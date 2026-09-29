import type { PinnedFinnCar } from "@/lib/types";
import type { CATEGORIES, FEATURES, PROFILES, SIGNALS } from "./constants";
import type { EnvironmentalAssessment } from "./environmental";
import type { ContractFit, RentalPeriod } from "./contract";

/* -------------------------------------------------------------------------- */
/* Configuration-derived types                                                */
/* -------------------------------------------------------------------------- */

export type CategoryId = keyof typeof CATEGORIES;
/** An entry in FINN's equipment list. */
export type FeatureId = keyof typeof FEATURES;
/** Any piece of evidence Lens scores or names: an equipment entry or a derived signal. */
export type SignalId = keyof typeof SIGNALS;
export type ProfileId = keyof typeof PROFILES;

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */


/**
 * Which FINN contract Lens is evaluating a vehicle under.
 *
 * This only selects which advertised monthly price to use. It deliberately
 * does not branch scoring, profiles, or recommendations.
 */
export type ContractType = "private" | "business";

export interface LensPreferences {
  /**
   * Maximum the user wants to spend per month on the car in total, including
   * estimated running costs. A hard eligibility constraint, never a score.
   */
  monthlyBudget: number;
  /** Roughly how far the user drives in a typical month. An estimate is fine. */
  monthlyKm: number;
  petrolPrice: number;
  dieselPrice: number;
  electricityPrice: number;
  contractType: ContractType;
  /**
   * The month the reader wants the car from, "2026-10", or null for no
   * particular period. Set together with `rentalTo`.
   *
   * Like the budget, a hard eligibility rule and never a score: it picks which
   * FINN term each car is priced on and whether it can be delivered in time.
   */
  rentalFrom: string | null;
  /** The last month the reader wants the car for, included: "2027-05". */
  rentalTo: string | null;
  /**
   * True when the reader may only drive an automatic — a licence limited to
   * automatics, or simply never driving a manual.
   *
   * Like the budget, a hard eligibility rule and never a score: a manual car
   * only wins when no pinned car is an automatic.
   */
  automaticOnly: boolean;
}

/**
 * Shape of settings persisted by older builds, kept only so
 * `loadLensSettings` can migrate them forward.
 */
