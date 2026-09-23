import { describe, expect, it } from "vitest";
import { normalizeSpec, parseCodeFix, parseSpecJson, SpecParseError, stripToJson } from "./claude";

const valid = {
  part_name: "BME280",
  description: "Env sensor",
  interface: "I2C",
  operating_voltage: "1.71V to 3.6V",
  logic_voltage: "1.2V to 3.6V",
  i2c_address: "0x76",
  pins: [
    { sensor_pin: "SDA", board_pin: "GPIO21", direction: "bidirectional", uses_adc: false, note: "" },
  ],
  init_sequence: [{ register: "0xF4", value: "0x27", purpose: "normal mode", source_page: 29 }],
  driver_code: "void setup(){} void loop(){}",
  warnings: ["3.3V only"],
  source_pages: { part_name: 1, pins: "36" },
};

describe("stripToJson", () => {
  it("removes ```json fences", () => {
    expect(stripToJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripToJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("drops preamble and trailing commentary", () => {
    expect(stripToJson('Here is the JSON:\n{"a":1}\nHope that helps!')).toBe('{"a":1}');
  });

  it("leaves clean JSON alone", () => {
    expect(stripToJson('{"a":{"b":2}}')).toBe('{"a":{"b":2}}');
  });
});

describe("parseSpecJson / normalizeSpec", () => {
  it("parses a valid fenced response", () => {
    const spec = parseSpecJson("```json\n" + JSON.stringify(valid) + "\n```");
    expect(spec.part_name).toBe("BME280");
    expect(spec.pins).toHaveLength(1);
    expect(spec.source_pages.pins).toBe(36); // coerced from string
    expect(spec.init_sequence[0].source_page).toBe(29);
  });

  it("normalises interface and direction spellings", () => {
    const spec = normalizeSpec({
      ...valid,
      interface: "i2c",
      pins: [{ sensor_pin: "X", board_pin: "GPIO4", direction: "OUT", uses_adc: "true", note: null }],
    });
    expect(spec.interface).toBe("I2C");
    expect(spec.pins[0].direction).toBe("output");
    expect(spec.pins[0].uses_adc).toBe(true);
    expect(spec.pins[0].note).toBe("");
  });

  it("normalises the libraries list", () => {
    expect(normalizeSpec({ ...valid, libraries: ["<Wire.h>", "wire", "SPI.h", " Adafruit BME280 Library "] }).libraries).toEqual([
      "Wire",
      "SPI",
      "Adafruit BME280 Library",
    ]);
    expect(normalizeSpec(valid).libraries).toEqual([]);
  });

  it("turns an empty i2c_address into null and defaults optional arrays", () => {
    const spec = normalizeSpec({ ...valid, i2c_address: "", init_sequence: undefined, warnings: undefined, source_pages: undefined });
    expect(spec.i2c_address).toBeNull();
    expect(spec.init_sequence).toEqual([]);
    expect(spec.warnings).toEqual([]);
    expect(spec.source_pages).toEqual({});
  });

  it("parses compile-fix replies and falls back to the previous library list", () => {
    const fix = parseCodeFix('```json\n{"driver_code":"#include <Wire.h>\\nvoid setup(){}","change_summary":"Added Wire.h"}\n```', ["Wire"]);
    expect(fix.driver_code).toContain("#include <Wire.h>");
    expect(fix.libraries).toEqual(["Wire"]);
    expect(fix.summary).toBe("Added Wire.h");
    expect(parseCodeFix('{"driver_code":"x","libraries":["<SPI.h>"]}', []).libraries).toEqual(["SPI"]);
    expect(() => parseCodeFix('{"driver_code":""}', [])).toThrow(SpecParseError);
    expect(() => parseCodeFix("nope", [])).toThrow(SpecParseError);
  });

  it("throws SpecParseError on invalid JSON", () => {
    expect(() => parseSpecJson("not json at all")).toThrow(SpecParseError);
    expect(() => parseSpecJson('{"part_name": ')).toThrow(/invalid JSON/);
  });

  it("throws SpecParseError on schema mismatch", () => {
    expect(() => parseSpecJson(JSON.stringify({ ...valid, pins: [] }))).toThrow(/pins/);
    expect(() => parseSpecJson(JSON.stringify({ ...valid, driver_code: "" }))).toThrow(/driver_code/);
    expect(() => parseSpecJson(JSON.stringify({ ...valid, interface: "CAN" }))).toThrow(/interface/);
    expect(() =>
      parseSpecJson(JSON.stringify({ ...valid, pins: [{ sensor_pin: "A", board_pin: "1", direction: "sideways" }] })),
    ).toThrow(/direction/);
  });
});
