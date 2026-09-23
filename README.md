# PinPoint

**From datasheet to working code, verified.**

PinPoint turns an electronics datasheet PDF into a board-specific wiring guide and Arduino-framework driver code, then verifies the AI's pin choices with a deterministic rules engine. If the rules engine finds a real error (an LED on an input-only pin, an SPI device off the hardware SPI pins, a GPIO wired to the ESP32's internal flash), PinPoint sends the violations back to Claude once, gets corrected wiring and code, and re-checks the result.

Supported boards: **ESP32 DevKit** and **Arduino Uno**.

## What it does

1. Upload a datasheet PDF (up to 30 MB) and pick a target board.
2. Claude (`claude-fable-5-1`) reads the PDF and returns strict JSON: part info, pin assignments, register init sequence, complete driver code, warnings, and the datasheet page number for every extracted value.
3. The rules engine (`lib/rules.ts`, plain TypeScript, no AI) checks every pin assignment against the board's hardware constraints.
4. If any *error*-severity violation is found, an auto-correction loop asks Claude to fix the pins and update the code to match. The rules engine runs again on the result.
5. The results page shows the part summary with `p.N` source badges, the wiring table with violations highlighted, the rules-check panel, syntax-highlighted driver code with a copy button, and the datasheet warnings.

## How the rules engine works

`lib/rules.ts` holds a **rules table**: one entry per rule, each with an id, board, severity, title, description, and a pure `check()` function. `checkPins(board, spec)` normalises every `board_pin` string (`"GPIO 21"`, `"IO21"`, `"D21"` and `"21"` all resolve to `GPIO21`; `"SDA"` on the Uno resolves to `A4`) and runs every rule registered for the board. Board data (default I2C/SPI pins, logic voltage, pin normalisation, prompt hints) lives in `lib/boards.ts`, so adding a board means adding one `BoardDef` and its rules.

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

Logic-level rules parse voltage strings such as `"1.71V to 3.6V"` or `"3V3"` (`lib/voltage.ts`); when no voltage can be found, the rule stays silent rather than guessing.

## How auto-correction works

`lib/pipeline.ts` runs the whole flow:

```
PDF ──▶ extractSpec() ──▶ checkPins() ──▶ errors? ──no──▶ done
                                            │
                                           yes
                                            ▼
                             correctSpec(spec, violations)   (one request)
                                            ▼
                                       checkPins() again ──▶ done
```

The correction request contains the original JSON plus the plain-English violation list, and asks Claude to move the offending signals to valid pins (preferring the board's recommended free GPIO), update `driver_code` so the pin constants and comments match, and explain each move in the pin's `note`. `diffPins()` then compares the before/after pin lists so the UI can show "GPIO35 → GPIO26" with the rule that triggered the move. Exactly one correction request is made; whatever violations remain are shown to the user.

JSON handling is defensive: markdown fences and any preamble are stripped, the object is validated against the schema (interfaces and directions are normalised, page numbers coerced), and if parsing fails the request is retried once with a stricter instruction before returning a clear error.

## Setup

Requirements: Node 20+ and an Anthropic API key.

```bash
npm install
cp .env.local.example .env.local      # then put your key in ANTHROPIC_API_KEY
npm run dev                            # http://localhost:3000
```

Other scripts:

```bash
npm test               # Vitest: rules engine, voltage parsing, JSON parsing, correction diff
npm run typecheck      # tsc --noEmit
npm run build          # production build
npm run demos:build    # regenerate public/demo/*.json using the real rules engine
```

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Required. Read only on the server. |
| `ANTHROPIC_WORKSPACE_ID` | – | Only if the key is not scoped to a workspace (the API asks for an `anthropic-workspace-id` header). Console → Settings → Workspaces. |
| `PINPOINT_MODEL` | `claude-fable-5-1` | Override the model id. |
| `PINPOINT_EFFORT` | `medium` | Claude effort level (`low`…`max`). Higher is more thorough and slower. |

### Demo mode

Event Wi-Fi is unreliable, so **Load demo** loads saved results from `public/demo/*.json` without touching the API. You can also link straight to one, e.g. `/?demo=esp32-led-autocorrect`.

- **LED module on ESP32** – Claude placed the LED on GPIO35 (input-only). The rules engine flagged the error and the correction loop moved it to GPIO26. Shows the "Auto-corrected by rules engine" badge.
- **BME280 on ESP32** – I2C sensor with a full compensation-formula driver; all checks pass.
- **MCP3008 on Arduino Uno** – SPI ADC; passes with a chip-select warning.
- **DS18B20 on ESP32 (real run)** – recorded live output from Claude: a bit-banged 1-Wire driver written from the datasheet.
- **TMP102 on Arduino Uno (real run)** – recorded live output: a 3.3V-only I2C sensor, so the rules engine adds the level-shifter warning.

The demo files are generated by `scripts/build-demos.ts`. The first three are hand-written specs; the "real run" ones are captured API results stored in `scripts/recorded/`. In both cases the script re-runs the actual rules engine, so the fixtures can never disagree with `lib/rules.ts`.

## Project layout

```
app/
  page.tsx                  entry (renders the client app)
  api/generate/route.ts     multipart upload -> NDJSON progress stream -> result
components/
  PinPointApp.tsx           state machine: idle / loading / result / error
  UploadPanel.tsx           drag-and-drop, board select, Generate, Load demo
  ProgressCard.tsx          live progress messages
  results/                  PartSummary, WiringTable, RulesPanel, DriverCode, WarningsList
lib/
  boards.ts                 board data table + pin normalisation
  rules.ts                  rules table + checkPins()
  voltage.ts                voltage string parsing
  claude.ts                 Anthropic SDK calls, prompts, JSON parsing/validation
  pipeline.ts               extract -> check -> correct -> re-check
  types.ts                  shared types (PartSpec, Violation, GenerateResult…)
  demos.ts                  demo manifest
  *.test.ts                 Vitest suites
public/demo/                saved demo results
scripts/build-demos.ts      regenerates public/demo
```

## Roadmap

- **Compile-check loop with `arduino-cli`.** Compile the generated sketch for the selected FQBN on the server; feed compiler errors back to Claude for one fix-up pass, and show a "Compiles ✓" badge next to the rules-engine badge.
- **More boards.** Raspberry Pi Pico (RP2040), ESP32-C3/S3, Arduino Nano / Mega, STM32 Nucleo. Each is one `BoardDef` plus a rules-table block.
- **Verified driver library.** Cache generated drivers that passed rules + compile + a human review, keyed by part number and board, so common parts return instantly and offline.
- **Accuracy benchmark.** A fixed set of datasheets with hand-labelled pins, addresses, and init registers; score extraction accuracy and page-citation accuracy per model/prompt version and track regressions in CI.
- **Richer rules.** Pull-up requirements for I2C, current limits per pin, PWM-capable pin checks, and 5V-tolerant-input tables where they exist.
