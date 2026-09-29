import type { PinnedFinnCar } from "@/lib/types";
import type {
  BudgetStatus,
  CategoryId,
  FeatureBasis,
  EmphasisSource,
  FeatureImportance,
  SignalId,
  NumericEvidence,
} from "../types";
import type { EnvironmentalAssessment } from "../environmental";
import type { Magnitude } from "./magnitude";

/**
 * The structured reasoning behind the Advice.
 *
 * This layer is deliberately facts-first: everything the explanation is
 * allowed to claim is derived and typed here, and only then turned into
 * sentences. Nothing downstream may state something that isn't on one of
 * these records.
 */

/* -------------------------------------------------------------------------- */
/* Features                                                                   */
/* -------------------------------------------------------------------------- */

/** One feature, with the plain-English explanation of it. */
export interface FeatureFact {
  key: SignalId;
  /** The name as a label or heading: "Towbar". */
  label: string;
  /** The name as it reads inside a sentence: "a towbar". */
  phrase: string;
  /** Short, jargon-free description, for the UI's information affordance. */
  explanation: string;
  /**
   * How much the user said this one matters. Null for a feature they never
   * picked out, which is most of a catalogue.
   */
  importance: FeatureImportance | null;
  /** Who raised it: a profile the reader applied, or the reader. Null when not raised. */
  source: EmphasisSource | null;
}

/** One standard item, checked against this car's listing. */
export interface StandardFact extends FeatureFact {
  state: "listed" | "unlisted" | "unknown";
}

/** A set of features split by whether the car has them. */
export interface FeatureSplit {
  present: FeatureFact[];
  missing: FeatureFact[];
  /** FINN's data doesn't say either way. Never read as missing. */
  unknown: FeatureFact[];
}

/**
 * What the car has and hasn't, on two separate questions.
 *
 * There is no importance grading here, because the user isn't asked for one:
 * how much a category matters is the priority order, and which things inside
 * it they care about is the selection.
 *
 * The two splits answer different questions and are kept apart so the
 * explanation can give both without conflating them:
 *
 * - `coverage` is what the score counted — the category's whole catalogue.
 * - `picked` is what the user asked for. It moves no number; it decides what
 *   the explanation leads with and which tradeoffs surface.
 *
 * A car can be strong on `coverage` and still miss two things in `picked`,
 * and saying exactly that is the whole point.
 */
export interface FeatureEvidence {
  /** See `CategoryDetail.basis`. */
  basis: FeatureBasis;
  /** Every feature the category covers. The plain count behind the score. */
  coverage: FeatureSplit;
  /** The features the user picked out. Both lists empty when they picked none. */
  picked: FeatureSplit;
  /** Picks the car lacks that the user gave the most influence. */
  highMisses: FeatureFact[];
  /** How many features the user picked out. Zero is a valid answer. */
  selectedCount: number;
  /** The priority's standard equipment, checked for this car. */
  standard: StandardFact[];
}

/* -------------------------------------------------------------------------- */
/* Measurements                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A measured number about the car, relevant to one priority.
 *
 * `scored` separates the numbers the engine actually weighs from the ones we
 * report purely because they answer "what does practical mean here?".
 */
export interface MeasurementFact {
  label: string;
  display: string;
  value: number;
  unit: string;
  lowerIsBetter: boolean;
  scored: boolean;
  /** The same measurement on the car being compared against, when known. */
  rival: {
    name: string;
    display: string;
    value: number;
    magnitude: Magnitude;
    /** True when the subject's figure is the better of the two. */
    subjectAhead: boolean;
  } | null;
}

/**
 * A categorical fact about the car — drivetrain, number of doors.
 *
 * Not every piece of relevant evidence is a number, and "it's electric" is a
 * more useful answer to an environment question than any score.
 */
export interface TraitFact {
  label: string;
  value: string;
  /** The same fact on the rival, when it differs and the difference matters. */
  rival: { name: string; value: string } | null;
}

/* -------------------------------------------------------------------------- */
/* Comparisons                                                                */
/* -------------------------------------------------------------------------- */

export interface RivalDifference {
  vehicleId: number;
  name: string;
  score: number;
  /** subject − rival. */
  difference: number;
  magnitude: Magnitude;
  subjectAhead: boolean;
  /** Features the subject has and the rival doesn't. */
  onlySubjectHas: FeatureFact[];
  /** Features the rival has and the subject doesn't. */
  onlyRivalHas: FeatureFact[];
}

export interface LeaderDifference {
  vehicleId: number;
  name: string;
  score: number;
  gap: number;
  magnitude: Magnitude;
  numeric: NumericEvidence | null;
}

/* -------------------------------------------------------------------------- */
/* Priority reasoning                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Where this car stands in one priority, relative to everything pinned.
 *
 * `unsupported` is a real answer, not a failure — it means the data does not
 * support a comparison and the Advice should say exactly that.
 */
export type PriorityStanding =
  | "leads"
  | "levelWithLeader"
  | "closeToLeader"
  | "behindLeader"
  | "unsupported";

export interface PriorityReasoning {
  priority: CategoryId;
  label: string;
  icon: string;
  rank: number;
  weightPercent: number;
  score: number;

  standing: PriorityStanding;
  /** False when neither features nor a measurement were available. */
  hasEvidence: boolean;

