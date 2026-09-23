"use client";

import { Card } from "./ui";
import { Spinner } from "./UploadPanel";

export default function ProgressCard({ messages }: { messages: string[] }) {
  const current = messages[messages.length - 1] ?? "Starting…";
  return (
    <Card className="p-6" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-500/10 text-accent-400">
          <Spinner className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-50">{current}</p>
          <p className="mt-1 text-xs text-ink-400">
            Reading a full datasheet can take a minute or two. Claude extracts the part, then the
            rules engine verifies every pin.
          </p>
          {messages.length > 1 && (
            <ol className="mt-3 space-y-1 text-xs text-ink-400">
              {messages.slice(0, -1).map((m, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span className="line-through decoration-ink-600">{m}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}
