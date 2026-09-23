/**
 * Express app. Kept free of process-level side effects so tests can build it
 * with mocked dependencies.
 */

import express, { type Request, type Response } from "express";
import { checkLibraries } from "./allowlist.js";
import { LibraryInstallError, type CompileOutcome } from "./arduino.js";
import { BOARDS, isCompileBoard, type CompileBoard } from "./config.js";

export interface CompileRequest {
  board: CompileBoard;
  code: string;
  libraries: string[];
}

export interface AppDeps {
  token: string;
  maxCodeBytes: number;
  maxConcurrent: number;
  maxQueue: number;
  compile: (board: CompileBoard, code: string) => Promise<CompileOutcome>;
  ensureLibraries: (names: readonly string[]) => Promise<void>;
  /** Extra data for GET /health. */
  info?: () => Promise<Record<string, unknown>>;
}

export type Validation = { ok: true; value: CompileRequest } | { ok: false; error: string };

export function validateCompileRequest(body: unknown, maxCodeBytes: number): Validation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  if (!isCompileBoard(b.board)) {
    return { ok: false, error: `"board" must be one of: ${Object.keys(BOARDS).join(", ")}.` };
  }
  if (typeof b.code !== "string" || b.code.trim() === "") {
    return { ok: false, error: '"code" must be a non-empty string.' };
  }
  const bytes = Buffer.byteLength(b.code, "utf8");
  if (bytes > maxCodeBytes) {
    return { ok: false, error: `"code" is ${bytes} bytes; the limit is ${maxCodeBytes} bytes.` };
  }
  let libraries: string[] = [];
  if (b.libraries !== undefined) {
    if (!Array.isArray(b.libraries) || !b.libraries.every((x) => typeof x === "string")) {
      return { ok: false, error: '"libraries" must be an array of strings.' };
    }
    if (b.libraries.length > 20) {
      return { ok: false, error: '"libraries" may list at most 20 entries.' };
    }
    libraries = b.libraries;
  }
  return { ok: true, value: { board: b.board, code: b.code, libraries } };
}

/** Tiny counting semaphore with a bounded wait queue. */
class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  get waiting() {
    return this.queue.length;
  }

  acquire(): Promise<() => void> | null {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve(() => this.release());
    }
    if (this.queue.length >= this.maxQueue) return null;
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

function bearerToken(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const x = req.header("x-compile-token");
  return x ? x.trim() : null;
}

export function createApp(deps: AppDeps) {
  const app = express();
  const sem = new Semaphore(deps.maxConcurrent, deps.maxQueue);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", async (_req: Request, res: Response) => {
    const extra = deps.info ? await deps.info().catch(() => ({})) : {};
    res.json({ ok: true, boards: Object.keys(BOARDS), ...extra });
  });

  app.post("/compile", async (req: Request, res: Response) => {
    if (!deps.token || bearerToken(req) !== deps.token) {
      res.status(401).json({ error: "Unauthorized: missing or invalid compile service token." });
      return;
    }

    const v = validateCompileRequest(req.body, deps.maxCodeBytes);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }

    const libs = checkLibraries(v.value.libraries);
    if (libs.rejected.length > 0) {
      res.status(400).json({
        error: `Library not allowed: ${libs.rejected.join(", ")}. Only core libraries and allowlisted third-party libraries can be used.`,
        rejected_libraries: libs.rejected,
      });
      return;
    }

    const slot = sem.acquire();
    if (!slot) {
      res.status(503).json({ error: "Compile service is busy; try again shortly." });
      return;
    }
    const release = await slot;
    try {
      try {
        await deps.ensureLibraries(libs.install);
      } catch (err) {
        if (err instanceof LibraryInstallError) {
          res.status(400).json({ error: err.message, library: err.library });
          return;
        }
        throw err;
      }
      const result = await deps.compile(v.value.board, v.value.code);
      res.json({
        success: result.success,
        errors: result.errors,
        warnings: result.warnings,
        duration_ms: result.duration_ms,
        board: v.value.board,
        fqbn: BOARDS[v.value.board].fqbn,
        installed_libraries: libs.install,
      });
    } catch (err) {
      console.error("[compile-service] compile failed:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Compile failed." });
    } finally {
      release();
    }
  });

  // JSON parse errors and unknown routes.
  app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const e = err as { type?: string; status?: number; message?: string };
    if (e?.type === "entity.too.large") {
      res.status(413).json({ error: "Request body too large (limit 256 KB)." });
      return;
    }
    if (e?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Body is not valid JSON." });
      return;
    }
    res.status(e?.status ?? 500).json({ error: e?.message ?? "Internal error." });
  });

  return app;
}
