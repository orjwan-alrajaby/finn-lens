import type { PinnedFinnCar } from "@/lib/types";
import type {
  AlternativeOption,
  CategoryId,
  CostBreakdown,
  FeatureSelection,
  HeadToHead,
  LensPreferences,
  PriorityBreakdown,
  PriorityComparison,
  ReasoningContext,
  Recommendation,
  ScoreRef,
  SignalId,
  VehicleEvaluation,
  VehicleScore,
} from "./types";

import {
  FEATURE_IMPORTANCE,
  DEFAULT_CATEGORY_FEATURES,
  DEFAULT_PRIORITIES,
} from "./constants";

import {
  buildCostAnalysis,
  calculateCost,
  partitionByBudget,
} from "./cost";

import {
  categoryDetail,
  computeAllScores,
  featureLabel,
  featurePhrase,
  fitFor,
  getCategory,
  priorityWeights,
  scoreFor,
  totalFor,
  winnerForCategory,
} from "./scoring";

import { hasSignal } from "./evidence";
import { dependsOnFor, pickWinner, runnerUpFor } from "./decision";
import { explainHeadToHead } from "./explain";
import {
  classifyMeasurementGap,
  classifyMonthlyCostGap,
  comparableMeasurements,
  isNoticeable,
} from "./narrative/magnitude";
import { formatEUR } from "./format";
import { rentalTier } from "./contract";

/* -------------------------------------------------------------------------- */
/* Re-exports                                                                 */
/* -------------------------------------------------------------------------- */

export {
  addMonths,
  fitContract,
  monthLabel,
  monthsInclusive,
  nearestPeriod,
  periodLabel,
  rentalPeriodOf,
  describeRentalProblem,
  type ContractFit,
  type NearestPeriod,
  type RentalPeriod,
} from "./contract";

export {
  advertisedMonthlyPrice,
  buildCostAnalysis,
  calculateCost,
  partitionByBudget,
} from "./cost";

export {
  categoryDetail,
  computeAllScores,
  fitFor,
  getCategory,
  priorityWeights,
  scoreFor,
  scoreVehicle,
  winnerForCategory,
} from "./scoring";

export {
  BOOT_SCORING_ENABLED,
  equipmentKnown,
  hasSignal,
  homeOf,
  signalUtility,
} from "./evidence";

export { explainHeadToHead } from "./explain";

export { buildAdviceNarrative, reasonAboutChallenge } from "./narrative";

export {
  formatEUR,
  formatKm,
  formatNumber,
  formatPrice,
  joinList,
} from "./format";

/* -------------------------------------------------------------------------- */
/* Reasoning context                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Builds the shared frame of reference for one comparison run.
 *
 * Costs and scores are calculated once, over **every** pinned car, so that:
 *
 * - the recommendation and any hot-seat inspection use identical numbers;
 * - an over-budget car the user wants to inspect still has a real score;
 * - relative scoring (boot space, range, CO₂) is measured against the same
 *   set no matter which car is being looked at.
 *
 * Budget never touches scoring. It only partitions the set afterwards.
 */
export function buildReasoningContext(
  vehicles: PinnedFinnCar[],
  priorities: CategoryId[],
  preferences: LensPreferences,
  categoryFeatures: Record<
    CategoryId,
    FeatureSelection
  > = DEFAULT_CATEGORY_FEATURES,
): ReasoningContext {
  const ordered = priorities.length ? priorities : DEFAULT_PRIORITIES;

  const costs: Record<number, CostBreakdown> = {};

  for (const vehicle of vehicles) {
    costs[vehicle.id] = calculateCost(vehicle, preferences);
  }

  const scores = computeAllScores(
    vehicles,
    ordered,
    preferences,
    categoryFeatures,
  );

  const ranked = [...vehicles].sort((a, b) =>
    compareForRanking(a, b, scores, ordered, costs),
  );

  return {
    vehicles,
    priorities: ordered,
    preferences,
    categoryFeatures,
    scores,
    costs,
    weights: priorityWeights(ordered, preferences.priorityShares),
    ranked,
    budget: partitionByBudget(vehicles, costs, preferences),
    rental: partitionByRental(vehicles, costs),
    gearbox: partitionByGearbox(vehicles, preferences),
  };
}

