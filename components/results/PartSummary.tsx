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
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2">
        <span className={`truncate text-sm text-ink-50 ${mono ? "font-mono" : ""}`}>
          {value && value.trim() !== "" ? value : <span className="text-ink-400">—</span>}
        </span>
        <SourceBadge page={page} />
      </dd>
    </div>
  );
}

export default function PartSummary({ spec, board }: { spec: PartSpec; board: BoardDef }) {
  const sp = spec.source_pages ?? {};
  return (
    <Card>
      <SectionTitle
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
          <h3 className="text-xl font-bold tracking-tight">{spec.part_name}</h3>
          <SourceBadge page={sp.part_name} />
        </div>
        <p className="mt-1 flex items-start gap-2 text-sm leading-relaxed text-ink-200">
          <span>{spec.description}</span>
          <SourceBadge page={sp.description} />
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Interface" value={spec.interface} page={sp.interface} />
          <Field label="Operating voltage" value={spec.operating_voltage} page={sp.operating_voltage} />
          <Field label="Logic voltage" value={spec.logic_voltage} page={sp.logic_voltage} />
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