export interface LegacyLensPreferences {
  annualKm?: number;
  monthlyKm?: number;
  monthlyBudget?: number;
  petrolPrice?: number;
  dieselPrice?: number;
  electricityPrice?: number;
  contractType?: ContractType;
  rentalFrom?: string | null;
  rentalTo?: string | null;
  automaticOnly?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Features                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How much extra influence one raised item should have.
 *
 * The keys are internal and never shown; what the user reads is the answer
 * to "how much should this influence your decision?" — somewhat, moderately,
 * highly. See FEATURE_IMPORTANCE.
 *
 * Deliberately not "essential". Lens has no hard requirements — a car missing
 * even an item raised highly stays in the running, and the gap is reported as
 * a tradeoff.
 */
export type FeatureImportance = "high" | "medium" | "low";

/**
 * Who set an emphasis: a profile the reader applied, or the reader.
 *
 * Lets every surface say "Nervous Driver emphasises…" for a raise the reader
 * never touched, and "You raised…" only for one they did.
 */
export type EmphasisSource = "profile" | "user";

/** One raised item, how much it should influence, and who raised it. */
export interface FeaturePreference {
  key: SignalId;
  importance: FeatureImportance;
  /** Absent on settings saved before provenance existed; read as the reader's. */
  source?: EmphasisSource;
}

/**
 * What is raised within one priority, at most five entries.
 *
 * An empty list is a valid answer: every item then counts at standard, and
 * niche items don't count.
 */
export type FeatureSelection = FeaturePreference[];

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A predefined starting point: an order, a starting emphasis, a promise and
 * its limits.
 *
 * Profiles are product configuration, not user documents. `enabled` is the
 * only field the user owns; applying a profile copies its order and emphasis
 * into the reader's settings, which are then theirs.
 */
export interface Profile {
  id: ProfileId;
  label: string;
  /**
   * The name of the mark that stands for this, not the mark itself.
   *
   * A key into the table in `components/PriorityIcon` — "shield", "leaf" — so
   * that the same value can be drawn as an icon by React and looked up
   * separately by the panel on finn.com, which is not React. Kept a `string`
   * rather than a union because settings saved by an older build hold an
   * emoji here, and those still render as themselves.
   */
  icon: string;
  forWhom: string;
  assumes: string;
  /** What the profile does not promise, said as plainly as what it does. */
  doesNotGuarantee: string;
  /** Three to five, in rank order. */
  priorities: CategoryId[];
  enabled: boolean;
}

/**
 * Which profile the reader's settings started from.
 *
 * `null` for settings that predate provenance or were built by hand. Whether
 * they have since been customised is derived, never stored.
 */
export type SettingsBasis = ProfileId | null;

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export interface CategoryDef {
  label: string;
  /**
   * The name of the mark that stands for this, not the mark itself.
   *
   * A key into the table in `components/PriorityIcon` — "shield", "leaf" — so
   * that the same value can be drawn as an icon by React and looked up
   * separately by the panel on finn.com, which is not React. Kept a `string`
   * rather than a union because settings saved by an older build hold an
   * emoji here, and those still render as themselves.
   */
  icon: string;
  color: string;
  question: string;
  description: string;
  recommendedFor: string[];
  numericOnly?: boolean;
  /**
   * The measured figure this priority reads, named for a reader: length under
   * City & Parking, electric range under Long Distance. Absent elsewhere.
   */
  measured?: string;
  /**
   * The evidence this priority scores and is the home of, most relevant first.
   * The only items the reader can raise here.
   */
  features: SignalId[];
  /** Items in `features` that count only once raised. */
  niche?: SignalId[];
  /** Evidence whose home is another priority, counted here at standard. */
  alsoCounts?: SignalId[];
  /**
   * Equipment on nearly every FINN car. Having it earns nothing; a car FINN
   * confirms is missing it loses what a missing Standard item costs.
   */
  expected?: FeatureId[];
  /** A figure that can only reduce this priority's score. */
  limit?: "evRange";
  /** A second such figure: an electric car's DC charging time. */
  chargeLimit?: "dcCharge";
}

/* -------------------------------------------------------------------------- */
/* User-editable priority metadata                                            */
/* -------------------------------------------------------------------------- */

export interface PriorityDefinition {
  id: CategoryId;
  label: string;
  /**
   * The name of the mark that stands for this, not the mark itself.
   *
   * A key into the table in `components/PriorityIcon` — "shield", "leaf" — so
   * that the same value can be drawn as an icon by React and looked up
   * separately by the panel on finn.com, which is not React. Kept a `string`
   * rather than a union because settings saved by an older build hold an
   * emoji here, and those still render as themselves.
   */
  icon: string;
  description: string;
  isCustom: boolean;
  enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A measured number behind a category score — length, electric range, CO₂ —
 * so the UI can cite the actual figure rather than only the score.
 */
export interface NumericEvidence {
  label: string;
  value: number;
  unit: string;
  display: string;
  /** True when a smaller number is the better outcome (CO₂, length). */
  lowerIsBetter: boolean;
}

/**
 * What a category's score was read from.
 *
 * - `category` — its evidence list.
 * - `none` — it has no evidence list and is read from a figure (Environmental).
 */
export type FeatureBasis = "category" | "none";

/** One piece of evidence as a category scored it. */
export interface EvidenceItem {
  key: SignalId;
  /** "home" for the priority's own evidence, "alsoCounts" for a second home. */
  role: "home" | "alsoCounts" | "expected";
  /** 0 for a niche item nobody raised; 1 standard; 2–4 raised. */
  weight: number;
  /** 0–1, or null when FINN's data doesn't say. */
  utility: number | null;
  importance: FeatureImportance | null;
  source: EmphasisSource | null;
  niche: boolean;
}

/**
 * One standard item on one car: listed by FINN, not listed, or unknowable
 * because FINN sent no equipment list.
 */
export interface StandardCheck {
  key: FeatureId;
  state: "listed" | "unlisted" | "unknown";
}

export interface CategoryDetail {
  /** 0–100, rounded, for display. 0 when the priority isn't assessed. */
  score: number;
  /** The unrounded score the fit is built from. */
  exactScore: number;
  /**
   * True when at least half the priority's counted evidence is known — or,
   * for Environmental, when there is a CO₂ reading. An unassessed priority
   * is left out of the fit rather than scored as zero or as average.
   */
  assessed: boolean;
  /** Every counted item, known or not. */
  items: EvidenceItem[];
  /** Counted yes-or-no items the car has. */
  matched: SignalId[];
  /** Counted yes-or-no items FINN's data says it hasn't. */
  missing: SignalId[];
  /** Counted items FINN's data doesn't answer. */
  unknown: SignalId[];
  /** Expected equipment FINN confirms this car is missing: each one costs. */
  expectedMissing: FeatureId[];
  /**
   * Every standard item, checked against this car's
   * listing, so a reader doesn't have to remember what counts as standard.
   */
  standard: StandardCheck[];
  basis: FeatureBasis;
  /** Raised items the car has, carrying the level and who raised them. */
  pickedMatched: FeaturePreference[];
  pickedMissing: FeaturePreference[];
  /** Raised items FINN's data doesn't answer for this car. */
  pickedUnknown: FeaturePreference[];
  /** Plain share of known yes-or-no items present: "3 of the 4 it checks". */
  coverageScore: number | null;
  /** The weighted evidence score, 0–100, before any limit. */
  featureScore: number | null;
  /** A scored figure's own 0–100 reading — the CO₂ score. */
  numericScore: number | null;
  numeric: NumericEvidence | null;
  /** Long Distance on an electric car: the range factor applied, ≤ 1. */
  tripFactor: number | null;
  /**
   * Long Distance on an electric car FINN lists a DC charging time for: the
   * charging factor applied, ≤ 1. Null when there's no time to read.
   */
  chargeFactor: number | null;
  /** The DC charging time behind `chargeFactor`, in minutes. */
  chargeMinutes: number | null;
  /** The working behind Environmental Impact. */
  environmental?: EnvironmentalAssessment | null;
  /**
   * The lowest and highest this priority could score if every unknown item
   * turned out absent or present — or, unassessed, 0 and 100.
   */
  bounds: { low: number; high: number };
  /** Same as `assessed`, kept for the surfaces that read it by this name. */
  hasEvidence: boolean;
}

/**
 * One line of a fit's working. Summed, the lines equal the fit exactly.
 *
 * - `item` — a piece of evidence's share of the result.
 * - `range` — Long Distance on an electric car: what a short range took away.
 * - `charging` — the same, for slow DC charging.
 * - `emissions` — the Environmental Impact score's share.
 */
export type Contribution =
  | { kind: "item"; priority: CategoryId; key: SignalId; points: number }
  | { kind: "missingExpected"; priority: CategoryId; key: FeatureId; points: number }
  | { kind: "range"; priority: CategoryId; points: number }
  | { kind: "charging"; priority: CategoryId; points: number }
  | { kind: "emissions"; priority: CategoryId; points: number };

/** What FINN's data didn't tell Lens about one car. */
export interface EvidenceGaps {
  /** False when FINN supplied no usable equipment list. */
  equipmentKnown: boolean;
  /** Counted items with no answer, outside a missing equipment list. */
  unknownItems: { priority: CategoryId; key: SignalId }[];
  /** Priorities left out of the fit. */
  unassessed: CategoryId[];
  /** Expected equipment FINN confirms missing, in priority order. */
  expectedMissing: FeatureId[];
}

export interface VehicleScore {
  vehicleId: number;
  /** The fit, rounded, for display. */
  total: number;
  /** The unrounded fit that ranking uses. */
  fit: number;
  /** #1 and #2 priorities both assessed. Only judgeable cars are recommended. */
  judgeable: boolean;
  byCategory: Record<CategoryId, number>;
  details: Partial<Record<CategoryId, CategoryDetail>>;
  contributions: Contribution[];
  gaps: EvidenceGaps;
  /** The fit if every unknown resolved worst and best. */
  bounds: { low: number; high: number };
}

/** How much a single priority contributes, given its position in the order. */
export interface PriorityWeight {
  priority: CategoryId;
  /** 1-based position in the user's ordering. */
  rank: number;
  /** Fraction of the overall score this priority accounts for (0–1). */
  weight: number;
  weightPercent: number;
}

/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

/** Why a cost component could not be calculated. Never silently treated as €0. */
export type CostUnavailableReason =
  | "missingSubscriptionPrice"
  | "missingConsumption"
  | "missingEnergyPrice"
  | "missingExtraKmPrice"
  /** A plug-in hybrid's energy is priced as fuel only: a floor, not a total. */
  | "plugInElectricityExcluded";

export interface CostComponent {
  /** Estimated euros per month, or null when it cannot be calculated. */
  amount: number | null;
  available: boolean;
  reason: CostUnavailableReason | null;
}

export interface SubscriptionCost extends CostComponent {
  contractType: ContractType;
  /**
   * Whether VAT is known to be included in the advertised price.
   * `null` means the supplied data does not say — we don't guess.
   */
  vatIncluded: boolean | null;
}

export interface EnergyCost extends CostComponent {
  /** Litres or kWh per 100 km, as supplied by FINN. */
  consumption: number | null;
  consumptionUnit: "L/100km" | "kWh/100km";
  /** The user-supplied price per litre or per kWh that was applied. */
  energyPrice: number | null;
  energyLabel: "fuel" | "electricity";
  costPer100Km: number | null;
  /**
   * Set for powertrains the supplied data cannot fully model — currently
   * plug-in hybrids, where FINN reports one combined litres figure and no
   * electric/petrol split.
   */
  caveat: string | null;
  /**
   * True when the amount is a floor rather than an estimate: a plug-in
   * hybrid's combined figure priced as fuel leaves out the electricity it
   * charges on, so the real energy cost is higher by an amount FINN's data
   * can't give.
   */
  isFloor: boolean;
}

export interface ExcessMileageCost extends CostComponent {
  includedMonthlyKm: number;
  monthlyKm: number;
  /** Kilometres beyond the included allowance. Never negative. */
  excessKm: number;
  extraKmPrice: number | null;
}

/**
 * Budget eligibility is three-state on purpose.
 *
 * A vehicle whose cost could not be fully calculated is never reported as
 * fitting the budget just because the missing pieces would have been €0.
 */
export type BudgetStatus = "within" | "over" | "unknown";

export interface CostBreakdown {
  vehicleId: number;
  currency: "€";
  contractType: ContractType;
  monthlyKm: number;
  includedMonthlyKm: number;

