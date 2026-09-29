import type { PinnedFinnCar } from "@/lib/types";
import type {
  FeatureImportance,
  SignalId,
  FeaturePreference,
  PriorityBreakdown,
} from "../types";
import type {
  FeatureEvidence,
  FeatureFact,
  LeaderDifference,
  MeasurementFact,
  PriorityStanding,
  RivalDifference,
  TraitFact,
} from "./types";

import { SIGNALS } from "../constants";
import { isBinarySignal } from "../evidence";
import { featureLabel, featurePhrase } from "../scoring";
import { formatNumber } from "../format";
import {
  classifyMeasurementGap,
  classifyScoreGap,
  comparableMeasurements,
  isEffectivelyLevel,
} from "./magnitude";

/**
 * Turning the engine's output into the facts an explanation is allowed to use.
 *
 * Nothing here writes a sentence. It decides *what is true* — which features
 * the user asked for and got, which measurements are worth quoting, how big
 * each gap is — so the composition layer can stay a thin translation of
 * established fact into English.
 */

/* -------------------------------------------------------------------------- */
/* Features                                                                   */
/* -------------------------------------------------------------------------- */

export function featureFact(
  key: SignalId,
  importance: FeatureImportance | null = null,
  source: FeaturePreference["source"] | null = null,
): FeatureFact {
  const meta = SIGNALS[key];

  return {
    key,
    label: featureLabel(key),
    phrase: featurePhrase(key),
    explanation: meta?.explanation ?? "",
    importance,
    source: importance ? (source ?? "user") : null,
  };
}

/** A raised item keeps its level and who raised it. */
const pickedFact = (preference: FeaturePreference): FeatureFact =>
  featureFact(preference.key, preference.importance, preference.source);

/**
 * What the car has and hasn't, on both questions the reader cares about.
 *
 * Nothing is graded, because the reader grades nothing. The split that
 * matters is between what the score counted (the category's catalogue) and
 * what the reader asked for (their picks) — two different questions that an
 * explanation has to be able to answer separately.
 */
