/**
 * Runtime configuration, all from environment variables.
 */

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  /** Port to listen on. */
  port: num(process.env.PORT, 8080),
  /** Shared secret; every /compile request must carry it. */
  token: process.env.COMPILE_SERVICE_TOKEN ?? "",
  /** Path to the arduino-cli executable. */
  arduinoCli: process.env.ARDUINO_CLI ?? "arduino-cli",
  /** Hard limit per compile. */
  compileTimeoutMs: num(process.env.COMPILE_TIMEOUT_MS, 60_000),
  /** Time allowed for `arduino-cli lib install`. */
  libInstallTimeoutMs: num(process.env.LIB_INSTALL_TIMEOUT_MS, 120_000),
  /** Reject sketches larger than this. */
  maxCodeBytes: 100 * 1024,
  /** How many compiles may run at the same time. */
  maxConcurrent: num(process.env.COMPILE_MAX_CONCURRENT, 2),
  /** Requests waiting beyond this are rejected with 503. */
  maxQueue: num(process.env.COMPILE_MAX_QUEUE, 8),
};

export type CompileBoard = "esp32" | "uno";

/**
 * Board -> FQBN. Override with FQBN_ESP32 / FQBN_UNO for local setups that have
 * a different core installed (e.g. Arduino IDE's bundled "arduino:esp32").
 */
function fqbnFor(env: string | undefined, fallback: string) {
  return env && /^[\w-]+:[\w-]+:[\w-]+(:[\w=,-]+)?$/.test(env) ? env : fallback;
}

const ESP32_FQBN = fqbnFor(process.env.FQBN_ESP32, "esp32:esp32:esp32");
const UNO_FQBN = fqbnFor(process.env.FQBN_UNO, "arduino:avr:uno");

const coreOf = (fqbn: string) => fqbn.split(":").slice(0, 2).join(":");

export const BOARDS: Record<CompileBoard, { fqbn: string; core: string; label: string }> = {
  esp32: { fqbn: ESP32_FQBN, core: coreOf(ESP32_FQBN), label: "ESP32 Dev Module" },
  uno: { fqbn: UNO_FQBN, core: coreOf(UNO_FQBN), label: "Arduino Uno" },
};

export function isCompileBoard(v: unknown): v is CompileBoard {
  return v === "esp32" || v === "uno";
}
