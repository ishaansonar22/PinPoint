import { describe, expect, it } from "vitest";
import { checkLibraries, normalizeLibraryName } from "../src/allowlist.js";

describe("normalizeLibraryName", () => {
  it("strips include syntax", () => {
    expect(normalizeLibraryName("<Wire.h>")).toBe("Wire");
    expect(normalizeLibraryName('"SPI.h"')).toBe("SPI");
    expect(normalizeLibraryName("  Adafruit BME280 Library ")).toBe("Adafruit BME280 Library");
  });
});

describe("checkLibraries", () => {
  it("classifies builtin, installable and rejected libraries", () => {
    const r = checkLibraries(["Wire", "SPI", "OneWire", "DallasTemperature", "SketchyLib", "Adafruit BME280 Library"]);
    expect(r.builtin).toEqual(["Wire", "SPI"]);
    expect(r.install).toEqual(["OneWire", "DallasTemperature", "Adafruit BME280 Library"]);
    expect(r.rejected).toEqual(["SketchyLib"]);
  });

  it("is case-insensitive and returns canonical names", () => {
    const r = checkLibraries(["wire", "onewire", "dht SENSOR library"]);
    expect(r.builtin).toEqual(["wire"]);
    expect(r.install).toEqual(["OneWire", "DHT sensor library"]);
  });

  it("allows vendor prefixes", () => {
    expect(checkLibraries(["Adafruit Whatever Library"]).install).toEqual(["Adafruit Whatever Library"]);
    expect(checkLibraries(["SparkFun Something"]).install).toEqual(["SparkFun Something"]);
  });

  it("rejects names with unsafe characters", () => {
    const r = checkLibraries(["Adafruit ../../etc", "Foo; rm -rf /", "Adafruit\nX"]);
    expect(r.install).toEqual([]);
    expect(r.rejected).toHaveLength(3);
  });

  it("dedupes and ignores blanks", () => {
    const r = checkLibraries(["Wire", "wire", "", "  ", "<Wire.h>"]);
    expect(r.builtin).toEqual(["Wire"]);
  });
});
