import { Cpu } from "lucide-react";
import type { BoardDef } from "@/lib/boards";
import type { PartSpec } from "@/lib/types";
import { Badge, Card, SectionTitle, SourceBadge } from "../ui";

function Field({
  label,
  value,
  page,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  page?: number;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2/50 px-3.5 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        <span className={`truncate text-sm font-semibold text-fg ${mono ? "font-mono" : ""}`}>
          {value && value.trim() !== "" ? value : <span className="font-normal text-muted-2">—</span>}
        </span>
        <SourceBadge page={page} />
      </dd>
    </div>
  );
}

export default function PartSummary({ spec, board }: { spec: PartSpec; board: BoardDef }) {
  const sp = spec.source_pages ?? {};
  return (
    <Card className="h-full" hover>
      <SectionTitle
        icon={<Cpu size={14} />}
        right={
          <div className="flex items-center gap-2">
            <Badge tone="accent">{spec.interface}</Badge>
            <Badge>{board.name}</Badge>
          </div>
        }
      >
        Part
      </SectionTitle>
      <div className="p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">{spec.part_name}</h3>
          <SourceBadge page={sp.part_name} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          {spec.description} <SourceBadge page={sp.description} />
        </p>
        <dl className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <Field label="Interface" value={spec.interface} page={sp.interface} />
          <Field label="Operating voltage" value={spec.operating_voltage} page={sp.operating_voltage} mono />
          <Field label="Logic voltage" value={spec.logic_voltage} page={sp.logic_voltage} mono />
          <Field
            label="I2C address"
            value={spec.i2c_address ?? (spec.interface === "I2C" ? "" : "n/a")}
            page={spec.i2c_address ? sp.i2c_address : undefined}
            mono
          />
        </dl>
      </div>
    </Card>
  );
}
