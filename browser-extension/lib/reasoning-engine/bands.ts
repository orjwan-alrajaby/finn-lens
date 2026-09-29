/**
 * Where the fit bands sit on the engine's 0–100 scale.
 *
 * Kept on their own so the two things that depend on them — the band a reader
 * sees, and the plug-in hybrid ceiling, which is "not Strong" by definition —
 * read the same numbers without importing each other.
 *
 * Provisional: calibrated against score distributions over FINN's inventory,
 * and expected to move when that calibration runs. What each band *means* is
 * fixed in `fit.ts`; these only place those meanings on the scale.
 */
export const STRONG_FROM = 65;
export const GOOD_FROM = 45;
export const PARTIAL_FROM = 25;

export type ScoreBand = "strong" | "good" | "partial" | "limited";

/** A 0–100 score's band, before any rule about which priorities fell short. */
export function bandForScore(score: number): ScoreBand {
  if (score >= STRONG_FROM) return "strong";
  if (score >= GOOD_FROM) return "good";
  if (score >= PARTIAL_FROM) return "partial";
  return "limited";
}

/** Bands in order, strongest first, for "at least Good" comparisons. */
export const BAND_ORDER: readonly ScoreBand[] = ["strong", "good", "partial", "limited"];

export const atLeast = (band: ScoreBand, floor: ScoreBand): boolean =>
  BAND_ORDER.indexOf(band) <= BAND_ORDER.indexOf(floor);
