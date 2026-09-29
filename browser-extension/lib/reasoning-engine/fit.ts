import type { FinnCar, PinnedFinnCar } from "@/lib/types";
import type {
  CategoryId,
  CostAnalysis,
  FeatureSelection,
  LensPreferences,
  PriorityBreakdown,
  VehicleScore,
} from "./types";
import { assessEnvironment } from "./environmental";
import type { EnvironmentalAssessment } from "./environmental";
import type {
  CostReasoning,
  FeatureFact,
  MeasurementFact,
  PriorityReasoning,
  StandardFact,
  Tradeoff,
  TraitFact,
} from "./narrative/types";

import { buildReasoningContext, evaluateVehicle } from "./index";
import { reasonAboutCost } from "./narrative/cost";
import { reasonAboutPriority } from "./narrative/priority";
import { reasonAboutTradeoffs } from "./narrative/tradeoffs";
import { summarisePriority } from "./narrative/verdict";
import { phraseLabel, sentence } from "./narrative/phrase";
import { DEFAULT_CATEGORY_FEATURES } from "./constants";
import { atLeast, bandForScore, type ScoreBand } from "./bands";
import { equipmentKnown, isBinarySignal } from "./evidence";

/**
 * One car, judged against one reader — the question asked on finn.com while
 * they are looking at a car, rather than the question the Compare page asks.
 *
 * The two are different questions and this file is careful about which one it
 * is answering. Compare asks "which of these fits me best?", and its answer is
 * relative by construction: boot space, range and CO₂ are scored against the
 * rest of the pinned set. Here there is no set. So:
 *
 * - **What is scored** is the part of the engine that was already absolute —
 *   how much of a priority's equipment catalogue the car carries, with the
 *   features the reader picked out weighted up. `categoryDetail` computes
 *   exactly that and needs no second implementation.
 *
 * - **What is reported but never scored** is every measurement. A relative
 *   score needs a population to be relative to, and inventing one — "cars like
 *   this usually have 450 km" — would be inventing the reader a rival. The
 *   figure is shown as a figure.
 *
 * - **What is never said** is a number out of a hundred. The reader is told
 *   how much of what they asked for this car has, in counts they can check.
 *   The weighted arithmetic underneath decides the ordering and the band, and
 *   stays off the page.
 *
 * Nothing here re-scores anything. It calls the engine with a set of one and
 * arranges the answer.
 */

/* -------------------------------------------------------------------------- */
/* Bands                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How well a car serves one thing the reader said they cared about.
 *
 * `unknown` is a real answer and the most important one to keep: FINN does not
 * supply an equipment list for every car, and a car we know nothing about must
 * read as unknown rather than as a car that has nothing.
 */
export type FitLevel = "strong" | "good" | "partial" | "limited" | "unknown";

export interface FitBand {
  level: FitLevel;
  /** "Strong match" — a claim about fit, never about the car's quality. */
  label: string;
}

/**
 * What each band is called, and what it looks like.
 *
 * The colours live here beside the words for the same reason the influence
 * scale keeps its own: a band shown in one place and coloured in another drifts
 * the moment either changes. Every surface that shows a band — the panel, the
 * badge on a card — reads its look from this, so a "Good match" is the same
 * blue wherever the reader meets it.
 *
 * The one rule the palette has to obey is that the four are distinguishable
 * before they are read. A list of cards is scanned rather than studied, and
 * four chips in the same colour make the reader stop and read each one.
 */
export const FIT_BANDS = {
  strong: {
    label: "Strong match",
    chipClass: "bg-finn-fit-strong-pale text-finn-fit-strong",
    barClass: "bg-finn-fit-strong",
    emptyBarClass: "bg-finn-fit-strong/20",
  },
  good: {
    label: "Good match",
    chipClass: "bg-finn-fit-good-pale text-finn-fit-good",
    barClass: "bg-finn-fit-good",
    emptyBarClass: "bg-finn-fit-good/20",
  },
  partial: {
    label: "Partial match",
    chipClass: "bg-finn-fit-partial-pale text-finn-fit-partial",
    barClass: "bg-finn-fit-partial",
    emptyBarClass: "bg-finn-fit-partial/20",
  },
  limited: {
    label: "Limited match",
    chipClass: "bg-finn-fit-limited-pale text-finn-fit-limited",
    barClass: "bg-finn-fit-limited",
    emptyBarClass: "bg-finn-fit-limited/20",
  },
  unknown: {
    label: "Not enough data",
    chipClass: "bg-finn-cotton text-finn-iron",
    barClass: "bg-finn-iron/40",
    emptyBarClass: "bg-finn-iron/15",
  },
} as const satisfies Record<
  FitLevel,
  {
    label: string;
    chipClass: string;
    barClass: string;
    emptyBarClass: string;
  }
>;

