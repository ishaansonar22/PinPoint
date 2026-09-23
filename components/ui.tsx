import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-ink-700/70 bg-ink-900/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/70 px-5 py-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-200">{children}</h2>
      {right}
    </div>
  );
}

export type BadgeTone = "neutral" | "accent" | "error" | "warning" | "success";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-ink-600 bg-ink-800 text-ink-200",
  accent: "border-accent-500/40 bg-accent-500/10 text-accent-400",
  error: "border-red-500/40 bg-red-500/10 text-red-300",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Small "p.15" badge showing where a value came from in the datasheet. */
export function SourceBadge({ page }: { page: number | undefined }) {
  if (!page) return null;
  return (
    <Badge tone="accent" title={`Found on datasheet page ${page}`}>
      p.{page}
    </Badge>
  );
}
