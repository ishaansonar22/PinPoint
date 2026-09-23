"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/* ---------------------------------------------------------------------------
   Card: glass surface with thin border. `hover` adds a subtle lift.
--------------------------------------------------------------------------- */
export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      whileHover={hover && !reduce ? { y: -2 } : undefined}
      transition={{ duration: 0.2 }}
      className={`glass min-w-0 rounded-[var(--radius-card)] ${hover ? "hover:border-border-strong" : ""} ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function SectionTitle({
  children,
  right,
  icon,
}: {
  children: ReactNode;
  right?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
      <h2 className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
        {icon && <span className="text-accent-text">{icon}</span>}
        {children}
      </h2>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Badges
--------------------------------------------------------------------------- */
export type BadgeTone = "neutral" | "accent" | "error" | "warning" | "success";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-border bg-surface-2 text-fg-2",
  accent: "border-accent/30 bg-accent/10 text-accent-text",
  error: "border-danger/40 bg-danger/10 text-danger",
  warning: "border-warn/40 bg-warn/10 text-warn",
  success: "border-success/40 bg-success/10 text-accent-text",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
  title,
  mono = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${mono ? "font-mono" : ""} ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Larger status badge that pops in. */
export function StatusBadge({
  children,
  tone,
  icon,
  delay = 0,
}: {
  children: ReactNode;
  tone: BadgeTone;
  icon?: ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        reduce ? { duration: 0 } : { duration: 0.25, delay, type: "spring", stiffness: 380, damping: 24 }
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${TONES[tone]}`}
    >
      {icon}
      {children}
    </motion.span>
  );
}

/** Small "p.15" mono pill showing where a value came from in the datasheet. */
export function SourceBadge({ page }: { page: number | undefined }) {
  if (!page) return null;
  return (
    <Badge tone="accent" mono title={`Found on datasheet page ${page}`}>
      p.{page}
    </Badge>
  );
}

/** Inline monospace token (pin names, registers, addresses). */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <code className={`font-mono text-[0.92em] ${className}`}>{children}</code>;
}