/**
 * Splits vehicles by whether the reader can drive them, keeping all of them.
 * Without `automaticOnly` every car fits.
 */
function partitionByGearbox(
  vehicles: PinnedFinnCar[],
  preferences: LensPreferences,
): ReasoningContext["gearbox"] {
  const required = preferences.automaticOnly === true;
  const statusOf = (vehicle: PinnedFinnCar) =>
    !required || vehicle.transmission === "Automatic"
      ? "fits"
      : vehicle.transmission === "Manual"
        ? "doesNotFit"
        : "unknown";

  return {
    required,
    fits: vehicles.filter((vehicle) => statusOf(vehicle) === "fits"),
    doesNotFit: vehicles.filter((vehicle) => statusOf(vehicle) === "doesNotFit"),
    unknown: vehicles.filter((vehicle) => statusOf(vehicle) === "unknown"),
  };
}

/** Splits vehicles by whether they fit the reader's rental period, keeping all of them. */
function partitionByRental(
  vehicles: PinnedFinnCar[],
  costs: Record<number, CostBreakdown>,
): ReasoningContext["rental"] {
  const statusOf = (vehicle: PinnedFinnCar) => costs[vehicle.id]?.contract.status ?? "notSet";

  return {
    period: vehicles.length ? (costs[vehicles[0]!.id]?.contract.period ?? null) : null,
    fits: vehicles.filter((vehicle) => ["fits", "notSet"].includes(statusOf(vehicle))),
    doesNotFit: vehicles.filter((vehicle) => statusOf(vehicle) === "doesNotFit"),
    unknown: vehicles.filter((vehicle) => statusOf(vehicle) === "unknown"),
  };
}

/**
 * Which of two cars comes first: the fit the reader is shown, then the
 * cheaper of the two where that fit is the same, then the #1 priority's exact
 * score, then the #2's, then FINN's config id so the same cars always come
 * out the same way. A priority that couldn't be assessed ranks below any that
 * could on a tie.
 *
 * The match is decided on what the reader is shown — the rounded fit. Ranking
 * on the unrounded one put a €1,806 BMW ahead of a €459 Peugeot on nine
 * hundredths of a point, under two labels that both read "66": a difference
 * Lens displays as no difference at all, and can't defend if asked. So cars
 * shown as equal are treated as equal, and among them the cheaper one wins.
 *
 * That is not price becoming a priority: it adds no points and moves nothing
 * that Lens can actually tell apart. It is what to do when Lens can't. A cost
 * it couldn't finish estimating never beats one it could, for the same reason
 * an unconfirmed budget never wins: an unknown is not a saving.
 */
function compareForRanking(
  a: PinnedFinnCar,
  b: PinnedFinnCar,
  scores: VehicleScore[],
  priorities: CategoryId[],
  costs: Record<number, CostBreakdown>,
): number {
  const shown = Math.round(fitFor(scores, b.id)) - Math.round(fitFor(scores, a.id));
  if (shown !== 0) return shown;

  /*
   * Ordered on a key, not on a chain of comparisons: a cost Lens couldn't
   * finish has to lose to every price it knows, and "fall back to the exact
   * fit when one side has no price" is not an order at all — it made A beat
   * B, B beat C and C beat A, and a sort given that returns whatever it
   * likes. Known costs first, cheapest of those first.
   */
  const priced = (vehicle: PinnedFinnCar) => {
    const cost = costs[vehicle.id];

    return cost?.complete ? { known: 0, monthly: cost.totalMonthly } : { known: 1, monthly: 0 };
  };

  const mine = priced(a);
  const theirs = priced(b);

  if (mine.known !== theirs.known) return mine.known - theirs.known;
  if (mine.known === 0 && mine.monthly !== theirs.monthly) return mine.monthly - theirs.monthly;

  const fit = fitFor(scores, b.id) - fitFor(scores, a.id);
  if (fit !== 0) return fit;

  for (const priority of priorities.slice(0, 2)) {
    const exact = (vehicle: PinnedFinnCar) => {
      const detail = scores.find((score) => score.vehicleId === vehicle.id)
        ?.details[priority];

      return detail?.assessed ? detail.exactScore : -1;
    };

    const difference = exact(b) - exact(a);
    if (difference !== 0) return difference;
  }

  return a.id - b.id;
}