/**
 * How many of the five segments a band fills.
 *
 * Five rather than four because five is the number of priorities Lens asks
 * for, so a reader who has answered the setup sees a meter whose length
 * matches the thing it is summarising. It does not mean "three of your five
 * priorities are met" — the meter is a picture of the band, and the band is a
 * summary of one weighted score — but the two being the same length stops the
 * meter reading as an arbitrary mark out of four. A reader who set fewer than
 * five priorities still gets five segments, which is fine: the scale is the
 * product's, not their own.
 *
 * The steps are the presentation judgement, and only the ends are forced.
 * `strong` has to fill the meter or the top band looks unfinished, `unknown`
 * has to be empty because it is the one state that is an absence of a claim
 * rather than a weak one, and the middle has to stay monotonic. That leaves
 * one segment more than there are bands to spend it on, and it goes into the
 * gap above `limited`: those are the cars that answer almost nothing the
 * reader asked for, and one lit segment says so more honestly than two.
 *
 * See `FIT_BANDS` and the thresholds below — like those, these are worth
 * recalibrating against real inventory rather than treated as settled.
 */
export const FIT_SEGMENTS: Record<FitLevel, number> = {
  strong: 5,
  good: 4,
  partial: 3,
  limited: 1,
  unknown: 0,
};

/** The meter's length, so the three places that draw it agree on it. */
export const FIT_METER_SEGMENTS = 5;

/** Bands a score the engine produced. Never produces a score of its own. */
export function classifyFit(score: number, hasEvidence = true): FitBand {
  if (!hasEvidence) {
    return { level: "unknown", label: FIT_BANDS.unknown.label };
  }

  const level: FitLevel = bandForScore(score);

  return { level, label: FIT_BANDS[level].label };
}

/**
 * A car's overall band: what it means for this reader, not only where its fit
 * lands.
 *
 * - **Strong** — delivers on nearly everything they ranked: a high fit, the #1
 *   priority at least Good, and nothing in the top three Limited.
 * - **Good** — delivers on what matters most, with real trade-offs: a fit in
 *   the Good range or better, and the #1 priority at least Partial.
 * - **Partial** — falls short on at least one top priority.
 * - **Limited** — falls short on the top priorities.
 * - **Not enough data** — the car can't be judged on the #1 and #2 priorities.
 *
 * A fit high enough for a band is held back a band when the priorities under
 * it don't bear it out. Where the fit lands is placed by `bands.ts`, which is
 * calibrated; these rules are the meaning and don't move with it.
 */
export function classifyCarFit(score: VehicleScore, priorities: CategoryId[]): FitBand {
  if (!score.judgeable) return classifyFit(0, false);

  const bandOf = (priority: CategoryId | undefined): ScoreBand | null => {
    const detail = priority ? score.details[priority] : undefined;
    return detail?.assessed ? bandForScore(detail.exactScore) : null;
  };

  const first = bandOf(priorities[0]);
  const topThree = priorities.slice(0, 3).map(bandOf);

  let level: ScoreBand = bandForScore(score.fit);

  if (
    level === "strong" &&
    ((first && !atLeast(first, "good")) || topThree.includes("limited"))
  ) {
    level = "good";
  }

  if (atLeast(level, "good") && first && !atLeast(first, "partial")) {
    level = "partial";
  }

  return { level, label: FIT_BANDS[level].label };
}

/* -------------------------------------------------------------------------- */
/* Equipment data                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether FINN told us what this car is equipped with.
 *
 * FINN sends every key on every car, so a list that answers nothing with a
 * yes is not an answer — see `equipmentKnown`, which this is.
 */
export function hasEquipmentData(vehicle: FinnCar): boolean {
  return equipmentKnown(vehicle);
}

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** One feature the reader picked out, and whether this car has it. */
export interface FitFeature extends FeatureFact {
  /** Which priority they picked it under. */
  priority: CategoryId;
  priorityLabel: string;
  /**
   * `unknown` is not "missing". It means FINN supplied no equipment list, so
   * the honest answer is that we don't know.
   */
  state: "present" | "absent" | "unknown";
}

/** One of the reader's priorities, judged against this car. */
export interface FitPriority {
  priority: CategoryId;
  label: string;
  icon: string;
  /** Position in the reader's own order. */
  rank: number;
  /** How much of the result this priority accounts for. */
  weightPercent: number;

  band: FitBand;

  /** How many of the priority's catalogue the car carries, and out of how many. */
  covered: number;
  catalogueSize: number;

  /** The reader's picks under this priority, present ones first. */
  picked: FitFeature[];

  /**
   * The priority's standard equipment, each checked against this car's
   * listing. Never scored; shown so the reader doesn't have to know what's
   * standard.
   */
  standard: StandardFact[];

