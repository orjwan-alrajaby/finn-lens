import type { PinnedFinnCar } from "@/lib/types";
import type {
  CategoryDef,
  CategoryDetail,
  CategoryId,
  Contribution,
  EvidenceGaps,
  EvidenceItem,
  FeatureId,
  StandardCheck,
  FeaturePreference,
  FeatureSelection,
  LensPreferences,
  NumericEvidence,
  PriorityWeight,
  SignalId,
  VehicleScore,
} from "./types";

import {
  BASE_FEATURE_WEIGHT,
  CATEGORIES,
  DEFAULT_CATEGORY_FEATURES,
  DEFAULT_PRIORITIES,
  FEATURE_IMPORTANCE,
  SIGNALS,
} from "./constants";

import { formatNumber } from "./format";
import {
  assessEnvironment,
  assessEnvironmentOrGaps,
} from "./environmental";
import {
  ASSESSED_SHARE,
  appliesTo,
  chargeFactor,
  countedItems,
  dcChargeMinutes,
  equipmentKnown,
  evRangeKm,
  isBinarySignal,
  isStatedFact,
  lengthMm,
  signalUtility,
  tripFactor,
} from "./evidence";

/**
 * How one car fits one reader, from the evidence FINN publishes about it.
 *
 * Everything here is intrinsic. A car's score depends on the car and the
 * reader's settings and on nothing else — no other pinned car can move it, so
 * one car viewed on its own and the same car in a comparison always score the
 * same, and adding a car to a comparison never reorders the ones already there.
 */

/* -------------------------------------------------------------------------- */
/* Runtime category registry                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Built-in categories are immutable.
 *
 * Custom categories live here instead of being added directly to CATEGORIES.
 * Nothing creates one any more, and the settings migration keeps them out of
 * the order; the registry survives so a stored definition still reads.
 */
const CUSTOM_CATEGORIES: Record<string, CategoryDef> = {};

/** Resolves either a built-in or custom category. */
export function getCategory(category: CategoryId): CategoryDef | undefined {
  return (
    (CATEGORIES[category as keyof typeof CATEGORIES] as CategoryDef | undefined) ??
    CUSTOM_CATEGORIES[category]
  );
}

/** Registers or updates metadata for a custom category. */
export function registerCategoryMeta(id: CategoryId, meta: CategoryDef): void {
  if (id in CATEGORIES) return;
  CUSTOM_CATEGORIES[id] = meta;
}

