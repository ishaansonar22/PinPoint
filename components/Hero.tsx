"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { Play } from "lucide-react";
import { DEMOS } from "@/lib/demos";
import type { BoardId } from "@/lib/types";
import UploadPanel from "./UploadPanel";

interface Props {
  busy: boolean;
  onGenerate: (file: File, board: BoardId) => void;
  onLoadDemo: (demoId: string) => void;
  activeDemo?: string;
}

export default function Hero({ busy, onGenerate, onLoadDemo, activeDemo }: Props) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <section className="mx-auto w-full max-w-3xl pt-8 sm:pt-14">
      <motion.h1
        {...fade(0)}
        className="text-shine text-center text-[2.75rem] font-bold leading-[0.98] tracking-[-0.04em] sm:text-7xl"
      >
        Datasheets, decoded.
      </motion.h1>
      <motion.p {...fade(0.06)} className="mt-4 text-center text-lg text-fg-2 sm:text-xl">
        From datasheet to working code,{" "}
        <span className="text-accent-text">verified</span>.
      </motion.p>
      <motion.p {...fade(0.1)} className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">
        Upload a component datasheet, pick your board, and get wiring plus driver code. Every pin
        choice is checked by a rules engine, and the sketch is compiled for real.
      </motion.p>

      <motion.div {...fade(0.16)} className="mt-8">
        <UploadPanel busy={busy} onGenerate={onGenerate} />
      </motion.div>

      <motion.div {...fade(0.22)} className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted">
          <Play size={11} strokeWidth={2.4} /> Try a demo
        </span>
        {DEMOS.map((d) => {
          const active = d.id === activeDemo;
          return (
            <button
              key={d.id}
              type="button"
              disabled={busy}
              onClick={() => onLoadDemo(d.id)}
              title={d.subtitle}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                active
                  ? "border-accent/50 bg-accent/12 text-accent-text"
                  : "border-border bg-surface-2/50 text-fg-2 hover:border-border-strong hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {d.title}
            </button>
          );
        })}
      </motion.div>
    </section>
  );
}
