"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { CheckCircle2, ChevronDown, Hammer, TriangleAlert, XCircle } from "lucide-react";
import type { BoardDef } from "@/lib/boards";
import type { CompileCheck as CompileCheckData } from "@/lib/types";
import { Badge, Card, SectionTitle } from "../ui";
import { compileBadge } from "./StatusStrip";

/** Small badge for the code card header. */
export function CompileBadge({ compile }: { compile: CompileCheckData | undefined }) {
  const b = compileBadge(compile);
  if (!b || compile?.status === "skipped") return null;
  return <Badge tone={b.tone}>{b.label}</Badge>;
}

function MonoBlock({ text, tone }: { text: string; tone: "error" | "warning" }) {
  return (
    <pre
      className={`scroll-thin mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border p-3 font-mono text-[11.5px] leading-relaxed ${
        tone === "error" ? "border-danger/30 bg-[var(--code-bg)] text-fg-2" : "border-warn/30 bg-[var(--code-bg)] text-fg-2"
      }`}
    >
      {text}
    </pre>
  );
}

export default function CompileCheck({
  compile,
  board,
}: {
  compile: CompileCheckData | undefined;
  board: BoardDef;
}) {
  const reduce = useReducedMotion();
  const c: CompileCheckData = compile ?? { status: "skipped", attempts: [], fixes: [] };
  const badge = compileBadge(c);
  const totalMs = c.attempts.reduce((s, a) => s + a.duration_ms, 0);
  const lastWarnings = c.attempts.at(-1)?.warnings?.trim();

  // Failed attempts start expanded; the successful one starts collapsed.
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(c.attempts.filter((a) => !a.success).map((a) => a.attempt)),
  );
  const toggle = (n: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <Card hover>
      <SectionTitle
        icon={<Hammer size={14} />}
        right={
          <div className="flex items-center gap-2">
            {c.fqbn && <span className="hidden font-mono text-[11px] text-muted sm:inline">{c.fqbn}</span>}
            {c.attempts.length > 0 && (
              <span className="text-[11px] text-muted">
                {c.attempts.length}× · {(totalMs / 1000).toFixed(1)}s
              </span>
            )}
            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
          </div>
        }
      >
        Compile check
      </SectionTitle>

      <div className="p-5 text-sm">
        {c.status === "skipped" && (
          <p className="text-xs leading-relaxed text-muted">
            {c.message ?? "Compile check not configured."} Set{" "}
            <code className="font-mono text-fg-2">COMPILE_SERVICE_URL</code> and{" "}
            <code className="font-mono text-fg-2">COMPILE_SERVICE_TOKEN</code> to build every sketch with
            arduino-cli for the {board.name} before it lands here.
          </p>
        )}

        {c.status === "unavailable" && (
          <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/[0.08] px-4 py-3">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <p className="font-medium text-fg">The compile service couldn&apos;t be reached.</p>
              {c.message && <p className="mt-1 text-xs text-muted">{c.message}</p>}
            </div>
          </div>
        )}

        {c.status === "passed" && (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.08] px-4 py-3.5">
            <CheckCircle2 size={26} className="shrink-0 text-accent-text" strokeWidth={2.2} />
            <div>
              <p className="font-semibold text-fg">Compiled first try</p>
              <p className="text-xs text-muted">
                arduino-cli built it for the {board.name}
                {c.attempts[0] ? ` in ${(c.attempts[0].duration_ms / 1000).toFixed(1)}s` : ""}.
              </p>
            </div>
          </div>
        )}

        {(c.status === "fixed" || c.status === "failed") && (
          <div className="space-y-3">
            <p className={`text-xs leading-relaxed ${c.status === "fixed" ? "text-fg-2" : "text-fg-2"}`}>
              {c.status === "fixed"
                ? `First version didn't build. Claude fixed it in ${c.fixes.length} round${c.fixes.length === 1 ? "" : "s"}; the final code compiles clean.`
                : `Still failing after ${c.attempts.length} attempts. The code card shows the latest version.`}
            </p>

            <ol className="space-y-2">
              {c.attempts.map((a) => {
                const fix = c.fixes.find((f) => f.attempt === a.attempt);
                const expanded = open.has(a.attempt);
                return (
                  <li
                    key={a.attempt}
                    className={`rounded-xl border ${
                      a.success ? "border-success/30 bg-success/[0.05]" : "border-danger/30 bg-danger/[0.05]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(a.attempt)}
                      aria-expanded={expanded}
                      className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left"
                    >
                      {a.success ? (
                        <CheckCircle2 size={16} className="shrink-0 text-accent-text" />
                      ) : (
                        <XCircle size={16} className="shrink-0 text-danger" />
                      )}
                      <span className="text-xs font-semibold text-fg">Attempt {a.attempt}</span>
                      <span className="text-[11px] text-muted">{a.success ? "compiled" : "error"} · {(a.duration_ms / 1000).toFixed(1)}s</span>
                      <ChevronDown size={14} className={`ml-auto text-muted transition ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={reduce ? undefined : { height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden px-3.5 pb-3.5"
                        >
                          {a.success ? (
                            <p className="text-xs text-muted">No errors.{a.warnings ? " Warnings below." : ""}</p>
                          ) : (
                            <MonoBlock text={a.errors || "(no compiler output)"} tone="error" />
                          )}
                          {fix && (
                            <div className="mt-2 rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2 text-xs leading-relaxed text-fg-2">
                              <span className="font-semibold text-accent-text">Fix → </span>
                              {fix.summary || "Claude rewrote the code to address the error above."}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {lastWarnings && (
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer select-none hover:text-fg">Compiler warnings</summary>
            <MonoBlock text={lastWarnings} tone="warning" />
          </details>
        )}
      </div>
    </Card>
  );
}
