/**
 * Deterministic board rules engine. No AI involved.
 *
 * Every rule is one entry in the RULES table. A rule receives the resolved
 * pin list for a board and returns zero or more violations. `checkPins` runs
 * every rule registered for the chosen board.
 */

import { BOARDS, type BoardDef, type PinRef } from "./boards";
import type { BoardId, PinAssignment, PartSpec, Severity, Violation } from "./types";
import { voltageSupports, voltageUnknown } from "./voltage";

/** The subset of a PartSpec the rules engine needs. */
export type RuleInput = Pick<PartSpec, "pins" | "interface" | "logic_voltage">;

export interface ResolvedPin {
  index: number;
  assignment: PinAssignment;
  ref: PinRef;
}

export interface RuleContext {
  board: BoardDef;
  spec: RuleInput;
  pins: ResolvedPin[];
}

export interface Rule {
  id: string;
  board: BoardId;
  severity: Severity;
  /** Short title shown in the UI / README. */
  title: string;
  /** One-line description of what the rule protects against. */
  description: string;
  check: (ctx: RuleContext) => Violation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function violation(
  rule: Pick<Rule, "id" | "severity">,
  pin: ResolvedPin,
  message: string,
): Violation {
  return {
    rule_id: rule.id,
    severity: rule.severity,
    sensor_pin: pin.assignment.sensor_pin,
    board_pin: pin.assignment.board_pin,
    message,
    pin_index: pin.index,
  };
}

/** Build a rule that evaluates each signal pin independently. */
function perPinRule(
  def: Omit<Rule, "check">,
  predicate: (pin: ResolvedPin, ctx: RuleContext) => string | null,
): Rule {
  return {
    ...def,
    check: (ctx) => {
      const out: Violation[] = [];
      for (const pin of ctx.pins) {
        const msg = predicate(pin, ctx);
        if (msg) out.push(violation(def, pin, msg));
      }
      return out;
    },
  };
}

/** True for pins that are actual signal assignments (not power/ground). */
function isSignal(pin: ResolvedPin): boolean {
  return (
    pin.assignment.direction !== "power" &&
    pin.assignment.direction !== "ground" &&
    pin.ref.kind !== "power" &&
    pin.ref.kind !== "ground"
  );
}

function drivesOutput(pin: ResolvedPin): boolean {
  return pin.assignment.direction === "output" || pin.assignment.direction === "bidirectional";
}

/** Guess which SPI signal a datasheet pin is, from its name and note. */
export type SpiRole = "mosi" | "miso" | "sck" | "ss";

export function guessSpiRole(pin: PinAssignment): SpiRole | null {
  const name = `${pin.sensor_pin} ${pin.note}`.toUpperCase();
  if (/\b(MOSI|SDI|DIN|SI|DI|SDA\/SDI|MOSI\/SDA|SDA\/DI)\b/.test(name)) return "mosi";
  if (/\b(MISO|SDO|DOUT|SO|DO)\b/.test(name)) return "miso";
  if (/\b(SCK|SCLK|SCL\/SCK|CLK|SPC)\b/.test(name)) return "sck";
  if (/\b(CS|CSB|SS|NCS|CSN|CE|CS_N|\/CS|CSB\/CS)\b/.test(name)) return "ss";
  return null;
}

/** Generic duplicate-pin rule shared by all boards. */
function duplicatePinRule(board: BoardId): Rule {
  const def = {
    id: `${board}-duplicate-pin`,
    board,
    severity: "error" as Severity,
    title: "Board pin assigned twice",
    description:
      "Two different signals cannot share one board pin. Shared I2C/SPI bus lines and power/ground pins are exempt.",
  };
  return {
    ...def,
    check: (ctx) => {
      const seen = new Map<string, ResolvedPin>();
      const out: Violation[] = [];
      for (const pin of ctx.pins) {
        if (!isSignal(pin)) continue;
        if (pin.ref.kind === "unknown") continue;
        const key = pin.ref.canonical;
        if (ctx.board.sharedBusPins.includes(key)) continue;
        const prev = seen.get(key);
        if (prev) {
          out.push(
            violation(
              def,
              pin,
              `${key} is already used by "${prev.assignment.sensor_pin}". Two signals cannot share one board pin unless it is a shared I2C/SPI bus line.`,
            ),
          );
        } else {
          seen.set(key, pin);
        }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// ESP32 DevKit rules
// ---------------------------------------------------------------------------

export const ESP32_INPUT_ONLY = [34, 35, 36, 39];
export const ESP32_FLASH_PINS = [6, 7, 8, 9, 10, 11];
export const ESP32_ADC2_PINS = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27];
export const ESP32_STRAPPING_PINS = [0, 2, 5, 12, 15];

const esp32Rules: Rule[] = [
  perPinRule(
    {
      id: "esp32-input-only",
      board: "esp32-devkit",
      severity: "error",
      title: "Input-only GPIO used as output",
      description: "GPIO 34, 35, 36 and 39 have no output driver and no internal pull-ups.",
    },
    (pin) => {
      if (!isSignal(pin) || pin.ref.gpio === null) return null;
      if (ESP32_INPUT_ONLY.includes(pin.ref.gpio) && drivesOutput(pin)) {
        return `GPIO${pin.ref.gpio} is input-only on the ESP32; it cannot drive "${pin.assignment.sensor_pin}" as an ${pin.assignment.direction} signal. Move it to a general-purpose GPIO such as 25, 26, 27, 32 or 33.`;
      }
      return null;
    },
  ),
  perPinRule(
    {
      id: "esp32-flash-pins",
      board: "esp32-devkit",
      severity: "error",
      title: "Flash GPIO used",
      description: "GPIO 6–11 are wired to the module's SPI flash; using them crashes the chip.",
    },
    (pin) => {
      if (!isSignal(pin) || pin.ref.gpio === null) return null;
      if (ESP32_FLASH_PINS.includes(pin.ref.gpio)) {
        return `GPIO${pin.ref.gpio} is connected to the ESP32's internal flash memory and must not be used for "${pin.assignment.sensor_pin}". The board will crash or fail to boot.`;
      }
      return null;
    },
  ),
  perPinRule(
    {
      id: "esp32-adc2-wifi",
      board: "esp32-devkit",
      severity: "warning",
      title: "ADC2 pin used for analog read",
      description: "ADC2 is shared with the Wi-Fi driver; analogRead fails while Wi-Fi is active.",
    },
    (pin) => {
      if (!isSignal(pin) || pin.ref.gpio === null) return null;
      if (pin.assignment.uses_adc && ESP32_ADC2_PINS.includes(pin.ref.gpio)) {
        return `GPIO${pin.ref.gpio} is an ADC2 channel; analog reads on it fail while Wi-Fi is on. Use an ADC1 pin (GPIO32–39) for "${pin.assignment.sensor_pin}" if the sketch uses Wi-Fi.`;
      }
      return null;
    },
  ),
  perPinRule(
    {
      id: "esp32-strapping",
      board: "esp32-devkit",
      severity: "warning",
      title: "Strapping pin used",
      description: "GPIO 0, 2, 5, 12 and 15 are sampled at reset to select the boot mode.",
    },
    (pin) => {
      if (!isSignal(pin) || pin.ref.gpio === null) return null;
      if (ESP32_STRAPPING_PINS.includes(pin.ref.gpio)) {
        return `GPIO${pin.ref.gpio} is a strapping pin that selects the boot mode at reset. If "${pin.assignment.sensor_pin}" holds it high or low during power-up the board may not boot or flash.`;
      }
      return null;
    },
  ),
  {
    id: "esp32-logic-level",
    board: "esp32-devkit",
    severity: "warning",
    title: "5V logic on a 3.3V board",
    description: "ESP32 GPIO are 3.3V and not 5V tolerant.",
    check: (ctx) => {
      const lv = ctx.spec.logic_voltage;
      if (voltageUnknown(lv) || voltageSupports(lv, 3.3)) return [];
      const first = ctx.pins.find(isSignal) ?? ctx.pins[0];
      if (!first) return [];
      const rule = { id: "esp32-logic-level", severity: "warning" as Severity };
      return [
        {
          ...violation(rule, first, ""),
          sensor_pin: "(logic level)",
          board_pin: "3V3",
          pin_index: -1,
          message: `The part's logic level is "${lv}", but the ESP32 runs at 3.3V and its GPIO are not 5V tolerant. Add a bidirectional level shifter on every signal line, or check whether the part accepts 3.3V logic.`,
        },
      ];
    },
  },
  duplicatePinRule("esp32-devkit"),
];

// ---------------------------------------------------------------------------
// Arduino Uno rules
// ---------------------------------------------------------------------------

const unoRules: Rule[] = [
  perPinRule(
    {
      id: "uno-serial-pins",
      board: "arduino-uno",
      severity: "warning",
      title: "USB serial pin used",
      description: "D0 (RX) and D1 (TX) carry the USB serial link used for uploads and Serial.print.",
    },
    (pin) => {
      if (!isSignal(pin) || pin.ref.kind !== "gpio") return null;
      if (pin.ref.gpio === 0 || pin.ref.gpio === 1) {
        return `D${pin.ref.gpio} is the USB serial ${pin.ref.gpio === 0 ? "RX" : "TX"} line. Using it for "${pin.assignment.sensor_pin}" breaks sketch uploads and Serial output. Use SoftwareSerial on other pins, or D2–D9.`;
      }
      return null;
    },
  ),
  perPinRule(
    {
      id: "uno-analog-only-a0-a5",
      board: "arduino-uno",
      severity: "error",
      title: "Analog read on a non-analog pin",
      description: "The ATmega328P ADC is only wired to A0–A5.",
    },
    (pin) => {
      if (!isSignal(pin)) return null;
      if (pin.assignment.uses_adc && pin.ref.kind !== "analog") {
        return `"${pin.assignment.sensor_pin}" needs an analog read but ${pin.ref.canonical} has no ADC. On the Uno, analogRead only works on A0–A5.`;
      }
      return null;
    },
  ),
  perPinRule(
    {
      id: "uno-spi-fixed-pins",
      board: "arduino-uno",
      severity: "error",
      title: "SPI on non-hardware pins",
      description: "Hardware SPI is fixed at D11 (MOSI), D12 (MISO), D13 (SCK); D10 is the default SS.",
    },
    (pin, ctx) => {
      if (ctx.spec.interface !== "SPI" || !isSignal(pin)) return null;
      const role = guessSpiRole(pin.assignment);
      if (!role || role === "ss") return null; // CS handled by the warning rule below
      const expected = ctx.board.spi[role];
      if (pin.ref.canonical !== expected) {
        return `"${pin.assignment.sensor_pin}" is the SPI ${role.toUpperCase()} line and must be on ${expected} (hardware SPI is fixed on the Uno), not ${pin.ref.canonical}.`;
      }
      return null;
    },
  ),
  perPinRule(
    {
      id: "uno-spi-ss-pin",
      board: "arduino-uno",
      severity: "warning",
      title: "SPI chip select not on D10",
      description: "Any output pin can be a chip select, but D10 must remain an output for SPI master mode.",
    },
    (pin, ctx) => {
      if (ctx.spec.interface !== "SPI" || !isSignal(pin)) return null;
      if (guessSpiRole(pin.assignment) !== "ss") return null;
      if (pin.ref.canonical !== ctx.board.spi.ss) {
        return `"${pin.assignment.sensor_pin}" (chip select) is on ${pin.ref.canonical}. That works, but D10 is the hardware SS pin and must stay configured as an OUTPUT or the Uno drops out of SPI master mode.`;
      }
      return null;
    },
  ),
  {
    id: "uno-logic-level",
    board: "arduino-uno",
    severity: "warning",
    title: "3.3V-only part on a 5V board",
    description: "Uno GPIO output 5V; 3.3V-only parts can be damaged.",
    check: (ctx) => {
      const lv = ctx.spec.logic_voltage;
      if (voltageUnknown(lv) || voltageSupports(lv, 5)) return [];
      const first = ctx.pins.find(isSignal) ?? ctx.pins[0];
      if (!first) return [];
      const rule = { id: "uno-logic-level", severity: "warning" as Severity };
      return [
        {
          ...violation(rule, first, ""),
          sensor_pin: "(logic level)",
          board_pin: "5V",
          pin_index: -1,
          message: `The part's logic level is "${lv}", but the Arduino Uno drives 5V on its GPIO. Use a bidirectional logic level shifter (e.g. TXS0108E or a BSS138 breakout) between the Uno and the part, and power the part from the 3.3V pin.`,
        },
      ];
    },
  },
  duplicatePinRule("arduino-uno"),
];

// ---------------------------------------------------------------------------
// Rules table + engine
// ---------------------------------------------------------------------------

/** The full rules table. Add new boards by appending their rules here. */
export const RULES: Rule[] = [...esp32Rules, ...unoRules];

export function rulesForBoard(board: BoardId): Rule[] {
  return RULES.filter((r) => r.board === board);
}

export function resolvePins(board: BoardDef, pins: PinAssignment[]): ResolvedPin[] {
  return pins.map((assignment, index) => ({
    index,
    assignment,
    ref: board.normalizePin(assignment.board_pin ?? ""),
  }));
}

/**
 * Run every rule for `boardId` against `spec.pins` and return all violations,
 * errors first.
 */
export function checkPins(boardId: BoardId, spec: RuleInput): Violation[] {
  const board = BOARDS[boardId];
  const ctx: RuleContext = { board, spec, pins: resolvePins(board, spec.pins ?? []) };
  const out: Violation[] = [];
  for (const rule of rulesForBoard(boardId)) {
    out.push(...rule.check(ctx));
  }
  return out.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function severityRank(s: Severity): number {
  return s === "error" ? 0 : 1;
}

export function hasErrors(violations: Violation[]): boolean {
  return violations.some((v) => v.severity === "error");
}

/** Format violations as a compact list for the auto-correction prompt. */
export function formatViolationsForPrompt(violations: Violation[]): string {
  return violations
    .map(
      (v) =>
        `- [${v.severity.toUpperCase()}] ${v.rule_id}: sensor pin "${v.sensor_pin}" on board pin "${v.board_pin}" — ${v.message}`,
    )
    .join("\n");
}