export function featureEvidence(breakdown: PriorityBreakdown): FeatureEvidence {
  const { matched, missing, unknown, basis, pickedMatched, pickedMissing, pickedUnknown } =
    breakdown;

  /*
   * Yes-or-no evidence only. A measured figure — length — is quoted as the
   * figure it is, in the measurements, never as a chip saying the car "has"
   * compact length.
   */
  const binary = (preference: FeaturePreference) => isBinarySignal(preference.key);

  const picked = {
    present: pickedMatched.filter(binary).map(pickedFact),
    missing: pickedMissing.filter(binary).map(pickedFact),
    unknown: pickedUnknown.filter(binary).map(pickedFact),
  };

  return {
    basis,
    coverage: {
      present: matched.map((key) => featureFact(key)),
      missing: missing.map((key) => featureFact(key)),
      unknown: unknown.filter(isBinarySignal).map((key) => featureFact(key)),
    },
    picked,
    highMisses: picked.missing.filter((fact) => fact.importance === "high"),
    selectedCount: picked.present.length + picked.missing.length,
    standard: (breakdown.standard ?? []).map((check) => ({
      ...featureFact(check.key),
      state: check.state,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Measurements                                                               */
/* -------------------------------------------------------------------------- */

const finite = (value: unknown): number | null => {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Vehicle measurements worth quoting for a priority *beyond* the one the
 * engine scores.
 *
 * These never touch the score. They exist because "practicality" is a word,
 * and the reader deserves the seat count and the boot figure behind it.
 */
function supportingMeasurements(
  priority: string,
  vehicle: PinnedFinnCar,
): { label: string; value: number; unit: string; lowerIsBetter: boolean }[] {
  const seats = finite(vehicle.capacity?.seats);
  const trunk = finite(vehicle.capacity?.trunk);
  const doors = finite(vehicle.doors);
  const consumption = finite(vehicle.consumption?.combined);
  const charging = vehicle.fuelType === "Electric" ? (vehicle.dcChargeMinutes ?? null) : null;

  const consumptionUnit =
    vehicle.fuelType === "Electric" ? "kWh/100km" : "L/100km";

  switch (priority) {
    /*
     * The load volume is shown and never scored: FINN's single figure is the
     * seats-up volume for some cars and the seats-folded one for others, and
     * doesn't say which. Its label says as much wherever it appears.
     */
    case "practicality":
      return [
        ...(seats == null || seats <= 0
          ? []
          : [{ label: "Seats", value: seats, unit: "", lowerIsBetter: false }]),
        ...(doors == null || doors <= 0
          ? []
          : [{ label: "Doors", value: doors, unit: "", lowerIsBetter: false }]),
        ...(trunk == null
          ? []
          : [{ label: LOAD_VOLUME, value: trunk, unit: "L", lowerIsBetter: false }]),
      ];

    /* FINN's charging time for an electric car: quoted here, and limits the score past 30 minutes. */
    case "longDistance":
      return charging == null
        ? []
        : [{ label: DC_CHARGING, value: charging, unit: "min", lowerIsBetter: true }];

    case "environmental":
      return consumption == null
        ? []
        : [
            {
              label: "Consumption",
              value: consumption,
              unit: consumptionUnit,
              lowerIsBetter: true,
            },
          ];

    default:
      return [];
  }
}

/** The label FINN's unscored boot figure carries everywhere. */
export const LOAD_VOLUME = "Load volume as FINN lists it";

/** The label FINN's DC charging time carries everywhere. */
export const DC_CHARGING = "DC charging, 10–80%";

/**
 * The figure a priority is *about*, reported when the engine couldn't score
 * one.
 *
 * A relative score needs a population to be relative to. Where there isn't
 * one — a single car being looked at on finn.com, or a set where only one car
 * carries the figure — the measurement drops out of the score, and staying
 * silent about it would leave "Long Distance" explained without ever
 * mentioning the range. So it is reported as a plain fact and never scored,
 * which is exactly what it is.
 *
 * Deduplicated by label against the scored measurement upstream, so a
 * comparison that did score the figure is completely unaffected.
 */
function headlineMeasurements(
  priority: string,
  vehicle: PinnedFinnCar,
): { label: string; value: number; unit: string; lowerIsBetter: boolean }[] {
  const range =
    vehicle.electric?.range != null && vehicle.electric.range !== "Unknown"
      ? finite(vehicle.electric.range)
      : null;

  const co2 = finite(vehicle.co2?.value);
  const length = finite(vehicle.dimensions?.length);

  switch (priority) {
    case "cityParking":
      return length == null || length <= 0
        ? []
        : [{ label: "Length", value: length, unit: "mm", lowerIsBetter: true }];

    /* Consumption isn't part of Long Distance: CO₂ and the cost already read it. */
    case "longDistance":
      return range == null || vehicle.fuelType !== "Electric"
        ? []
        : [{ label: "Electric range", value: range, unit: "km", lowerIsBetter: false }];

    case "environmental":
      return co2 == null || co2 <= 0
        ? []
        : [{ label: "CO\u2082 emissions", value: co2, unit: "g/km", lowerIsBetter: true }];

    default:
      return [];
  }
}

/**
 * The measured evidence for one priority: the number the engine scored, plus
 * any supporting figures, each set beside the rival's own value.
 */
export function measurementFacts(
  breakdown: PriorityBreakdown,
  vehicle: PinnedFinnCar,
  rival: PinnedFinnCar | null,
): MeasurementFact[] {
  const facts: MeasurementFact[] = [];

  const scored = breakdown.numeric;

  if (scored) {
    /* Only a figure of the same kind is the rival's version of this one. */
    const rivalNumeric =
      breakdown.versus?.numeric &&
      comparableMeasurements(scored, breakdown.versus.numeric)
        ? breakdown.versus.numeric
        : null;

    facts.push({
      label: scored.label,
      display: scored.display,
      value: scored.value,
      unit: scored.unit,
      lowerIsBetter: scored.lowerIsBetter,
      scored: true,
      rival:
        rivalNumeric && breakdown.versus
          ? {
              name: breakdown.versus.name,
              display: rivalNumeric.display,
              value: rivalNumeric.value,
              magnitude: classifyMeasurementGap(scored.value, rivalNumeric.value),
              subjectAhead: scored.lowerIsBetter
                ? scored.value < rivalNumeric.value
                : scored.value > rivalNumeric.value,
            }
          : null,
    });
  }

  const unscored = [
    ...supportingMeasurements(breakdown.priority, vehicle),
    ...(scored ? [] : headlineMeasurements(breakdown.priority, vehicle)),
  ];

  for (const supporting of unscored) {
    /* Never report the same figure twice under two labels. */
    if (scored && scored.label === supporting.label) continue;
    if (facts.some((fact) => fact.label === supporting.label)) continue;

    const rivalValue = rival
      ? [
          ...supportingMeasurements(breakdown.priority, rival),
          ...(scored ? [] : headlineMeasurements(breakdown.priority, rival)),
        ].find((item) => comparableMeasurements(item, supporting))?.value ??
        null
      : null;

    const display = supporting.unit
      ? `${formatNumber(supporting.value)} ${supporting.unit}`
      : formatNumber(supporting.value);

    facts.push({
      label: supporting.label,
      display,
      value: supporting.value,
      unit: supporting.unit,
      lowerIsBetter: supporting.lowerIsBetter,
      scored: false,
      rival:
        rivalValue != null && rival
          ? {
              name: rival.name,
              display: supporting.unit
                ? `${formatNumber(rivalValue)} ${supporting.unit}`
                : formatNumber(rivalValue),
              value: rivalValue,
              magnitude: classifyMeasurementGap(supporting.value, rivalValue),
              subjectAhead: supporting.lowerIsBetter
                ? supporting.value < rivalValue
                : supporting.value > rivalValue,
            }
          : null,
    });
  }

  return facts;
}

/* -------------------------------------------------------------------------- */
/* Traits                                                                     */
/* -------------------------------------------------------------------------- */

/** Categorical facts that answer a priority's question better than a score. */
export function traitFacts(
  breakdown: PriorityBreakdown,
  vehicle: PinnedFinnCar,
  rival: PinnedFinnCar | null,
): TraitFact[] {
  if (breakdown.priority === "climateSuitability") return tyreTraits(vehicle, rival);

  const wantsDrivetrain =
    breakdown.priority === "environmental" ||
    breakdown.priority === "longDistance";

  if (!wantsDrivetrain || !vehicle.fuelType) return [];

  const differs = Boolean(rival?.fuelType && rival.fuelType !== vehicle.fuelType);

  return [
    {
      label: "Drivetrain",
      value: vehicle.fuelType,
      rival:
        differs && rival
          ? { name: rival.name, value: rival.fuelType }
          : null,
    },
  ];
}

/** How FINN's tyre setup reads in a sentence. */
export const TYRE_SETUP = {
  allSeason: "all-season tyres",
  summerAndWinter: "a summer and a winter set of tyres",
} as const;

/**
 * FINN's tyre setup, under Climate Suitability: quoted, never scored. Nearly
 * every FINN car has all-season tyres, and a summer and winter set isn't the
 * worse option, so there's nothing to rank — but it's what the car meets snow
 * on, and a reader asking about winter should hear it.
 */
function tyreTraits(vehicle: PinnedFinnCar, rival: PinnedFinnCar | null): TraitFact[] {
  if (!vehicle.tyres) return [];

  const differs = Boolean(rival?.tyres && rival.tyres !== vehicle.tyres);

  return [
    {
      label: "Tyres",
      value: TYRE_SETUP[vehicle.tyres],
      rival: differs && rival?.tyres ? { name: rival.name, value: TYRE_SETUP[rival.tyres] } : null,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Comparisons                                                                */
/* -------------------------------------------------------------------------- */

export function rivalDifference(
  breakdown: PriorityBreakdown,
): RivalDifference | null {
  const versus = breakdown.versus;
  if (!versus) return null;

  return {
    vehicleId: versus.vehicleId,
    name: versus.name,
    score: versus.score,
    difference: versus.difference,
    magnitude: classifyScoreGap(versus.difference),
    subjectAhead: versus.difference > 0,
    onlySubjectHas: versus.onlySubjectHas.map((key) => featureFact(key)),
    onlyRivalHas: versus.onlyOtherHas.map((key) => featureFact(key)),
  };
}

/**
 * The category leader, but only when naming it adds something.
 *
 * If the subject leads, or the leader is already the rival being discussed,
 * there is no third car to introduce and doing so would just add noise.
 */
export function leaderDifference(
  breakdown: PriorityBreakdown,
): LeaderDifference | null {
  const { leader, versus, isLeader } = breakdown;

  if (!leader || isLeader) return null;
  if (versus && leader.vehicleId === versus.vehicleId) return null;

  const gap = leader.score - breakdown.score;
  if (gap <= 0) return null;

  return {
    vehicleId: leader.vehicleId,
    name: leader.name,
    score: leader.score,
    gap,
    magnitude: classifyScoreGap(gap),
    numeric: leader.numeric,
  };
}

/* -------------------------------------------------------------------------- */
/* Standing                                                                   */
/* -------------------------------------------------------------------------- */

/** Where the car sits in this priority across the whole pinned set. */
export function priorityStanding(
  breakdown: PriorityBreakdown,
): PriorityStanding {
  if (!breakdown.hasEvidence) return "unsupported";
  if (breakdown.isLeader) return "leads";

  const magnitude = classifyScoreGap(breakdown.gapToLeader);

  if (magnitude === "tie") return "levelWithLeader";
  if (isEffectivelyLevel(magnitude)) return "closeToLeader";
  if (magnitude === "slight") return "closeToLeader";

  return "behindLeader";
}
