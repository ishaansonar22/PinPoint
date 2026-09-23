/**
 * Compile-check loop: send driver_code to the compile service, and if it
 * fails, ask Claude to fix the code and try again (up to `maxRetries` times).
 *
 * The compile and fix steps are injected so the loop can be unit-tested with
 * the service and Claude mocked out.
 */

import type { CompileTarget } from "./boards";
import type { CodeFix } from "./claude";
import type { CompileAttempt, CompileCheck, CompileFix, PartSpec } from "./types";

export const DEFAULT_MAX_RETRIES = 2;

export interface CompileServiceResponse {
  success: boolean;
  errors: string;
  warnings: string;
  duration_ms: number;
  fqbn?: string;
}

/** Thrown when the service itself cannot be used (network, auth, 5xx). */
export class CompileServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CompileServiceError";
  }
}

export function isCompileConfigured(): boolean {
  return Boolean(process.env.COMPILE_SERVICE_URL?.trim() && process.env.COMPILE_SERVICE_TOKEN?.trim());
}

/** POST /compile on the configured compile service. */
export async function compileViaService(
  board: CompileTarget,
  code: string,
  libraries: string[],
): Promise<CompileServiceResponse> {
  const base = process.env.COMPILE_SERVICE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.COMPILE_SERVICE_TOKEN?.trim();
  if (!base || !token) throw new CompileServiceError("Compile service is not configured.");

  let res: Response;
  try {
    res = await fetch(`${base}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ board, code, libraries }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new CompileServiceError(`Could not reach the compile service: ${why}`);
  }

  const body = (await res.json().catch(() => ({}))) as Partial<CompileServiceResponse> & {
    error?: string;
  };

  if (res.status === 400) {
    // Invalid request (e.g. a library that is not allowlisted). Treat it as a
    // compile failure so the fix loop can rewrite the code/library list.
    return {
      success: false,
      errors: body.error ?? "The compile service rejected the request.",
      warnings: "",
      duration_ms: 0,
    };
  }
  if (!res.ok) {
    throw new CompileServiceError(body.error ?? `Compile service returned HTTP ${res.status}.`, res.status);
  }
  return {
    success: body.success === true,
    errors: body.errors ?? "",
    warnings: body.warnings ?? "",
    duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : 0,
    fqbn: body.fqbn,
  };
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

export interface CompileLoopDeps {
  compile: (code: string, libraries: string[]) => Promise<CompileServiceResponse>;
  fix: (spec: PartSpec, errors: string, attempt: number) => Promise<CodeFix>;
  onProgress?: (message: string) => void;
  maxRetries?: number;
}

export interface CompileLoopResult {
  spec: PartSpec;
  compile: CompileCheck;
}

export function skippedCompile(message = "Compile check not configured"): CompileCheck {
  return { status: "skipped", attempts: [], fixes: [], message };
}

export async function runCompileLoop(spec: PartSpec, deps: CompileLoopDeps): Promise<CompileLoopResult> {
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const progress = deps.onProgress ?? (() => {});
  const attempts: CompileAttempt[] = [];
  const fixes: CompileFix[] = [];
  let current = spec;
  let fqbn: string | undefined;

  const compileOnce = async (attempt: number): Promise<CompileAttempt> => {
    const r = await deps.compile(current.driver_code, current.libraries);
    fqbn = r.fqbn ?? fqbn;
    const a: CompileAttempt = {
      attempt,
      success: r.success,
      errors: r.errors,
      warnings: r.warnings,
      duration_ms: r.duration_ms,
    };
    attempts.push(a);
    return a;
  };

  try {
    progress("Compiling...");
    let last = await compileOnce(1);
    if (last.success) {
      progress("Compiled successfully");
      return { spec: current, compile: { status: "passed", attempts, fixes, fqbn } };
    }

    for (let i = 1; i <= maxRetries; i++) {
      progress(`Fixing compile error (attempt ${i})...`);
      const fix = await deps.fix(current, last.errors, i);
      fixes.push({ attempt: last.attempt, errors: last.errors, summary: fix.summary });
      current = { ...current, driver_code: fix.driver_code, libraries: fix.libraries };

      progress("Compiling...");
      last = await compileOnce(i + 1);
      if (last.success) {
        progress("Compiled successfully");
        return { spec: current, compile: { status: "fixed", attempts, fixes, fqbn } };
      }
    }

    progress(`Compile failed after ${attempts.length} attempts`);
    return {
      spec: current,
      compile: {
        status: "failed",
        attempts,
        fixes,
        fqbn,
        message: last.errors || "The sketch did not compile.",
      },
    };
  } catch (err) {
    if (err instanceof CompileServiceError) {
      return {
        spec: current,
        compile: { status: "unavailable", attempts, fixes, fqbn, message: err.message },
      };
    }
    throw err;
  }
}