/* -------------------------------------------------------------------------- */
/* Comparative reasoning                                                      */
/* -------------------------------------------------------------------------- */

function scoreRef(
  vehicle: PinnedFinnCar,
  scores: VehicleScore[],
  category: CategoryId,
): ScoreRef {
  return {
    vehicleId: vehicle.id,
    name: vehicle.name,
    score: scoreFor(scores, vehicle.id, category),
    numeric:
      scores.find((score) => score.vehicleId === vehicle.id)?.details[category]
        ?.numeric ?? null,
  };
}

/**
 * Builds the full evidence record for one vehicle in one priority.
 *
 * `peers` is the set the category leader is resolved against — the
 * recommendation and its realistic alternatives, not everything pinned. See
 * `PriorityBreakdown.leader`.
 */
function priorityBreakdown(
  category: CategoryId,
  rank: number,
  weight: number,
  subject: PinnedFinnCar,
  other: PinnedFinnCar | null,
  peers: PinnedFinnCar[],
  context: ReasoningContext,
): PriorityBreakdown {
  const { scores, vehicles, preferences, categoryFeatures } = context;
  const meta = getCategory(category);

  const detail =
    scores.find((score) => score.vehicleId === subject.id)?.details[category] ??
    categoryDetail(
      category,
      subject,
      vehicles,
      preferences,
      categoryFeatures,
    );

  const score = detail.score;

  const leaderVehicle = winnerForCategory(peers, scores, category);
  const leader = leaderVehicle
    ? scoreRef(leaderVehicle, scores, category)
    : null;

  const runnerUpVehicle = winnerForCategory(
    peers.filter((item) => item.id !== subject.id),
    scores,
    category,
  );

  const runnerUp = runnerUpVehicle
    ? scoreRef(runnerUpVehicle, scores, category)
    : null;

  const matchedLabels = detail.matched.map(featureLabel);
  const missingLabels = detail.missing.map(featureLabel);

  return {
    priority: category,
    label: meta?.label ?? category,
    icon: meta?.icon ?? "car",
    rank,
    weight,
    weightPercent: Math.round(weight * 100),
    score,
    weightedContribution: score * weight,
    matched: detail.matched,
    missing: detail.missing,
    unknown: detail.unknown,
    expectedMissing: detail.expectedMissing,
    standard: detail.standard,
    basis: detail.basis,
    pickedMatched: detail.pickedMatched,
    pickedMissing: detail.pickedMissing,
    pickedUnknown: detail.pickedUnknown,
    coverageScore: detail.coverageScore,
    matchedLabels,
    missingLabels,
    numeric: detail.numeric,
    tripFactor: detail.tripFactor,
    chargeFactor: detail.chargeFactor,
    chargeMinutes: detail.chargeMinutes,
    environmental: detail.environmental ?? null,
    hasEvidence: detail.hasEvidence,
    leader,
    isLeader: leader ? leader.score <= score : detail.assessed,
    gapToLeader: leader ? Math.max(0, leader.score - score) : 0,
    runnerUp,
    versus: other
      ? comparePriority(category, subject, other, score, weight, context)
      : null,
  };
}

