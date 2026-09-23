"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { Check, Code2, Copy, Download } from "lucide-react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import type { BoardDef } from "@/lib/boards";
import type { CompileCheck } from "@/lib/types";
import { Badge, Card, SectionTitle } from "../ui";
import { codeTheme } from "./codeTheme";
import { CompileBadge } from "./CompileCheck";

SyntaxHighlighter.registerLanguage("cpp", cpp);

export default function DriverCode({
  code,
  partName,
  board,
  libraries = [],
  compile,
}: {
  code: string;
  partName: string;
  board: BoardDef;
  libraries?: string[];
  compile?: CompileCheck;
}) {
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${partName.replace(/[^\w-]+/g, "_") || "driver"}_${board.id}.ino`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = code.split("\n").length;

  return (
    <Card className="overflow-hidden">
      <SectionTitle
        icon={<Code2 size={14} />}
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>Arduino · {board.shortName}</Badge>
            {libraries.map((l) => (
              <Badge key={l} tone="accent" mono title="Library required by the sketch">
                {l}
              </Badge>
            ))}
            <CompileBadge compile={compile} />
            <span className="ml-1 font-mono text-[11px] text-muted">{lines} lines</span>
          </div>
        }
      >
        Driver code
      </SectionTitle>

      <div className="relative">
        {/* Sticky action bar */}
        <div className="pointer-events-none sticky top-3 z-10 flex justify-end gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={download}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-xs font-medium text-fg-2 backdrop-blur transition hover:border-border-strong hover:text-fg"
          >
            <Download size={13} /> .ino
          </button>
          <motion.button
            type="button"
            onClick={copy}
            whileTap={reduce ? undefined : { scale: 0.95 }}
            className={`pointer-events-auto relative inline-flex min-w-[88px] items-center justify-center gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
              copied
                ? "border-success/50 bg-success text-accent-fg shadow-[var(--shadow-glow-sm)]"
                : "border-accent/40 bg-accent/15 text-accent-text hover:bg-accent/25"
            }`}
            aria-live="polite"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="copied"
                  initial={reduce ? false : { y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? undefined : { y: -12, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Check size={13} strokeWidth={3} /> Copied!
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={reduce ? false : { y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? undefined : { y: -12, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Copy size={13} /> Copy
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        <div className="scroll-thin -mt-9 max-h-[680px] overflow-auto bg-[var(--code-bg)] text-[13px]">
          <SyntaxHighlighter
            language="cpp"
            style={codeTheme}
            showLineNumbers
            customStyle={{ margin: 0, padding: "2.75rem 1.25rem 1.25rem", background: "transparent", fontSize: "inherit" }}
            lineNumberStyle={{ color: "var(--code-line)", minWidth: "2.75em", paddingRight: "1.25em" }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      </div>
    </Card>
  );
}
