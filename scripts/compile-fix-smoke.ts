/**
 * Smoke-test the compile-check loop against a REAL compile service and REAL
 * Claude, without needing a datasheet PDF. Feeds a sketch that is missing
 * `#include <Wire.h>` and prints what the loop did.
 *
 *   COMPILE_SERVICE_URL=http://localhost:8080 COMPILE_SERVICE_TOKEN=... npm run compile:smoke [esp32-devkit|arduino-uno]
 *
 * Reads ANTHROPIC_API_KEY from .env.local if it is not already set.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BOARDS, isBoardId } from "../lib/boards";
import { fixCompileErrors } from "../lib/claude";
import { compileViaService, isCompileConfigured, runCompileLoop } from "../lib/compile";
import type { PartSpec } from "../lib/types";

function loadEnvLocal() {
  if (process.env.ANTHROPIC_API_KEY || !existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnvLocal();
  const boardId = process.argv[2] ?? "esp32-devkit";
  if (!isBoardId(boardId)) throw new Error(`unknown board ${boardId}`);
  if (!isCompileConfigured()) throw new Error("Set COMPILE_SERVICE_URL and COMPILE_SERVICE_TOKEN first.");
  const board = BOARDS[boardId];

  const spec: PartSpec = {
    part_name: "SHT31-D",
    description: "smoke test",
    interface: "I2C",
    operating_voltage: "2.15V to 5.5V",
    logic_voltage: "2.15V to 5.5V",
    i2c_address: "0x44",
    pins: [],
    init_sequence: [],
    driver_code: readFileSync(path.join("scripts", "fixtures", "sht31_before.ino"), "utf8"),
    libraries: [],
    warnings: [],
    source_pages: {},
  };

  const started = Date.now();
  const out = await runCompileLoop(spec, {
    compile: (code, libs) => compileViaService(board.compileTarget, code, libs),
    fix: (s, errors, attempt) => fixCompileErrors(s, errors, board, attempt, (m) => console.log("  [claude]", m)),
    onProgress: (m) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${m}`),
  });

  console.log("\nstatus:", out.compile.status);
  for (const a of out.compile.attempts) console.log(` attempt ${a.attempt}: ${a.success ? "ok" : "FAIL"} (${a.duration_ms} ms)`);
  for (const f of out.compile.fixes) console.log(` fix for attempt ${f.attempt}: ${f.summary}`);
  console.log("libraries:", out.spec.libraries);
  console.log("code has Wire.h include:", /#include\s*<Wire\.h>/.test(out.spec.driver_code));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
