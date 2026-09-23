import { ListOrdered, TriangleAlert } from "lucide-react";
import type { InitStep } from "@/lib/types";
import { Badge, Card, SectionTitle, SourceBadge } from "../ui";

export function WarningsCard({ warnings }: { warnings: string[] }) {
  return (
    <Card className="h-full" hover>
      <SectionTitle
        icon={<TriangleAlert size={14} />}
        right={<Badge tone={warnings.length ? "warning" : "success"}>{warnings.length}</Badge>}
      >
        Before you power up
      </SectionTitle>
      <div className="p-5">
        {warnings.length === 0 ? (
          <p className="text-sm text-muted">No warnings. Rare, but it happens.</p>
        ) : (
          <ul className="space-y-2.5">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-fg-2">
                <span className="mt-[3px] h-4 w-1 shrink-0 rounded-full bg-warn/70" aria-hidden />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function InitSequenceCard({ initSequence }: { initSequence: InitStep[] }) {
  return (
    <Card className="h-full" hover>
      <SectionTitle
        icon={<ListOrdered size={14} />}
        right={<span className="text-[11px] text-muted">{initSequence.length} steps</span>}
      >
        Init sequence
      </SectionTitle>
      <div className="p-5">
        {initSequence.length === 0 ? (
          <p className="text-sm text-muted">No registers to configure. Plug and play.</p>
        ) : (
          <ol className="space-y-2.5">
            {initSequence.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="w-5 shrink-0 font-mono text-xs text-muted-2">{i + 1}.</span>
                <code className="rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent-text">
                  {s.register}
                </code>
                <span className="text-muted-2">←</span>
                <code className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">
                  {s.value}
                </code>
                <span className="text-xs text-fg-2">{s.purpose}</span>
                <SourceBadge page={s.source_page} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

/** Kept for backwards compatibility with the old layout. */
export default function WarningsList({
  warnings,
  initSequence,
}: {
  warnings: string[];
  initSequence: InitStep[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <WarningsCard warnings={warnings} />
      <InitSequenceCard initSequence={initSequence} />
    </div>
  );
}
