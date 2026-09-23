/**
 * Thin wrapper around the arduino-cli executable.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BOARDS, config, type CompileBoard } from "./config.js";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runCli(args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      config.arduinoCli,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, killSignal: "SIGKILL", windowsHide: true },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string; killed?: boolean; signal?: string }) | null;
        if (e && e.code === "ENOENT") {
          resolve({
            code: null,
            stdout: "",
            stderr: `arduino-cli not found at "${config.arduinoCli}" (set ARDUINO_CLI)`,
            timedOut: false,
          });
          return;
        }
        const timedOut = !!e && (e.killed === true || e.signal === "SIGKILL");
        const code = e ? (typeof e.code === "number" ? e.code : null) : 0;
        resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), timedOut });
      },
    );
  });
}

export async function cliVersion(): Promise<string> {
  const r = await runCli(["version", "--json"], 15_000);
  try {
    const j = JSON.parse(r.stdout) as { VersionString?: string; Application?: string };
    return j.VersionString ?? r.stdout.trim();
  } catch {
    return (r.stdout || r.stderr).trim();
  }
}

export async function installedCores(): Promise<string[]> {
  const r = await runCli(["core", "list", "--json"], 30_000);
  try {
    const j = JSON.parse(r.stdout) as
      | { platforms?: Array<{ id?: string; installed_version?: string }> }
      | Array<{ id?: string }>;
    const list = Array.isArray(j) ? j : j.platforms ?? [];
    return list.map((p) => p.id ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------

let installedLibs: Set<string> | null = null;
let installChain: Promise<void> = Promise.resolve();

async function refreshInstalledLibraries(): Promise<Set<string>> {
  const r = await runCli(["lib", "list", "--json"], 30_000);
  const set = new Set<string>();
  try {
    const j = JSON.parse(r.stdout) as
      | { installed_libraries?: Array<{ library?: { name?: string } }> }
      | Array<{ library?: { name?: string } }>;
    const list = Array.isArray(j) ? j : j.installed_libraries ?? [];
    for (const item of list) {
      const n = item.library?.name;
      if (n) set.add(n.toLowerCase());
    }
  } catch {
    /* leave empty: we'll try to install and let arduino-cli decide */
  }
  installedLibs = set;
  return set;
}

/**
 * Install every library in `names` that is not already present.
 * Installs run one at a time: concurrent `lib install` calls can corrupt the
 * library directory.
 */
export function ensureLibraries(names: readonly string[]): Promise<void> {
  const task = installChain.then(async () => {
    if (names.length === 0) return;
    const have = installedLibs ?? (await refreshInstalledLibraries());
    for (const name of names) {
      if (have.has(name.toLowerCase())) continue;
      const r = await runCli(["lib", "install", name], config.libInstallTimeoutMs);
      if (r.code !== 0) {
        const why = (r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ");
        throw new LibraryInstallError(name, why || (r.timedOut ? "timed out" : `exit ${r.code}`));
      }
      have.add(name.toLowerCase());
    }
  });
  // Keep the chain alive even if this task fails.
  installChain = task.catch(() => {});
  return task;
}

export class LibraryInstallError extends Error {
  constructor(
    public readonly library: string,
    detail: string,
  ) {
    super(`Failed to install library "${library}": ${detail}`);
    this.name = "LibraryInstallError";
  }
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

export interface CompileOutcome {
  success: boolean;
  errors: string;
  warnings: string;
  duration_ms: number;
}

const MAX_TEXT = 8_000;

function cap(s: string): string {
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "\n… (truncated)" : s;
}

/** Replace the temp sketch path so errors read like "sketch.ino:12:3: error: …". */
function stripSketchPath(text: string, sketchDir: string): string {
  const variants = new Set([sketchDir, sketchDir.replace(/\\/g, "/"), sketchDir.replace(/\//g, "\\")]);
  let out = text;
  for (const v of variants) {
    if (!v) continue;
    out = out.split(v + "/").join("").split(v + "\\").join("").split(v).join("");
  }
  // The OS may report the temp dir in a different form than we created it
  // (Windows 8.3 short names, symlinked /tmp). Strip any remaining absolute
  // path that ends in our temp folder name.
  // Path segments may contain spaces, so match segment-by-segment up to our folder.
  out = out.replace(
    /(?:[A-Za-z]:)?[\\/](?:[^\\/\r\n]*?[\\/])*?pinpoint-compile-[^\\/\s"']+[\\/]sketch[\\/]?/g,
    "",
  );
  return out;
}

/**
 * Turn raw arduino-cli output into success / errors / warnings.
 * Exported for unit tests.
 */
export function parseCompileOutput(run: RunResult, sketchDir: string): Omit<CompileOutcome, "duration_ms"> {
  if (run.timedOut) {
    return {
      success: false,
      errors: `Compile timed out after ${Math.round(config.compileTimeoutMs / 1000)} seconds.`,
      warnings: "",
    };
  }

  let compilerOut = "";
  let compilerErr = "";
  let cliError = "";
  let success = run.code === 0;

  try {
    const j = JSON.parse(run.stdout) as {
      compiler_out?: string;
      compiler_err?: string;
      success?: boolean;
      error?: string;
    };
    compilerOut = j.compiler_out ?? "";
    compilerErr = j.compiler_err ?? "";
    cliError = j.error ?? "";
    if (typeof j.success === "boolean") success = j.success;
  } catch {
    compilerOut = run.stdout;
    compilerErr = run.stderr;
  }

  const all = stripSketchPath(`${compilerErr}\n${run.stderr}`, sketchDir);
  const lines = all
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);

  const warnings = lines.filter((l) => /warning:/i.test(l));

  if (success) {
    return { success: true, errors: "", warnings: cap(dedupe(warnings).join("\n")) };
  }

  // Error lines: compiler diagnostics plus the lines that follow them (source
  // excerpt and caret), then any cli-level error (missing core, etc.).
  const errorLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/(^|\s)(error|fatal error):|undefined reference|collect2:|ld returned|multiple definition|does not name a type|was not declared/i.test(l)) {
      errorLines.push(l);
      // include up to 2 context lines (source + caret) when they are not diagnostics
      for (let k = 1; k <= 2 && i + k < lines.length; k++) {
        const next = lines[i + k];
        if (/(error|warning|note):/i.test(next)) break;
        errorLines.push(next);
      }
    }
  }
  if (cliError) errorLines.push(stripSketchPath(cliError, sketchDir));
  const errors =
    errorLines.length > 0
      ? dedupe(errorLines).join("\n")
      : (all.trim() || compilerOut.trim() || `arduino-cli exited with code ${run.code ?? "unknown"}`);

  return { success: false, errors: cap(errors), warnings: cap(dedupe(warnings).join("\n")) };
}

function dedupe(lines: string[]): string[] {
  return Array.from(new Set(lines));
}

/**
 * Write `code` to a temporary sketch, compile it for `board`, and clean up.
 */
export async function compileSketch(board: CompileBoard, code: string): Promise<CompileOutcome> {
  const started = Date.now();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "pinpoint-compile-"));
  const sketchDir = path.join(tmp, "sketch");
  try {
    await mkdir(sketchDir);
    await writeFile(path.join(sketchDir, "sketch.ino"), code, "utf8");
    const run = await runCli(
      ["compile", "--fqbn", BOARDS[board].fqbn, "--warnings", "default", "--json", sketchDir],
      config.compileTimeoutMs,
    );
    const parsed = parseCompileOutput(run, sketchDir);
    return { ...parsed, duration_ms: Date.now() - started };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
