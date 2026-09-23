/**
 * The full generate pipeline:
 *   PDF -> Claude extraction -> rules engine -> (auto-correction -> rules engine)
 */

import { BOARDS, type BoardDef } from "./boards";
import { correctSpec, extractSpec, fixCompileErrors, type Logger } from "./claude";
import { compileViaService, isCompileConfigured, runCompileLoop, skippedCompile } from "./compile";
import { checkPins, hasErrors } from "./rules";
import type { BoardId, CompileCheck, Correction, GenerateResult, PartSpec, Violation } from "./types";

export interface PipelineOptions {
  pdfBase64: string;
  board: BoardId;
  onProgress?: (message: string) => void;
  log?: Logger;
}

/**
 * Compare pin assignments before and after correction and describe what moved.
 * Exported for tests and for building demo fixtures.
 */
export function diffPins(
  board: BoardDef,
  before: PartSpec,
  after: PartSpec,
  violations: Violation[],
): Correction[] {
  const out: Correction[] = [];
  before.pins.forEach((orig, index) => {
    const fixed = after.pins.find(
      (p) => p.sensor_pin.trim().toLowerCase() === orig.sensor_pin.trim().toLowerCase(),
    );
    if (!fixed) return;
    const a = board.normalizePin(orig.board_pin).canonical;
    const b = board.normalizePin(fixed.board_pin).canonical;
    if (a === b) return;
    const reasons = violations.filter((v) => v.pin_index === index).map((v) => v.message);
    out.push({
      sensor_pin: orig.sensor_pin,
      original_pin: orig.board_pin,
      new_pin: fixed.board_pin,
      reason: reasons.length ? reasons.join(" ") : fixed.note || "Moved during auto-correction.",
    });
  });
  return out;
}

export async function runPipeline(opts: PipelineOptions): Promise<GenerateResult> {
  const board = BOARDS[opts.board];
  const progress = opts.onProgress ?? (() => {});
  const log = opts.log ?? (() => {});
  const started = Date.now();

  progress(`Reading the datasheet with Claude for the ${board.name}…`);
  const spec = await extractSpec(opts.pdfBase64, board, log);
  log("Extracted spec", spec);

  progress("Running the board rules engine…");
  const violations = checkPins(opts.board, spec);
  log("Rules engine violations", violations);

  let result: GenerateResult;

  if (!hasErrors(violations)) {
    result = {
      board: opts.board,
      spec,
      violations,
      autoCorrected: false,
      corrections: [],
      originalViolations: violations,
    };
  } else {
    const errorCount = violations.filter((v) => v.severity === "error").length;
    progress(
      `Found ${errorCount} pin error${errorCount === 1 ? "" : "s"} — asking Claude to fix the wiring…`,
    );
    const corrected = await correctSpec(spec, violations, board, log);
    log("Corrected spec", corrected);

    progress("Re-checking the corrected wiring…");
    const finalViolations = checkPins(opts.board, corrected);
    const corrections = diffPins(board, spec, corrected, violations);
    log("Corrections", corrections);

    result = {
      board: opts.board,
      spec: corrected,
      violations: finalViolations,
      autoCorrected: true,
      corrections,
      originalViolations: violations,
    };
  }

  // Compile check (optional: needs COMPILE_SERVICE_URL + COMPILE_SERVICE_TOKEN).
  const compiled = await compileStep(result.spec, board, progress, log);
  result.spec = compiled.spec;
  result.compile = compiled.compile;
  result.elapsedMs = Date.now() - started;
  return result;
}

async function compileStep(
  spec: PartSpec,
  board: BoardDef,
  progress: (m: string) => void,
  log: Logger,
): Promise<{ spec: PartSpec; compile: CompileCheck }> {
  if (!isCompileConfigured()) {
    log("Compile check skipped: COMPILE_SERVICE_URL / COMPILE_SERVICE_TOKEN not set");
    return { spec, compile: skippedCompile() };
  }
  const out = await runCompileLoop(spec, {
    compile: (code, libraries) => compileViaService(board.compileTarget, code, libraries),
    fix: (s, errors, attempt) => fixCompileErrors(s, errors, board, attempt, log),
    onProgress: progress,
  });
  log("Compile check", { status: out.compile.status, attempts: out.compile.attempts.length, fixes: out.compile.fixes });
  return out;
}