function comparePriority(
  category: CategoryId,
  subject: PinnedFinnCar,
  other: PinnedFinnCar,
  subjectScore: number,
  weight: number,
  context: ReasoningContext,
): PriorityComparison {
  const { scores, vehicles, preferences, categoryFeatures } = context;

  const otherDetail =
    scores.find((score) => score.vehicleId === other.id)?.details[category] ??
    categoryDetail(category, other, vehicles, preferences, categoryFeatures);

  /*
   * Compared over every yes-or-no item the priority counts, which is what the
   * score counted — not just the reader's raises. Evidence FINN's data doesn't
   * answer on either car is never reported as a difference.
   */
  const subjectDetail =
    scores.find((score) => score.vehicleId === subject.id)?.details[category] ??
    categoryDetail(category, subject, vehicles, preferences, categoryFeatures);

  /* Expected equipment is a difference only where one car's gap cost it. */
  const expectedListed = (detail: typeof subjectDetail): SignalId[] =>
    detail.standard
      .filter((item) => item.state === "listed")
      .map((item) => item.key);

  const onlySubjectHas: SignalId[] = [
    ...subjectDetail.matched.filter((key) => otherDetail.missing.includes(key)),
    ...expectedListed(subjectDetail).filter((key) =>
      otherDetail.expectedMissing.includes(key as never),
    ),
  ];

  const onlyOtherHas: SignalId[] = [
    ...otherDetail.matched.filter((key) => subjectDetail.missing.includes(key)),
    ...expectedListed(otherDetail).filter((key) =>
      subjectDetail.expectedMissing.includes(key as never),
    ),
  ];

  const difference = subjectScore - otherDetail.score;

  return {
    vehicleId: other.id,
    name: other.name,
    score: otherDetail.score,
    difference,
    weightedDifference: difference * weight,
    numeric: otherDetail.numeric,
    onlySubjectHas,
    onlyOtherHas,
  };
}

function buildHeadToHead(
  subject: PinnedFinnCar,
  other: PinnedFinnCar,
  breakdowns: PriorityBreakdown[],
  context: ReasoningContext,
): HeadToHead {
  const subjectTotal = totalFor(context.scores, subject.id);
  const otherTotal = totalFor(context.scores, other.id);

  /* Ordered by how much each priority actually moved the result. */
  const categories = [...breakdowns].sort(
    (a, b) =>
      Math.abs(b.versus?.weightedDifference ?? 0) -
      Math.abs(a.versus?.weightedDifference ?? 0),
  );

  const advantages = categories.filter(
    (item) => (item.versus?.difference ?? 0) > 0,
  );

  const concessions = categories.filter(
    (item) => (item.versus?.difference ?? 0) < 0,
  );

  const subjectCost = context.costs[subject.id];
  const otherCost = context.costs[other.id];

  const partial = {
    subject: {
      vehicleId: subject.id,
      name: subject.name,
      total: subjectTotal,
    },
    other: {
      vehicleId: other.id,
      name: other.name,
      total: otherTotal,
    },
    totalDifference: subjectTotal - otherTotal,
    categories,
    decidingAdvantage: advantages[0] ?? null,
    biggestConcession: concessions[0] ?? null,
    budget: {
      budget: context.budget.budget,
      subject: subjectCost?.budgetStatus ?? "unknown",
      other: otherCost?.budgetStatus ?? "unknown",
      subjectDifference: subjectCost?.budgetDifference ?? null,
      otherDifference: otherCost?.budgetDifference ?? null,
    },
  };

  return {
    ...partial,
    summary: explainHeadToHead(partial),
  };
}

/**
 * Produces the complete verdict on one vehicle under the user's settings.
 *
 * Called identically for the recommended car and for any car the user puts in
 * the hot seat. Nothing about the user's configuration changes between the
 * two — the same priorities, ordering, features, mileage, prices, budget and
 * contract type apply, and the recommendation itself is not affected.
 *
 * Two options decide who this car is measured against, and both default to
 * the honest thing rather than the dramatic one:
 *
 * - `compareWith` — the single rival to run head-to-head with. For a car in
 *   the hot seat that is the recommendation, because "how does this compare
 *   with the one you were given?" is the question being asked. For the
 *   recommendation itself it is `null`: the winner is explained on its own
 *   merits, not by parading whichever car beats it at each individual thing.
 *
 * - `peers` — the set a category leader is resolved within. Defaults to
 *   everything pinned; callers pass the winner and its realistic alternatives
 *   so that a distant car topping one category doesn't get quoted as though
 *   it were a contender.
 */
