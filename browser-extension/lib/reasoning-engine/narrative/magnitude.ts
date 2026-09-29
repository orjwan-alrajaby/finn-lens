/**
 * How big is a difference, really?
 *
 * Every comparative sentence in the Advice needs to know whether a gap is
 * worth a paragraph, worth a clause, or worth saying "these are the same".
 * Classifying that once, here, is what stops the prose from calling a
 * one-point difference decisive — and from burying a 400-litre one.
 */

/** A difference between two comparable values. */
export type Magnitude =
  | "tie"
  | "negligible"
  | "slight"
  | "clear"
  | "decisive";

/** True when a difference is too small to base a decision on. */
export const isNoticeable = (magnitude: Magnitude): boolean =>
  magnitude === "clear" || magnitude === "decisive";

/** True when the honest thing to say is "these are the same". */
export const isEffectivelyLevel = (magnitude: Magnitude): boolean =>
  magnitude === "tie" || magnitude === "negligible";

/**
 * Category scores run 0–100 and are relative to the pinned set, so a handful
 * of points is noise and thirty is a different car.
 */
export function classifyScoreGap(difference: number): Magnitude {
  const gap = Math.abs(difference);

  if (gap === 0) return "tie";
  if (gap <= 4) return "negligible";
  if (gap <= 12) return "slight";
  if (gap <= 29) return "clear";

  return "decisive";
}

/**
 * Whether two cars' figures measure the same quantity, and so can be compared.
 *
 * Not a given within one priority. Long distance is scored on electric range
 * for a car that publishes one and on consumption otherwise, and consumption
 * is litres for a combustion car and kilowatt-hours for an electric one — so
 * two cars' figures under the same heading can be 450 km and 6.5 L/100km.
 * Ordering those, or quoting one "against" the other, is nonsense.
 */
export function comparableMeasurements(
  a: { label: string; unit: string },
  b: { label: string; unit: string },
): boolean {
  return a.label === b.label && a.unit === b.unit;
}

/**
 * Measurements — boot litres, CO₂, range — are judged proportionally, because
 * 50 litres means something different at 300 L than at 1,600 L.
 */
export function classifyMeasurementGap(a: number, b: number): Magnitude {
  const larger = Math.max(Math.abs(a), Math.abs(b));

  if (larger === 0) return "tie";
  if (a === b) return "tie";

  const ratio = Math.abs(a - b) / larger;

  if (ratio < 0.03) return "negligible";
  if (ratio < 0.12) return "slight";
  if (ratio < 0.35) return "clear";

  return "decisive";
}

/**
 * Money is judged in absolute euros per month, because that is how a monthly
 * subscription is actually felt — €40 is €40 whether the car is €300 or €900.
 * The proportional check only rescues small absolute gaps on cheap cars.
 */
export function classifyMonthlyCostGap(
  difference: number,
  reference: number,
): Magnitude {
  const gap = Math.abs(difference);

  if (gap < 1) return "tie";

  const share = reference > 0 ? gap / reference : 0;

  if (gap < 10 && share < 0.05) return "negligible";
  if (gap < 25) return "slight";
  if (gap < 75) return "clear";

  return "decisive";
}

/**
 * The overall totals of two cars.
 *
 * Deliberately stricter than `classifyScoreGap`: a total is a weighted blend
 * of every priority, so a two-point spread genuinely is a coin toss and the
 * ranking should say so rather than implying a winner pulled away.
 */
export function classifyTotalGap(difference: number): Magnitude {
  const gap = Math.abs(difference);

  if (gap === 0) return "tie";
  if (gap <= 2) return "negligible";
  if (gap <= 6) return "slight";
  if (gap <= 15) return "clear";

  return "decisive";
}
