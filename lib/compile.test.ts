import { describe, expect, it, vi } from "vitest";
import type { CodeFix } from "./claude";
import { CompileServiceError, runCompileLoop, type CompileServiceResponse } from "./compile";
import type { PartSpec } from "./types";

const spec: PartSpec = {
  part_name: "X",
  description: "d",
  interface: "I2C",
  operating_voltage: "3.3V",
  logic_voltage: "3.3V",
  i2c_address: "0x44",
  pins: [{ sensor_pin: "SDA", board_pin: "GPIO21", direction: "bidirectional", uses_adc: false, note: "" }],
  init_sequence: [],
  driver_code: "void setup(){ Wire.begin(); } void loop(){}",
  libraries: [],
  warnings: [],
  source_pages: {},
};

const ok: CompileServiceResponse = { success: true, errors: "", warnings: "", duration_ms: 10, fqbn: "esp32:esp32:esp32" };
const bad = (msg: string): CompileServiceResponse => ({ success: false, errors: msg, warnings: "", duration_ms: 5 });

/** compile() that fails `failures` times, then succeeds. */
function compileFailingTimes(failures: number) {
  let n = 0;
  return vi.fn(async (_code: string, _libs: string[]) => (n++ < failures ? bad(`error ${n}`) : ok));
}

const fixer = vi.fn(async (s: PartSpec, errors: string, attempt: number): Promise<CodeFix> => ({
  driver_code: `#include <Wire.h>\n${s.driver_code} // fix ${attempt} for: ${errors}`,
  libraries: ["Wire"],
  summary: `Added Wire.h (attempt ${attempt})`,
}));

describe("runCompileLoop", () => {
  it("passes on the first attempt without calling the fixer", async () => {
    const compile = compileFailingTimes(0);
    fixer.mockClear();
    const progress: string[] = [];
    const r = await runCompileLoop(spec, { compile, fix: fixer, onProgress: (m) => progress.push(m) });
    expect(r.compile.status).toBe("passed");
    expect(r.compile.attempts).toHaveLength(1);
    expect(r.compile.fixes).toHaveLength(0);
    expect(r.compile.fqbn).toBe("esp32:esp32:esp32");
    expect(fixer).not.toHaveBeenCalled();
    expect(r.spec).toBe(spec);
    expect(progress).toEqual(["Compiling...", "Compiled successfully"]);
  });

  it("fixes after one failure and records the attempt, fix and progress", async () => {
    const compile = compileFailingTimes(1);
    fixer.mockClear();
    const progress: string[] = [];
    const r = await runCompileLoop(spec, { compile, fix: fixer, onProgress: (m) => progress.push(m) });
    expect(r.compile.status).toBe("fixed");
    expect(r.compile.attempts.map((a) => a.success)).toEqual([false, true]);
    expect(r.compile.fixes).toEqual([{ attempt: 1, errors: "error 1", summary: "Added Wire.h (attempt 1)" }]);
    expect(fixer).toHaveBeenCalledTimes(1);
    expect(fixer).toHaveBeenCalledWith(spec, "error 1", 1);
    expect(r.spec.driver_code).toContain("#include <Wire.h>");
    expect(r.spec.libraries).toEqual(["Wire"]);
    // second compile used the fixed code
    expect(compile.mock.calls[1][0]).toContain("#include <Wire.h>");
    expect(compile.mock.calls[1][1]).toEqual(["Wire"]);
    expect(progress).toEqual([
      "Compiling...",
      "Fixing compile error (attempt 1)...",
      "Compiling...",
      "Compiled successfully",
    ]);
  });

  it("fixes after two failures (the retry limit)", async () => {
    const compile = compileFailingTimes(2);
    fixer.mockClear();
    const r = await runCompileLoop(spec, { compile, fix: fixer });
    expect(r.compile.status).toBe("fixed");
    expect(r.compile.attempts).toHaveLength(3);
    expect(r.compile.fixes.map((f) => f.attempt)).toEqual([1, 2]);
    expect(fixer).toHaveBeenCalledTimes(2);
    // each fix sees the previous fix's code
    expect((fixer.mock.calls[1][0] as PartSpec).driver_code).toContain("fix 1");
  });

  it("gives up after maxRetries and reports failed with the last error", async () => {
    const compile = compileFailingTimes(99);
    fixer.mockClear();
    const progress: string[] = [];
    const r = await runCompileLoop(spec, { compile, fix: fixer, onProgress: (m) => progress.push(m) });
    expect(r.compile.status).toBe("failed");
    expect(r.compile.attempts).toHaveLength(3); // 1 initial + 2 retries
    expect(r.compile.fixes).toHaveLength(2);
    expect(fixer).toHaveBeenCalledTimes(2);
    expect(compile).toHaveBeenCalledTimes(3);
    expect(r.compile.message).toBe("error 3");
    expect(r.spec.driver_code).toContain("fix 2"); // keeps the latest code so the user sees it
    expect(progress.at(-1)).toBe("Compile failed after 3 attempts");
  });

  it("honours a custom maxRetries", async () => {
    const compile = compileFailingTimes(99);
    const r = await runCompileLoop(spec, { compile, fix: fixer, maxRetries: 0 });
    expect(r.compile.status).toBe("failed");
    expect(r.compile.attempts).toHaveLength(1);
    expect(r.compile.fixes).toHaveLength(0);
  });

  it("returns 'unavailable' when the service cannot be reached", async () => {
    const compile = vi.fn(async () => {
      throw new CompileServiceError("Could not reach the compile service: ECONNREFUSED");
    });
    const r = await runCompileLoop(spec, { compile, fix: fixer });
    expect(r.compile.status).toBe("unavailable");
    expect(r.compile.message).toMatch(/ECONNREFUSED/);
    expect(r.spec).toBe(spec);
  });

  it("propagates unexpected errors from the fixer", async () => {
    const compile = compileFailingTimes(1);
    const fix = vi.fn(async () => {
      throw new Error("Claude exploded");
    });
    await expect(runCompileLoop(spec, { compile, fix })).rejects.toThrow("Claude exploded");
  });
});