export function evaluateVehicle(
  vehicle: PinnedFinnCar,
  context: ReasoningContext,
  options: {
    recommendedId?: number;
    compareWith?: PinnedFinnCar | null;
    peers?: PinnedFinnCar[];
  } = {},
): VehicleEvaluation {
  const { scores, ranked, weights, preferences, costs } = context;

  const score =
    scores.find((item) => item.vehicleId === vehicle.id) ??
    ({
      vehicleId: vehicle.id,
      total: 0,
      fit: 0,
      judgeable: false,
      byCategory: {} as Record<CategoryId, number>,
      details: {},
      contributions: [],
      gaps: {
        equipmentKnown: false,
        unknownItems: [],
        unassessed: [],
        expectedMissing: [],
      },
      bounds: { low: 0, high: 100 },
    } satisfies VehicleScore);

  const rank = ranked.findIndex((item) => item.id === vehicle.id) + 1;
  const isRecommendation = options.recommendedId === vehicle.id;

  const other =
    options.compareWith !== undefined
      ? options.compareWith
      : defaultComparison(vehicle, context, options.recommendedId);

  const peers = options.peers?.length ? options.peers : context.vehicles;

  const priorities = weights.map(({ priority, rank: priorityRank, weight }) =>
    priorityBreakdown(
      priority,
      priorityRank,
      weight,
      vehicle,
      other,
      peers,
      context,
    ),
  );

  const byImpact = [...priorities].sort(
    (a, b) =>
      Math.abs(b.versus?.weightedDifference ?? 0) -
      Math.abs(a.versus?.weightedDifference ?? 0),
  );

  return {
    vehicle,
    score,
    rank: rank > 0 ? rank : ranked.length,
    isRecommendation,
    cost: buildCostAnalysis(vehicle, preferences, costs[vehicle.id]),
    priorities,
    strengths: byImpact.filter((item) => (item.versus?.difference ?? 0) > 0),
    weaknesses: byImpact.filter((item) => (item.versus?.difference ?? 0) < 0),
    comparison: other
      ? buildHeadToHead(vehicle, other, priorities, context)
      : null,
  };
}

/**
 * Picks the rival for a car the user is inspecting: the recommendation.
 *
 * The recommendation itself gets none. Explaining the winner by naming the
 * runner-up turns the answer into a two-horse race the user didn't ask about;
 * challengers are offered deliberately, through the alternatives set.
 */