  subscription: SubscriptionCost;
  energy: EnergyCost;
  excessMileage: ExcessMileageCost;

  /** Sum of the components that could actually be calculated. */
  totalMonthly: number;
  /** True only when every component was calculable. */
  complete: boolean;
  missing: CostUnavailableReason[];

  /** null when the user has not set a usable budget. */
  budget: number | null;
  /** totalMonthly − budget. Positive means over. null without a budget. */
  budgetDifference: number | null;
  budgetStatus: BudgetStatus;

  /** Which FINN term the subscription is priced on, and whether it fits the reader's period. */
  contract: ContractFit;
}

/**
 * A cost line ready to render, tagged with where the number came from so the
 * UI can keep FINN's facts, the user's assumptions and Lens's estimates
 * visually distinct.
 */
export type CostFactSource = "finn" | "user" | "estimate";

export interface CostLine {
  id: "subscription" | "energy" | "excessMileage";
  label: string;
  amount: number | null;
  available: boolean;
  source: CostFactSource;
  /** Plain-English explanation of this line, built from the numbers above. */
  explanation: string;
  /** The inputs behind the line, each tagged by origin. */
  facts: CostFact[];
}

export interface CostFact {
  label: string;
  value: string;
  source: CostFactSource;
}

export interface CostAnalysis {
  vehicleId: number;
  vehicleName: string;
  breakdown: CostBreakdown;
  lines: CostLine[];
  /** "We estimate this car will cost you around €742/month." */
  headline: string;
  /** The budget sentence, or null when no budget is configured. */
  budgetSentence: string | null;
  /** What VAT treatment the supplied data actually supports. */
  vatNote: string;
  /** Warnings about components that could not be estimated. Empty when complete. */
  caveats: string[];
  disclaimer: string;
}

/* -------------------------------------------------------------------------- */
/* Comparative reasoning                                                      */
/* -------------------------------------------------------------------------- */

export interface ScoreRef {
  vehicleId: number;
  name: string;
  score: number;
  /** The measurement behind that score, when the category has one. */
  numeric: NumericEvidence | null;
}

/**
 * Everything known about one vehicle's performance in one priority, including
 * how it compares with a specific rival and with the category leader.
 */
export interface PriorityBreakdown {
  priority: CategoryId;
  label: string;
  /**
   * The name of the mark that stands for this, not the mark itself.
   *
   * A key into the table in `components/PriorityIcon` — "shield", "leaf" — so
   * that the same value can be drawn as an icon by React and looked up
   * separately by the panel on finn.com, which is not React. Kept a `string`
   * rather than a union because settings saved by an older build hold an
   * emoji here, and those still render as themselves.
   */
  icon: string;
  rank: number;
  weight: number;
  weightPercent: number;