/** Removes a custom category. Built-in categories can never be removed. */
export function unregisterCategoryMeta(id: CategoryId): void {
  if (id in CATEGORIES) return;
  delete CUSTOM_CATEGORIES[id];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export const featureLabel = (key: string): string =>
  SIGNALS[key as SignalId]?.label ?? key;

/**
 * A signal's name as it reads inside a sentence: "a towbar", "adaptive
 * cruise control". Chips and headings keep the bare label.
 */
export const featurePhrase = (key: string): string => {
  const meta = SIGNALS[key as SignalId];

  if (!meta) return key;

  const name = sentenceCase(meta.label);

  return "article" in meta ? `${meta.article} ${name}` : name;
};

/**
 * Lowercases a label for mid-sentence use without mangling acronyms,
 * symbols or brand names — "Heated seats" → "heated seats", but "ISOFIX
 * child seat anchors" and "360° camera" are left alone.
 */
function sentenceCase(label: string): string {
  const first = label.split(" ")[0] ?? label;

  const isAcronymOrSymbol = first.length > 1 && first === first.toUpperCase();

  if (isAcronymOrSymbol || !/^[A-Z]/.test(label)) return label;

  return label.charAt(0).toLowerCase() + label.slice(1);
}

function evidence(
  label: string,
  value: number,
  unit: string,
  display: string,
  lowerIsBetter: boolean,
): NumericEvidence {
  return { label, value, unit, display, lowerIsBetter };
}

/* -------------------------------------------------------------------------- */
/* Category scoring                                                           */
/* -------------------------------------------------------------------------- */

/** The weight a reader's settings give one counted item. */
function weighItem(
  role: EvidenceItem["role"],
  niche: boolean,
  preference: FeaturePreference | undefined,
): { weight: number; preference: FeaturePreference | null } {
  /* Evidence from another home counts at standard; it is raised only at home. */
  if (role === "alsoCounts") return { weight: BASE_FEATURE_WEIGHT, preference: null };

  if (preference) {
    return {
      weight: FEATURE_IMPORTANCE[preference.importance].weight,
      preference,
    };
  }

  return { weight: niche ? 0 : BASE_FEATURE_WEIGHT, preference: null };
}

/**
 * Scores one car in one priority and records the evidence behind it.
 *
 * - Every counted item has a weight from the reader's settings and a reading
 *   from the car. An item FINN's data doesn't answer is left out of the score
 *   entirely — never counted as absent, never counted as average.
 * - The priority is **assessed** when at least half its counted weight is
 *   known. An unassessed priority is left out of the car's fit and said to be
 *   unassessed, rather than scored.
 * - Long Distance on an electric car is multiplied by the range factor and
 *   the DC charging factor, which can only lower it; an electric car with no
 *   published range is unassessed, and one with no charging time simply isn't
 *   limited by it.
 * - An item that means nothing for this car — a heat pump on a petrol car —
 *   isn't counted for it at all.
 * - Environmental Impact is the CO₂ reading, and is assessed when there is one.
 *
 * `vehicles` is accepted for callers that pass the comparison set and is
 * deliberately unused: nothing about another car may move this score.
 */
export function categoryDetail(
  category: CategoryId,
  vehicle: PinnedFinnCar,
  _vehicles: PinnedFinnCar[] = [vehicle],
  _preferences?: LensPreferences,
  categoryFeatures: Record<CategoryId, FeatureSelection> = DEFAULT_CATEGORY_FEATURES,
): CategoryDetail {
  if (category === "environmental") return environmentalDetail(vehicle);

  const def = getCategory(category);
  const selection = categoryFeatures[category] ?? [];
  const known = equipmentKnown(vehicle);

  const items: EvidenceItem[] = (def ? countedItems(category) : [])
    .filter(({ key }) => appliesTo(key, vehicle))
    .map(
    ({ key, role, niche }) => {
      const { weight, preference } = weighItem(
        role,
        niche,
        selection.find((item) => item.key === key),
      );

      return {
        key,
        role,
        weight,
        utility: signalUtility(key, vehicle),
        importance: preference?.importance ?? null,
        source: preference ? (preference.source ?? "user") : null,
        niche,
      };
    },
  );

  const counted = items.filter((item) => item.weight > 0);

  /*
   * Expected items stay out of the arithmetic that earns: counted there, they
   * would add the same to every car and only squeeze the differences between
   * them. A confirmed gap in one is taken off what the car earned, at the
   * weight a missing Standard (or raised) item carries.
   */
  const scored = counted.filter((item) => item.role !== "expected");
  const expectedItems = counted.filter((item) => item.role === "expected");

  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0);
  const knownItems = scored.filter((item) => item.utility != null);
  const knownWeight = knownItems.reduce((sum, item) => sum + item.weight, 0);
  const earned = knownItems.reduce(
    (sum, item) => sum + item.weight * (item.utility as number),
    0,
  );
  const deduction = expectedItems
    .filter((item) => item.utility === 0)
    .reduce((sum, item) => sum + item.weight, 0);

  const featureScore =
    knownWeight > 0 ? (100 * Math.max(0, earned - deduction)) / knownWeight : null;

  /* Long Distance on an electric car: the range can only take away. */
  const range = def?.limit === "evRange" ? evRangeKm(vehicle) : null;
  const isElectric = vehicle.fuelType === "Electric";
  const limited = def?.limit === "evRange" && isElectric;
  const rangeFactor = limited && range != null ? tripFactor(range) : null;

  /* And slow DC charging, when FINN lists a time. */
  const minutes = def?.chargeLimit === "dcCharge" ? dcChargeMinutes(vehicle) : null;
  const charging = minutes != null ? chargeFactor(minutes) : null;

  const factor = rangeFactor == null && charging == null ? null : (rangeFactor ?? 1) * (charging ?? 1);

  const assessed =
    totalWeight > 0 &&
    knownWeight >= ASSESSED_SHARE * totalWeight &&
    !(limited && range == null);

  const exactScore = assessed ? (featureScore ?? 0) * (factor ?? 1) : 0;

  const binary = scored.filter((item) => isBinarySignal(item.key));
  const matched = binary.filter((item) => item.utility === 1).map((item) => item.key);
  const missing = binary.filter((item) => item.utility === 0).map((item) => item.key);
  const unknown = scored.filter((item) => item.utility == null).map((item) => item.key);

  const pickedMatched: FeaturePreference[] = [];
  const pickedMissing: FeaturePreference[] = [];
  const pickedUnknown: FeaturePreference[] = [];

  for (const item of items) {
    if (!item.importance || item.role === "alsoCounts") continue;

    const preference = selection.find((entry) => entry.key === item.key) as FeaturePreference;

    if (item.utility == null) pickedUnknown.push(preference);
    else if (item.utility > 0) pickedMatched.push(preference);
    else pickedMissing.push(preference);
  }

  const standard: StandardCheck[] = ((def?.expected ?? []) as FeatureId[]).map((key) => {
    const utility = signalUtility(key, vehicle);

    return {
      key,
      state: utility == null ? "unknown" : utility === 1 ? "listed" : "unlisted",
    };
  });

  const expectedMissing = standard
    .filter((item) => item.state === "unlisted")
    .map((item) => item.key);

  const coverageScore =
    matched.length + missing.length
      ? Math.round((100 * matched.length) / (matched.length + missing.length))
      : null;

  return {
    score: Math.round(exactScore),
    exactScore,
    assessed,
    items,
    matched,
    missing,
    unknown,
    expectedMissing,
    standard,
    basis: items.length ? "category" : "none",
    pickedMatched,
    pickedMissing,
    pickedUnknown,
    coverageScore,
    featureScore,
    numericScore: null,
    numeric: categoryNumeric(category, vehicle, range),
    tripFactor: rangeFactor,
    chargeFactor: charging,
    chargeMinutes: minutes,
    environmental: null,
    bounds: priorityBounds(assessed, scored, expectedItems, totalWeight, earned, deduction, factor),
    hasEvidence: assessed,
  };
}

