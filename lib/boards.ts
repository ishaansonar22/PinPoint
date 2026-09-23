/**
 * Board data: everything PinPoint knows about a target board that is not a
 * rule. Rules live in lib/rules.ts and read from this table.
 *
 * To add a board: add a `BoardDef` here, then add its rules to RULES in
 * lib/rules.ts.
 */

import type { BoardId } from "./types";

export type PinKind = "gpio" | "analog" | "power" | "ground" | "unknown";

export interface PinRef {
  /** Canonical label used for comparisons, e.g. "GPIO21", "D10", "A4", "GND". */
  canonical: string;
  kind: PinKind;
  /** GPIO / digital pin number when applicable. For Uno A0–A5 this is 14–19. */
  gpio: number | null;
  /** Analog channel number for Uno "A" pins. */
  analog: number | null;
  raw: string;
}

export interface BoardDef {
  id: BoardId;
  name: string;
  /** e.g. "ESP32" - used in prompts and copy. */
  shortName: string;
  logicVoltage: number;
  /** Canonical labels for default I2C pins. */
  i2c: { sda: string; scl: string };
  /** Canonical labels for hardware SPI pins. */
  spi: { ss: string; mosi: string; miso: string; sck: string };
  /** Bus lines that may legitimately be shared by several assignments. */
  sharedBusPins: string[];
  /** Pins that are a good first choice for new GPIO assignments. */
  recommendedGpio: string[];
  /** Human-readable constraints handed to Claude in the prompt. */
  promptHints: string;
  /** Arduino-framework specific hints for the driver code. */
  codeHints: string;
  /** Turn a free-form board_pin string into a PinRef. */
  normalizePin: (raw: string) => PinRef;
}

// ---------------------------------------------------------------------------
// Shared normalisation helpers
// ---------------------------------------------------------------------------

function cleanLabel(raw: string): string {
  // "GPIO21 (SDA)" -> "GPIO21", "A4 / SDA" -> "A4"
  return raw
    .trim()
    .replace(/\(.*?\)/g, "")
    .split(/[\/,]/)[0]
    .trim()
    .toUpperCase();
}

const POWER_RE = /^(3V3|3\.3\s*V|3\.3|VCC|VDD|VDDIO|5\s*V|5V0|VIN|VBUS|VUSB|V5|V3\.3|VSYS)$/i;
const GROUND_RE = /^(GND|VSS|GROUND|0V|AGND|DGND)$/i;

function powerOrGround(label: string, raw: string): PinRef | null {
  if (GROUND_RE.test(label)) {
    return { canonical: "GND", kind: "ground", gpio: null, analog: null, raw };
  }
  if (POWER_RE.test(label)) {
    const canonical = /5/.test(label) || /VIN|VBUS|VUSB|VSYS/i.test(label) ? "5V" : "3V3";
    return { canonical, kind: "power", gpio: null, analog: null, raw };
  }
  return null;
}

function unknown(raw: string): PinRef {
  return { canonical: cleanLabel(raw) || raw, kind: "unknown", gpio: null, analog: null, raw };
}

// ---------------------------------------------------------------------------
// ESP32 DevKit
// ---------------------------------------------------------------------------

const ESP32_GPIO_RE = /^(?:GPIO|IO|G|D|P)?\s*[-_]?\s*(\d{1,2})$/i;

function normalizeEsp32Pin(raw: string): PinRef {
  const label = cleanLabel(raw);
  const pg = powerOrGround(label, raw);
  if (pg) return pg;
  const m = label.match(ESP32_GPIO_RE);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 0 && n <= 39) {
      return { canonical: `GPIO${n}`, kind: "gpio", gpio: n, analog: null, raw };
    }
  }
  return unknown(raw);
}

