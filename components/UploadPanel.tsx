"use client";

import { useCallback, useId, useRef, useState, type DragEvent } from "react";
import { BOARD_LIST } from "@/lib/boards";
import { DEMOS } from "@/lib/demos";
import type { BoardId } from "@/lib/types";
import { Badge, Card } from "./ui";

export const MAX_PDF_BYTES = 30 * 1024 * 1024;

export function validatePdf(file: File): string | null {
  const isPdf =
    file.type === "application/pdf" ||
    (file.type === "" && file.name.toLowerCase().endsWith(".pdf"));
  if (!isPdf) {
    return `"${file.name}" is not a PDF. Please upload the datasheet as a .pdf file.`;
  }
  if (file.size > MAX_PDF_BYTES) {
    return `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is 30 MB.`;
  }
  return null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  busy: boolean;
  onGenerate: (file: File, board: BoardId) => void;
  onLoadDemo: (demoId: string) => void;
}

export default function UploadPanel({ busy, onGenerate, onLoadDemo }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [board, setBoard] = useState<BoardId>("esp32-devkit");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectId = useId();

  const acceptFile = useCallback((f: File | undefined) => {
    if (!f) return;
    const err = validatePdf(f);
    if (err) {
      setFile(null);
      setFileError(err);
      return;
    }
    setFileError(null);
    setFile(f);
  }, []);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const canGenerate = !!file && !busy && !fileError;

  return (
    <Card className="p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload datasheet PDF"
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !busy) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition
            ${dragging ? "border-accent-400 bg-accent-500/10" : "border-ink-600 bg-ink-800/40 hover:border-ink-400 hover:bg-ink-800/70"}
            ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <svg viewBox="0 0 24 24" className="h-9 w-9 text-ink-400 transition group-hover:text-accent-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M12 18v-6" />
            <path d="m9 15 3-3 3 3" />
          </svg>
          {file ? (
            <>
              <p className="max-w-full truncate px-2 text-sm font-medium text-ink-50">{file.name}</p>
              <p className="text-xs text-ink-400">
                {formatBytes(file.size)} · PDF · click or drop to replace
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink-50">
                Drop a datasheet PDF here, or <span className="text-accent-400">browse</span>
              </p>
              <p className="text-xs text-ink-400">PDF only · up to 30 MB</p>
            </>
          )}
          {fileError && (
            <p role="alert" className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
              {fileError}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          <label htmlFor={selectId} className="text-xs font-medium uppercase tracking-wider text-ink-400">
            Target board
          </label>
          <select
            id={selectId}
            value={board}
            disabled={busy}
            onChange={(e) => setBoard(e.target.value as BoardId)}
            className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-50 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-500/30 disabled:opacity-60"
          >
            {BOARD_LIST.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.logicVoltage}V logic
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => file && onGenerate(file, board)}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-lg shadow-accent-500/20 transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400 disabled:shadow-none"
          >
            {busy ? (
              <>
                <Spinner /> Generating…
              </>
            ) : (
              "Generate"
            )}
          </button>

          <div className="relative mt-auto">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDemoOpen((o) => !o)}
              className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm text-ink-200 transition hover:border-ink-400 hover:text-ink-50 disabled:opacity-60"
              aria-expanded={demoOpen}
            >
              <span className="inline-flex items-center gap-2">
                <Badge tone="accent">offline</Badge> Load demo
              </span>
              <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${demoOpen ? "rotate-180" : ""}`} fill="currentColor" aria-hidden>
                <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
              </svg>
            </button>
            {demoOpen && (
              <ul className="absolute right-0 z-20 mt-1 w-full min-w-[260px] overflow-hidden rounded-lg border border-ink-600 bg-ink-800 shadow-xl">
                {DEMOS.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDemoOpen(false);
                        onLoadDemo(d.id);
                      }}
                      className="block w-full px-3 py-2 text-left transition hover:bg-ink-700"
                    >
                      <span className="block text-sm text-ink-50">{d.title}</span>
                      <span className="block text-xs text-ink-400">{d.subtitle}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}