/** The measured figure a priority quotes: length for City & Parking, range for Long Distance. */
function categoryNumeric(
  category: CategoryId,
  vehicle: PinnedFinnCar,
  range: number | null,
): NumericEvidence | null {
  if (category === "cityParking") {
    const length = lengthMm(vehicle);

    return length == null
      ? null
      : evidence("Length", length, "mm", `${formatNumber(length / 1000, 2)} m`, true);
  }

  if (category === "longDistance" && range != null) {
    return evidence("Electric range", range, "km", `${formatNumber(range, 0)} km`, false);
  }

  return null;
}

/**
 * The lowest and highest a priority could score once FINN filled its gaps.
 *
 * Unknown items at absent and at present, with the range factor applied; an
 * unassessed priority could be anything.
 */
function priorityBounds(
  assessed: boolean,
  scored: EvidenceItem[],
  expected: EvidenceItem[],
  totalWeight: number,
  earned: number,
  deduction: number,
  factor: number | null,
): { low: number; high: number } {
  if (!assessed || totalWeight === 0) return { low: 0, high: 100 };

  const unknownWeight = (items: EvidenceItem[]) =>
    items
      .filter((item) => item.utility == null)
      .reduce((sum, item) => sum + item.weight, 0);

  const f = factor ?? 1;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));

  /* Worst: unknown scored items absent and unknown expected items missing. */
  return {
    low: clamp((100 * (earned - deduction - unknownWeight(expected))) / totalWeight) * f,
    high: clamp((100 * (earned - deduction + unknownWeight(scored))) / totalWeight) * f,
  };
}

/** Environmental Impact: the CO₂ reading, or unassessed without one. */
function environmentalDetail(vehicle: PinnedFinnCar): CategoryDetail {
  const assessment = assessEnvironment(vehicle);
  const score = assessment?.score ?? null;
  const assessed = score != null;

  return {
    score: assessed ? Math.round(score) : 0,
    exactScore: assessed ? score : 0,
    assessed,
    items: [],
    matched: [],
    missing: [],
    unknown: [],
    expectedMissing: [],
    standard: [],
    basis: "none",
    pickedMatched: [],
    pickedMissing: [],
    pickedUnknown: [],
    coverageScore: null,
    featureScore: null,
    numericScore: score,
    numeric: assessment?.co2
      ? evidence(
          "CO₂ emissions",
          assessment.co2.gPerKm,
          "g/km",
          `${formatNumber(assessment.co2.gPerKm)} g/km`,
          true,
        )
      : null,
    tripFactor: null,
    chargeFactor: null,
    chargeMinutes: null,
    /*
     * Carried even when there is no CO₂ figure to score, so the reader can be
     * told exactly what FINN didn't publish.
     */
    environmental: assessment ?? assessEnvironmentOrGaps(vehicle),
    bounds: assessed ? { low: score, high: score } : { low: 0, high: 100 },
    hasEvidence: assessed,
  };
}

