<p align="center">
  <img src="public/logo.png" alt="PinPoint logo" width="180">
</p>

# PinPoint

**From datasheet to working code, verified.**

PinPoint turns an electronics datasheet PDF into a board-specific wiring guide and Arduino-framework driver code, then verifies the result two ways:

1. A **deterministic rules engine** checks every pin choice against the board's hardware constraints. Real errors (an LED on an input-only pin, SPI off the hardware pins, a GPIO wired to the ESP32's flash) trigger one auto-correction round with Claude.
2. An optional **compile-check loop** builds the sketch with `arduino-cli` in a separate compile service. If it fails, the compiler output goes back to Claude, which fixes only the code, up to two times.

Supported boards: **ESP32 DevKit** and **Arduino Uno**.

## Architecture

```
 Browser                      PinPoint (Next.js)                          Compile service (Express)
 ────────                     ──────────────────                          ─────────────────────────
 upload PDF + board  ──────▶  /api/generate (NDJSON progress stream)
                              │
                              ├─ 1. extractSpec()      ──▶ Claude (claude-fable-5-1) ──▶ JSON spec
                              ├─ 2. checkPins()            lib/rules.ts (no AI)
                              ├─ 3. errors? correctSpec() ──▶ Claude, one request ──▶ checkPins() again
                              ├─ 4. compile loop          ──▶ POST /compile {board, code, libraries}
                              │      ├─ fail? fixCompileErrors() ──▶ Claude (code only)   arduino-cli compile
                              │      └─ retry ≤ 2                                          --fqbn esp32:esp32:esp32
                              │                                                            --fqbn arduino:avr:uno
 results page  ◀──────────────┴─ {spec, violations, corrections, compile}
```

The compile service is optional. Without `COMPILE_SERVICE_URL` and `COMPILE_SERVICE_TOKEN`, step 4 is skipped and the UI shows "Compile check not configured".

## What it does

1. Upload a datasheet PDF (up to 30 MB) and pick a target board.
2. Claude reads the PDF and returns strict JSON: part info, pin assignments, register init sequence, complete driver code, the libraries it needs, warnings, and the datasheet page number for every extracted value.
3. The rules engine (`lib/rules.ts`, plain TypeScript) checks every pin assignment.
4. If any *error*-severity violation is found, an auto-correction loop asks Claude to fix the pins and update the code to match. The rules engine runs again.
5. If a compile service is configured, the sketch is compiled. Compiler errors are sent back to Claude for a code-only fix, up to two retries.
6. The results page shows the part summary with `p.N` source badges, the wiring table with violations highlighted, the rules-check panel, syntax-highlighted driver code with Copy/Download, the compile-check panel, and the datasheet warnings.

## How the rules engine works

`lib/rules.ts` holds a **rules table**: one entry per rule, each with an id, board, severity, title, description, and a pure `check()` function. `checkPins(board, spec)` normalises every `board_pin` string (`"GPIO 21"`, `"IO21"`, `"D21"` and `"21"` all resolve to `GPIO21`; `"SDA"` on the Uno resolves to `A4`) and runs every rule registered for the board. Board data (default I2C/SPI pins, logic voltage, pin normalisation, prompt hints, compile target) lives in `lib/boards.ts`, so adding a board means adding one `BoardDef` and its rules.

| Board | Rule | Severity |
|---|---|---|
| ESP32 | GPIO 34, 35, 36, 39 are input-only: used as output or bidirectional | error |
| ESP32 | GPIO 6–11 are wired to internal flash: used at all | error |
| ESP32 | ADC2 pins (GPIO 0, 2, 4, 12–15, 25–27) cannot analogRead while Wi-Fi is on | warning |
| ESP32 | Strapping pins (GPIO 0, 2, 5, 12, 15) affect boot | warning |
| ESP32 | Part's logic level does not include 3.3V | warning |
| ESP32 | Same board pin assigned twice (shared I2C/SPI bus lines and power/ground exempt) | error |
| Uno | D0 / D1 are the USB serial link | warning |
| Uno | analogRead on a pin that is not A0–A5 | error |
| Uno | SPI MOSI/MISO/SCK not on D11/D12/D13 | error |
| Uno | SPI chip select not on D10 (works, but D10 must stay an output) | warning |
| Uno | Part is 3.3V-only on a 5V board: suggests a level shifter | warning |
| Uno | Same board pin assigned twice (shared bus lines and power/ground exempt) | error |

Logic-level rules parse voltage strings such as `"1.71V to 3.6V"` or `"3V3"` (`lib/voltage.ts`) and ignore negated mentions like "not 5V tolerant"; when no voltage can be found, the rule stays silent rather than guessing.

## How auto-correction works

