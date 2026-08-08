/**
 * Flexible US feet/inches measurement parsing.
 * All successful results are inches. Bare numbers mean FEET.
 */

export type ParseMeasureOk = { ok: true; inches: number };
export type ParseMeasureErr = { ok: false; error: string };
export type ParseMeasureResult = ParseMeasureOk | ParseMeasureErr;

/** No room is 500 feet long — reject anything above this. */
export const MAX_MEASURE_INCHES = 500 * 12;

/** Normalize iOS / typographic quotes and collapse whitespace. */
export function normalizeMeasureInput(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function reject(error: string): ParseMeasureErr {
  return { ok: false, error };
}

function accept(inches: number): ParseMeasureResult {
  if (!Number.isFinite(inches)) {
    return reject("Enter a valid measurement.");
  }
  if (inches < 0) {
    return reject("Measurements can’t be negative.");
  }
  if (inches === 0) {
    return reject("Enter a measurement greater than zero.");
  }
  if (inches > MAX_MEASURE_INCHES) {
    return reject("That measurement is too large.");
  }
  return { ok: true, inches };
}

/**
 * Parse user measurement text into inches.
 * Bare number = feet. Number + inch mark = inches.
 */
export function parseMeasure(raw: string): ParseMeasureResult {
  const input = normalizeMeasureInput(raw);
  if (!input) {
    return reject("Enter a measurement.");
  }

  // 12'6" | 12' 6" | 12ft 6in | 12 feet 6 inches | 12'6 | 12ft6in
  const feetInches = input.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)\s*(?:"|in|inches)?$/i,
  );
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inchesPart = Number(feetInches[2]);
    if (inchesPart >= 12) {
      return reject("Inches must be less than 12 when paired with feet.");
    }
    return accept(feet * 12 + inchesPart);
  }

  // 12 6  (two bare numbers → feet + inches)
  const twoBare = input.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
  if (twoBare) {
    const feet = Number(twoBare[1]);
    const inchesPart = Number(twoBare[2]);
    if (inchesPart >= 12) {
      return reject("Inches must be less than 12 when paired with feet.");
    }
    return accept(feet * 12 + inchesPart);
  }

  // 6" | 6in | 6 inches
  const inchesOnly = input.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inches)$/i);
  if (inchesOnly) {
    return accept(Number(inchesOnly[1]));
  }

  // 12 | 12' | 12ft | 12.5 | 12 feet
  const feetOnly = input.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?$/i);
  if (feetOnly) {
    return accept(Number(feetOnly[1]) * 12);
  }

  return reject("Enter a valid measurement.");
}
