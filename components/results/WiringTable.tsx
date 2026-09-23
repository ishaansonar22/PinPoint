"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { ArrowRight, Cable, ChevronDown, Info } from "lucide-react";
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
  const reduce = useReducedMotion();
  const byIndex = new Map<number, Violation[]>();
  for (const v of violations) {
    if (v.pin_index < 0) continue;
    byIndex.set(v.pin_index, [...(byIndex.get(v.pin_index) ?? []), v]);
  }
  const corrected = new Map(corrections.map((c) => [c.sensor_pin.toLowerCase(), c]));

  // Rows with errors start expanded; warnings start collapsed.
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(violations.filter((v) => v.severity === "error" && v.pin_index >= 0).map((v) => v.pin_index)),
  );
  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <Card className="h-full overflow-hidden" hover>
      <SectionTitle icon={<Cable size={14} />} right={<SourceBadge page={spec.source_pages?.pins} />}>
        Wiring · {spec.pins.length} connections
      </SectionTitle>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="px-5 py-2.5 font-medium">{spec.part_name}</th>
              <th className="px-2 py-2.5 font-medium" aria-label="to" />
              <th className="px-3 py-2.5 font-medium">{board.shortName}</th>
              <th className="px-3 py-2.5 font-medium">Direction</th>
              <th className="px-5 py-2.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {spec.pins.map((p, i) => {
              const vs = byIndex.get(i) ?? [];
              const worst = vs.some((v) => v.severity === "error") ? "error" : vs.length ? "warning" : null;
              const fix = corrected.get(p.sensor_pin.toLowerCase());
              const expanded = open.has(i);
              const border =
                worst === "error"
                  ? "border-l-danger"
                  : worst === "warning"
                    ? "border-l-warn"
                    : fix
                      ? "border-l-success"
                      : "border-l-transparent";
              const tint =
                worst === "error" ? "bg-danger/[0.06]" : worst === "warning" ? "bg-warn/[0.06]" : "";
              return (
                <tr
                  key={`${p.sensor_pin}-${i}`}
                  className={`border-b border-border border-l-2 align-top transition-colors ${border} ${tint} hover:bg-surface-2/60`}
                  title={vs.length ? vs.map((v) => v.message).join("\n") : undefined}
                >
                  <td className="px-5 py-3 font-mono font-semibold text-fg">{p.sensor_pin}</td>
                  <td className="px-2 py-3 text-muted-2">
                    <ArrowRight size={14} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[13px] font-semibold text-accent-text">
                        {p.board_pin}
                      </span>
                      {fix && (
                        <Badge tone="success" mono title={fix.reason}>
                          was {fix.original_pin}
                        </Badge>
                      )}
                      {p.uses_adc && <Badge mono>ADC</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-fg-2">{DIRECTION_LABEL[p.direction]}</td>
                  <td className="px-5 py-3 text-xs text-fg-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="leading-relaxed">{p.note}</span>
                      {vs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(i)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} ${vs.length} issue${vs.length === 1 ? "" : "s"} for ${p.sensor_pin}`}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                            worst === "error"
                              ? "border-danger/40 bg-danger/10 text-danger"
                              : "border-warn/40 bg-warn/10 text-warn"
                          }`}
                        >
                          <Info size={11} />
                          {vs.length}
                          <ChevronDown size={11} className={`transition ${expanded ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {expanded &&
                        vs.map((v, k) => (
                          <motion.p
                            key={k}
                            initial={reduce ? false : { opacity: 0, height: 0, marginTop: 0 }}
                            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                            exit={reduce ? undefined : { opacity: 0, height: 0, marginTop: 0 }}
                            transition={{ duration: 0.2 }}
                            className={`overflow-hidden rounded-lg border px-2.5 py-2 text-xs leading-relaxed ${
                              v.severity === "error"
                                ? "border-danger/30 bg-danger/10 text-fg"
                                : "border-warn/30 bg-warn/10 text-fg"
                            }`}
                          >
                            <span className={`mr-1.5 font-semibold uppercase ${v.severity === "error" ? "text-danger" : "text-warn"}`}>
                              {v.severity}
                            </span>
                            {v.message}
                          </motion.p>
                        ))}
                    </AnimatePresence>
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