  score: number;
  /** score × weight — this priority's actual contribution to the total. */
  weightedContribution: number;

  matched: SignalId[];
  missing: SignalId[];
  /** See `CategoryDetail.unknown`. */
  unknown: SignalId[];
  /** See `CategoryDetail.expectedMissing`. */
  expectedMissing: FeatureId[];
  /** See `CategoryDetail.standard`. */
  standard: StandardCheck[];
  /** See `CategoryDetail.basis`. */
  basis: FeatureBasis;
  /** See `CategoryDetail.pickedMatched`. */
  pickedMatched: FeaturePreference[];
  pickedMissing: FeaturePreference[];
  pickedUnknown: FeaturePreference[];
  /** See `CategoryDetail.coverageScore`. */
  coverageScore: number | null;
  matchedLabels: string[];
  missingLabels: string[];
  numeric: NumericEvidence | null;
  /** See `CategoryDetail.tripFactor`. */
  tripFactor: number | null;
  /** See `CategoryDetail.chargeFactor`. */
  chargeFactor: number | null;
  /** See `CategoryDetail.chargeMinutes`. */
  chargeMinutes: number | null;
  /** See `CategoryDetail.environmental`. */
  environmental: EnvironmentalAssessment | null;

  /** See `CategoryDetail.assessed`. */
  hasEvidence: boolean;

