import type { BoardDef } from "@/lib/boards";
import { rulesForBoard } from "@/lib/rules";
import type { GenerateResult, Violation } from "@/lib/types";
import { Badge, Card, SectionTitle } from "../ui";

function ViolationItem({ v }: { v: Violation }) {
  const error = v.severity === "error";
  return (
    <li
      className={`rounded-lg border px-3 py-2.5 ${
        error ? "border-red-500/40 bg-red-500/10" : "border-amber-400/40 bg-amber-400/10"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={error ? "error" : "warning"}>{v.severity}</Badge>
        <span className="font-mono text-xs text-ink-50">
          {v.sensor_pin} → {v.board_pin}
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-400">{v.rule_id}</span>
      </div>
      <p className={`mt-1.5 text-xs leading-relaxed ${error ? "text-red-100" : "text-amber-50"}`}>
        {v.message}
      </p>
    </li>
  );
}

export default function RulesPanel({ result, board }: { result: GenerateResult; board: BoardDef }) {
  const rules = rulesForBoard(board.id);
  const { violations, corrections, autoCorrected, originalViolations } = result;
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const fixedErrors = originalViolations.filter((v) => v.severity === "error").length;

  return (
    <Card className="flex flex-col">
      <SectionTitle
        right={
          <span className="text-[11px] text-ink-400">
            {rules.length} rules · {board.name}
          </span>
        }
      >
        Rules check
      </SectionTitle>
      <div className="flex flex-1 flex-col gap-4 p-5">
        {violations.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/20 text-lg text-emerald-300">
              ✓
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-200">All checks passed ✓</p>
              <p className="text-xs text-emerald-100/80">
                Every pin assignment satisfies the {board.name} rules.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs text-ink-400">
              {errors.length} error{errors.length === 1 ? "" : "s"}, {warnings.length} warning
              {warnings.length === 1 ? "" : "s"} on the final wiring.
            </p>
            <ul className="space-y-2">
              {violations.map((v, i) => (
                <ViolationItem key={`${v.rule_id}-${i}`} v={v} />
              ))}
            </ul>
          </div>
        )}

        {autoCorrected && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Auto-corrected by rules engine</Badge>
              <span className="text-xs text-ink-400">
                {fixedErrors} error{fixedErrors === 1 ? "" : "s"} found on the first pass
              </span>
            </div>
            {corrections.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {corrections.map((c, i) => (
                  <li key={i} className="text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-ink-50">
                      <span className="font-semibold">{c.sensor_pin}</span>
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-300 line-through">
                        {c.original_pin}
                      </span>
                      <span className="text-ink-400">→</span>
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                        {c.new_pin}
                      </span>
                    </div>
                    <p className="mt-1 leading-relaxed text-ink-200">{c.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-ink-200">
                Claude returned the same pins; see the remaining violations above.
              </p>
            )}
          </div>
        )}

        <details className="mt-auto text-xs text-ink-400">
          <summary className="cursor-pointer select-none hover:text-ink-200">
            Rules applied for {board.name}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} className="flex gap-2">
                <Badge tone={r.severity === "error" ? "error" : "warning"} className="mt-0.5 shrink-0">
                  {r.severity}
                </Badge>
                <span>
                  <span className="text-ink-200">{r.title}.</span> {r.description}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Card>
  );
}