  /**
   * Everything else the priority covers, present ones first.
   *
   * The picks are what the reader asked for; this is the rest of what the
   * score counted. Keeping them apart is what lets the panel say "you asked
   * for three of these and got two" and "the category covers twelve more,
   * and it has seven of them" as two different sentences — which they are.
   */
  alsoCounted: FitFeature[];

  /** Figures relevant to this priority. Reported, never scored. */
  measurements: MeasurementFact[];
  traits: TraitFact[];

  /**
   * The working, where a priority is scored on figures rather than on
   * equipment. Only environmental impact has one, and it is the only priority
   * whose result a reader can't check against a list of features — so the
   * panel shows what went into it.
   */
  impact: EnvironmentalAssessment | null;

  /** The engine's explanation, already written. */
  sentences: string[];

  /** False when neither equipment nor a measurement could speak to it. */
  hasEvidence: boolean;
}

export interface FitAnalysis {
  vehicle: FinnCar;

  /** The headline answer. A statement about fit, not about the car. */
  overall: FitBand;

  /** The reader's priorities, in their own order. */
  priorities: FitPriority[];

  /** Why it fits, drawn from the priorities it actually serves. */
  strengths: string[];

  /** What they would be accepting. Never used to rule the car out. */
  tradeoffs: Tradeoff[];

  /** What it costs, on their own driving assumptions. */
  cost: CostAnalysis;
  costReasoning: CostReasoning;

  /**
   * How this car uses energy, whatever the reader ranked.
   *
   * The same reading already reaches `FitPriority.impact`, but only for a
   * reader who put environmental impact in their priorities — which made how
   * much fuel or electricity a car uses a fact the product would mention or
   * withhold depending on whether they had said they cared about the planet.
   * Those are different questions: one is about emissions, the other is about
   * what the car costs to run and turns up on the bill every month. So it is
   * carried here for every car and every reader, and the panel decides how to
   * say it.
   */
  environment: EnvironmentalAssessment | null;

  /** False when FINN supplied no equipment list for this car. */
  equipmentKnown: boolean;

