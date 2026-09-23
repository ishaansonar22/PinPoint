import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp, validateCompileRequest } from "../src/server.js";
import { LibraryInstallError, parseCompileOutput } from "../src/arduino.js";

const TOKEN = "test-token";
const compile = vi.fn(async (_board: string, code: string) => ({
  success: !code.includes("BREAK"),
  errors: code.includes("BREAK") ? "sketch.ino:1:1: error: 'BREAK' was not declared in this scope" : "",
  warnings: "",
  duration_ms: 42,
}));
const ensureLibraries = vi.fn(async (names: readonly string[]) => {
  if (names.includes("Adafruit Broken")) throw new LibraryInstallError("Adafruit Broken", "not found in index");
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createApp({
    token: TOKEN,
    maxCodeBytes: 100 * 1024,
    maxConcurrent: 2,
    maxQueue: 2,
    compile,
    ensureLibraries,
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function post(body: unknown, token: string | null = TOKEN) {
  const res = await fetch(`${base}/compile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("validateCompileRequest", () => {
  it("rejects bad boards, empty code, oversized code and bad libraries", () => {
    expect(validateCompileRequest({ board: "pico", code: "x" }, 1000)).toMatchObject({ ok: false });
    expect(validateCompileRequest({ board: "uno", code: "" }, 1000)).toMatchObject({ ok: false });
    expect(validateCompileRequest({ board: "uno", code: "x".repeat(1001) }, 1000)).toMatchObject({ ok: false });
    expect(validateCompileRequest({ board: "uno", code: "x", libraries: "Wire" }, 1000)).toMatchObject({ ok: false });
    expect(validateCompileRequest({ board: "uno", code: "x", libraries: [1] }, 1000)).toMatchObject({ ok: false });
  });

  it("accepts a valid request and defaults libraries", () => {
    const v = validateCompileRequest({ board: "esp32", code: "void setup(){}" }, 1000);
    expect(v).toEqual({ ok: true, value: { board: "esp32", code: "void setup(){}", libraries: [] } });
  });
});

describe("POST /compile", () => {
  it("requires the shared token", async () => {
    expect((await post({ board: "uno", code: "x" }, null)).status).toBe(401);
    expect((await post({ board: "uno", code: "x" }, "wrong")).status).toBe(401);
  });

  it("accepts the token via x-compile-token too", async () => {
    const res = await fetch(`${base}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-compile-token": TOKEN },
      body: JSON.stringify({ board: "uno", code: "void setup(){} void loop(){}" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid bodies", async () => {
    expect((await post({ board: "nope", code: "x" })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
  });

  it("rejects libraries that are not allowlisted before compiling", async () => {
    compile.mockClear();
    const r = await post({ board: "uno", code: "void setup(){}", libraries: ["Wire", "EvilLib"] });
    expect(r.status).toBe(400);
    expect(r.json.rejected_libraries).toEqual(["EvilLib"]);
    expect(compile).not.toHaveBeenCalled();
  });

  it("installs only non-builtin allowlisted libraries, then compiles", async () => {
    ensureLibraries.mockClear();
    compile.mockClear();
    const r = await post({
      board: "esp32",
      code: "void setup(){} void loop(){}",
      libraries: ["Wire", "OneWire", "Adafruit BME280 Library"],
    });
    expect(r.status).toBe(200);
    expect(ensureLibraries).toHaveBeenCalledWith(["OneWire", "Adafruit BME280 Library"]);
    expect(compile).toHaveBeenCalledWith("esp32", "void setup(){} void loop(){}");
    expect(r.json).toMatchObject({ success: true, errors: "", duration_ms: 42, fqbn: "esp32:esp32:esp32" });
  });

  it("reports compile failures with errors text", async () => {
    const r = await post({ board: "uno", code: "BREAK" });
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(false);
    expect(String(r.json.errors)).toMatch(/not declared/);
  });

  it("returns 400 when a library cannot be installed", async () => {
    const r = await post({ board: "uno", code: "void setup(){}", libraries: ["Adafruit Broken"] });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toMatch(/Adafruit Broken/);
  });

  it("serves /health without a token", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe("parseCompileOutput", () => {
  const dir = "/tmp/pinpoint-compile-abc/sketch";

  it("extracts error lines from arduino-cli JSON output and strips temp paths", () => {
    const stdout = JSON.stringify({
      compiler_out: "",
      compiler_err: `${dir}/sketch.ino: In function 'void setup()':\n${dir}/sketch.ino:12:3: error: 'Wire' was not declared in this scope\n   Wire.begin();\n   ^~~~\n${dir}/sketch.ino:5:7: warning: unused variable 'x' [-Wunused-variable]`,
      success: false,
      error: "Error during build: exit status 1",
    });
    const r = parseCompileOutput({ code: 1, stdout, stderr: "", timedOut: false }, dir);
    expect(r.success).toBe(false);
    expect(r.errors).toContain("sketch.ino:12:3: error: 'Wire' was not declared in this scope");
    expect(r.errors).not.toContain("/tmp/");
    expect(r.errors).toContain("Wire.begin();");
    expect(r.warnings).toContain("unused variable");
  });

  it("strips Windows temp paths with spaces and 8.3 short names", () => {
    // The service created the dir under the short name, arduino-cli printed the long one.
    const created = "C:\\Users\\ISHAAN~1\\AppData\\Local\\Temp\\pinpoint-compile-n0drox\\sketch";
    const printed = "C:\\Users\\ISHAAN SONAR\\AppData\\Local\\Temp\\pinpoint-compile-n0drox\\sketch";
    const stdout = JSON.stringify({
      compiler_err: `${printed}\\sketch.ino:2:37: error: 'Wire' was not declared in this scope`,
      success: false,
    });
    const r = parseCompileOutput({ code: 1, stdout, stderr: "", timedOut: false }, created);
    expect(r.errors).toBe("sketch.ino:2:37: error: 'Wire' was not declared in this scope");
  });

  it("reports success with warnings", () => {
    const stdout = JSON.stringify({ compiler_out: "Sketch uses 924 bytes", compiler_err: `${dir}/sketch.ino:5:7: warning: unused variable 'x'`, success: true });
    const r = parseCompileOutput({ code: 0, stdout, stderr: "", timedOut: false }, dir);
    expect(r).toMatchObject({ success: true, errors: "" });
    expect(r.warnings).toMatch(/unused variable/);
  });

  it("falls back to raw output when stdout is not JSON", () => {
    const r = parseCompileOutput({ code: 1, stdout: "", stderr: "Error: platform not installed", timedOut: false }, dir);
    expect(r.success).toBe(false);
    expect(r.errors).toMatch(/platform not installed/);
  });

  it("reports timeouts", () => {
    const r = parseCompileOutput({ code: null, stdout: "", stderr: "", timedOut: true }, dir);
    expect(r.success).toBe(false);
    expect(r.errors).toMatch(/timed out/);
  });
});
