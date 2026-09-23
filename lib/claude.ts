/**
 * All Claude API calls and response parsing live here.
 *
 * - extractSpec():  datasheet PDF -> PartSpec JSON (retries once on bad JSON)
 * - correctSpec():  PartSpec + rules violations -> fixed PartSpec (one request)
 * - parseSpecJson(): tolerant JSON parsing + schema validation
 *
 * The API key is read from ANTHROPIC_API_KEY on the server only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BoardDef } from "./boards";
import {
  INTERFACES,
  PIN_DIRECTIONS,
  type BusInterface,
  type InitStep,
  type PartSpec,
  type PinAssignment,
  type PinDirection,
  type Violation,
} from "./types";
import { formatViolationsForPrompt } from "./rules";

export const MODEL = process.env.PINPOINT_MODEL ?? "claude-fable-5-1";
const EFFORT = (process.env.PINPOINT_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max";
const MAX_TOKENS = 32_000;

export type Logger = (message: string, data?: unknown) => void;

const noop: Logger = () => {};

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.",
    );
  }
  if (!client) {
    // Keys that are not scoped to a workspace must name one per request.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    client = new Anthropic({
      timeout: 10 * 60 * 1000,
      maxRetries: 2,
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const SCHEMA_TEXT = `{
  "part_name": string,
  "description": string,
  "interface": "I2C" | "SPI" | "UART" | "GPIO" | "Analog" | "OneWire",
  "operating_voltage": string,
  "logic_voltage": string,
  "i2c_address": string | null,
  "pins": [
    {
      "sensor_pin": string,
      "board_pin": string,
      "direction": "input" | "output" | "bidirectional" | "power" | "ground",
      "uses_adc": boolean,
      "note": string
    }
  ],
  "init_sequence": [
    { "register": string, "value": string, "purpose": string, "source_page": number }
  ],
  "driver_code": string,
  "libraries": [string],
  "warnings": [string],
  "source_pages": { [field: string]: number }
}`;

export function buildSystemPrompt(board: BoardDef): string {
  return `You are PinPoint, an embedded-systems engineer who turns component datasheets into a wiring guide and Arduino-framework driver code for one specific development board.

Respond with a single JSON object and nothing else: no markdown fences, no preamble, no commentary after the JSON. The object must match this schema exactly:

${SCHEMA_TEXT}

Field guidance:
- part_name: the manufacturer part number (e.g. "BME280"). description: one or two sentences on what the part does.
- interface: the primary bus the driver uses to talk to the part. If the part supports several, pick the one the wiring and driver_code use.
- operating_voltage / logic_voltage: short ranges only, in the form "1.71V to 3.6V" or "3.3V". logic_voltage is the voltage range the part's I/O pins accept (VDDIO or the interface pins' rating). Put caveats such as "not 5V tolerant" or pull-up advice in warnings, not in these fields.
- i2c_address: the 7-bit address as a hex string such as "0x76" for I2C parts, otherwise null. Mention alternate addresses in warnings.
- pins: one entry for every part pin that must be connected: power, ground, and every signal the driver uses. Include a pin the driver does not use only when the datasheet requires it to be tied (e.g. CSB pulled high to select I2C), and say so in the note. sensor_pin is the name printed in the datasheet. board_pin uses this board's naming exactly as described below. direction is from the board's point of view (the board drives an "output", reads an "input"). uses_adc is true only for analog signals the board reads with analogRead.
- init_sequence: the register writes or commands sent at start-up, in order, each with the datasheet page that documents it. Use an empty array for parts without registers.
- driver_code: a complete, compilable Arduino sketch with setup() and loop() for the target board. Use only the core libraries that ship with the board package (Wire, SPI, etc.), implement register access yourself from the datasheet, and carry over any compensation or conversion formulas the datasheet gives. Define every pin as a named constant that matches the pins array exactly. Comment the code, citing datasheet pages for register values. Print readings over Serial.
- libraries: every Arduino library the sketch #includes, by Library Manager name, e.g. ["Wire"], ["SPI"], ["Wire", "Adafruit BME280 Library"]. Core libraries (Wire, SPI, EEPROM, SoftwareSerial, WiFi) are always fine; prefer them and avoid third-party libraries unless the part is impractical to drive without one.
- warnings: anything the user must know before powering up: voltage limits, pull-ups, address-select pins, timing, calibration.
- source_pages: map each of part_name, description, interface, operating_voltage, logic_voltage, i2c_address, pins and init_sequence to the 1-based PDF page number where you found the value. Every extracted value must cite a page; use the page of the pinout table for pins.

Target board:
${board.promptHints}

Code notes: ${board.codeHints}

Use the board's default pins whenever the part's interface has defaults (I2C: SDA=${board.i2c.sda}, SCL=${board.i2c.scl}; SPI: MOSI=${board.spi.mosi}, MISO=${board.spi.miso}, SCK=${board.spi.sck}, CS=${board.spi.ss}). For other signals prefer these pins in order: ${board.recommendedGpio.join(", ")}.`;
}

const STRICT_RETRY_SUFFIX = (error: string) =>
  `\n\nIMPORTANT: your previous reply could not be used (${error}). Reply with ONLY the raw JSON object, starting with "{" and ending with "}". Escape newlines inside strings as \\n and double quotes as \\". Do not wrap it in markdown fences and do not add any text before or after it.`;

// ---------------------------------------------------------------------------
// Low-level call
// ---------------------------------------------------------------------------

async function callClaude(
  system: string,
  content: Anthropic.Beta.BetaContentBlockParam[],
  log: Logger,
): Promise<string> {
  const anthropic = getClient();
  const started = Date.now();

  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: EFFORT },
    system,
    messages: [{ role: "user", content }],
  });

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    throw new Error(describeApiError(err));
  }
  log(`Claude responded in ${((Date.now() - started) / 1000).toFixed(1)}s`, {
    model: message.model,
    stop_reason: message.stop_reason,
    usage: message.usage,
  });

  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation ?? "no explanation given";
    throw new Error(`Claude declined to process this datasheet (${why}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "Claude's response was cut off before the JSON was complete. Try a shorter datasheet or a simpler part.",
    );
  }

  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Turn SDK errors into one plain sentence for the UI. */
