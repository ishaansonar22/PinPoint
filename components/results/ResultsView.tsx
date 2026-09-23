"use client";

import { BOARDS } from "@/lib/boards";
import type { GenerateResult } from "@/lib/types";
import { Badge } from "../ui";
import DriverCode from "./DriverCode";
import PartSummary from "./PartSummary";
import RulesPanel from "./RulesPanel";
import WarningsList from "./WarningsList";
import WiringTable from "./WiringTable";

export default function ResultsView({ result }: { result: GenerateResult }) {
  const board = BOARDS[result.board];
  const errors = result.violations.filter((v) => v.severity === "error").length;
  const warnings = result.violations.filter((v) => v.severity === "warning").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
        <span>
          Results for <span className="font-medium text-ink-200">{board.name}</span>
        </span>
        {result.demo && <Badge tone="accent">Demo · {result.demo.title}</Badge>}
        {result.autoCorrected && <Badge tone="success">Auto-corrected by rules engine</Badge>}
        {errors === 0 && warnings === 0 && <Badge tone="success">All checks passed ✓</Badge>}
        {errors > 0 && <Badge tone="error">{errors} error{errors === 1 ? "" : "s"}</Badge>}
        {warnings > 0 && <Badge tone="warning">{warnings} warning{warnings === 1 ? "" : "s"}</Badge>}
        {typeof result.elapsedMs === "number" && !result.demo && (
          <span className="ml-auto">{(result.elapsedMs / 1000).toFixed(1)}s</span>
        )}
      </div>

      <PartSummary spec={result.spec} board={board} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[3fr_2fr]">
        <WiringTable
          spec={result.spec}
          board={board}
          violations={result.violations}
          corrections={result.corrections}
        />
        <RulesPanel result={result} board={board} />
      </div>

      <DriverCode code={result.spec.driver_code} partName={result.spec.part_name} board={board} />

      <WarningsList warnings={result.spec.warnings} initSequence={result.spec.init_sequence} />
    </div>
  );
}
