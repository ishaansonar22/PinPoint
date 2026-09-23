import type { InitStep } from "@/lib/types";
import { Badge, Card, SectionTitle, SourceBadge } from "../ui";

export default function WarningsList({
  warnings,
  initSequence,
}: {
  warnings: string[];
  initSequence: InitStep[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <SectionTitle right={<Badge tone={warnings.length ? "warning" : "success"}>{warnings.length}</Badge>}>
          Warnings from the datasheet
        </SectionTitle>
        <div className="p-5">
          {warnings.length === 0 ? (
            <p className="text-sm text-ink-400">No warnings.</p>
          ) : (
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-200">
                  <span className="mt-0.5 shrink-0 text-amber-300" aria-hidden>
                    ⚠
                  </span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle right={<span className="text-[11px] text-ink-400">{initSequence.length} steps</span>}>
          Init sequence
        </SectionTitle>
        <div className="p-5">
          {initSequence.length === 0 ? (
            <p className="text-sm text-ink-400">This part has no registers to configure.</p>
          ) : (
            <ol className="space-y-2">
              {initSequence.map((s, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span className="w-5 shrink-0 text-xs text-ink-400">{i + 1}.</span>
                  <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-accent-400">
                    {s.register}
                  </code>
                  <span className="text-ink-400">←</span>
                  <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-50">
                    {s.value}
                  </code>
                  <span className="text-xs text-ink-200">{s.purpose}</span>
                  <SourceBadge page={s.source_page} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}
