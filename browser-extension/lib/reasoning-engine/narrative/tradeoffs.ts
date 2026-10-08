import type { PinnedFinnCar } from "@/lib/types";
import type {
  CategoryId,
  ReasoningContext,
  VehicleEvaluation,
} from "../types";
import type {
  CostPosition,
  CostReasoning,
  FeatureFact,
  PriorityReasoning,
  Tradeoff,
} from "./types";

import { hasSignal } from "../evidence";
import { absentList, emphasisClause } from "./evidence-phrases";
import { formatEUR } from "../format";
import { takeableIds } from "./cost";
import { rankedByReader } from "./verdict";
import { featureFact } from "./facts";
import {
  classifyMonthlyCostGap,
  comparableMeasurements,
  isNoticeable,
} from "./magnitude";
import {
  inSentence,
  joinCapped,
  joinList,
  paragraph,
  phraseLabel,
  sentence,
  toSentenceStart,
} from "./phrase";

/**
 * What the reader is giving up.
 *
 * This is not a disclaimer and not a footnote. A recommendation presented
 * without its compromises is half an answer, so this reasoning is built to
 * the same standard as the reasoning that produced the recommendation: every
 * item names the thing being given up, quotes the figures behind it, names
 * the car that has it, and says why *this* reader should care.
 *
 * Two filters keep it honest:
 *
 * - **Relevance.** A compromise is only surfaced when it answers to something
 *   the user told us — a priority they ranked, a feature they picked out, or
 *   the budget they set. High CO₂ is a fact about a car; it is only a tradeoff
 *   for someone who said the environment matters. Manufacturing importance is
 *   its own dishonesty.
 *
 * - **Restraint.** Only the alternatives the recommendation is actually
 *   competing with can source a compromise, and only the most consequential
 *   few are shown. A recommendation followed by nine caveats is unusable.
 */

/** How loudly to say it, from where the user put the priority. */
const severityFor = (rank: number): Tradeoff["severity"] =>
  rank <= 2 ? "high" : "moderate";

/**
 * Equipment the alternative has for this priority and the subject doesn't.
 *
 * Restricted to the features the user singled out, so a compromise is never
 * built out of equipment nobody asked about. Where they singled out nothing,
 * there is no such claim to make and the measurement carries the tradeoff
 * instead.
 */
function featureGap(
  subject: PinnedFinnCar,
  other: PinnedFinnCar,
  priority: CategoryId,
  context: ReasoningContext,
): FeatureFact[] {
  const selected = context.categoryFeatures[priority] ?? [];

  return selected
    .filter(
      (preference) =>
        hasSignal(other, preference.key) && !hasSignal(subject, preference.key),
    )
    .map((preference) => featureFact(preference.key, preference.importance));
}

/** Within the reader's limit and dates, as far as FINN's data says: a car they could take instead. */
const withinLimits = (vehicle: PinnedFinnCar, context: ReasoningContext): boolean => {
  const cost = context.costs[vehicle.id];

  return cost?.budgetStatus !== "over" && cost?.contract.status !== "doesNotFit";
};

/** Why the reader should care, said in their own ranking. */
const relevanceFor = (label: string, rank: number): string =>
  `You ranked ${phraseLabel(label)} #${rank}.`;

/* -------------------------------------------------------------------------- */
/* Features the user picked out that the car doesn't have                     */
/* -------------------------------------------------------------------------- */

/**
 * Something the user singled out that this car doesn't have.
 *
 * Surfaced, never used to disqualify. A picked-out feature is a statement of
 * interest, not a hard requirement — the product's position is that the user
 * decides, and Lens's job is to make sure they decide knowing this. So the
 * sentence states the gap plainly and then accounts for why the car still
 * placed where it did.
 */