function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { message?: string } } | undefined;
    const detail = body?.error?.message ?? err.message;
    if (/anthropic-workspace-id/i.test(detail)) {
      return "Your API key is not scoped to a workspace. Add ANTHROPIC_WORKSPACE_ID=<your workspace id> to .env.local (Console → Settings → Workspaces) and restart the server.";
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return "The ANTHROPIC_API_KEY in .env.local was rejected. Check the key and restart the server.";
    }
    if (err instanceof Anthropic.RateLimitError) {
      return "Claude is rate-limited right now. Wait a moment and try again.";
    }
    return `Claude API error ${err.status ?? ""}: ${detail}`.trim();
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Claude API. Check the network connection and try again.";
  }
  return err instanceof Error ? err.message : "Unexpected error while calling Claude.";
}

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

export class SpecParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "SpecParseError";
  }
}

/** Remove ``` fences and any text before the first "{" / after the last "}". */
export function stripToJson(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```\s*$/);
  if (fenced) t = fenced[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return t;
  return t.slice(first, last + 1);
}

function str(v: unknown, field: string, { allowEmpty = false } = {}): string {
  if (typeof v !== "string") throw new Error(`"${field}" must be a string`);
  if (!allowEmpty && v.trim() === "") throw new Error(`"${field}" must not be empty`);
  return v;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function normalizeInterface(v: unknown): BusInterface {
  const s = String(v ?? "").trim();
  const hit = INTERFACES.find((i) => i.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  if (/i2c|iic|twi/i.test(s)) return "I2C";
  if (/spi/i.test(s)) return "SPI";
  if (/uart|serial/i.test(s)) return "UART";
  if (/one.?wire/i.test(s)) return "OneWire";
  if (/analog|adc/i.test(s)) return "Analog";
  if (/gpio|digital/i.test(s)) return "GPIO";
  throw new Error(`"interface" must be one of ${INTERFACES.join(", ")} (got "${s}")`);
}

function normalizeDirection(v: unknown, field: string): PinDirection {
  const s = String(v ?? "").trim().toLowerCase();
  const hit = PIN_DIRECTIONS.find((d) => d === s);
  if (hit) return hit;
  if (/^(in|input)$/.test(s)) return "input";
  if (/^(out|output)$/.test(s)) return "output";
  if (/^(io|inout|bidir|bi-directional|bidirectional)$/.test(s)) return "bidirectional";
  if (/^(pwr|power|vcc|vdd|supply)$/.test(s)) return "power";
  if (/^(gnd|ground)$/.test(s)) return "ground";
  throw new Error(`${field}.direction must be one of ${PIN_DIRECTIONS.join(", ")} (got "${s}")`);
}

function normalizePin(raw: unknown, i: number): PinAssignment {
  if (!raw || typeof raw !== "object") throw new Error(`pins[${i}] must be an object`);
  const p = raw as Record<string, unknown>;
  return {
    sensor_pin: str(p.sensor_pin, `pins[${i}].sensor_pin`),
    board_pin: str(p.board_pin, `pins[${i}].board_pin`),
    direction: normalizeDirection(p.direction, `pins[${i}]`),
    uses_adc: p.uses_adc === true || p.uses_adc === "true",
    note: typeof p.note === "string" ? p.note : "",
  };
}

function normalizeInit(raw: unknown, i: number): InitStep {
  if (!raw || typeof raw !== "object") throw new Error(`init_sequence[${i}] must be an object`);
  const s = raw as Record<string, unknown>;
  return {
    register: String(s.register ?? ""),
    value: String(s.value ?? ""),
    purpose: String(s.purpose ?? ""),
    source_page: num(s.source_page),
  };
}

function normalizeLibraries(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = String(item ?? "")
      .trim()
      .replace(/^[<"]/, "")
      .replace(/[>"]$/, "")
      .replace(/\.h$/i, "")
      .trim();
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

/** Validate and normalise an untyped parsed object into a PartSpec. */
export function normalizeSpec(raw: unknown): PartSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("top level must be a JSON object");
  }
  const o = raw as Record<string, unknown>;

  const pinsRaw = o.pins;
  if (!Array.isArray(pinsRaw) || pinsRaw.length === 0) {
    throw new Error('"pins" must be a non-empty array');
  }

  const sourcePages: Record<string, number> = {};
  if (o.source_pages && typeof o.source_pages === "object") {
    for (const [k, v] of Object.entries(o.source_pages as Record<string, unknown>)) {
      const n = num(v, NaN);
      if (Number.isFinite(n)) sourcePages[k] = n;
    }
  }

  const i2c = o.i2c_address;

  return {
    part_name: str(o.part_name, "part_name"),
    description: str(o.description, "description"),
    interface: normalizeInterface(o.interface),
    operating_voltage: typeof o.operating_voltage === "string" ? o.operating_voltage : "",
    logic_voltage: typeof o.logic_voltage === "string" ? o.logic_voltage : "",
    i2c_address: typeof i2c === "string" && i2c.trim() !== "" ? i2c.trim() : null,
    pins: pinsRaw.map(normalizePin),
    init_sequence: Array.isArray(o.init_sequence) ? o.init_sequence.map(normalizeInit) : [],
    driver_code: str(o.driver_code, "driver_code"),
    libraries: normalizeLibraries(o.libraries),
    warnings: Array.isArray(o.warnings) ? o.warnings.map((w) => String(w)) : [],
    source_pages: sourcePages,
  };
}

/** Parse Claude's reply into a PartSpec, or throw SpecParseError. */
export function parseSpecJson(text: string): PartSpec {
  const json = stripToJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new SpecParseError(`invalid JSON: ${(e as Error).message}`, text);
  }
  try {
    return normalizeSpec(parsed);
  } catch (e) {
    throw new SpecParseError(`schema mismatch: ${(e as Error).message}`, text);
  }
}

// ---------------------------------------------------------------------------
// High-level operations
// ---------------------------------------------------------------------------

async function askForSpec(
  system: string,
  makeContent: (suffix: string) => Anthropic.Beta.BetaContentBlockParam[],
  log: Logger,
  label: string,
): Promise<PartSpec> {
  const first = await callClaude(system, makeContent(""), log);
  log(`[${label}] raw response (attempt 1)`, first);
  try {
    return parseSpecJson(first);
  } catch (e) {
    if (!(e instanceof SpecParseError)) throw e;
    log(`[${label}] parse failed, retrying with stricter instruction: ${e.message}`);
    const second = await callClaude(system, makeContent(STRICT_RETRY_SUFFIX(e.message)), log);
    log(`[${label}] raw response (attempt 2)`, second);
    try {
      return parseSpecJson(second);
    } catch (e2) {
      if (!(e2 instanceof SpecParseError)) throw e2;
      throw new Error(
        `Claude did not return valid JSON after two attempts (${e2.message}). Please try again or use a different datasheet.`,
      );
    }
  }
}

/**
 * Send a datasheet PDF to Claude and get a PartSpec for the given board.
 * Retries once with a stricter instruction if the first reply is not valid JSON.
 */
export async function extractSpec(
  pdfBase64: string,
  board: BoardDef,
  log: Logger = noop,
): Promise<PartSpec> {
  const system = buildSystemPrompt(board);
  return askForSpec(
    system,
    (suffix) => [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        title: "Component datasheet",
      },
      {
        type: "text",
        text: `Read this datasheet and produce the JSON for wiring and driving the part from a ${board.name}.${suffix}`,
      },
    ],
    log,
    "extract",
  );
}

/**
 * Ask Claude to fix the pin assignments that the rules engine rejected and
 * update the driver code to match. Exactly one correction request is made
 * (plus at most one re-ask if the JSON does not parse).
 */
export async function correctSpec(
  spec: PartSpec,
  violations: Violation[],
  board: BoardDef,
  log: Logger = noop,
): Promise<PartSpec> {
  const system = buildSystemPrompt(board);
  const text = `Here is the JSON you produced for the ${board.name}:

${JSON.stringify(spec, null, 2)}

PinPoint's deterministic board rules engine checked the pin assignments and found these problems:

${formatViolationsForPrompt(violations)}

Fix every ERROR by moving the affected signals to valid board pins. Prefer these free pins, in order: ${board.recommendedGpio.join(", ")}. Resolve WARNINGS too when a better pin is available without changing the bus defaults. Then:
- update driver_code so every pin constant, Wire/SPI initialisation and comment matches the new pins,
- for each pin you moved, set its note to explain why (one sentence),
- keep every other field exactly as it was.

Return the complete corrected JSON object only.`;

  return askForSpec(system, (suffix) => [{ type: "text", text: text + suffix }], log, "correct");
}

// ---------------------------------------------------------------------------
// Compile-error fixes
// ---------------------------------------------------------------------------

export interface CodeFix {
  driver_code: string;
  libraries: string[];
  summary: string;
}

/** Parse the small JSON object returned by fixCompileErrors. */
export function parseCodeFix(text: string, fallbackLibraries: string[]): CodeFix {
  const json = stripToJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new SpecParseError(`invalid JSON: ${(e as Error).message}`, text);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SpecParseError("schema mismatch: top level must be a JSON object", text);
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.driver_code !== "string" || o.driver_code.trim() === "") {
    throw new SpecParseError('schema mismatch: "driver_code" must be a non-empty string', text);
  }
  const libs = Array.isArray(o.libraries) ? normalizeLibraries(o.libraries) : fallbackLibraries;
  return {
    driver_code: o.driver_code,
    libraries: libs,
    summary: typeof o.change_summary === "string" ? o.change_summary.trim() : "",
  };
}

/**
 * Ask Claude to fix compiler errors in driver_code without touching wiring.
 * Returns only the new code, the library list and a summary of the change.
 */
export async function fixCompileErrors(
  spec: PartSpec,
  compilerErrors: string,
  board: BoardDef,
  attempt: number,
  log: Logger = noop,
): Promise<CodeFix> {
  const system = `You are PinPoint's compile-fix assistant. You receive an Arduino sketch for the ${board.name} that failed to compile with arduino-cli, plus the compiler output. Fix the code so it compiles, changing as little as possible and keeping the pin assignments, register values and behaviour exactly the same.

Respond with a single JSON object and nothing else (no markdown fences, no commentary):
{
  "driver_code": string,      // the complete corrected sketch
  "libraries": [string],      // every library the corrected sketch #includes, by Library Manager name
  "change_summary": string    // one or two sentences describing what you changed and why
}

Board and toolchain notes: ${board.codeHints} Only libraries that ship with the board core or are on the Arduino Library Manager are available; if an include cannot be satisfied, rewrite the code to avoid it.`;

  const text = `Fix attempt ${attempt}. The sketch below failed to compile.

Compiler output:
${compilerErrors}

Libraries currently listed: ${spec.libraries.length ? spec.libraries.join(", ") : "(none)"}

Sketch:
${spec.driver_code}`;

  const first = await callClaude(system, [{ type: "text", text }], log);
  log(`[fix ${attempt}] raw response (attempt 1)`, first);
  try {
    return parseCodeFix(first, spec.libraries);
  } catch (e) {
    if (!(e instanceof SpecParseError)) throw e;
    log(`[fix ${attempt}] parse failed, retrying: ${e.message}`);
    const second = await callClaude(system, [{ type: "text", text: text + STRICT_RETRY_SUFFIX(e.message) }], log);
    log(`[fix ${attempt}] raw response (attempt 2)`, second);
    return parseCodeFix(second, spec.libraries);
  }
}
