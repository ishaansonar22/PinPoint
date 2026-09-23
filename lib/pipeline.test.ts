import { describe, expect, it } from "vitest";
import { ESP32_DEVKIT } from "./boards";
import { diffPins } from "./pipeline";
import { checkPins } from "./rules";
import type { PartSpec } from "./types";

const base: PartSpec = {
  part_name: "LED",
  description: "LED module",
  interface: "GPIO",
  operating_voltage: "3.3V",
  logic_voltage: "3.3V",
  i2c_address: null,
  pins: [
    { sensor_pin: "S", board_pin: "GPIO35", direction: "output", uses_adc: false, note: "" },
    { sensor_pin: "-", board_pin: "GND", direction: "ground", uses_adc: false, note: "" },
  ],
  init_sequence: [],
  driver_code: "void setup(){} void loop(){}",
  libraries: [],
  warnings: [],
  source_pages: {},
};

describe("diffPins", () => {
  it("reports moved pins with the rules-engine reason", () => {
    const violations = checkPins("esp32-devkit", base);
    const fixed: PartSpec = {
      ...base,
      pins: [{ ...base.pins[0], board_pin: "GPIO26" }, base.pins[1]],
    };
    const corrections = diffPins(ESP32_DEVKIT, base, fixed, violations);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ sensor_pin: "S", original_pin: "GPIO35", new_pin: "GPIO26" });
    expect(corrections[0].reason).toMatch(/input-only/);
  });

  it("ignores spelling-only changes and unchanged pins", () => {
    const same: PartSpec = {
      ...base,
      pins: [{ ...base.pins[0], board_pin: "GPIO 35" }, base.pins[1]],
    };
    expect(diffPins(ESP32_DEVKIT, base, same, [])).toEqual([]);
  });

  it("falls back to the new note when no violation explains the move", () => {
    const fixed: PartSpec = {
      ...base,
      pins: [{ ...base.pins[0], board_pin: "GPIO27", note: "Moved to keep GPIO26 free." }, base.pins[1]],
    };
    const [c] = diffPins(ESP32_DEVKIT, base, fixed, []);
    expect(c.reason).toBe("Moved to keep GPIO26 free.");
  });
});
