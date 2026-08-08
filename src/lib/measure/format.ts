/**
 * Display formatting for measurements stored in inches.
 * Round to the nearest inch for stable round-trips with parseMeasure.
 */

export function formatMeasure(inches: number): string {
  const whole = Math.round(inches);
  const feet = Math.floor(whole / 12);
  const rem = whole % 12;
  if (rem === 0) {
    return `${feet}'`;
  }
  return `${feet}' ${rem}"`;
}
