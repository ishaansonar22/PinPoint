"use client";

import { useEffect, useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { BoardDef } from "@/lib/boards";
import { Badge, Card, SectionTitle } from "../ui";

SyntaxHighlighter.registerLanguage("cpp", cpp);

export default function DriverCode({
  code,
  partName,
  board,
}: {
  code: string;
  partName: string;
  board: BoardDef;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Fallback for browsers without clipboard permissions.
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
    }
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
        right={
          <div className="flex items-center gap-2">
            <Badge>Arduino · {board.shortName}</Badge>
            <span className="text-[11px] text-ink-400">{lines} lines</span>
            <button
              type="button"
              onClick={download}
              className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 transition hover:border-ink-400 hover:text-ink-50"
            >
              Download .ino
            </button>
            <button
              type="button"
              onClick={copy}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                copied
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-accent-500/50 bg-accent-500/10 text-accent-400 hover:bg-accent-500/20"
              }`}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        }
      >
        Driver code
      </SectionTitle>
      <div className="max-h-[640px] overflow-auto text-[13px] leading-relaxed">
        <SyntaxHighlighter
          language="cpp"
          style={vscDarkPlus}
          showLineNumbers
          customStyle={{
            margin: 0,
            padding: "1.25rem",
            background: "transparent",
            fontSize: "inherit",
          }}
          lineNumberStyle={{ color: "#3b4658", minWidth: "2.5em" }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </Card>
  );
}
