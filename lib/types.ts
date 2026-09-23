/**
 * Shared types for PinPoint.
 *
 * `PartSpec` is the JSON schema Claude is asked to return.
 * `GenerateResult` is what the /api/generate route sends to the UI (and what
 * the demo files in /public/demo contain).
 */

export type BoardId = "esp32-devkit" | "arduino-uno";

export const BOARD_IDS: readonly BoardId[] = ["esp32-devkit", "arduino-uno"];

export type BusInterface = "I2C" | "SPI" | "UART" | "GPIO" | "Analog" | "OneWire";

export const INTERFACES: readonly BusInterface[] = [
  "I2C",
  "SPI",
  "UART",
  "GPIO",
  "Analog",
  "OneWire",
];

export type PinDirection = "input" | "output" | "bidirectional" | "power" | "ground";

export const PIN_DIRECTIONS: readonly PinDirection[] = [
  "input",
  "output",
  "bidirectional",
  "power",
  "ground",
];

export interface PinAssignment {
  /** Pin name as printed in the datasheet, e.g. "SDA", "VDD", "DOUT". */
  sensor_pin: string;
  /** Pin on the target board, e.g. "GPIO21", "A4", "3V3", "GND". */
  board_pin: string;
  /** Direction from the *board's* point of view. */
  direction: PinDirection;
  /** True when the board must read this pin with its ADC. */
  uses_adc: boolean;
  note: string;
}

export interface InitStep {
  register: string;
  value: string;
  purpose: string;
  source_page: number;
}

export interface PartSpec {
  part_name: string;
  description: string;
  interface: BusInterface;
  operating_voltage: string;
  logic_voltage: string;
  i2c_address: string | null;
  pins: PinAssignment[];
  init_sequence: InitStep[];
  driver_code: string;
  warnings: string[];
  /** field name -> datasheet page number where the value was found. */
  source_pages: Record<string, number>;
}

export type Severity = "error" | "warning";

export interface Violation {
  /** Stable rule identifier from the rules table, e.g. "esp32-input-only". */
  rule_id: string;
  severity: Severity;
  /** Datasheet-side pin name the violation refers to. */
  sensor_pin: string;
  /** Board pin as written in the spec (not normalised). */
  board_pin: string;
  /** Plain-English explanation. */
  message: string;
  /** Index into spec.pins so the UI can highlight the row. */
  pin_index: number;
}

export interface Correction {
  sensor_pin: string;
  original_pin: string;
  new_pin: string;
  reason: string;
}

export interface GenerateResult {
  board: BoardId;
  /** Final spec (after auto-correction, if any). */
  spec: PartSpec;
  /** Rules-engine result for the final spec. */
  violations: Violation[];
  /** True when the auto-correction loop ran. */
  autoCorrected: boolean;
  /** What the auto-correction loop changed. */
  corrections: Correction[];
  /** Violations found on the *first* extraction, before correction. */
  originalViolations: Violation[];
  /** Milliseconds spent in the whole pipeline. */
  elapsedMs?: number;
  /** Set when a result was loaded from /public/demo instead of the API. */
  demo?: { id: string; title: string };
}

/** NDJSON events streamed by /api/generate. */
export type GenerateEvent =
  | { type: "progress"; message: string }
  | { type: "result"; data: GenerateResult }
  | { type: "error"; message: string };
