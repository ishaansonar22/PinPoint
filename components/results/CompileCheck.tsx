import type { BoardDef } from "@/lib/boards";
import type { CompileCheck as CompileCheckData } from "@/lib/types";
import { Badge, Card, SectionTitle, type BadgeTone } from "../ui";

function statusBadge(c: CompileCheckData): { label: string; tone: BadgeTone } {
  switch (c.status) {
    case "passed":
      return { label: "Compiles ✓", tone: "success" };
    case "fixed":
      return { label: `Fixed after ${c.fixes.length} attempt${c.fixes.length === 1 ? "" : "s"} ✓`, tone: "success" };
    case "failed":
      return { label: "Failed ✗", tone: "error" };
    case "unavailable":
      return { label: "Compile service unavailable", tone: "warning" };
    default:
      return { label: "Compile check not configured", tone: "neutral" };
  }
}

/** Badge used in the results header. Exported so ResultsView can reuse it. */
export function CompileBadge({ compile }: { compile: CompileCheckData | undefined }) {
  if (!compile) return null;
  const { label, tone } = statusBadge(compile);
  return <Badge tone={tone}>{label}</Badge>;
}

function ErrorBlock({ text }: { text: string }) {
  return (
    <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-red-500/30 bg-ink-950/70 p-3 font-mono text-[11.5px] leading-relaxed text-red-100 whitespace-pre-wrap">
      {text}
    </pre>
  );
}

export default function CompileCheck({
  compile,
  board,
}: {
  compile: CompileCheckData | undefined;
  board: BoardDef;
}) {
  const c: CompileCheckData = compile ?? { status: "skipped", attempts: [], fixes: [] };
  const { label, tone } = statusBadge(c);
  const totalMs = c.attempts.reduce((s, a) => s + a.duration_ms, 0);
  const lastWarnings = c.attempts.at(-1)?.warnings?.trim();

  return (
    <Card>
      <SectionTitle
        right={
          <div className="flex items-center gap-2">
            {c.fqbn && <span className="font-mono text-[11px] text-ink-400">{c.fqbn}</span>}
            {c.attempts.length > 0 && (
              <span className="text-[11px] text-ink-400">
                {c.attempts.length} compile{c.attempts.length === 1 ? "" : "s"} · {(totalMs / 1000).toFixed(1)}s
              </span>
            )}
            <Badge tone={tone}>{label}</Badge>
          </div>
        }
      >
        Compile check
      </SectionTitle>

      <div className="p-5 text-sm">
        {c.status === "skipped" && (
          <p className="text-ink-400">
            {c.message ?? "Compile check not configured."} Set <code className="font-mono text-ink-200">COMPILE_SERVICE_URL</code> and{" "}
            <code className="font-mono text-ink-200">COMPILE_SERVICE_TOKEN</code> to have every sketch compiled with arduino-cli
            for the {board.name} before it is shown here.
          </p>
        )}

        {c.status === "unavailable" && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-amber-100">
            <p className="font-medium">The compile service could not be used, so this sketch is unverified.</p>
            {c.message && <p className="mt-1 text-xs text-amber-100/80">{c.message}</p>}
          </div>
        )}

        {c.status === "passed" && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/20 text-lg text-emerald-300">✓</span>
            <div>
              <p className="font-semibold text-emerald-200">Compiled successfully on the first attempt</p>
              <p className="text-xs text-emerald-100/80">
                arduino-cli built the sketch for the {board.name}
                {c.attempts[0] ? ` in ${(c.attempts[0].duration_ms / 1000).toFixed(1)}s` : ""}.
              </p>
            </div>
          </div>
        )}

        {(c.status === "fixed" || c.status === "failed") && (
          <div className="space-y-3">
            <p className={c.status === "fixed" ? "text-emerald-200" : "text-red-200"}>
              {c.status === "fixed"
                ? `The first version did not compile. Claude fixed it in ${c.fixes.length} round${c.fixes.length === 1 ? "" : "s"} and the final code builds cleanly.`
                : `The sketch still fails after ${c.attempts.length} attempts. The last compiler output is shown below; the code section contains the latest version.`}
            </p>

            <ol className="space-y-3">
              {c.attempts.map((a) => {
                const fix = c.fixes.find((f) => f.attempt === a.attempt);
                return (
                  <li
                    key={a.attempt}
                    className={`rounded-lg border px-4 py-3 ${
                      a.success ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={a.success ? "success" : "error"}>{a.success ? "compiled" : "error"}</Badge>
                      <span className="text-xs font-medium text-ink-50">Attempt {a.attempt}</span>
                      <span className="text-[11px] text-ink-400">{(a.duration_ms / 1000).toFixed(1)}s</span>
                    </div>
                    {!a.success && a.errors && <ErrorBlock text={a.errors} />}
                    {fix && (
                      <div className="mt-2 rounded-md border border-accent-500/30 bg-accent-500/5 px-3 py-2 text-xs text-ink-200">
                        <span className="font-semibold text-accent-400">Fix → </span>
                        {fix.summary || "Claude rewrote the code to address the error above."}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {lastWarnings && (
          <details className="mt-3 text-xs text-ink-400">
            <summary className="cursor-pointer select-none hover:text-ink-200">Compiler warnings</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-amber-400/30 bg-ink-950/70 p-3 font-mono text-[11.5px] leading-relaxed text-amber-100 whitespace-pre-wrap">
              {lastWarnings}
            </pre>
          </details>
        )}
      </div>
    </Card>
  );
}