/* -------------------------------------------------------------------------- */
/* Priority weighting                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Turns a priority *order* into explicit weights.
 *
 * Position 1 gets the largest share and each step down gets one unit less,
 * normalised so the weights sum to 1: 5:4:3:2:1 for five priorities.
 */
export function priorityWeights(priorities: CategoryId[]): PriorityWeight[] {
  const ordered = priorities.length ? priorities : DEFAULT_PRIORITIES;
  const denominator = (ordered.length * (ordered.length + 1)) / 2;

  return ordered.map((priority, index) => {
    const weight = (ordered.length - index) / denominator;

    return {
      priority,
      rank: index + 1,
      weight,
      weightPercent: Math.round(weight * 100),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Vehicle scoring                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One car's fit under the reader's settings, with its working.
 *
 * - **Fit** is the weighted average over assessed priorities only.
 * - **Judgeable** means the #1 and #2 priorities are both assessed. Only a
 *   judgeable car can be recommended or given an overall band.
 * - **Contributions** add up exactly to the fit: one line per piece of counted
 *   evidence, a range line for an electric car under Long Distance, and one
 *   line for the CO₂ score.
 * - **Bounds** are the fit with every unknown at its worst and at its best —
 *   the check behind "this could change depending on…".
 */
export function scoreVehicle(
  vehicle: PinnedFinnCar,
  priorities: CategoryId[],
  preferences?: LensPreferences,
  categoryFeatures: Record<CategoryId, FeatureSelection> = DEFAULT_CATEGORY_FEATURES,
): VehicleScore {
  const weights = priorityWeights(priorities);

  const byCategory = {} as Record<CategoryId, number>;
  const details: Partial<Record<CategoryId, CategoryDetail>> = {};

  for (const { priority } of weights) {
    const detail = categoryDetail(priority, vehicle, [vehicle], preferences, categoryFeatures);

    byCategory[priority] = detail.score;
    details[priority] = detail;
  }

  const assessedWeight = weights
    .filter(({ priority }) => details[priority]?.assessed)
    .reduce((sum, { weight }) => sum + weight, 0);

  const fit = assessedWeight
    ? weights.reduce((sum, { priority, weight }) => {
        const detail = details[priority] as CategoryDetail;
        return detail.assessed ? sum + weight * detail.exactScore : sum;
      }, 0) / assessedWeight
    : 0;

  const [first, second] = weights;

  const judgeable = Boolean(
    first &&
      details[first.priority]?.assessed &&
      (!second || details[second.priority]?.assessed),
  );

  return {
    vehicleId: vehicle.id,
    total: Math.round(fit),
    fit,
    judgeable,
    byCategory,
    details,
    contributions: contributionsFor(weights, details, assessedWeight),
    gaps: gapsFor(vehicle, weights, details),
    bounds: {
      low: weights.reduce(
        (sum, { priority, weight }) => sum + weight * (details[priority]?.bounds.low ?? 0),
        0,
      ),
      high: weights.reduce(
        (sum, { priority, weight }) => sum + weight * (details[priority]?.bounds.high ?? 100),
        0,
      ),
    },
  };
}

function contributionsFor(
  weights: PriorityWeight[],
  details: Partial<Record<CategoryId, CategoryDetail>>,
  assessedWeight: number,
): Contribution[] {
  const lines: Contribution[] = [];

  if (!assessedWeight) return lines;

  for (const { priority, weight } of weights) {
    const detail = details[priority];
    if (!detail?.assessed) continue;

    const share = weight / assessedWeight;

    if (detail.basis === "none") {
      lines.push({ kind: "emissions", priority, points: share * detail.exactScore });
      continue;
    }

    const known = detail.items.filter(
      (item) => item.weight > 0 && item.utility != null && item.role !== "expected",
    );
    const knownWeight = known.reduce((sum, item) => sum + item.weight, 0);
    if (!knownWeight) continue;

    let itemPoints = 0;

    for (const item of known) {
      const points = (share * item.weight * (item.utility as number) * 100) / knownWeight;
      itemPoints += points;
      lines.push({ kind: "item", priority, key: item.key, points });
    }

    /*
     * Each confirmed gap in expected equipment, as a negative line. A priority
     * can't go below zero, so when the gaps outweigh what the car earned they
     * share out exactly what it lost.
     */
    const gaps = detail.items.filter(
      (item) => item.weight > 0 && item.role === "expected" && item.utility === 0,
    );
    const gapPoints = gaps.reduce(
      (sum, item) => sum + (share * item.weight * 100) / knownWeight,
      0,
    );
    const taken = Math.min(gapPoints, itemPoints);

    for (const item of gaps) {
      const points = (share * item.weight * 100) / knownWeight;
      lines.push({ kind: "missingExpected", priority, key: item.key as FeatureId, points: -(points * taken) / gapPoints });
    }

    itemPoints -= taken;

    if (detail.tripFactor != null && detail.tripFactor < 1) {
      lines.push({ kind: "range", priority, points: -(1 - detail.tripFactor) * itemPoints });
      itemPoints *= detail.tripFactor;
    }

    if (detail.chargeFactor != null && detail.chargeFactor < 1) {
      lines.push({ kind: "charging", priority, points: -(1 - detail.chargeFactor) * itemPoints });
    }
  }

  return lines;
}

function gapsFor(
  vehicle: PinnedFinnCar,
  weights: PriorityWeight[],
  details: Partial<Record<CategoryId, CategoryDetail>>,
): EvidenceGaps {
  const known = equipmentKnown(vehicle);

  const unknownItems: EvidenceGaps["unknownItems"] = [];
  const unassessed: CategoryId[] = [];
  const expectedMissing: FeatureId[] = [];

  for (const { priority } of weights) {
    const detail = details[priority];
    if (!detail) continue;

    if (!detail.assessed) unassessed.push(priority);

    for (const key of detail.unknown) {
      /* A missing equipment list is one gap, not one per entry. */
      if (!known && !isStatedFact(key)) continue;
      unknownItems.push({ priority, key });
    }

    for (const key of detail.expectedMissing) {
      if (!expectedMissing.includes(key)) expectedMissing.push(key);
    }
  }

  return { equipmentKnown: known, unknownItems, unassessed, expectedMissing };
}

/**
 * Scores every vehicle against the reader's ordered priorities.
 *
 * Intentionally unaware of the budget, and of which other cars are in the set:
 * each car is scored on its own, so the list is just the same calculation
 * mapped over it.
 */
export function computeAllScores(
  vehicles: PinnedFinnCar[],
  priorities: CategoryId[],
  preferences: LensPreferences,
  categoryFeatures: Record<CategoryId, FeatureSelection> = DEFAULT_CATEGORY_FEATURES,
): VehicleScore[] {
  return vehicles.map((vehicle) =>
    scoreVehicle(vehicle, priorities, preferences, categoryFeatures),
  );
}

/* -------------------------------------------------------------------------- */
/* Score lookups                                                              */
/* -------------------------------------------------------------------------- */

export function scoreFor(
  scores: VehicleScore[],
  vehicleId: number,
  category: CategoryId,
): number {
  return (
    scores.find((score) => score.vehicleId === vehicleId)?.byCategory[
      category
    ] ?? 0
  );
}

export function totalFor(scores: VehicleScore[], vehicleId: number): number {
  return scores.find((score) => score.vehicleId === vehicleId)?.total ?? 0;
}

/** The unrounded fit, which ranking and closeness use. */
export function fitFor(scores: VehicleScore[], vehicleId: number): number {
  return scores.find((score) => score.vehicleId === vehicleId)?.fit ?? 0;
}

/** The best car in one priority among those it could be assessed for. */
export function winnerForCategory(
  vehicles: PinnedFinnCar[],
  scores: VehicleScore[],
  category: CategoryId,
): PinnedFinnCar | undefined {
  const exact = (vehicle: PinnedFinnCar) =>
    scores.find((score) => score.vehicleId === vehicle.id)?.details[category];

  return [...vehicles]
    .filter((vehicle) => exact(vehicle)?.assessed)
    .sort(
      (a, b) => (exact(b)?.exactScore ?? 0) - (exact(a)?.exactScore ?? 0),
    )[0];
}