  features: FeatureEvidence;
  measurements: MeasurementFact[];
  traits: TraitFact[];

  /**
   * The environmental reading, for the one priority that has one.
   *
   * Carried whole rather than flattened into `measurements`, because the
   * interpretation is the point: a table row saying "CO₂ emissions 140 g/km"
   * asks the reader to know what 140 means, and every surface that only had
   * the measurements ended up asking exactly that. Null on every other
   * priority.
   */
  environmental: EnvironmentalAssessment | null;

  rival: RivalDifference | null;
  /** Only set when the category leader is neither the subject nor the rival. */
  leader: LeaderDifference | null;

  /** The explanation, ready to render. One string per paragraph. */
  sentences: string[];
}

/* -------------------------------------------------------------------------- */
/* Cost reasoning                                                             */
/* -------------------------------------------------------------------------- */

/** One car's monthly cost, broken into the parts a reader can act on. */
export interface CostPosition {
  vehicleId: number;
  name: string;
  /** Estimated total per month. Partial when `complete` is false. */
  total: number;
  /** The advertised subscription price alone. */
  subscription: number | null;
  /** Estimated energy at the user's mileage. */
  energy: number | null;
  /** Estimated charge for kilometres beyond FINN's allowance. */
  excessMileage: number | null;
  complete: boolean;
  budgetStatus: BudgetStatus;
}

export interface CostReasoning {
  subject: CostPosition;
  /** The rival the Advice is weighing the subject against. */
  rival: CostPosition | null;
  /** The cheapest pinned car we can fully cost, when it isn't the subject. */
  cheapest: CostPosition | null;
  budget: number | null;
  /** Estimated total minus budget. Positive means over. */
  budgetDifference: number | null;
  monthlyKm: number;
  /** Cost components we could not estimate, in plain English. */
  unknowns: string[];
  sentences: string[];
}

/* -------------------------------------------------------------------------- */
/* Tradeoffs                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Why a compromise is being shown.
 *
 * Every tradeoff must trace back to something the user told us — a priority
 * they ranked, or the budget they set. A weakness that answers to neither is
 * not surfaced, however real it is.
 */
export type TradeoffKind =
  /** The car lacks something the user singled out. Never a disqualification. */
  | "missingSelected"
  | "priorityDeficit"
  | "measurementDeficit"
  | "cost"
  | "budget";

/**
 * The car a compromise is measured against.
 *
 * Always one of the recommendation's realistic alternatives, so "you're
 * giving this up" names a car the reader could actually take instead.
 */
export interface TradeoffRival {
  vehicleId: number;
  name: string;
}

export interface Tradeoff {
  kind: TradeoffKind;
  /** The priority this answers to. Null only for budget, which the user set directly. */
  priority: CategoryId | null;
  priorityLabel: string | null;
  /** The priority's position in the user's order. Drives how loudly we say it. */
  rank: number | null;
  severity: "high" | "moderate";
  /** Short label for the UI. States the compromise, not a category name. */
  headline: string;
  /**
   * What is being given up, as concrete evidence: named equipment or a
   * measurement with both figures.
   */
  evidence: string;
  /**
   * Why this reader should care — the priority they ranked, or the budget
   * they set. Never a generic "worth weighing".
   */
  relevance: string;
  /** The alternative that has it, when one does. */
  rival: TradeoffRival | null;
  sentences: string[];
}

/* -------------------------------------------------------------------------- */
/* Verdict                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The answer, stated once.
 *
 * The fields are separated because each is said in exactly one place on the
 * page. The budget override in particular used to appear four times — in the
 * headline, the verdict prose, the head-to-head summary and the cost panel —
 * which reads as a system repeating itself rather than a person explaining
 * something.
 */
export interface Verdict {
  /** One line, safe to use as a hero headline. The conclusion, not the score. */
  headline: string;
  /** Why, tied to the priorities the user ranked highest. Evidence, not restatement. */
  reasons: string[];
  /**
   * The one place the page says the budget changed the answer.
   *
   * Null when the highest-scoring car is also the recommended one, because
   * then there is nothing to explain.
   */
  budgetNote: string | null;
  /** How far clear of the next car it finished, when there is one. */
  margin: {
    name: string;
    difference: number;
    magnitude: Magnitude;
  } | null;
  /** Said only when the top two are close enough that the ranking misleads. */
  marginNote: string | null;
  /**
   * Said only when evidence FINN didn't publish could reorder the
   * recommendation and the runner-up, naming that evidence.
   */
  dependsNote: string | null;
}

/* -------------------------------------------------------------------------- */
/* The whole thing                                                            */
/* -------------------------------------------------------------------------- */

export interface AdviceNarrative {
  vehicle: PinnedFinnCar;
  rank: number;
  total: number;
  isRecommendation: boolean;

  verdict: Verdict;
  /**
   * Every ranked priority, in the user's own order.
   *
   * Priorities the data can't speak to are still here, marked `unsupported`,
   * so the page can say "we don't know" rather than quietly skipping one.
   */
  priorities: PriorityReasoning[];
  cost: CostReasoning;
  /** Relevance-filtered compromises, most consequential first. */
  tradeoffs: Tradeoff[];
  /** Priorities where the data could not support a comparison. */
  unsupported: PriorityReasoning[];
}
