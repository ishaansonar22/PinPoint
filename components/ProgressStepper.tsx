"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { Check, Loader2 } from "lucide-react";

type StepState = "pending" | "active" | "done" | "skipped";

interface StepDef {
  id: string;
  label: string;
  match?: RegExp;
}

/**
 * The stepper maps the server's streamed progress messages onto fixed steps.
 * Reading and extracting are one Claude call; the label advances after a
 * short while so the user can see the long call is still moving.
 */
const STEPS: StepDef[] = [
  { id: "read", label: "Reading datasheet", match: /Reading the datasheet|Uploading/i },
  { id: "extract", label: "Extracting pins & registers" },
  { id: "rules", label: "Checking rules", match: /rules engine/i },
  { id: "correct", label: "Auto-correcting wiring", match: /asking Claude to fix|Re-checking/i },
  { id: "compile", label: "Compiling", match: /^Compiling/i },
  { id: "fix", label: "Fixing compile error", match: /Fixing compile error/i },
  { id: "done", label: "Done", match: /Compiled successfully|Compile failed/i },
];

const EXTRACT_AFTER_MS = 20_000;

export function deriveSteps(messages: string[], elapsedMs: number): { state: StepState; def: StepDef; detail?: string }[] {
  let activeIdx = 0;
  const matched = new Set<number>();
  for (const m of messages) {
    STEPS.forEach((s, i) => {
      if (s.match?.test(m)) {
        matched.add(i);
        if (i > activeIdx) activeIdx = i;
      }
    });
  }
  // A "Compiling" after a "Fixing compile error" means we're back on the compile step.
  const last = messages[messages.length - 1] ?? "";
  if (/^Compiling/i.test(last) && matched.has(5)) activeIdx = 4;

  if (activeIdx === 0 && elapsedMs > EXTRACT_AFTER_MS) {
    matched.add(0);
    activeIdx = 1;
  }
  const doneIdx = STEPS.length - 1;
  return STEPS.map((def, i) => {
    let state: StepState;
    if (activeIdx === doneIdx && i === doneIdx) state = "done";
    else if (i === activeIdx) state = "active";
    else if (i < activeIdx) state = matched.has(i) || i === 1 ? "done" : "skipped";
    else state = "pending";
    return { def, state, detail: i === activeIdx ? last : undefined };
  });
}

export default function ProgressStepper({ messages, startedAt }: { messages: string[]; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  const reduce = useReducedMotion();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.max(0, now - startedAt);
  const steps = useMemo(() => deriveSteps(messages, elapsed), [messages, elapsed]);
  const isDemo = messages.some((m) => /Loading saved demo/i.test(m));

  const mm = Math.floor(elapsed / 60000);
  const ss = Math.floor((elapsed % 60000) / 1000);

  return (
    <div className="glass rounded-[var(--radius-card)] p-6 sm:p-8" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight">
          {isDemo ? "Loading saved demo…" : "Working on it."}
        </h2>
        <span className="font-mono text-sm tabular-nums text-muted">
          {mm}:{ss.toString().padStart(2, "0")}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Big datasheets can take about a minute. Claude is reading every page, then the rules engine
        and compiler check its work.
      </p>

      {isDemo ? (
        <div className="mt-6 flex items-center gap-3 text-sm text-fg-2">
          <Loader2 size={18} className="animate-spin text-accent-text" /> {messages[messages.length - 1]}
        </div>
      ) : (
        <ol className="relative mt-7 space-y-0">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <li key={s.def.id} className="relative flex gap-4 pb-6 last:pb-0">
                {/* connector */}
                {!isLast && (
                  <svg
                    className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-[2px] overflow-visible"
                    aria-hidden
                  >
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="100%"
                      stroke={s.state === "done" ? "var(--accent)" : "var(--border-strong)"}
                      strokeWidth="2"
                      strokeDasharray={s.state === "active" ? "6 6" : undefined}
                      className={s.state === "active" && !reduce ? "animate-trace" : ""}
                    />
                    {s.state === "active" && !reduce && (
                      <line
                        x1="1"
                        y1="0"
                        x2="1"
                        y2="100%"
                        stroke="var(--accent)"
                        strokeWidth="2"
                        strokeDasharray="6 26"
                        className="animate-trace"
                      />
                    )}
                  </svg>
                )}

                {/* node */}
                <span
                  className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition ${
                    s.state === "done"
                      ? "border-accent bg-accent text-accent-fg"
                      : s.state === "active"
                        ? "border-accent bg-surface text-accent-text shadow-[var(--shadow-glow-sm)]"
                        : s.state === "skipped"
                          ? "border-border bg-surface text-muted-2"
                          : "border-border-strong bg-surface text-muted-2"
                  }`}
                >
                  {s.state === "done" ? (
                    <Check size={14} strokeWidth={3} />
                  ) : s.state === "active" ? (
                    <motion.span
                      animate={reduce ? undefined : { scale: [1, 0.7, 1], opacity: [1, 0.6, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                      className="h-2.5 w-2.5 rounded-full bg-accent"
                    />
                  ) : s.state === "skipped" ? (
                    <span className="h-[2px] w-2.5 rounded bg-border-strong" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-border-strong" />
                  )}
                </span>

                <div className="min-w-0 pt-0.5">
                  <p
                    className={`text-sm font-semibold ${
                      s.state === "active"
                        ? "text-fg"
                        : s.state === "done"
                          ? "text-fg-2"
                          : s.state === "skipped"
                            ? "text-muted-2 line-through decoration-border-strong"
                            : "text-muted-2"
                    }`}
                  >
                    {s.def.label}
                    {s.state === "skipped" && <span className="ml-2 text-[11px] font-normal no-underline">not needed</span>}
                  </p>
                  {s.detail && s.state === "active" && (
                    <p className="mt-0.5 truncate text-xs text-muted">{s.detail}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