  /** Echoed back so the panel can say what the judgement was made against. */
  preferences: LensPreferences;
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

/** How many reasons a "why it fits" list can carry before it stops being one. */
const MAX_STRENGTHS = 3;

/**
 * Judges one car against the reader's saved settings.
 *
 * The vehicle is passed to the engine as the whole comparison set, which is
 * what makes every relative measurement drop out of the score on its own —
 * `numericScore` refuses to rank a population of one — leaving the absolute
 * catalogue coverage that is the honest thing to judge a lone car on.
 */
export function buildFitAnalysis(
  vehicle: PinnedFinnCar,
  priorities: CategoryId[],
  preferences: LensPreferences,
  categoryFeatures: Record<
    CategoryId,
    FeatureSelection
  > = DEFAULT_CATEGORY_FEATURES,
): FitAnalysis {
  const context = buildReasoningContext(
    [vehicle],
    priorities,
    preferences,
    categoryFeatures,
  );

  /*
   * Deliberately not marked as the recommendation and given no rival: there is
   * nothing it was recommended over and nothing to compare it with. Both flags
   * are what keep the narrative layer from reaching for a second car.
   */
  const evaluation = evaluateVehicle(vehicle, context);

  const equipmentKnown = hasEquipmentData(vehicle);

  const reasoning = evaluation.priorities.map((breakdown) =>
    reasonAboutPriority(breakdown, vehicle, null),
  );

  const costReasoning = reasonAboutCost(vehicle, null, context, []);

  const fitPriorities = evaluation.priorities.map((breakdown, index) =>
    toFitPriority(breakdown, reasoning[index] as PriorityReasoning, equipmentKnown),
  );

  const overall = classifyCarFit(evaluation.score, context.priorities);

  return {
    vehicle,
    overall,
    priorities: fitPriorities,
    strengths: describeStrengths(fitPriorities, reasoning, equipmentKnown),
    tradeoffs: equipmentKnown
      ? reasonAboutTradeoffs(evaluation, reasoning, costReasoning, context, [])
      : reasonAboutTradeoffs(evaluation, [], costReasoning, context, []),
    cost: evaluation.cost,
    costReasoning,
    environment: assessEnvironment(vehicle),
    equipmentKnown,
    preferences,
  };
}

function toFitPriority(
  breakdown: PriorityBreakdown,
  reasoning: PriorityReasoning,
  _equipmentKnown: boolean,
): FitPriority {
  const { picked, coverage } = reasoning.features;

  /* A pick is listed once, under the reader's own heading rather than twice. */
  const pickedKeys = new Set(
    [...picked.present, ...picked.missing, ...picked.unknown].map((fact) => fact.key),
  );

  const toFeature = (
    fact: FeatureFact,
    featureState: FitFeature["state"],
  ): FitFeature => ({
    ...fact,
    priority: breakdown.priority,
    priorityLabel: breakdown.label,
    state: featureState,
  });

  const rest = (facts: FeatureFact[]) =>
    facts.filter((fact) => !pickedKeys.has(fact.key) && isBinarySignal(fact.key));

  return {
    priority: breakdown.priority,
    label: breakdown.label,
    icon: breakdown.icon,
    rank: breakdown.rank,
    weightPercent: breakdown.weightPercent,

    /* An unassessed priority reads "Not enough data", never a low band. */
    band: classifyFit(breakdown.score, breakdown.hasEvidence),

    covered: breakdown.matched.length,
    catalogueSize:
      breakdown.matched.length +
      breakdown.missing.length +
      breakdown.unknown.filter(isBinarySignal).length,

    picked: [
      ...picked.present.map((fact) => toFeature(fact, "present")),
      ...picked.missing.map((fact) => toFeature(fact, "absent")),
      ...picked.unknown.map((fact) => toFeature(fact, "unknown")),
    ],

    standard: reasoning.features.standard,

    alsoCounted: [
      ...rest(coverage.present).map((fact) => toFeature(fact, "present")),
      ...rest(coverage.missing).map((fact) => toFeature(fact, "absent")),
      ...rest(coverage.unknown).map((fact) => toFeature(fact, "unknown")),
    ],

    measurements: reasoning.measurements,
    traits: reasoning.traits,
    impact: breakdown.environmental,

    /* The engine's own sentences wherever the priority could be judged. */
    sentences:
      breakdown.hasEvidence || breakdown.environmental ? reasoning.sentences : [],

    hasEvidence: breakdown.hasEvidence,
  };
}

/**
 * Why this car fits, in the reader's own order.
 *
 * Only priorities the car genuinely serves are eligible, and each reason is
 * the engine's own summary of what the car does about that priority — the
 * equipment named, the count quoted. A car that serves nothing the reader
 * ranked gets no reasons rather than a consolation sentence, because the
 * tradeoffs below are then the honest account of it.
 */
function describeStrengths(
  priorities: FitPriority[],
  reasoning: PriorityReasoning[],
  equipmentKnown: boolean,
): string[] {
  if (!equipmentKnown) return [];

  const byPriority = new Map(
    reasoning.map((item) => [item.priority, item] as const),
  );

  const strengths: string[] = [];

  for (const priority of priorities) {
    if (strengths.length === MAX_STRENGTHS) break;
    if (priority.band.level !== "strong" && priority.band.level !== "good") {
      continue;
    }

    const summary = summarisePriority(
      byPriority.get(priority.priority) as PriorityReasoning,
      strengths.length === 0 && priority.rank === 1 ? "first" : "next",
    );

    if (summary) strengths.push(summary);
  }

  return strengths;
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

/** The priorities named in a sentence: "Practicality", "A and B", "A, B and C". */
function joinLabels(priorities: FitPriority[]): string {
  const labels = priorities.map((item) => phraseLabel(item.label));

  if (labels.length === 1) return labels[0] as string;

  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * What the headline band is a claim about.
 *
 * Said in full on the page, because "Strong match" on its own is exactly the
 * kind of label a reader can mistake for a verdict on the car. It is a verdict
 * on the fit between this car and the things *this* reader ranked — someone
 * else with different settings would get a different word for the same car.
 */
export function describeFit(analysis: FitAnalysis): string {
  if (analysis.overall.level === "unknown") {
    /*
     * A priority scored on the car's own figures survives a missing equipment
     * list — `toFitPriority` keeps its band and its sentences — so a flat
     * "there's nothing to check your priorities against" was contradicted by
     * the environmental result sitting a few centimetres below it on the same
     * screen. The exception is named where there is one.
     */
    const judged = analysis.priorities.filter(
      (item) => item.band.level !== "unknown",
    );

    if (judged.length) {
      return sentence(
        "FINN hasn't supplied an equipment list for this car, so most of your",
        `priorities have nothing to check against — ${joinLabels(judged)}`,
        `${judged.length === 1 ? "is" : "are"} judged on the car's own figures instead`,
      );
    }

    return sentence(
      "FINN hasn't supplied an equipment list for this car, so there's nothing",
      "to check your priorities against",
    );
  }

  const served = analysis.priorities.filter(
    (item) => item.band.level === "strong" || item.band.level === "good",
  );

  const total = analysis.priorities.length;

  if (!served.length) {
    return sentence(
      `It doesn't strongly serve any of the ${total} priorities you set —`,
      "what it does and doesn't have is below",
    );
  }

  const first = served[0] as FitPriority;

  return sentence(
    `It's a good or strong match on ${served.length} of the ${total}`,
    `${total === 1 ? "priority" : "priorities"} you set,`,
    `led by ${phraseLabel(first.label)}, your #${first.rank}`,
  );
}