  /**
   * The strongest car in this category **within the comparison set** — the
   * recommendation and its closest alternatives — not across everything
   * pinned.
   *
   * Scoping it matters: a car that finished thirty points back overall is not
   * a reason to doubt the recommendation just because it happens to top one
   * low-ranked category, and naming it as though it were is what turns an
   * explanation into a leaderboard.
   */
  leader: ScoreRef | null;
  isLeader: boolean;
  /** Points behind the category leader. 0 when this vehicle leads. */
  gapToLeader: number;
  /**
   * The best of the comparison set *other than* this vehicle.
   *
   * Carried so that a lead can be described honestly: leading by three grams
   * of CO₂ is still leading, and calling it a reason to buy the car would be
   * manufacturing a difference out of noise.
   */
  runnerUp: ScoreRef | null;

  /** Head-to-head against the vehicle this one is being compared with. */
  versus: PriorityComparison | null;
}

export interface PriorityComparison {
  vehicleId: number;
  name: string;
  score: number;
  /** subject − other. Positive means the subject is ahead here. */
  difference: number;
  /** difference × weight — how much this gap moved the overall result. */
  weightedDifference: number;
  numeric: NumericEvidence | null;
  /** Evidence the subject has that the other vehicle does not. */
  onlySubjectHas: SignalId[];
  /** Evidence the other vehicle has that the subject does not. */
  onlyOtherHas: SignalId[];
}

/** One car's overall standing, as a comparison refers to it. */
export interface ScoreSummary {
  vehicleId: number;
  name: string;
  /** The overall match, 0–100. */
  total: number;
}

export interface HeadToHead {
  subject: ScoreSummary;
  other: ScoreSummary;
  /** subject.total − other.total. */
  totalDifference: number;
  /** Every priority, ordered by how much it moved the result. */
  categories: PriorityBreakdown[];
  /** The subject's largest weighted advantage, if it has one. */
  decidingAdvantage: PriorityBreakdown | null;
  /** The subject's largest weighted deficit, if it has one. */
  biggestConcession: PriorityBreakdown | null;
  /**
   * Where each car stands against the budget.
   *
   * Carried here so the explanation can say when the higher-scoring car was
   * not eligible to win — otherwise a budget-driven result looks arbitrary.
   */
  budget: BudgetComparison;
  /** Data-derived prose explaining the overall outcome. */
  summary: string;
}

export interface BudgetComparison {
  /** null when the user has not set a usable budget. */
  budget: number | null;
  subject: BudgetStatus;
  other: BudgetStatus;
  /** Estimated cost minus budget. Positive means over. */
  subjectDifference: number | null;
  otherDifference: number | null;
}

/**
 * A complete verdict on one vehicle under the user's current settings.
 *
 * Produced identically for the recommended car and for any car the user puts
 * in the hot seat — only `isRecommendation` differs.
 */
export interface VehicleEvaluation {
  vehicle: PinnedFinnCar;
  score: VehicleScore;
  /** 1-based position in the overall ranking of every pinned car. */
  rank: number;
  isRecommendation: boolean;
  cost: CostAnalysis;
  priorities: PriorityBreakdown[];
  /** Priorities where this car beats its comparison, biggest weighted gap first. */
  strengths: PriorityBreakdown[];
  /** Priorities where its comparison beats it, biggest weighted gap first. */
  weaknesses: PriorityBreakdown[];
  comparison: HeadToHead | null;
}

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Immutable frame of reference for a single comparison run.
 *
 * Scores and costs are computed once over every pinned car so that the
 * recommendation and any hot-seat inspection are judged against exactly the
 * same numbers.
 */
export interface ReasoningContext {
  vehicles: PinnedFinnCar[];
  priorities: CategoryId[];
  preferences: LensPreferences;
  categoryFeatures: Record<CategoryId, FeatureSelection>;
  scores: VehicleScore[];
  costs: Record<number, CostBreakdown>;
  weights: PriorityWeight[];
  /** Every vehicle, best overall match first. Budget plays no part in this order. */
  ranked: PinnedFinnCar[];
  budget: BudgetPartition;
  rental: RentalPartition;
  gearbox: GearboxPartition;
}

/**
 * Pinned cars by whether the reader can drive them. With `automaticOnly` off,
 * every car `fits`.
 */
export interface GearboxPartition {
  required: boolean;
  fits: PinnedFinnCar[];
  /** Manual cars, when the reader drives automatics only. */
  doesNotFit: PinnedFinnCar[];
  /** Cars whose gearbox FINN doesn't state. */
  unknown: PinnedFinnCar[];
}

export interface RentalPartition {
  /** Null when the reader hasn't set a period — then every car is `notSet`. */
  period: RentalPeriod | null;
  fits: PinnedFinnCar[];
  doesNotFit: PinnedFinnCar[];
  unknown: PinnedFinnCar[];
}

export interface BudgetPartition {
  budget: number | null;
  within: PinnedFinnCar[];
  over: PinnedFinnCar[];
  /** Cost could not be fully calculated, so "fits" cannot be confirmed. */
  unknown: PinnedFinnCar[];
  /** True when at least one vehicle is confirmed to fit the budget. */
  anyFits: boolean;
}

export interface Recommendation {
  winner: PinnedFinnCar;
  score: VehicleScore;
  ranked: PinnedFinnCar[];
  scores: VehicleScore[];
  /**
   * True when nothing was confirmed to fit the budget and the winner is the
   * strongest priority match rather than an affordable one.
   */
  isFallback: boolean;
  /**
   * Why the winner is a fallback, so the UI can say "none of these fit" only
   * when that is actually what happened.
   *
   * - `allOverBudget`   — every car's calculable cost already exceeds the budget.
   * - `costUnconfirmed` — no car is confirmed to fit because cost data is missing.
   */
  fallbackReason: "allOverBudget" | "costUnconfirmed" | null;
  budget: BudgetPartition;
  /**
   * The car that scored highest, whoever it is.
   *
   * Kept beside `winner` because they differ whenever the budget excluded the
   * top scorer, and the difference is something the user is owed rather than
   * something to paper over.
   */
  topScorer: PinnedFinnCar;
  /** True when `topScorer` is not `winner`. */
  budgetChangedTheAnswer: boolean;
  /**
   * Set when the reader gave a rental period and the winner isn't confirmed
   * to fit it: `noneFit` when no pinned car does, `unconfirmed` when the best
   * available couldn't be confirmed either way.
   */
  rentalFallback: "noneFit" | "unconfirmed" | null;
  /**
   * Set when the reader drives automatics only and the winner isn't a
   * confirmed automatic: `noneFit` when every pinned car is a manual,
   * `unconfirmed` when FINN doesn't state the winner's gearbox.
   */
  gearboxFallback: "noneFit" | "unconfirmed" | null;
  /**
   * The realistic alternatives — the four cars closest to the winner overall.
   *
   * This is the entire set the user may challenge the recommendation with.
   * Everything else pinned stays visible in the ranking but never competes
   * head-to-head.
   */
  alternatives: PinnedFinnCar[];
  /**
   * True when no car in the winner's budget pool could be judged on the
   * reader's top two priorities, and the winner is the best estimate among
   * them rather than a confident recommendation.
   */
  evidenceFallback: boolean;
  /**
   * The runner-up the recommendation was checked against: the next car in the
   * same budget pool that can be judged. Null when there isn't one.
   */
  runnerUp: PinnedFinnCar | null;
  /**
   * Missing evidence that could change the recommendation.
   *
   * Filled only when re-scoring the winner with every unknown at its worst
   * and the runner-up with every unknown at its best puts the runner-up
   * ahead. Empty means nothing FINN left out could reorder the two.
   */
  dependsOn: DependsOnGap[];
  /** The winner's own evaluation, explained on its own merits. */
  evaluation: VehicleEvaluation;
  context: ReasoningContext;
}

/** A piece of missing evidence, on one of the two cars being checked. */
export type DependsOnGap =
  | { vehicleId: number; name: string; kind: "equipmentList" }
  | { vehicleId: number; name: string; kind: "item"; priority: CategoryId; key: SignalId }
  | { vehicleId: number; name: string; kind: "priority"; priority: CategoryId };

/* -------------------------------------------------------------------------- */
/* Alternatives and the hot seat                                              */
/* -------------------------------------------------------------------------- */

/**
 * One of the small, fixed set of cars the recommendation may be challenged
 * with.
 *
 * Chosen by overall closeness to the winner, never by "beats it at one
 * thing" — a car that wins a single low-ranked category while finishing
 * thirty points behind is not a realistic alternative, and putting it in
 * front of the reader implies otherwise.
 */
export interface AlternativeOption {
  vehicle: PinnedFinnCar;
  /** Position in the overall ranking of every pinned car. */
  rank: number;
  total: number;
  /** Overall points between this car and the winner. Negative means behind. */
  differenceToWinner: number;
  isSelected: boolean;
  budgetStatus: BudgetStatus;
  totalMonthly: number;
  /** Estimated monthly cost minus the winner's. Positive means dearer. */
  costDifference: number | null;
  /** Estimated cost minus the budget. Positive means over. Null without one. */
  budgetDifference: number | null;
  /**
   * The single most useful reason to look at this car instead, stated as a
   * fact. Null when nothing separates it from the winner worth a sentence.
   */
  hook: string | null;
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export interface LensSettings {
  preferences: LensPreferences;
  priorities: CategoryId[];
  priorityDefinitions: PriorityDefinition[];
  profiles: Profile[];
  categoryFeatures: Record<CategoryId, FeatureSelection>;
  defaultProfileId: ProfileId;
  /** The profile the order and emphasis were copied from. See `SettingsBasis`. */
  basedOn: SettingsBasis;
}