export const ESP32_DEVKIT: BoardDef = {
  id: "esp32-devkit",
  name: "ESP32 DevKit",
  shortName: "ESP32",
  logicVoltage: 3.3,
  i2c: { sda: "GPIO21", scl: "GPIO22" },
  spi: { ss: "GPIO5", mosi: "GPIO23", miso: "GPIO19", sck: "GPIO18" },
  sharedBusPins: ["GPIO21", "GPIO22", "GPIO23", "GPIO19", "GPIO18"],
  recommendedGpio: [
    "GPIO16",
    "GPIO17",
    "GPIO25",
    "GPIO26",
    "GPIO27",
    "GPIO32",
    "GPIO33",
    "GPIO13",
    "GPIO14",
  ],
  promptHints: [
    "Board: ESP32 DevKit (ESP32-WROOM-32). Logic level 3.3V. Board pins are named GPIOn.",
    "Default I2C: SDA=GPIO21, SCL=GPIO22. Default VSPI: MOSI=GPIO23, MISO=GPIO19, SCK=GPIO18, CS=GPIO5. Default UART2: TX=GPIO17, RX=GPIO16.",
    "Power pins: 3V3, 5V (VIN), GND.",
    "GPIO34, 35, 36, 39 are INPUT ONLY (no output, no pull-ups).",
    "GPIO6-11 are wired to the internal flash and must never be used.",
    "ADC2 pins (GPIO0, 2, 4, 12, 13, 14, 15, 25, 26, 27) cannot do analogRead while Wi-Fi is on; prefer ADC1 (GPIO32-39) for analog inputs.",
    "Strapping pins GPIO0, 2, 5, 12, 15 affect boot; avoid them for new signals.",
    "Good general-purpose GPIO for outputs/inputs: 16, 17, 25, 26, 27, 32, 33.",
  ].join("\n"),
  codeHints:
    "Use the Arduino framework for ESP32 (arduino-esp32 core). Call Wire.begin(21, 22) explicitly for I2C. Use Serial at 115200 baud. analogRead works on ADC1 pins with 12-bit resolution (0-4095).",
  normalizePin: normalizeEsp32Pin,
};

// ---------------------------------------------------------------------------
// Arduino Uno
// ---------------------------------------------------------------------------

const UNO_DIGITAL_RE = /^(?:D|PIN|IO)?\s*[-_]?\s*(\d{1,2})$/i;
const UNO_ANALOG_RE = /^A\s*[-_]?\s*([0-5])$/i;

function normalizeUnoPin(raw: string): PinRef {
  const label = cleanLabel(raw);
  const pg = powerOrGround(label, raw);
  if (pg) return pg;

  // I2C aliases printed on the board.
  if (label === "SDA") return { canonical: "A4", kind: "analog", gpio: 18, analog: 4, raw };
  if (label === "SCL") return { canonical: "A5", kind: "analog", gpio: 19, analog: 5, raw };

  const a = label.match(UNO_ANALOG_RE);
  if (a) {
    const n = parseInt(a[1], 10);
    return { canonical: `A${n}`, kind: "analog", gpio: 14 + n, analog: n, raw };
  }
  const d = label.match(UNO_DIGITAL_RE);
  if (d) {
    const n = parseInt(d[1], 10);
    if (n >= 14 && n <= 19) {
      const ch = n - 14;
      return { canonical: `A${ch}`, kind: "analog", gpio: n, analog: ch, raw };
    }
    if (n >= 0 && n <= 13) {
      return { canonical: `D${n}`, kind: "gpio", gpio: n, analog: null, raw };
    }
  }
  return unknown(raw);
}

export const ARDUINO_UNO: BoardDef = {
  id: "arduino-uno",
  name: "Arduino Uno",
  shortName: "Uno",
  logicVoltage: 5,
  i2c: { sda: "A4", scl: "A5" },
  spi: { ss: "D10", mosi: "D11", miso: "D12", sck: "D13" },
  sharedBusPins: ["A4", "A5", "D11", "D12", "D13"],
  recommendedGpio: ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"],
  promptHints: [
    "Board: Arduino Uno R3 (ATmega328P). Logic level 5V. Digital pins are D0-D13, analog inputs are A0-A5.",
    "Default I2C: SDA=A4, SCL=A5. Hardware SPI is fixed: SS=D10, MOSI=D11, MISO=D12, SCK=D13.",
    "Power pins: 5V, 3.3V (max 50 mA), GND.",
    "D0 and D1 are the USB serial (RX/TX) - avoid them.",
    "Analog input (analogRead) works only on A0-A5, 10-bit (0-1023).",
    "PWM (analogWrite) is available on D3, D5, D6, D9, D10, D11.",
    "3.3V-only parts need a level shifter (or at least series resistors) on every signal line.",
  ].join("\n"),
  codeHints:
    "Use the standard Arduino AVR core. Wire.begin() with no arguments. Use Serial at 9600 or 115200 baud. Keep RAM usage low (2 KB SRAM) and avoid String objects in loops.",
  normalizePin: normalizeUnoPin,
};

// ---------------------------------------------------------------------------

export const BOARDS: Record<BoardId, BoardDef> = {
  "esp32-devkit": ESP32_DEVKIT,
  "arduino-uno": ARDUINO_UNO,
};

export const BOARD_LIST: BoardDef[] = [ESP32_DEVKIT, ARDUINO_UNO];

export function getBoard(id: string): BoardDef | undefined {
  return (BOARDS as Record<string, BoardDef>)[id];
}

export function isBoardId(id: string): id is BoardId {
  return id in BOARDS;
}
