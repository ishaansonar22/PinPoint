"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { Cpu, FileText, Loader2, Sparkles, Upload, X, Zap } from "lucide-react";
import { BOARD_LIST } from "@/lib/boards";
import type { BoardId } from "@/lib/types";

export const MAX_PDF_BYTES = 30 * 1024 * 1024;

export function validatePdf(file: File): string | null {
  const isPdf =
    file.type === "application/pdf" ||
    (file.type === "" && file.name.toLowerCase().endsWith(".pdf"));
  if (!isPdf) {
    return `"${file.name}" isn't a PDF. Datasheets come as .pdf — that's the one we need.`;
  }
  if (file.size > MAX_PDF_BYTES) {
    return `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is 30 MB. Export just the relevant pages and try again.`;
  }
  return null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const BOARD_ICON: Record<BoardId, typeof Cpu> = {
  "esp32-devkit": Zap,
  "arduino-uno": Cpu,
};

interface Props {
  busy: boolean;
  onGenerate: (file: File, board: BoardId) => void;
}

export default function UploadPanel({ busy, onGenerate }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [board, setBoard] = useState<BoardId>("esp32-devkit");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

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
    <div className="glass rounded-[var(--radius-card)] p-3 sm:p-4">
      {/* Drop zone */}
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="Upload datasheet PDF"
        aria-describedby="dropzone-hint"
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
        animate={dragging && !reduce ? { scale: 1.012 } : { scale: 1 }}
        transition={{ duration: 0.18 }}
        className={`group relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors sm:min-h-[220px]
          ${dragging ? "border-accent bg-accent/10 shadow-[var(--shadow-glow)]" : "border-border-strong bg-surface-2/50 hover:border-muted-2 hover:bg-surface-2/80"}
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

        <div
          className={`grid h-14 w-14 place-items-center rounded-2xl border transition ${
            dragging
              ? "border-accent/50 bg-accent/15 text-accent-text"
              : "border-border bg-surface text-muted group-hover:text-fg"
          }`}
        >
          {file ? <FileText size={24} strokeWidth={1.8} /> : <Upload size={24} strokeWidth={1.8} />}
        </div>

        {file ? (
          <div className="max-w-full">
            <p className="max-w-[26rem] truncate px-2 font-mono text-sm font-medium text-fg">{file.name}</p>
            <p className="mt-1 text-xs text-muted">
              {formatBytes(file.size)} · PDF · drop another to replace
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              className="mt-3 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-border-strong hover:text-fg"
            >
              <X size={12} /> Remove
            </button>
          </div>
        ) : (
          <div>
            <p className="text-base font-semibold text-fg">
              Drop a datasheet PDF here{" "}
              <span className="text-muted">or</span>{" "}
              <span className="text-accent-text underline decoration-accent/40 underline-offset-4">browse</span>
            </p>
            <p id="dropzone-hint" className="mt-1.5 text-xs text-muted">
              PDF only · up to 30 MB · we&apos;ll handle the 60 pages
            </p>
          </div>
        )}

        {fileError && (
          <p
            role="alert"
            className="mt-1 max-w-md rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {fileError}
          </p>
        )}
      </motion.div>

      {/* Controls */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="radiogroup"
          aria-label="Target board"
          className="inline-flex w-full rounded-full border border-border bg-surface-2/60 p-1 sm:w-auto"
        >
          {BOARD_LIST.map((b) => {
            const active = b.id === board;
            const Icon = BOARD_ICON[b.id];
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy}
                onClick={() => setBoard(b.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const idx = BOARD_LIST.findIndex((x) => x.id === board);
                    const next = BOARD_LIST[(idx + (e.key === "ArrowRight" ? 1 : BOARD_LIST.length - 1)) % BOARD_LIST.length];
                    setBoard(next.id);
                  }
                }}
                className={`relative inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition sm:flex-none ${
                  active ? "text-accent-fg" : "text-muted hover:text-fg"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="board-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-accent shadow-[var(--shadow-glow-sm)]"
                  />
                )}
                <span className="relative inline-flex items-center gap-2">
                  <Icon size={15} strokeWidth={2} />
                  {b.name}
                  <span className={`hidden font-mono text-[11px] sm:inline ${active ? "text-accent-fg/80" : "text-muted-2"}`}>
                    {b.logicVoltage}V
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <motion.button
          type="button"
          disabled={!canGenerate}
          onClick={() => file && onGenerate(file, board)}
          whileHover={canGenerate && !reduce ? { y: -1 } : undefined}
          whileTap={canGenerate && !reduce ? { scale: 0.98 } : undefined}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-fg transition hover:shadow-[var(--shadow-glow)] disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-muted-2 disabled:shadow-none"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Working…
            </>
          ) : (
            <>
              <Sparkles size={16} strokeWidth={2.2} /> Generate wiring + code
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
