import { CheckCircle2, ShieldCheck } from "lucide-react";
import type { BoardDef } from "@/lib/boards";
import { rulesForBoard } from "@/lib/rules";
import type { GenerateResult, Violation } from "@/lib/types";
import { Badge, Card, SectionTitle } from "../ui";

function ViolationItem({ v }: { v: Violation }) {
  const error = v.severity === "error";
  return (
    <li
      className={`rounded-xl border px-3.5 py-3 ${
        error ? "border-danger/30 bg-danger/[0.07]" : "border-warn/30 bg-warn/[0.07]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={error ? "error" : "warning"}>{v.severity}</Badge>
        <span className="font-mono text-xs text-fg">
          {v.sensor_pin} → {v.board_pin}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-2">{v.rule_id}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{v.message}</p>
    </li>
  );
}

export default function RulesPanel({ result, board }: { result: GenerateResult; board: BoardDef }) {
  const rules = rulesForBoard(board.id);
  const { violations } = result;
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  return (
    <Card className="flex h-full flex-col" hover>
      <SectionTitle
        icon={<ShieldCheck size={14} />}
        right={<span className="text-[11px] text-muted">{rules.length} rules · {board.name}</span>}
      >
        Rules check
      </SectionTitle>
      <div className="flex flex-1 flex-col gap-4 p-5">
        {violations.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.08] px-4 py-3.5">
            <CheckCircle2 size={26} className="shrink-0 text-accent-text" strokeWidth={2.2} />
            <div>
              <p className="text-sm font-semibold text-fg">All checks passed ✓</p>
              <p className="text-xs text-muted">
                Every pin assignment satisfies the {board.name} rules.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs text-muted">
              {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning
              {warnings.length === 1 ? "" : "s"} on the final wiring
            </p>
            <ul className="space-y-2">
              {violations.map((v, i) => (
                <ViolationItem key={`${v.rule_id}-${i}`} v={v} />
              ))}
            </ul>
          </div>
        )}

        <details className="mt-auto text-xs text-muted">
          <summary className="cursor-pointer select-none rounded-md hover:text-fg">
            Rules applied for {board.name}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} className="flex gap-2">
                <Badge tone={r.severity === "error" ? "error" : "warning"} className="mt-0.5 shrink-0">
                  {r.severity}
                </Badge>
                <span>
                  <span className="text-fg-2">{r.title}.</span> {r.description}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Card>
  );
}
