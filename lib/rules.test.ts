import { describe, expect, it } from "vitest";
import { checkPins, hasErrors, RULES, rulesForBoard, type RuleInput } from "./rules";
import { ARDUINO_UNO, ESP32_DEVKIT } from "./boards";
import type { PinAssignment, Violation } from "./types";
import { parseVoltageRanges, voltageSupports } from "./voltage";

function pin(over: Partial<PinAssignment> & Pick<PinAssignment, "sensor_pin" | "board_pin">): PinAssignment {
  return {
    direction: "output",
    uses_adc: false,
    note: "",
    ...over,
  };
}

function spec(pins: PinAssignment[], over: Partial<RuleInput> = {}): RuleInput {
  return { interface: "GPIO", logic_voltage: "3.3V", pins, ...over };
}

const ids = (v: Violation[]) => v.map((x) => x.rule_id);
const byRule = (v: Violation[], id: string) => v.filter((x) => x.rule_id === id);

// ---------------------------------------------------------------------------

describe("rules table", () => {
  it("has a unique id for every rule", () => {
    const seen = new Set(RULES.map((r) => r.id));
    expect(seen.size).toBe(RULES.length);
  });

  it("registers rules for both boards", () => {
    expect(rulesForBoard("esp32-devkit").length).toBeGreaterThan(0);
    expect(rulesForBoard("arduino-uno").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe("pin normalisation", () => {
  it("understands the common ESP32 spellings", () => {
    for (const raw of ["GPIO21", "GPIO 21", "gpio21", "IO21", "D21", "21", "GPIO21 (SDA)"]) {
      expect(ESP32_DEVKIT.normalizePin(raw).canonical, raw).toBe("GPIO21");
    }
    expect(ESP32_DEVKIT.normalizePin("3V3").kind).toBe("power");
    expect(ESP32_DEVKIT.normalizePin("VIN").canonical).toBe("5V");
    expect(ESP32_DEVKIT.normalizePin("GND").kind).toBe("ground");
    expect(ESP32_DEVKIT.normalizePin("GPIO99").kind).toBe("unknown");
  });

  it("understands the common Uno spellings", () => {
    for (const raw of ["A4", "a4", "SDA", "A4/SDA", "D18", "18"]) {
      expect(ARDUINO_UNO.normalizePin(raw).canonical, raw).toBe("A4");
    }
    for (const raw of ["D10", "10", "Pin 10", "D10 (SS)"]) {
      expect(ARDUINO_UNO.normalizePin(raw).canonical, raw).toBe("D10");
    }
    expect(ARDUINO_UNO.normalizePin("5V").canonical).toBe("5V");
    expect(ARDUINO_UNO.normalizePin("3.3V").canonical).toBe("3V3");
  });
});

// ---------------------------------------------------------------------------

describe("voltage parsing", () => {
  it("parses singles, ranges and shorthands", () => {
    expect(parseVoltageRanges("3.3V")).toEqual([{ min: 3.3, max: 3.3 }]);
    expect(parseVoltageRanges("1.71V to 3.6V")).toEqual([{ min: 1.71, max: 3.6 }]);
    expect(parseVoltageRanges("2.7–5.5 V")).toEqual([{ min: 2.7, max: 5.5 }]);
    expect(parseVoltageRanges("3V3")).toEqual([{ min: 3.3, max: 3.3 }]);
    expect(parseVoltageRanges("unknown")).toEqual([]);
  });

  it("does not treat negated voltages as supported", () => {
    // Real Claude output for the TMP102: the "5V" here is a *limit*, not support.
    const tmp102 = "Referenced to V+; VIH = 0.7 x V+ min, absolute maximum 4V on SCL/SDA/ADD0 - not 5V tolerant";
    expect(voltageSupports(tmp102, 5)).toBe(false);
    expect(voltageSupports("3.3V only, do not connect to 5V", 5)).toBe(false);
    expect(voltageSupports("3.3V (not 5V-tolerant)", 3.3)).toBe(true);
    expect(parseVoltageRanges("DQ: -0.3V to +5.5V; VIH min 2.2V")).toContainEqual({ min: 0.3, max: 5.5 });
  });

  it("checks whether a target voltage is supported", () => {
    expect(voltageSupports("5V", 5)).toBe(true);
    expect(voltageSupports("5V", 3.3)).toBe(false);
    expect(voltageSupports("3.3V", 5)).toBe(false);
    expect(voltageSupports("1.8V - 5.5V", 3.3)).toBe(true);
    expect(voltageSupports("3.3V or 5V", 5)).toBe(true);
    expect(voltageSupports("", 5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("ESP32 DevKit rules", () => {
  it("errors when an input-only pin (34/35/36/39) is used as output or bidirectional", () => {
    for (const n of [34, 35, 36, 39]) {
      const out = checkPins("esp32-devkit", spec([pin({ sensor_pin: "LED", board_pin: `GPIO${n}`, direction: "output" })]));
      expect(byRule(out, "esp32-input-only"), `GPIO${n} output`).toHaveLength(1);
      expect(byRule(out, "esp32-input-only")[0].severity).toBe("error");

      const bidi = checkPins("esp32-devkit", spec([pin({ sensor_pin: "DQ", board_pin: `GPIO${n}`, direction: "bidirectional" })]));
      expect(byRule(bidi, "esp32-input-only"), `GPIO${n} bidirectional`).toHaveLength(1);
    }
  });

  it("allows input-only pins to be used as inputs", () => {
    const out = checkPins("esp32-devkit", spec([pin({ sensor_pin: "OUT", board_pin: "GPIO35", direction: "input" })]));
    expect(byRule(out, "esp32-input-only")).toHaveLength(0);
  });

  it("errors on GPIO 6–11 (internal flash) regardless of direction", () => {
    for (const n of [6, 7, 8, 9, 10, 11]) {
      const out = checkPins("esp32-devkit", spec([pin({ sensor_pin: "SIG", board_pin: `GPIO${n}`, direction: "input" })]));
      const v = byRule(out, "esp32-flash-pins");
      expect(v, `GPIO${n}`).toHaveLength(1);
      expect(v[0].severity).toBe("error");
    }
    expect(byRule(checkPins("esp32-devkit", spec([pin({ sensor_pin: "SIG", board_pin: "GPIO5", direction: "input" })])), "esp32-flash-pins")).toHaveLength(0);
  });

  it("warns when an ADC2 pin is used for analog reads", () => {
    for (const n of [0, 2, 4, 12, 13, 14, 15, 25, 26, 27]) {
      const out = checkPins("esp32-devkit", spec([pin({ sensor_pin: "AOUT", board_pin: `GPIO${n}`, direction: "input", uses_adc: true })]));
      const v = byRule(out, "esp32-adc2-wifi");
      expect(v, `GPIO${n}`).toHaveLength(1);
      expect(v[0].severity).toBe("warning");
    }
  });

  it("does not warn about ADC2 when the pin is digital or an ADC1 pin", () => {
    const digital = checkPins("esp32-devkit", spec([pin({ sensor_pin: "LED", board_pin: "GPIO26", direction: "output", uses_adc: false })]));
    expect(byRule(digital, "esp32-adc2-wifi")).toHaveLength(0);
    const adc1 = checkPins("esp32-devkit", spec([pin({ sensor_pin: "AOUT", board_pin: "GPIO34", direction: "input", uses_adc: true })]));
    expect(byRule(adc1, "esp32-adc2-wifi")).toHaveLength(0);
  });

  it("warns on strapping pins 0, 2, 5, 12, 15", () => {
    for (const n of [0, 2, 5, 12, 15]) {
      const out = checkPins("esp32-devkit", spec([pin({ sensor_pin: "SIG", board_pin: `GPIO${n}`, direction: "input" })]));
      const v = byRule(out, "esp32-strapping");
      expect(v, `GPIO${n}`).toHaveLength(1);
      expect(v[0].severity).toBe("warning");
    }
    expect(byRule(checkPins("esp32-devkit", spec([pin({ sensor_pin: "SIG", board_pin: "GPIO4" })])), "esp32-strapping")).toHaveLength(0);
  });

  it("warns when the part requires 5V logic", () => {
    const out = checkPins("esp32-devkit", spec([pin({ sensor_pin: "SDA", board_pin: "GPIO21", direction: "bidirectional" })], { logic_voltage: "5V" }));
    const v = byRule(out, "esp32-logic-level");
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("warning");
    expect(v[0].message).toMatch(/level shifter/i);
  });

  it("does not warn about logic level for 3.3V-compatible or unknown parts", () => {
    expect(byRule(checkPins("esp32-devkit", spec([pin({ sensor_pin: "SDA", board_pin: "GPIO21" })], { logic_voltage: "1.71V to 3.6V" })), "esp32-logic-level")).toHaveLength(0);
    expect(byRule(checkPins("esp32-devkit", spec([pin({ sensor_pin: "SDA", board_pin: "GPIO21" })], { logic_voltage: "3.3V / 5V" })), "esp32-logic-level")).toHaveLength(0);
    expect(byRule(checkPins("esp32-devkit", spec([pin({ sensor_pin: "SDA", board_pin: "GPIO21" })], { logic_voltage: "" })), "esp32-logic-level")).toHaveLength(0);
  });

  it("errors when the same board pin is assigned twice", () => {
    const out = checkPins(
      "esp32-devkit",
      spec([
        pin({ sensor_pin: "LED1", board_pin: "GPIO26" }),
        pin({ sensor_pin: "LED2", board_pin: "GPIO 26" }),
      ]),
    );
    const v = byRule(out, "esp32-devkit-duplicate-pin");
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("error");
    expect(v[0].sensor_pin).toBe("LED2");
  });

  it("allows shared I2C/SPI bus lines and repeated power/ground pins", () => {
    const out = checkPins(
      "esp32-devkit",
      spec(
        [
          pin({ sensor_pin: "SDA", board_pin: "GPIO21", direction: "bidirectional" }),
          pin({ sensor_pin: "SDA2", board_pin: "GPIO21", direction: "bidirectional" }),
          pin({ sensor_pin: "SCL", board_pin: "GPIO22", direction: "output" }),
          pin({ sensor_pin: "GND", board_pin: "GND", direction: "ground" }),
          pin({ sensor_pin: "GND2", board_pin: "GND", direction: "ground" }),
          pin({ sensor_pin: "VDD", board_pin: "3V3", direction: "power" }),
        ],
        { interface: "I2C" },
      ),
    );
    expect(byRule(out, "esp32-devkit-duplicate-pin")).toHaveLength(0);
  });

  it("passes a clean I2C sensor wiring", () => {
    const out = checkPins(
      "esp32-devkit",
      spec(
        [
          pin({ sensor_pin: "VDD", board_pin: "3V3", direction: "power" }),
          pin({ sensor_pin: "GND", board_pin: "GND", direction: "ground" }),
          pin({ sensor_pin: "SDA", board_pin: "GPIO21", direction: "bidirectional" }),
          pin({ sensor_pin: "SCL", board_pin: "GPIO22", direction: "output" }),
        ],
        { interface: "I2C", logic_voltage: "1.71V to 3.6V" },
      ),
    );
    expect(out).toEqual([]);
  });

  it("reproduces the demo scenario: LED on GPIO35 is an error, GPIO26 is clean", () => {
    const bad = checkPins("esp32-devkit", spec([pin({ sensor_pin: "LED", board_pin: "GPIO35" })]));
    expect(hasErrors(bad)).toBe(true);
    const good = checkPins("esp32-devkit", spec([pin({ sensor_pin: "LED", board_pin: "GPIO26" })]));
    expect(hasErrors(good)).toBe(false);
    expect(good).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("Arduino Uno rules", () => {
  const uno = (pins: PinAssignment[], over: Partial<RuleInput> = {}) =>
    checkPins("arduino-uno", spec(pins, { logic_voltage: "5V", ...over }));

  it("warns when D0 or D1 (USB serial) are used", () => {
    for (const n of [0, 1]) {
      const out = uno([pin({ sensor_pin: "SIG", board_pin: `D${n}`, direction: "input" })]);
      const v = byRule(out, "uno-serial-pins");
      expect(v, `D${n}`).toHaveLength(1);
      expect(v[0].severity).toBe("warning");
    }
    expect(byRule(uno([pin({ sensor_pin: "SIG", board_pin: "D2" })]), "uno-serial-pins")).toHaveLength(0);
  });

  it("errors when an analog read is placed on a pin without an ADC", () => {
    const out = uno([pin({ sensor_pin: "AOUT", board_pin: "D7", direction: "input", uses_adc: true })]);
    const v = byRule(out, "uno-analog-only-a0-a5");
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("error");
  });

  it("allows analog reads on A0–A5", () => {
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const out = uno([pin({ sensor_pin: "AOUT", board_pin: `A${n}`, direction: "input", uses_adc: true })]);
      expect(byRule(out, "uno-analog-only-a0-a5"), `A${n}`).toHaveLength(0);
    }
  });

  it("errors when SPI MOSI/MISO/SCK are not on D11/D12/D13", () => {
    const out = uno(
      [
        pin({ sensor_pin: "MOSI", board_pin: "D5", direction: "output" }),
        pin({ sensor_pin: "MISO", board_pin: "D6", direction: "input" }),
        pin({ sensor_pin: "SCK", board_pin: "D7", direction: "output" }),
        pin({ sensor_pin: "CS", board_pin: "D10", direction: "output" }),
      ],
      { interface: "SPI" },
    );
    const v = byRule(out, "uno-spi-fixed-pins");
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.severity === "error")).toBe(true);
  });

  it("recognises SPI pin aliases (SDI/SDO/SCLK) from datasheets", () => {
    const out = uno(
      [
        pin({ sensor_pin: "SDI", board_pin: "D11", direction: "output" }),
        pin({ sensor_pin: "SDO", board_pin: "D12", direction: "input" }),
        pin({ sensor_pin: "SCLK", board_pin: "D13", direction: "output" }),
        pin({ sensor_pin: "CSB", board_pin: "D10", direction: "output" }),
      ],
      { interface: "SPI" },
    );
    expect(byRule(out, "uno-spi-fixed-pins")).toHaveLength(0);
    expect(byRule(out, "uno-spi-ss-pin")).toHaveLength(0);
  });

  it("warns when the SPI chip select is not on D10", () => {
    const out = uno(
      [
        pin({ sensor_pin: "MOSI", board_pin: "D11" }),
        pin({ sensor_pin: "MISO", board_pin: "D12", direction: "input" }),
        pin({ sensor_pin: "SCK", board_pin: "D13" }),
        pin({ sensor_pin: "CS", board_pin: "D9" }),
      ],
      { interface: "SPI" },
    );
    const v = byRule(out, "uno-spi-ss-pin");
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("warning");
  });

  it("ignores SPI rules for non-SPI parts", () => {
    const out = uno([pin({ sensor_pin: "SCK", board_pin: "D7" })], { interface: "GPIO" });
    expect(byRule(out, "uno-spi-fixed-pins")).toHaveLength(0);
  });

  it("warns and suggests a level shifter for 3.3V-only parts", () => {
    const out = uno([pin({ sensor_pin: "SDA", board_pin: "A4", direction: "bidirectional" })], {
      interface: "I2C",
      logic_voltage: "3.3V",
    });
    const v = byRule(out, "uno-logic-level");
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("warning");
    expect(v[0].message).toMatch(/level shifter/i);
  });

  it("does not warn about logic level for 5V-tolerant parts", () => {
    const out = uno([pin({ sensor_pin: "SDA", board_pin: "A4" })], { logic_voltage: "2.7V to 5.5V" });
    expect(byRule(out, "uno-logic-level")).toHaveLength(0);
  });

  it("errors when the same board pin is assigned twice (except bus lines)", () => {
    const dup = uno([
      pin({ sensor_pin: "LED", board_pin: "D7" }),
      pin({ sensor_pin: "BUZZER", board_pin: "7" }),
    ]);
    expect(byRule(dup, "arduino-uno-duplicate-pin")).toHaveLength(1);

    const bus = uno(
      [
        pin({ sensor_pin: "SDA", board_pin: "A4", direction: "bidirectional" }),
        pin({ sensor_pin: "SDA_B", board_pin: "SDA", direction: "bidirectional" }),
      ],
      { interface: "I2C" },
    );
    expect(byRule(bus, "arduino-uno-duplicate-pin")).toHaveLength(0);
  });

  it("passes a clean 5V I2C wiring", () => {
    const out = uno(
      [
        pin({ sensor_pin: "VCC", board_pin: "5V", direction: "power" }),
        pin({ sensor_pin: "GND", board_pin: "GND", direction: "ground" }),
        pin({ sensor_pin: "SDA", board_pin: "A4", direction: "bidirectional" }),
        pin({ sensor_pin: "SCL", board_pin: "A5", direction: "output" }),
      ],
      { interface: "I2C", logic_voltage: "3.3V to 5.5V" },
    );
    expect(out).toEqual([]);
  });

  it("sorts errors before warnings", () => {
    const out = uno([
      pin({ sensor_pin: "RX", board_pin: "D0", direction: "input" }),
      pin({ sensor_pin: "AOUT", board_pin: "D7", direction: "input", uses_adc: true }),
    ]);
    expect(ids(out)[0]).toBe("uno-analog-only-a0-a5");
  });
});
