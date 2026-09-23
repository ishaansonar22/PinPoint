/**
 * Small helpers for reasoning about voltage strings such as
 * "3.3V", "1.71V to 3.6V", "2.7–5.5 V", "5V ±10%".
 *
 * These are heuristics: when nothing that looks like a voltage is found we
 * return an empty list, and callers treat that as "unknown" (no violation).
 */

export interface VoltageRange {
  min: number;
  max: number;
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const RANGE_RE = new RegExp(
  String.raw`${NUM}\s*V?\s*(?:-|–|—|to|~)\s*\+?${NUM}\s*V`,
  "gi",
);
const SINGLE_RE = new RegExp(String.raw`${NUM}\s*V(?![a-z0-9])`, "gi");
/** Common shorthands like "3V3" / "1V8". */
const SHORTHAND_RE = /(\d)V(\d)\b/gi;
/**
 * Phrases that mention a voltage the part does NOT support, e.g.
 * "not 5V tolerant", "never 5V", "do not connect to 5V", "no 5V".
 * These are removed before parsing so the number is not read as supported.
 */
const NEGATION_RE =
  /\b(?:not|never|no|non|without|don'?t|do not|must not|cannot|can't|isn'?t|aren'?t)\b[^.;,]{0,40}?\d+(?:\.\d+)?\s*V(?:[- ]?tolerant)?/gi;

export function parseVoltageRanges(input: string | null | undefined): VoltageRange[] {
  if (!input) return [];
  const text = input.replace(/,/g, ".").replace(NEGATION_RE, " ");
  const ranges: VoltageRange[] = [];

  let consumed = text;
  for (const m of text.matchAll(RANGE_RE)) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      ranges.push({ min: Math.min(a, b), max: Math.max(a, b) });
    }
    consumed = consumed.replace(m[0], " ");
  }

  for (const m of consumed.matchAll(SINGLE_RE)) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v)) ranges.push({ min: v, max: v });
  }

  for (const m of text.matchAll(SHORTHAND_RE)) {
    const v = parseFloat(`${m[1]}.${m[2]}`);
    if (Number.isFinite(v)) ranges.push({ min: v, max: v });
  }

  // Ignore obviously non-logic-level numbers (e.g. "12V" motor supply is fine,
  // but "1000V" is probably an isolation rating).
  return ranges.filter((r) => r.max <= 60);
}

/**
 * True when `input` mentions at least one voltage and one of the mentioned
 * ranges covers `target` (within `tolerance` volts).
 */
export function voltageSupports(
  input: string | null | undefined,
  target: number,
  tolerance = 0.35,
): boolean {
  return parseVoltageRanges(input).some(
    (r) => r.min - tolerance <= target && target <= r.max + tolerance,
  );
}

/** True when nothing voltage-like was found in the string. */
export function voltageUnknown(input: string | null | undefined): boolean {
  return parseVoltageRanges(input).length === 0;
}
