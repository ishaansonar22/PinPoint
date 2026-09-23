"use client";

import { CheckCircle2, CircleAlert, Hammer, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import type { BoardDef } from "@/lib/boards";
import type { CompileCheck, GenerateResult } from "@/lib/types";
import { Badge, StatusBadge, type BadgeTone } from "../ui";

export function rulesHeadline(r: GenerateResult): string {
  const errors = r.violations.filter((v) => v.severity === "error").length;
  const warnings = r.violations.filter((v) => v.severity === "warning").length;
  const fixed = r.originalViolations.filter((v) => v.severity === "error").length;
  if (r.autoCorrected && errors === 0) {
    return `Caught ${fixed} wiring mistake${fixed === 1 ? "" : "s"} before ${fixed === 1 ? "it" : "they"} cost you a sensor.`;
  }
  if (errors > 0) return `${errors} wiring error${errors === 1 ? "" : "s"} still need${errors === 1 ? "s" : ""} a human.`;
  if (warnings > 0) return `Clean wiring, ${warnings} thing${warnings === 1 ? "" : "s"} worth a look.`;
  return "Clean wiring. Nothing to fix.";
}

export function compileHeadline(c: CompileCheck | undefined): string | null {
  switch (c?.status) {
    case "passed":
      return "Compiles clean. Ship it.";
    case "fixed":
      return `Compiles clean after ${c.fixes.length} fix${c.fixes.length === 1 ? "" : "es"}.`;
    case "failed":
      return "Still won't compile. Latest errors below.";
    case "unavailable":
      return "Compiler was unreachable, so the sketch is unverified.";
    default:
      return null;
  }
}

export function rulesBadge(r: GenerateResult): { label: string; tone: BadgeTone; icon: React.ReactNode } {
  const errors = r.violations.filter((v) => v.severity === "error").length;
  const warnings = r.violations.filter((v) => v.severity === "warning").length;
  const fixed = r.originalViolations.filter((v) => v.severity === "error").length;
  if (errors > 0) return { label: `Rules ✗ · ${errors} error${errors === 1 ? "" : "s"}`, tone: "error", icon: <XCircle size={15} /> };
  if (r.autoCorrected) return { label: `Rules ✓ · ${fixed} issue${fixed === 1 ? "" : "s"} fixed`, tone: "success", icon: <ShieldCheck size={15} /> };
  if (warnings > 0) return { label: `Rules ✓ · ${warnings} warning${warnings === 1 ? "" : "s"}`, tone: "warning", icon: <TriangleAlert size={15} /> };
  return { label: "Rules ✓", tone: "success", icon: <ShieldCheck size={15} /> };
}

export function compileBadge(c: CompileCheck | undefined): { label: string; tone: BadgeTone; icon: React.ReactNode } | null {
  if (!c) return null;
  switch (c.status) {
    case "passed":
      return { label: "Compiles ✓", tone: "success", icon: <CheckCircle2 size={15} /> };
    case "fixed":
      return { label: `Fixed after ${c.fixes.length} attempt${c.fixes.length === 1 ? "" : "s"} ✓`, tone: "success", icon: <Hammer size={15} /> };
    case "failed":
      return { label: "Compile failed ✗", tone: "error", icon: <XCircle size={15} /> };
    case "unavailable":
      return { label: "Compiler unavailable", tone: "warning", icon: <CircleAlert size={15} /> };
    default:
      return { label: "Compile check off", tone: "neutral", icon: <Hammer size={15} /> };
  }
}

export default function StatusStrip({ result, board }: { result: GenerateResult; board: BoardDef }) {
  const rb = rulesBadge(result);
  const cb = compileBadge(result.compile);
  const headline = rulesHeadline(result);
  const compileLine = compileHeadline(result.compile);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            <span className="font-mono text-fg-2">{result.spec.part_name}</span> on{" "}
            <span className="text-fg-2">{board.name}</span>
          </span>
          {result.demo && <Badge tone="accent">demo · {result.demo.title}</Badge>}
          {typeof result.elapsedMs === "number" && !result.demo && result.elapsedMs > 0 && (
            <Badge mono>{(result.elapsedMs / 1000).toFixed(0)}s</Badge>
          )}
        </div>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{headline}</h2>
        {compileLine && <p className="mt-1 text-sm text-muted">{compileLine}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={rb.tone} icon={rb.icon} delay={0.05}>
          {rb.label}
        </StatusBadge>
        {cb && (
          <StatusBadge tone={cb.tone} icon={cb.icon} delay={0.12}>
            {cb.label}
          </StatusBadge>
        )}
      </div>
    </div>
  );
}