function defaultComparison(
  vehicle: PinnedFinnCar,
  context: ReasoningContext,
  recommendedId?: number,
): PinnedFinnCar | null {
  if (recommendedId == null || recommendedId === vehicle.id) return null;

  return context.ranked.find((item) => item.id === recommendedId) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Alternatives                                                               */
/* -------------------------------------------------------------------------- */

/** How many cars may be put up against the recommendation. */
export const ALTERNATIVE_COUNT = 4;

/**
 * The cars worth challenging the recommendation with.
 *
 * Closeness is measured on the overall result, because that is what "a
 * realistic alternative" means: a car the user could plausibly have been
 * given instead. Winning one isolated category is explicitly *not* a
 * qualification — a car forty points back that happens to top climate
 * suitability is not an alternative, it is a distraction.
 *
 * Ties in distance break towards the better-placed car.
 */
export function selectAlternatives(
  context: ReasoningContext,
  winnerId: number,
  limit: number = ALTERNATIVE_COUNT,
): PinnedFinnCar[] {
  const { ranked, scores } = context;

  const winnerFit = fitFor(scores, winnerId);

  /* Only a car Lens could judge is put up against the recommendation. */
  const judgeable = (vehicle: PinnedFinnCar) =>
    scores.find((score) => score.vehicleId === vehicle.id)?.judgeable ?? false;

  return ranked
    .map((vehicle, index) => ({ vehicle, index }))
    .filter((item) => item.vehicle.id !== winnerId && judgeable(item.vehicle))
    .sort((a, b) => {
      const distance =
        Math.abs(fitFor(scores, a.vehicle.id) - winnerFit) -
        Math.abs(fitFor(scores, b.vehicle.id) - winnerFit);

      return distance !== 0 ? distance : a.index - b.index;
    })
    .slice(0, Math.max(0, limit))
    .map((item) => item.vehicle);
}

/**
 * The one concrete thing that would make a reader look at this car instead.
 *
 * Ordered by how directly it answers "what would I actually gain?": equipment
 * the user picked out beats a measurement, a measurement beats money,
 * and when none of the three separates the two cars it returns null rather
 * than inventing a reason.
 */
function alternativeHook(
  alternative: PinnedFinnCar,
  winner: PinnedFinnCar,
  context: ReasoningContext,
  costDifference: number | null,
): string | null {
  const { weights, categoryFeatures, scores } = context;

  /*
   * Something the user singled out that this car has and the winner doesn't,
   * taken from their highest priority downwards. Only their own selections
   * qualify — equipment nobody asked about is not a reason to look at a car.
   */
  for (const { priority } of weights) {
    const selected = categoryFeatures[priority] ?? [];

    /* Highest importance first: it is the pick they'd most notice missing. */
    const gained = [...selected]
      .sort(
        (a, b) =>
          FEATURE_IMPORTANCE[b.importance].weight -
          FEATURE_IMPORTANCE[a.importance].weight,
      )
      .filter(
        (preference) =>
          hasSignal(alternative, preference.key) &&
          !hasSignal(winner, preference.key),
      );

    if (gained.length) {
      return `Adds ${featurePhrase(gained[0]!.key)}`;
    }
  }

  for (const { priority } of weights) {
    const mine = scores.find((item) => item.vehicleId === alternative.id)
      ?.details[priority]?.numeric;

    const theirs = scores.find((item) => item.vehicleId === winner.id)
      ?.details[priority]?.numeric;

    if (!mine || !theirs || !comparableMeasurements(mine, theirs)) continue;

    const ahead = mine.lowerIsBetter
      ? mine.value < theirs.value
      : mine.value > theirs.value;

    if (!ahead) continue;
    if (!isNoticeable(classifyMeasurementGap(mine.value, theirs.value))) continue;

    return `${mine.label}: ${mine.display} vs ${theirs.display}`;
  }

  if (
    costDifference != null &&
    costDifference < 0 &&
    isNoticeable(
      classifyMonthlyCostGap(
        costDifference,
        context.costs[winner.id]?.totalMonthly ?? 0,
      ),
    )
  ) {
    return `${formatEUR(Math.abs(costDifference))}/month cheaper`;
  }

  /*
   * Nothing separates them on anything the user asked about. Saying so is
   * more useful than an empty line — it tells the reader this one isn't worth
   * opening.
   */
  return `Nothing you ranked separates it from ${winner.name}`;
}

/**
 * The alternatives, packaged for the picker.
 *
 * Every figure here is expressed relative to the winner, because that is the
 * only comparison the hot seat is for.
 */
export function alternativeOptions(
  context: ReasoningContext,
  alternatives: PinnedFinnCar[],
  winner: PinnedFinnCar,
  selectedId: number,
): AlternativeOption[] {
  const { ranked, scores, costs } = context;

  const winnerCost = costs[winner.id];
  const winnerTotal = totalFor(scores, winner.id);

  return alternatives.map((vehicle) => {
    const cost = costs[vehicle.id];

    const costDifference =
      cost?.complete && winnerCost?.complete
        ? cost.totalMonthly - winnerCost.totalMonthly
        : null;

    return {
      vehicle,
      rank: ranked.findIndex((item) => item.id === vehicle.id) + 1,
      total: totalFor(scores, vehicle.id),
      differenceToWinner: totalFor(scores, vehicle.id) - winnerTotal,
      isSelected: vehicle.id === selectedId,
      budgetStatus: cost?.budgetStatus ?? "unknown",
      totalMonthly: cost?.totalMonthly ?? 0,
      costDifference,
      budgetDifference: cost?.budgetDifference ?? null,
      hook: alternativeHook(vehicle, winner, context, costDifference),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Recommendation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Picks the recommended vehicle and explains it.
 *
 * The order is deliberate and the two systems never mix:
 *
 *   1. cost is calculated for every vehicle;
 *   2. budget eligibility is resolved from that cost;
 *   3. every vehicle is scored against the user's priorities — budget plays
 *      no part in this;
 *   4. the winner is the highest-scoring vehicle that is *allowed* to win;
 *   5. the four closest cars become the alternatives it can be challenged
 *      with, and the winner is explained on its own merits.
 *
 * Who is allowed to win, in order of preference:
 *
 *   - a vehicle confirmed to fit the budget;
 *   - failing that, a vehicle whose cost couldn't be fully calculated — it
 *     is not confirmed affordable, so it can't jump ahead of one that is;
 *   - failing that, every vehicle, and the result is flagged `isFallback`.
 *
 * A fallback winner is never presented as fitting the budget. Over-budget
 * vehicles are never hidden — they stay in `ranked` and remain inspectable.
 */
export function buildRecommendation(
  vehicles: PinnedFinnCar[],
  priorities: CategoryId[],
  preferences: LensPreferences,
  categoryFeatures: Record<
    CategoryId,
    FeatureSelection
  > = DEFAULT_CATEGORY_FEATURES,
): Recommendation | null {
  if (!vehicles.length) return null;

  const context = buildReasoningContext(
    vehicles,
    priorities,
    preferences,
    categoryFeatures,
  );

  return recommendFrom(context);
}

/** The same selection, when a context has already been built. */
export function recommendFrom(
  context: ReasoningContext,
): Recommendation | null {
  const { budget, ranked, scores } = context;

  if (!ranked.length) return null;

  const winner = pickWinner(context);

  if (!winner) return null;

  const scoreOf = (vehicle: PinnedFinnCar) =>
    scores.find((score) => score.vehicleId === vehicle.id) as VehicleScore;

  const winnerScore = scoreOf(winner);

  /*
   * Fallback means: the user set a budget, nothing was confirmed to fit it,
   * and we're presenting the strongest priority match anyway — clearly
   * marked, rather than returning nothing.
   */
  const winnerStatus = context.costs[winner.id]?.budgetStatus;

  /*
   * Not "nothing anywhere fits": a car within budget that can't be rented
   * for the reader's dates can't win either, and a €977 winner beside it
   * came back unflagged, headlined as not over a €700 budget.
   */
  const isFallback = budget.budget != null && winnerStatus !== "within";

  const topScorer = ranked[0] as PinnedFinnCar;
  const alternatives = selectAlternatives(context, winner.id);

  const runnerUp = runnerUpFor(context, winner.id);

  return {
    winner,
    score: winnerScore,
    ranked,
    scores,
    isFallback,
    fallbackReason: !isFallback
      ? null
      : winnerStatus === "over"
        ? "allOverBudget"
        : "costUnconfirmed",
    budget,
    topScorer,
    budgetChangedTheAnswer: topScorer.id !== winner.id,
    rentalFallback:
      context.rental.period == null
        ? null
        : rentalTier(context.costs[winner.id]?.contract.status ?? "unknown") === 2
          ? "noneFit"
          : rentalTier(context.costs[winner.id]?.contract.status ?? "unknown") === 1
            ? "unconfirmed"
            : null,
    gearboxFallback: gearboxFallbackFor(context, winner),
    alternatives,
    evidenceFallback: !winnerScore.judgeable,
    runnerUp,
    dependsOn: dependsOnFor(context, winner),
    evaluation: evaluateVehicle(winner, context, {
      recommendedId: winner.id,
      compareWith: null,
      peers: [winner, ...alternatives],
    }),
    context,
  };
}

/** Whether the winner breaks the reader's automatic-only rule, and why. */
function gearboxFallbackFor(
  context: ReasoningContext,
  winner: PinnedFinnCar,
): Recommendation["gearboxFallback"] {
  const { gearbox } = context;

  if (!gearbox.required) return null;
  if (gearbox.doesNotFit.some((car) => car.id === winner.id)) return "noneFit";
  if (gearbox.unknown.some((car) => car.id === winner.id)) return "unconfirmed";

  return null;
}

/**
 * The evaluation for a car the user has put up against the recommendation.
 *
 * Always framed as alternative-versus-winner, and scored inside the same
 * comparison set, so the two readings can never contradict each other.
 */
export function evaluateChallenger(
  challenger: PinnedFinnCar,
  recommendation: Recommendation,
): VehicleEvaluation {
  const { context, winner, alternatives } = recommendation;

  return evaluateVehicle(challenger, context, {
    recommendedId: winner.id,
    compareWith: winner,
    peers: [winner, ...alternatives],
  });
}

