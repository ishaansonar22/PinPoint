"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { BOARDS } from "@/lib/boards";
import type { GenerateResult } from "@/lib/types";
import CompileCheck from "./CompileCheck";
import CorrectionsCard from "./CorrectionsCard";
import DriverCode from "./DriverCode";
import { cardVariants, cardVariantsReduced, gridVariants, gridVariantsReduced } from "./motion";
import PartSummary from "./PartSummary";
import RulesPanel from "./RulesPanel";
import StatusStrip from "./StatusStrip";
import { InitSequenceCard, WarningsCard } from "./WarningsList";
import WiringTable from "./WiringTable";

export default function ResultsView({ result }: { result: GenerateResult }) {
  const board = BOARDS[result.board];
  const reduce = useReducedMotion();

  const card = reduce ? cardVariantsReduced : cardVariants;
  const grid = reduce ? gridVariantsReduced : gridVariants;

  const item = (className: string, children: React.ReactNode) => (
    <motion.div variants={card} className={`min-w-0 ${className}`}>
      {children}
    </motion.div>
  );

  return (
    <motion.div variants={grid} initial="hidden" animate="show" className="flex flex-col gap-6">
      <motion.div variants={card}>
        <StatusStrip result={result} board={board} />
      </motion.div>

      {/* Bento grid: 12 columns on large screens, single column on mobile. */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-12">
        {item("lg:col-span-7", <PartSummary spec={result.spec} board={board} />)}
        {item("lg:col-span-5", <RulesPanel result={result} board={board} />)}

        {item(
          "lg:col-span-7",
          <WiringTable spec={result.spec} board={board} violations={result.violations} corrections={result.corrections} />,
        )}
        {item(
          "lg:col-span-5 flex flex-col gap-5",
          <>
            {result.autoCorrected && <CorrectionsCard result={result} />}
            <CompileCheck compile={result.compile} board={board} />
          </>,
        )}

        {item(
          "lg:col-span-12",
          <DriverCode
            code={result.spec.driver_code}
            partName={result.spec.part_name}
            board={board}
            libraries={result.spec.libraries ?? []}
            compile={result.compile}
          />,
        )}

        {item("lg:col-span-6", <WarningsCard warnings={result.spec.warnings} />)}
        {item("lg:col-span-6", <InitSequenceCard initSequence={result.spec.init_sequence} />)}
      </div>
    </motion.div>
  );
}
