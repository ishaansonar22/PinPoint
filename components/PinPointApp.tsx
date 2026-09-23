"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { AlertTriangle, X } from "lucide-react";
import { DEMOS } from "@/lib/demos";
import type { BoardId, GenerateEvent, GenerateResult } from "@/lib/types";
import Footer from "./Footer";
import Header from "./Header";
import Hero from "./Hero";
import ProgressStepper from "./ProgressStepper";
import ResultsView from "./results/ResultsView";

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; messages: string[]; startedAt: number }
  | { kind: "result"; result: GenerateResult }
  | { kind: "error"; message: string };

export default function PinPointApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const resultsRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (phase.kind === "result" || phase.kind === "loading") {
      resultsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [phase.kind, reduce]);

  const pushProgress = (message: string) =>
    setPhase((p) => (p.kind === "loading" ? { ...p, messages: [...p.messages, message] } : p));

  const onGenerate = useCallback(async (file: File, board: BoardId) => {
    setPhase({ kind: "loading", messages: ["Uploading the datasheet…"], startedAt: Date.now() });
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("board", board);
      const res = await fetch("/api/generate", { method: "POST", body: form });

      if (!res.ok) {
        let message = `Request failed (${res.status}).`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) message = j.error;
        } catch {
          /* non-JSON error body */
        }
        setPhase({ kind: "error", message });
        return;
      }
      if (!res.body) {
        setPhase({ kind: "error", message: "The server returned an empty response." });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const handle = (line: string) => {
        if (!line.trim()) return;
        const ev = JSON.parse(line) as GenerateEvent;
        if (ev.type === "progress") pushProgress(ev.message);
        else if (ev.type === "result") {
          finished = true;
          setPhase({ kind: "result", result: ev.data });
        } else if (ev.type === "error") {
          finished = true;
          setPhase({ kind: "error", message: ev.message });
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          handle(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      if (buffer.trim()) handle(buffer);
      if (!finished) {
        setPhase({ kind: "error", message: "The connection closed before a result arrived. Try again in a moment." });
      }
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }, []);

  const onLoadDemo = useCallback(async (demoId: string) => {
    const demo = DEMOS.find((d) => d.id === demoId);
    if (!demo) return;
    setPhase({ kind: "loading", messages: [`Loading saved demo: ${demo.title}…`], startedAt: Date.now() });
    try {
      const res = await fetch(demo.file, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Could not load ${demo.file} (${res.status}).`);
      const data = (await res.json()) as GenerateResult;
      setPhase({
        kind: "result",
        result: { ...data, demo: { id: demo.id, title: demo.title } },
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not load the demo.",
      });
    }
  }, []);

  // Deep link: /?demo=esp32-led-autocorrect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("demo");
    if (id && DEMOS.some((d) => d.id === id)) void onLoadDemo(id);

    // Development only: /?preview=stepper renders the loading state with sample progress.
    if (process.env.NODE_ENV === "development" && params.get("preview") === "stepper") {
      setPhase({
        kind: "loading",
        startedAt: Date.now() - 47_000,
        messages: [
          "Uploading the datasheet…",
          "Reading the datasheet with Claude for the ESP32 DevKit…",
          "Running the board rules engine…",
          "Found 1 pin error — asking Claude to fix the wiring…",
          "Re-checking the corrected wiring…",
          "Compiling...",
        ],
      });
    }
  }, [onLoadDemo]);

  const activeDemo = phase.kind === "result" ? phase.result.demo?.id : undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
      <Header />
      <main className="flex flex-col gap-10 pb-6">
        <Hero
          busy={phase.kind === "loading"}
          onGenerate={onGenerate}
          onLoadDemo={onLoadDemo}
          activeDemo={activeDemo}
        />

        <div ref={resultsRef} className="scroll-mt-6">
          <AnimatePresence mode="wait">
            {phase.kind === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: reduce ? 0 : 0.25 }}
                className="mx-auto w-full max-w-3xl"
              >
                <ProgressStepper messages={phase.messages} startedAt={phase.startedAt} />
              </motion.div>
            )}

            {phase.kind === "error" && (
              <motion.div
                key="error"
                role="alert"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.25 }}
                className="mx-auto w-full max-w-3xl rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 p-5"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-fg">That didn&apos;t work.</p>
                    <p className="mt-1 text-sm text-fg-2">{phase.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhase({ kind: "idle" })}
                    aria-label="Dismiss error"
                    className="rounded-full border border-border p-1.5 text-muted transition hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            )}

            {phase.kind === "result" && (
              <motion.div
                key={`result-${phase.result.demo?.id ?? "live"}-${phase.result.spec.part_name}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
              >
                <ResultsView result={phase.result} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <Footer />
    </div>
  );
}