The correction request contains the original JSON plus the plain-English violation list, and asks Claude to move the offending signals to valid pins (preferring the board's recommended free GPIO), update `driver_code` so the pin constants and comments match, and explain each move in the pin's `note`. `diffPins()` compares the before/after pin lists so the UI can show "GPIO35 → GPIO26" with the rule that triggered the move. Exactly one correction request is made; whatever violations remain are shown to the user.

JSON handling is defensive: markdown fences and any preamble are stripped, the object is validated against the schema, and if parsing fails the request is retried once with a stricter instruction before returning a clear error.

## How the compile-check loop works

`lib/compile.ts` implements `runCompileLoop()` with the compile and fix steps injected (so it is unit-tested with both mocked):

```
compile(code, libraries) ─▶ ok?  ──▶ status "passed"
        │ errors
        ▼
fixCompileErrors(spec, errors, attempt 1) ─▶ compile ─▶ ok? ──▶ status "fixed"
        │ errors
        ▼
fixCompileErrors(spec, errors, attempt 2) ─▶ compile ─▶ ok? ──▶ status "fixed"
        │ errors
        ▼
status "failed" (last errors shown; latest code kept)
```

- The fix prompt receives only the sketch, the library list and the compiler output, and must return `{driver_code, libraries, change_summary}`. Pins, registers and behaviour must stay the same.
- A `400` from the service (for example a library that is not allowlisted) is treated as a compile failure so Claude can rewrite the library list.
- If the service is unreachable or returns 5xx, the status is `unavailable` and the rest of the result is still shown.
- Progress events streamed to the UI: `Compiling...`, `Fixing compile error (attempt N)...`, `Compiled successfully`.

## Setup: PinPoint

Requirements: Node 20+ and an Anthropic API key.

```bash
npm install
cp .env.local.example .env.local      # put your key in ANTHROPIC_API_KEY
npm run dev                            # http://localhost:3000
```

Scripts:

```bash
npm test               # Vitest: rules engine, voltage parsing, JSON parsing, correction diff, compile loop
npm run typecheck      # tsc --noEmit
npm run build          # production build
npm run demos:build    # regenerate public/demo/*.json using the real rules engine
npm run compile:smoke  # live smoke test of the compile-fix loop (needs compile service + API key)
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Required. Read only on the server. |
| `ANTHROPIC_WORKSPACE_ID` | – | Only if the key is not scoped to a workspace (the API asks for an `anthropic-workspace-id` header). |
| `PINPOINT_MODEL` | `claude-fable-5-1` | Override the model id. |
| `PINPOINT_EFFORT` | `medium` | Claude effort level (`low`…`max`). |
| `COMPILE_SERVICE_URL` | – | Base URL of the compile service, e.g. `http://localhost:8080`. |
| `COMPILE_SERVICE_TOKEN` | – | Shared secret sent as `Authorization: Bearer …`. Both compile variables must be set to enable the check. |

## Setup: compile service

`compile-service/` is a small Express + TypeScript server with one job: run `arduino-cli compile`.

**API**

```
POST /compile
Authorization: Bearer <COMPILE_SERVICE_TOKEN>
{ "board": "esp32" | "uno", "code": "<sketch>", "libraries": ["Wire", "Adafruit BME280 Library"] }

200 { "success": true|false, "errors": "...", "warnings": "...", "duration_ms": 1234, "fqbn": "arduino:avr:uno" }
400 { "error": "Library not allowed: …" }        # allowlist, size (>100 KB), bad board
401 { "error": "Unauthorized…" }
503 { "error": "Compile service is busy…" }

GET /health  → { ok, boards, arduino_cli, cores }
```

Each request writes the code to a temporary sketch folder, compiles with the right FQBN (`esp32:esp32:esp32` or `arduino:avr:uno`), deletes the folder, and returns within a hard 60-second timeout. Libraries are installed on demand with `arduino-cli lib install`, but only names on the allowlist in `src/allowlist.ts` (core libraries, a curated list, and the `Adafruit `, `SparkFun `, `Sensirion ` vendor prefixes). Anything else is rejected before compiling. At most two compiles run concurrently; extra requests queue briefly, then get a 503.

**Run with Docker (recommended)**

```bash
docker build -t pinpoint-compile ./compile-service        # installs arduino-cli + both cores, warms the build cache
docker run --rm -p 8080:8080 -e COMPILE_SERVICE_TOKEN=change-me pinpoint-compile
curl http://localhost:8080/health
```

The image is large (the ESP32 core alone is well over 1 GB) and the first build takes several minutes; later builds reuse the cached core layer. Then in PinPoint's `.env.local`:

```
COMPILE_SERVICE_URL=http://localhost:8080
COMPILE_SERVICE_TOKEN=change-me
```

**Run without Docker (local dev)**

If you have `arduino-cli` (or the Arduino IDE 2.x, which bundles one) with the cores installed:

```bash
cd compile-service && npm install
COMPILE_SERVICE_TOKEN=change-me npm run dev
```

Useful overrides: `ARDUINO_CLI=<path to arduino-cli>` when it is not on the PATH (Arduino IDE on Windows: `%LOCALAPPDATA%\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`), and `FQBN_ESP32` / `FQBN_UNO` to compile against a different installed core (for instance `FQBN_ESP32=arduino:esp32:nano_nora` if only Arduino's ESP32 package is installed). Compile-service tests: `cd compile-service && npm test`.

## Deployment notes

- **Compile service**: deploy the Docker image anywhere that runs containers (Fly.io, Railway, Render, Google Cloud Run, a VPS). Give it at least 1 GB RAM and a persistent or warm instance: a cold ESP32 build can take 40–60 s, a warm one 5–10 s. Set `COMPILE_SERVICE_TOKEN` to a long random string and expose only `/compile` and `/health`.
- **PinPoint**: any Node host (Vercel, Netlify, Fly.io). A full run takes 1–3 minutes, so the `/api/generate` function needs a long timeout (`maxDuration = 300` is set in the route; make sure the platform plan allows it). Set `ANTHROPIC_API_KEY`, `COMPILE_SERVICE_URL` (the public URL of the compile service) and `COMPILE_SERVICE_TOKEN`.
- **Cost**: a datasheet is 60k–80k input tokens; expect roughly a dollar per run at this model's pricing, plus a fraction more per compile-fix round.
- Rotate the API key and the compile token if they are ever pasted into a chat or a ticket.

## Demo mode

Event Wi-Fi is unreliable, so **Load demo** loads saved results from `public/demo/*.json` without touching either service. You can also link straight to one, e.g. `/?demo=sht31-esp32-compilefix`.

- **LED module on ESP32** – Claude placed the LED on GPIO35 (input-only). The rules engine flagged the error and the correction loop moved it to GPIO26.
- **BME280 on ESP32** – I2C sensor with a full compensation-formula driver; all checks pass.
- **MCP3008 on Arduino Uno** – SPI ADC; passes with a chip-select warning. Compile check: passed (real `arduino:avr:uno` build).
- **SHT31-D on ESP32** – the first sketch was missing `#include <Wire.h>`; the compile-check loop caught it (real arduino-cli output) and the fix compiled. Shows "Fixed after 1 attempt ✓".
- **DS18B20 on ESP32 (real run)** – recorded live Claude output: a bit-banged 1-Wire driver.
- **TMP102 on Arduino Uno (real run)** – recorded live output; the rules engine adds the level-shifter warning. Compile check: passed.

Fixtures are generated by `scripts/build-demos.ts`: hand-written specs, recorded API results in `scripts/recorded/`, real compiler output in `scripts/fixtures/`. The script re-runs the actual rules engine, so fixtures can never disagree with `lib/rules.ts`.

## Frontend notes

- **Design tokens** live in one block at the top of `app/globals.css` (colours, radii, code theme). Dark is the default; `html.light` overrides. Tailwind utilities such as `bg-surface`, `text-accent-text` and `border-border` are mapped from those variables, so retheming means editing that block only.
- **Theme toggle** in the header remembers the choice in `localStorage` (wrapped in try/catch). `/?theme=light` or `/?theme=dark` in the URL overrides it, which is handy for sharing screenshots.
- **Fonts**: Space Grotesk (UI) and JetBrains Mono (code, pins, registers) via `next/font`.
- **Motion**: framer-motion with short (150–400 ms) transitions. Every animation checks `prefers-reduced-motion` through `components/motion/useReducedMotion.ts`, which is hydration-safe.
- **Dev preview**: in development, `/?preview=stepper` renders the loading stepper with sample progress so the loading state can be styled without a live run.

## Project layout

```
app/api/generate/route.ts    multipart upload -> NDJSON progress stream -> result
components/                  PinPointApp (state machine), UploadPanel, ProgressCard, results/*
  results/CompileCheck.tsx   compile badge + per-attempt errors and fix summaries
lib/
  boards.ts                  board data table, pin normalisation, compile target
  rules.ts                   rules table + checkPins()
  voltage.ts                 voltage string parsing
  claude.ts                  Anthropic SDK calls: extract, correct pins, fix compile errors
  compile.ts                 compile-service client + runCompileLoop()
  pipeline.ts                extract -> check -> correct -> compile
  types.ts                   PartSpec, Violation, CompileCheck, GenerateResult…
  *.test.ts                  Vitest suites
compile-service/             Express + arduino-cli service (Dockerfile, allowlist, tests)
public/demo/                 saved demo results
scripts/                     build-demos.ts, compile-fix-smoke.ts, fixtures/, recorded/
```

## Roadmap

- **More boards.** Raspberry Pi Pico (RP2040), ESP32-C3/S3, Arduino Nano / Mega, STM32 Nucleo. Each is one `BoardDef`, a rules-table block, and an FQBN in the compile service.
- **Verified driver library.** Cache generated drivers that passed rules + compile + a human review, keyed by part number and board, so common parts return instantly and offline.
- **Accuracy benchmark.** A fixed set of datasheets with hand-labelled pins, addresses and init registers; score extraction accuracy, page-citation accuracy and first-try compile rate per model/prompt version, and track regressions in CI.
- **Richer rules.** Pull-up requirements for I2C, current limits per pin, PWM-capable pin checks, 5V-tolerant-input tables.
- **Hardware-in-the-loop.** Flash the compiled binary to a real board and check Serial output against expected ranges.
