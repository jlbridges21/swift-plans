/**
 * Measurement parse/format assertions.
 * Run: npm run check:measure
 *   or: node --experimental-strip-types scripts/check-measure.ts
 *
 * Relative imports only — the @/ alias does not resolve under plain Node.
 */

import { formatMeasure } from "../src/lib/measure/format.ts";
import {
  MAX_MEASURE_INCHES,
  parseMeasure,
} from "../src/lib/measure/parse.ts";

let failed = 0;

function ok(label: string): void {
  console.log("ok ", label);
}

function fail(label: string, detail: string): void {
  failed += 1;
  console.log("FAIL", label, "—", detail);
}

function assert(condition: boolean, label: string, detail = ""): void {
  if (condition) {
    ok(label);
  } else {
    fail(label, detail || "assertion failed");
  }
}

function assertInches(input: string, expected: number): void {
  const result = parseMeasure(input);
  assert(
    result.ok && result.inches === expected,
    `parse ${JSON.stringify(input)} → ${expected}`,
    result.ok
      ? `got ${result.inches}`
      : `error: ${result.error}`,
  );
}

function assertReject(input: string, label?: string): void {
  const result = parseMeasure(input);
  assert(
    !result.ok,
    label ?? `reject ${JSON.stringify(input)}`,
    result.ok ? `unexpectedly parsed ${result.inches}` : "",
  );
}

// ---------------------------------------------------------------------------
// Accepted formats
// ---------------------------------------------------------------------------
assertInches("12", 144);
assertInches("12'", 144);
assertInches("12'6\"", 150);
assertInches("12' 6\"", 150);
assertInches("12 6", 150);
assertInches("12.5", 150);
assertInches("12ft", 144);
assertInches("12ft 6in", 150);
assertInches("6\"", 6);
assertInches("12 feet", 144);
assertInches("12 feet 6 inches", 150);
assertInches("  12'  6\"  ", 150);
assertInches("10in", 10);
assertInches("0.5", 6);

// Curly quotes (iOS)
assertInches("12\u20196\u201D", 150); // 12’6”
assertInches("12\u2019 6\u201D", 150);
assertInches("6\u201D", 6);
assertInches("12\u2032 6\u2033", 150); // prime / double-prime

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------
assertReject("");
assertReject("   ");
assertReject("-12");
assertReject("-6\"");
assertReject("abc");
assertReject("12x6");
assertReject("12' 15\""); // inches >= 12 with feet
assertReject("hello 12");

{
  const huge = String(MAX_MEASURE_INCHES / 12 + 1);
  assertReject(huge, `reject over max (${huge} feet)`);
}

{
  const atMaxFeet = String(MAX_MEASURE_INCHES / 12);
  const result = parseMeasure(atMaxFeet);
  assert(
    result.ok && result.inches === MAX_MEASURE_INCHES,
    `accept exactly max (${atMaxFeet} feet)`,
    result.ok ? `got ${result.inches}` : result.error,
  );
}

assertReject("0");
assertReject("0\"");

// ---------------------------------------------------------------------------
// Round-trip: parse → format → parse yields same inches
// ---------------------------------------------------------------------------
const roundTripCases = [
  6, 12, 18, 144, 150, 151, 240, 301, 480, 72.4, 99.6,
];

for (const inches of roundTripCases) {
  const rounded = Math.round(inches);
  const formatted = formatMeasure(rounded);
  const again = parseMeasure(formatted);
  assert(
    again.ok && again.inches === rounded,
    `round-trip ${rounded} via ${JSON.stringify(formatted)}`,
    again.ok ? `got ${again.inches}` : again.error,
  );
}

// Format shape
assert(formatMeasure(150) === "12' 6\"", 'format 150 → 12\' 6"');
assert(formatMeasure(144) === "12'", "format 144 → 12'");
assert(formatMeasure(6) === "0' 6\"", 'format 6 → 0\' 6"');

console.log("");
if (failed > 0) {
  console.log(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("All measure checks passed.");
