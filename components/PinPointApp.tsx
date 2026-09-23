"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMOS } from "@/lib/demos";
import type { BoardId, GenerateEvent, GenerateResult } from "@/lib/types";
import Header from "./Header";
import ProgressCard from "./ProgressCard";
import UploadPanel from "./UploadPanel";
import ResultsView from "./results/ResultsView";

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; messages: string[] }
  | { kind: "result"; result: GenerateResult }
  | { kind: "error"; message: string };

export default function PinPointApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase.kind === "result" || phase.kind === "loading") {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase.kind]);

  const pushProgress = (message: string) =>
    setPhase((p) =>
      p.kind === "loading" ? { kind: "loading", messages: [...p.messages, message] } : p,
    );

  const onGenerate = useCallback(async (file: File, board: BoardId) => {
    setPhase({ kind: "loading", messages: ["Uploading the datasheet…"] });
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
        setPhase({ kind: "error", message: "The connection closed before a result arrived." });
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
    setPhase({ kind: "loading", messages: [`Loading saved demo: ${demo.title}…`] });
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

  // Allow linking straight to a demo: /?demo=esp32-led-autocorrect
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("demo");
    if (id && DEMOS.some((d) => d.id === id)) void onLoadDemo(id);
  }, [onLoadDemo]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Header />
      <UploadPanel busy={phase.kind === "loading"} onGenerate={onGenerate} onLoadDemo={onLoadDemo} />

      <div ref={resultsRef} className="scroll-mt-6">
        {phase.kind === "loading" && <ProgressCard messages={phase.messages} />}
        {phase.kind === "error" && (
          <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
            <p className="text-sm font-semibold text-red-300">Generation failed</p>
            <p className="mt-1 text-sm text-red-200/90">{phase.message}</p>
            <button
              type="button"
              onClick={() => setPhase({ kind: "idle" })}
              className="mt-3 rounded-md border border-red-400/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10"
            >
              Dismiss
            </button>
          </div>
        )}
        {phase.kind === "result" && <ResultsView result={phase.result} />}
      </div>

      <footer className="mt-4 text-center text-xs text-ink-400">
        PinPoint · pin choices verified by a deterministic rules engine · driver code generated by
        Claude. Always double-check power connections before applying voltage.
      </footer>
    </main>
  );
}