function missingSelected(
  reasoning: PriorityReasoning,
  evaluation: VehicleEvaluation,
  priorities: PriorityReasoning[],
  alternatives: PinnedFinnCar[],
  context: ReasoningContext,
): Tradeoff | null {
  /* Only the user's own picks. Catalogue coverage isn't a broken promise. */
  const missing = reasoning.features.picked.missing;
  if (!missing.length) return null;

  const labels = joinCapped(missing.map((fact) => fact.phrase), 5);

  /*
   * Which alternative would give the reader the missing piece back — one they
   * could take: "the E-Klasse has it" named a €1,059 car under a €500 limit,
   * beside a catch saying no car within it does.
   */
  const rescuer = alternatives.find(
    (candidate) => withinLimits(candidate, context) && missing.some((fact) => hasSignal(candidate, fact.key)),
  );

  const rescued = rescuer
    ? missing.filter((fact) => hasSignal(rescuer, fact.key))
    : [];

  const sameList =
    rescued.length === missing.length &&
    rescued.every((fact) => missing.some((item) => item.key === fact.key));

  const evidence = sentence(
    toSentenceStart(absentList(missing.map((fact) => fact.key), 5, "this car")),
    rescuer
      ? sameList
        ? `— ${rescuer.name} ${missing.length === 1 ? "has it" : "has them"}`
        : `— ${rescuer.name} has ${joinCapped(
            rescued.map((fact) => fact.phrase),
            5,
          )}`
      : "",
  );

  const high = missing.filter((fact) => fact.importance === "high");
  const who = emphasisClause(missing.map((fact) => fact.source));

  /*
   * In a chat the reader named needs, not a ranking of priorities: "you
   * raised it under safety & driver assistance" named an engine category for
   * something they asked for about parking. So only a ranked reader hears
   * where it sits.
   */
  const under = rankedByReader(context)
    ? ` under ${phraseLabel(reasoning.label)}, your #${reasoning.rank} priority,`
    : ",";

  const relevance = high.length
    ? sentence(
        toSentenceStart(who),
        `${
          high.length === missing.length && missing.length === 1
            ? "it as counting highly"
            : `${joinCapped(high.map((fact) => fact.phrase), 5)} as counting highly`
        }${under}`,
        "so this is the compromise here most worth weighing",
      )
    : sentence(
        toSentenceStart(who),
        `${missing.length === 1 ? "it" : "them"}${under}`,
        "so it's worth weighing before you decide",
      );

  const placement = whyItStillWon(reasoning, evaluation, priorities, context);

  return {
    kind: "missingSelected",
    priority: reasoning.priority,
    priorityLabel: reasoning.label,
    rank: reasoning.rank,
    /*
     * Loud when the reader ranked the priority highly *or* gave the pick the
     * most influence. Either on its own is enough to earn the top of the
     * list.
     */
    severity:
      missing.some((fact) => fact.importance === "high")
        ? "high"
        : severityFor(reasoning.rank),
    headline: `Not listed: ${missing.map((fact) => inSentence(fact.label)).join(", ")}`,
    evidence,
    relevance,
    rival: rescuer ? { vehicleId: rescuer.id, name: rescuer.name } : null,
    sentences: paragraph(evidence, relevance, placement),
  };
}

/**
 * Why the car still won despite missing something the user asked for.
 *
 * Only stated when it is actually true. "It's stronger on the priorities you
 * ranked above this one" is a lie under the #1 priority, where there is
 * nothing above it, and a lie again when the budget is what decided the
 * result — which is precisely the case a reader is most likely to check.
 */
function whyItStillWon(
  reasoning: PriorityReasoning,
  evaluation: VehicleEvaluation,
  priorities: PriorityReasoning[],
  context: ReasoningContext,
): string | null {
  if (!evaluation.isRecommendation) return null;

  /* The budget narrowed the field; that is the honest account. */
  if (evaluation.rank > 1 && context.budget.budget != null) {
    /*
     * Picked from the cars whose cost couldn't be confirmed when none was
     * confirmed to fit, and "fits your budget" is not something to say of one.
     */
    const confirmed =
      context.costs[evaluation.vehicle.id]?.budgetStatus === "within";

    return sentence(
      "It's still the recommendation because it's the strongest car here",
      confirmed
        ? "that fits your budget"
        : "that isn't already over your budget",
      "— not because this gap doesn't matter",
    );
  }

  const stronger = priorities.filter(
    (item) =>
      item.rank < reasoning.rank &&
      item.standing !== "unsupported" &&
      (item.standing === "leads" || item.standing === "levelWithLeader"),
  );

  if (!stronger.length) return null;

  return sentence(
    `It still comes out on top because nothing close beats it on`,
    `${joinList(stronger.slice(0, 2).map((item) => phraseLabel(item.label)))},`,
    rankedByReader(context)
      ? "which you ranked higher — but this is a real compromise, not a rounding error"
      : "which count for more in what you asked for — but this is a real compromise, not a rounding error",
  );
}

/* -------------------------------------------------------------------------- */
/* Priorities an alternative does better                                      */
/* -------------------------------------------------------------------------- */

/**
 * Somewhere the user cares about that a realistic alternative genuinely wins.
 *
 * Raised only at "clear" or better. A four-point spread is not a compromise,
 * and dressing one up as a compromise is manufacturing drama out of noise.
 */
