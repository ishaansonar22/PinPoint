import { NextResponse } from "next/server";
import { isBoardId } from "@/lib/boards";
import { runPipeline } from "@/lib/pipeline";
import type { GenerateEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export const MAX_PDF_BYTES = 30 * 1024 * 1024;

function isPdf(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === "application/pdf" || (type === "" && file.name.toLowerCase().endsWith(".pdf"));
}

/** Read the first bytes to confirm it's really a PDF (magic number "%PDF"). */
function hasPdfMagic(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString("latin1").startsWith("%PDF");
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const board = form.get("board");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No PDF file was uploaded." }, { status: 400 });
  }
  if (!isPdf(file)) {
    return NextResponse.json(
      { error: `"${file.name}" is not a PDF. Please upload the datasheet as a .pdf file.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return NextResponse.json(
      { error: `The PDF is ${mb} MB; the limit is 30 MB. Try exporting only the relevant pages.` },
      { status: 400 },
    );
  }
  if (typeof board !== "string" || !isBoardId(board)) {
    return NextResponse.json({ error: "Unknown target board." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!hasPdfMagic(buf)) {
    return NextResponse.json(
      { error: `"${file.name}" does not look like a valid PDF (missing %PDF header).` },
      { status: 400 },
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The server has no ANTHROPIC_API_KEY configured. Add it to .env.local and restart." },
      { status: 500 },
    );
  }
  const pdfBase64 = buf.toString("base64");

  // Stream NDJSON progress events so the UI can show what is happening while
  // Claude reads the datasheet.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: GenerateEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const log = (message: string, data?: unknown) => {
        if (data === undefined) console.log(`[pinpoint] ${message}`);
        else console.log(`[pinpoint] ${message}\n`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
      };
      try {
        console.log(`[pinpoint] generate: ${file.name} (${file.size} bytes) for ${board}`);
        const result = await runPipeline({
          pdfBase64,
          board,
          log,
          onProgress: (message) => send({ type: "progress", message }),
        });
        send({ type: "result", data: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected server error.";
        console.error("[pinpoint] generate failed:", err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
