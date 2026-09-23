import type { BoardDef } from "@/lib/boards";
import type { Correction, PartSpec, PinDirection, Violation } from "@/lib/types";
import { Badge, Card, SectionTitle, SourceBadge } from "../ui";

const DIRECTION_LABEL: Record<PinDirection, string> = {
  input: "board reads",
  output: "board drives",
  bidirectional: "bidirectional",
  power: "power",
  ground: "ground",
};

export default function WiringTable({
  spec,
  board,
  violations,
  corrections,
}: {
  spec: PartSpec;
  board: BoardDef;
  violations: Violation[];
  corrections: Correction[];
}) {
  const byIndex = new Map<number, Violation[]>();
  for (const v of violations) {
    if (v.pin_index < 0) continue;
    byIndex.set(v.pin_index, [...(byIndex.get(v.pin_index) ?? []), v]);
  }
  const corrected = new Map(corrections.map((c) => [c.sensor_pin.toLowerCase(), c]));

  return (
    <Card className="overflow-hidden">
      <SectionTitle right={<SourceBadge page={spec.source_pages?.pins} />}>
        Wiring · {spec.part_name} → {board.name}
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-ink-700/70 text-left text-[11px] uppercase tracking-wider text-ink-400">
              <th className="px-5 py-2 font-medium">Sensor pin</th>
              <th className="px-3 py-2 font-medium">→</th>
              <th className="px-3 py-2 font-medium">Board pin</th>
              <th className="px-3 py-2 font-medium">Direction</th>
              <th className="px-5 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {spec.pins.map((p, i) => {
              const vs = byIndex.get(i) ?? [];
              const worst = vs.some((v) => v.severity === "error")
                ? "error"
                : vs.length
                  ? "warning"
                  : null;
              const fix = corrected.get(p.sensor_pin.toLowerCase());
              const rowTone =
                worst === "error"
                  ? "bg-red-500/10 hover:bg-red-500/15"
                  : worst === "warning"
                    ? "bg-amber-400/10 hover:bg-amber-400/15"
                    : "hover:bg-ink-800/60";
              const border =
                worst === "error"
                  ? "border-l-2 border-l-red-500"
                  : worst === "warning"
                    ? "border-l-2 border-l-amber-400"
                    : fix
                      ? "border-l-2 border-l-emerald-500"
                      : "border-l-2 border-l-transparent";
              return (
                <tr key={`${p.sensor_pin}-${i}`} className={`border-b border-ink-700/50 align-top transition ${rowTone} ${border}`}>
                  <td className="px-5 py-2.5 font-mono font-semibold text-ink-50">{p.sensor_pin}</td>
                  <td className="px-3 py-2.5 text-ink-400">→</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-accent-400">{p.board_pin}</span>
                      {fix && (
                        <Badge tone="success" title={fix.reason}>
                          was {fix.original_pin}
                        </Badge>
                      )}
                      {p.uses_adc && <Badge>ADC</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-200">{DIRECTION_LABEL[p.direction]}</td>
                  <td className="px-5 py-2.5 text-xs text-ink-200">
                    <span>{p.note}</span>
                    {vs.map((v, k) => (
                      <p
                        key={k}
                        className={`mt-1.5 flex gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
                          v.severity === "error"
                            ? "border-red-500/40 bg-red-500/10 text-red-200"
                            : "border-amber-400/40 bg-amber-400/10 text-amber-100"
                        }`}
                      >
                        <span className="font-semibold uppercase">{v.severity}</span>
                        <span>{v.message}</span>
                      </p>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
