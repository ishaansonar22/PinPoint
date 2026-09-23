import { ArrowRight, Wand2 } from "lucide-react";
import type { GenerateResult } from "@/lib/types";
import { Badge, Card, SectionTitle } from "../ui";

export default function CorrectionsCard({ result }: { result: GenerateResult }) {
  const fixedErrors = result.originalViolations.filter((v) => v.severity === "error").length;
  return (
    <Card hover>
      <SectionTitle icon={<Wand2 size={14} />} right={<Badge tone="success">Auto-corrected by rules engine</Badge>}>
        Auto-correction
      </SectionTitle>
      <div className="p-5">
        <p className="text-xs text-muted">
          The rules engine found {fixedErrors} error{fixedErrors === 1 ? "" : "s"} in Claude&apos;s first pass and sent
          {fixedErrors === 1 ? " it" : " them"} back. One request later, the wiring and code were updated.
        </p>
        {result.corrections.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {result.corrections.map((c, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface-2/50 p-3">
                <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
                  <span className="font-semibold text-fg">{c.sensor_pin}</span>
                  <span className="rounded-md border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-danger line-through decoration-danger/70">
                    {c.original_pin}
                  </span>
                  <ArrowRight size={14} className="text-muted-2" />
                  <span className="rounded-md border border-success/40 bg-success/15 px-1.5 py-0.5 font-semibold text-accent-text shadow-[var(--shadow-glow-sm)]">
                    {c.new_pin}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-fg-2">{c.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-fg-2">
            Claude returned the same pins; see the remaining violations in the rules check.
          </p>
        )}
      </div>
    </Card>
  );
}