function priorityDeficit(
  reasoning: PriorityReasoning,
  evaluation: VehicleEvaluation,
  context: ReasoningContext,
): Tradeoff | null {
  const behind = reasoning.leader;

  if (!behind || !isNoticeable(behind.magnitude)) return null;

  const rival = context.vehicles.find(
    (item) => item.id === behind.vehicleId,
  );

  /* A realistic alternative: one past the reader's limit or dates is no compromise they could make. */
  if (!rival || !withinLimits(rival, context)) return null;

  /*
   * The measurement is the better evidence when there is one: "1,726 L
   * against 491 L" tells the reader what they're giving up, where a score
   * only tells them that they're giving something up.
   */
  const scored = reasoning.measurements.find((fact) => fact.scored);

  /*
   * Only when the rival's figure is the same quantity and genuinely better.
   * A leader in a category that averages a measurement with equipment can
   * lead on the equipment while having the smaller boot, and "has the better
   * boot space: 400 L against this car's 500 L" is then a false statement.
   */
  const measured =
    scored &&
    behind.numeric &&
    comparableMeasurements(scored, behind.numeric) &&
    (scored.lowerIsBetter
      ? behind.numeric.value < scored.value
      : behind.numeric.value > scored.value)
      ? scored
      : null;

  const gained = featureGap(
    evaluation.vehicle,
    rival,
    reasoning.priority,
    context,
  );

  const evidence =
    measured && behind.numeric
      ? sentence(
          `${rival.name} has the better ${inSentence(measured.label)}:`,
          `${behind.numeric.display} against this car's ${measured.display}`,
        )
      : gained.length
        ? sentence(
            `${rival.name} has`,
            `${joinCapped(gained.map((fact) => inSentence(fact.label)))};`,
            absentList(gained.map((fact) => fact.key), 3, "this car"),
          )
        : null;

  /* No concrete difference to point at means no claim worth making. */
  if (!evidence) return null;

  /* "You ranked … #2" only to a reader who ranked: a chat's order comes from the needs they named. */
  const relevance = rankedByReader(context)
    ? sentence(
        relevanceFor(reasoning.label, reasoning.rank).replace(/\.$/, ""),
        reasoning.rank === 1
          ? ", so this is the most significant thing you'd be giving up"
          : `, so this is one of the main compromises in choosing ${evaluation.vehicle.name}`,
      )
    : sentence(
        reasoning.rank === 1
          ? "It's where most of what you asked for is weighed, so this is the most significant thing you'd be giving up"
          : `It's part of what you asked for, so this is one of the main compromises in choosing ${evaluation.vehicle.name}`,
      );

  return {
    kind: measured ? "measurementDeficit" : "priorityDeficit",
    priority: reasoning.priority,
    priorityLabel: reasoning.label,
    rank: reasoning.rank,
    severity: severityFor(reasoning.rank),
    headline:
      measured && behind.numeric
        ? `${measured.label}: ${measured.display} vs ${behind.numeric.display}`
        : `${rival.name} has ${
            gained[0]?.phrase ?? phraseLabel(reasoning.label)
          }`,
    evidence,
    relevance,
    rival: { vehicleId: rival.id, name: rival.name },
    sentences: paragraph(evidence, relevance),
  };
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Names what the extra monthly cost is buying, in the user's own priorities —
 * or admits that nothing in them explains it.
 *
 * "You're paying €152 more than the Dolphin Surf" invites exactly one
 * question, and this is where it gets answered.
 */
function whatTheExtraBuys(
  evaluation: VehicleEvaluation,
  priorities: PriorityReasoning[],
  otherId: number,
  context: ReasoningContext,
): string[] {
  const other = context.vehicles.find((item) => item.id === otherId);
  if (!other) return [];

  const wins: string[] = [];

  for (const reasoning of priorities) {
    if (reasoning.standing === "unsupported") continue;

    /*
     * Compared over whatever the category was actually judged on. Looking
     * only at the user's picks would report "nothing you ranked separates
     * them" for a reader who picked nothing — which is the opposite of true,
     * since the score separated them on the catalogue.
     */
    const looksAt = [
      ...reasoning.features.coverage.present,
      ...reasoning.features.coverage.missing,
    ].map((fact) => fact.key);

    const gained = looksAt.filter(
      (key) => hasSignal(evaluation.vehicle, key) && !hasSignal(other, key),
    );

    if (gained.length) {
      wins.push(
        `${joinCapped(
          gained.map((key) => featureFact(key).phrase),
          2,
        )} under ${phraseLabel(reasoning.label)}`,
      );
    }

    if (wins.length === 2) break;
  }

  return wins;
}

function costTradeoff(
  cost: CostReasoning,
  evaluation: VehicleEvaluation,
  priorities: PriorityReasoning[],
  context: ReasoningContext,
): Tradeoff | null {
  /* A car the reader couldn't take is no measure of what this one costs them. */
  const rival = cost.rival && takeableIds(context).has(cost.rival.vehicleId) ? cost.rival : null;
  const alternative: CostPosition | null = cost.cheapest ?? rival;

  if (!alternative || !cost.subject.complete || !alternative.complete) return null;

  const difference = cost.subject.total - alternative.total;
  if (difference <= 0) return null;

  if (!isNoticeable(classifyMonthlyCostGap(difference, alternative.total))) {
    return null;
  }

  const buys = whatTheExtraBuys(
    evaluation,
    priorities,
    alternative.vehicleId,
    context,
  );

  const evidence = sentence(
    /* The difference is the headline's; this says the two prices it's between. */
    `At ${context.preferences.monthlyKm.toLocaleString("en-GB")} km a month this is estimated at ${formatEUR(cost.subject.total)}/month,`,
    `against ${formatEUR(alternative.total)} for ${alternative.name}`,
  );

  const relevance = buys.length
    ? sentence(
        `That extra ${formatEUR(difference)} a month is buying you`,
        `${buys.join("; and ")} — which is what put this car ahead of it`,
      )
    : sentence(
        /* "Ranked" only to a reader who ranked: a chat's reader named needs. */
        `Nothing you ${rankedByReader(context) ? "ranked" : "asked for"} separates the two by much, so that extra`,
        `${formatEUR(difference)} a month isn't buying you anything you told Lens you wanted`,
      );

  return {
    kind: "cost",
    priority: null,
    priorityLabel: null,
    rank: null,
    severity: "high",
    headline: `${formatEUR(difference)}/month more than ${alternative.name}`,
    evidence,
    relevance,
    rival: { vehicleId: alternative.vehicleId, name: alternative.name },
    sentences: paragraph(evidence, relevance),
  };
}

function budgetTradeoff(cost: CostReasoning): Tradeoff | null {
  if (cost.budget == null) return null;
  if (cost.subject.budgetStatus === "within") return null;

  const over = cost.subject.budgetStatus === "over";

  const evidence = over
    ? sentence(
        `Your limit is ${formatEUR(cost.budget)}/month. This is estimated at`,
        `${formatEUR(cost.subject.total)}/month, about`,
        `${formatEUR(Math.abs(cost.budgetDifference ?? 0))} over`,
      )
    : sentence(
        `Your limit is ${formatEUR(cost.budget)}/month, and part of this car's cost`,
        "couldn't be estimated from FINN's data",
      );

  const relevance = over
    ? sentence(
        "Lens doesn't pick a car over your limit while one within it can win,",
        "whatever else it has"
      )
    : sentence(
        "Lens won't call a car affordable on numbers FINN's data doesn't have,",
        "so it can't be confirmed to fit",
      );

  return {
    kind: "budget",
    priority: null,
    priorityLabel: null,
    rank: null,
    severity: "high",
    headline: over
      ? `${formatEUR(Math.abs(cost.budgetDifference ?? 0))}/month over your budget`
      : "Can't be confirmed within your limit",
    evidence,
    relevance,
    rival: null,
    sentences: paragraph(evidence, relevance),
  };
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

/** How many compromises a recommendation can carry before it stops helping. */
const MAX_TRADEOFFS = 4;

export function reasonAboutTradeoffs(
  evaluation: VehicleEvaluation,
  priorities: PriorityReasoning[],
  cost: CostReasoning,
  context: ReasoningContext,
  alternatives: PinnedFinnCar[] = [],
): Tradeoff[] {
  const fromPriorities: Tradeoff[] = [];

  for (const reasoning of priorities) {
    if (reasoning.standing === "unsupported") continue;

    const wanted = missingSelected(
      reasoning,
      evaluation,
      priorities,
      alternatives,
      context,
    );

    if (wanted) {
      fromPriorities.push(wanted);
      continue;
    }

    const deficit = priorityDeficit(reasoning, evaluation, context);
    if (deficit) fromPriorities.push(deficit);
  }

  const money = [
    budgetTradeoff(cost),
    costTradeoff(cost, evaluation, priorities, context),
  ].filter((item): item is Tradeoff => item != null);

  /*
   * Money first — the budget is a constraint the user set outright — and then
   * strictly in their own priority order. Sorting by an internal severity
   * ahead of that would print a #5 compromise above a #3 one, which reads as
   * the page disagreeing with the ranking it just showed them.
   */
  const ordered = [
    ...money,
    ...[...fromPriorities].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
  ];

  return ordered.slice(0, MAX_TRADEOFFS);
}
