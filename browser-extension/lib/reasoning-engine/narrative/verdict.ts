import type {
  CategoryId,
  PriorityBreakdown,
  ReasoningContext,
  VehicleEvaluation,
} from "../types";
import type { PriorityReasoning, Verdict } from "./types";

import { formatEUR } from "../format";
import { totalFor } from "../scoring";
import { classifyTotalGap, isEffectivelyLevel } from "./magnitude";
import { dependsOnFor, runnerUpFor } from "../decision";
import { CATEGORIES } from "../constants";
import { describeRentalProblem, periodLabel, rentalTier } from "../contract";
import { absentList, emphasisClause, gapPhrase } from "./evidence-phrases";
import {
  coverage,
  inSentence,
  joinCapped,
  joinList,
  paragraph,
  phraseLabel,
  sentence,
  toSentenceStart,
} from "./phrase";

/**
 * The answer to "why this one?".
 *
 * Two rules govern this file, and both exist because the old version broke
 * them:
 *
 * - **Say it once.** The budget override, the closeness of the top two, and
 *   the conclusion itself each get exactly one sentence on the page. They
 *   used to appear in four places, which reads as a machine looping rather
 *   than a person explaining.
 *
 * - **Reason, don't score.** The reader is told what they asked for and what
 *   this car does about it. The weighted arithmetic that produced the result
 *   is still calculated, still checkable, and stays out of the sentence.
 */

/* -------------------------------------------------------------------------- */
/* Why it won                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One priority, compressed to the sentence a summary can carry.
 *
 * Names the equipment or quotes the figure — never "scores well here", which
 * tells the reader nothing they can act on.
 */
export function summarisePriority(
  reasoning: PriorityReasoning,
  position: "first" | "next",
): string | null {
  if (reasoning.standing === "unsupported") return null;

  const opener =
    position === "first"
      ? `You put ${phraseLabel(reasoning.label)} first`
      : `${toSentenceStart(phraseLabel(reasoning.label))} is your #${reasoning.rank}`;

  const { basis, picked, coverage: cover } = reasoning.features;
  const { present, missing } = picked;

  /* What was raised leads, saying whose raise it was. */
  if (present.length + missing.length > 0) {
    const total = present.length + missing.length;
    const who = emphasisClause([...present, ...missing].map((fact) => fact.source));

    if (!missing.length) {
      const named = joinCapped(present.map((fact) => fact.phrase), 5);

      return total === 1
        ? sentence(`${opener}, and this car has ${named}, the one thing ${who} there`)
        : sentence(
            `${opener}, and this car has everything ${who} there:`,
            named,
          );
    }

    const gap = absentList(missing.map((fact) => fact.key));

    if (!present.length) {
      return sentence(
        `${opener}, and this car has none of what ${who} there —`,
        gap,
      );
    }

    return sentence(
      `${opener}, and this car has`,
      `${coverage(present.length, total)} things ${who} there —`,
      gap,
    );
  }

  /*
   * Nothing picked out. The measurement is the answer where there is one, and
   * otherwise how much of the category's equipment the car carries.
   */
  const measured = reasoning.measurements.find((fact) => fact.scored);

  if (measured) {
    /*
     * "has X of Y" rather than "its X is Y": the labels aren't all singular —
     * "this car's CO₂ emissions is 0 g/km" — and a construction that needs no
     * verb agreement is cheaper than a list of which ones are plural.
     */
    return sentence(
      `${opener}, and this car has ${inSentence(measured.label)} of ${measured.display}`,
    );
  }

  const total = cover.present.length + cover.missing.length;

  if (basis === "category" && total > 0) {
    return sentence(
      `${opener}. Nothing is raised there, so everything it checks counts`,
      `the same — this one has ${cover.present.length} of the ${total}`,
    );
  }

  return null;
}

/**
 * The "why", built from the top of the user's own order.
 *
 * Capped at two priorities: the detail for every priority is directly below
 * on the page, and a summary that repeats all five isn't a summary.
 */
function describeReasons(priorities: PriorityReasoning[]): string[] {
  const usable = priorities.filter((item) => item.standing !== "unsupported");

  const [first, second] = usable;

  return paragraph(
    first ? summarisePriority(first, "first") : null,
    second ? summarisePriority(second, "next") : null,
  );
}

/* -------------------------------------------------------------------------- */
/* The budget                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The one statement on the page that the budget changed the answer.
 *
 * A recommendation that placed below the top scorer is not the highest-scoring
 * car, and saying so plainly is the difference between a result the reader can
 * check and one they have to take on faith.
 */
function describeBudgetOverride(
  evaluation: VehicleEvaluation,
  context: ReasoningContext,
): string | null {
  if (!evaluation.isRecommendation || evaluation.rank <= 1) return null;

  const topScorer = context.ranked[0];
  if (!topScorer) return null;

  /*
   * The rental period is weighed before the budget, so when it is what set
   * the top scorer aside, it is what gets said — a budget sentence here would
   * blame the wrong rule.
   */
  const topFit = context.costs[topScorer.id]?.contract;
  const winnerFit = context.costs[evaluation.vehicle.id]?.contract;

  const cost = context.costs[topScorer.id];
  const budget = context.budget.budget;

  if (
    topFit?.period &&
    winnerFit &&
    rentalTier(topFit.status) > rentalTier(winnerFit.status)
  ) {
    const problem = describeRentalProblem(topFit) ?? "";
    /*
     * Over the budget as well: saying only the dates told a reader with
     * €800 to spend that a €1,589 car lost on its contract terms.
     */
    const overToo = budget != null && cost?.budgetStatus === "over";
    const winnerWithin = context.costs[evaluation.vehicle.id]?.budgetStatus === "within";
    const why = overToo
      ? `${topScorer.name} scores higher overall, but at about ${formatEUR(cost!.totalMonthly)}/month it's over the ${formatEUR(budget!)} budget you set, and it ${problem}`
      : /* "…but it is due 21 Oct, but FINN says…" — one "but" is enough. */
        problem.includes(", but ")
        ? `${topScorer.name} scores higher overall. It ${problem}`
        : `${topScorer.name} scores higher overall, but it ${problem}`;

    return sentence(
      why,
      `— so ${evaluation.vehicle.name} is the strongest car here that`,
      winnerFit.status === "fits"
        ? overToo && winnerWithin
          ? `fits both`
          : `fits ${periodLabel(topFit.period)}`
        : `isn't ruled out for ${periodLabel(topFit.period)}, though FINN's data can't confirm it either`,
    );
  }

  if (budget == null) return null;

  const problem =
    cost?.budgetStatus === "over"
      ? sentence(
          `${topScorer.name} scores higher overall, but at about`,
          `${formatEUR(cost.totalMonthly)}/month it's over the ${formatEUR(budget)}`,
          `budget you set`,
        )
      : sentence(
          `${topScorer.name} scores higher overall, but part of its cost`,
          `couldn't be estimated, so we can't confirm it fits your ${formatEUR(budget)}`,
          `budget`,
        );

  return sentence(
    problem.replace(/\.$/, ""),
    `— so ${evaluation.vehicle.name} is the strongest car here`,
    fitsConfirmed(evaluation, context)
      ? "that does fit"
      : "that isn't already over it, though part of its own cost couldn't be estimated either",
  );
}

/**
 * Whether the recommendation itself is confirmed to fit the budget.
 *
 * Not implied by being recommended over a higher scorer: with nothing
 * confirmed to fit, the winner comes from the cars whose cost couldn't be
 * worked out, and saying it "fits" would be the claim the budget model exists
 * to refuse.
 */
function fitsConfirmed(
  evaluation: VehicleEvaluation,
  context: ReasoningContext,
): boolean {
  return context.costs[evaluation.vehicle.id]?.budgetStatus === "within";
}

/* -------------------------------------------------------------------------- */
/* The margin                                                                 */
/* -------------------------------------------------------------------------- */

function marginToNext(
  evaluation: VehicleEvaluation,
  context: ReasoningContext,
): Verdict["margin"] {
  const subject = evaluation.vehicle;

  /*
   * For the recommendation, the car that would have won in its place — not
   * the next car by points. That one could be over budget or unrentable,
   * and "Nissan Qashqai finishes level with it" named a car the reader had
   * already been told was out of reach.
   */
  const index = context.ranked.findIndex((item) => item.id === subject.id);
  const next = evaluation.isRecommendation
    ? runnerUpFor(context, subject.id)
    : context.ranked[index + 1];
  if (!next) return null;

  const difference = totalFor(context.scores, subject.id) - totalFor(context.scores, next.id);

  const detail = (id: number, priority: CategoryId) =>
    context.scores.find((score) => score.vehicleId === id)?.details[priority];
  const gaps = context.weights
    .map(({ priority, weight }) => {
      const mine = detail(subject.id, priority);
      const theirs = detail(next.id, priority);

      return {
        label: phraseLabel(CATEGORIES[priority].label),
        gap: mine?.assessed && theirs?.assessed ? (mine.exactScore - theirs.exactScore) * weight : 0,
      };
    })
    .filter((item) => Math.abs(item.gap) >= 0.5);
  const ahead = [...gaps].sort((a, b) => b.gap - a.gap)[0];
  const behind = [...gaps].sort((a, b) => a.gap - b.gap)[0];

  const mine = context.costs[subject.id];
  const theirs = context.costs[next.id];

  /* Two listings of one model: "Ford Puma finishes level with it" beside a Ford Puma. */
  const sameModel = next.name === subject.name;

  return {
    name: sameModel
      ? `Another ${next.name}${next.trim && next.trim !== subject.trim ? ` (${next.trim})` : ""}`
      : next.name,
    difference,
    magnitude: classifyTotalGap(difference),
    aheadOn: ahead && ahead.gap > 0 ? ahead.label : null,
    behindOn: behind && behind.gap < 0 ? behind.label : null,
    dearerBy: mine?.complete && theirs?.complete ? Math.round(theirs.totalMonthly - mine.totalMonthly) : null,
  };
}

/**
 * Said only when the ranking would otherwise mislead.
 *
 * Two cars a point apart are a coin toss, and a reader who can see 82 beside
 * 81 deserves to be told that before they read a confident explanation of the
 * gap — and what actually tipped it: a priority where this one is ahead, or,
 * when they score the same on everything, the price, which is how the
 * ranking breaks the tie.
 */
function describeMargin(margin: Verdict["margin"]): string | null {
  if (!margin || !isEffectivelyLevel(margin.magnitude)) return null;

  const cheaper =
    margin.dearerBy != null && margin.dearerBy > 0
      ? `this one is about ${formatEUR(margin.dearerBy)}/month cheaper`
      : null;

  if (margin.difference === 0) {
    if (margin.aheadOn && margin.behindOn) {
      return sentence(
        `${margin.name} finishes level with it on points — this one is stronger on ${margin.aheadOn},`,
        `that one on ${margin.behindOn}${cheaper ? `, and ${cheaper}` : ""}`,
      );
    }

    return sentence(
      `${margin.name} scores the same on everything you asked about`,
      cheaper
        ? `— ${cheaper}`
        : margin.dearerBy === 0
          ? "and costs the same, so either is as good a choice"
          : "— close enough that either would be a defensible choice",
    );
  }

  const behind = `${Math.abs(margin.difference)} point${Math.abs(margin.difference) === 1 ? "" : "s"} behind`;

  return sentence(
    `${margin.name} finishes ${behind}`,
    margin.aheadOn
      ? `, and ${margin.aheadOn} is what separates them`
      : `— close enough that either would be a defensible choice`,
  );
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

const labelsOf = (items: PriorityBreakdown[]): string[] =>
  items.map((item) => phraseLabel(item.label));

/**
 * The verdict for a car the user has put up against the recommendation.
 *
 * Framed entirely as "instead of", because that is the only decision on the
 * table once a recommendation exists.
 */
function challengerVerdict(
  evaluation: VehicleEvaluation,
  context: ReasoningContext,
  margin: Verdict["margin"],
): Verdict {
  const name = evaluation.vehicle.name;
  const winnerName = evaluation.comparison?.other.name ?? "the recommendation";

  const gains = evaluation.strengths.filter((item) => item.hasEvidence);
  const losses = evaluation.weaknesses.filter((item) => item.hasEvidence);

  const cost = context.costs[evaluation.vehicle.id];
  const budget = context.budget.budget;

  return {
    headline: sentence(
      `What ${name} would gain you over ${winnerName}, and what it would cost you`,
    ),
    reasons: paragraph(
      gains.length
        ? sentence(
            `${name} is ahead on ${joinList(labelsOf(gains.slice(0, 2)))}`,
          )
        : sentence(
            `${name} doesn't beat ${winnerName} on any priority you ranked`,
          ),
      losses.length
        ? sentence(
            `${winnerName} is ahead on ${joinList(labelsOf(losses.slice(0, 2)))}`,
          )
        : null,
    ),
    budgetNote:
      budget != null && cost?.budgetStatus === "over"
        ? sentence(
            `At about ${formatEUR(cost.totalMonthly)}/month it's`,
            `${formatEUR(Math.abs(cost.budgetDifference ?? 0))} over your`,
            `${formatEUR(budget)} budget, which is why it wasn't recommended`,
          )
        : null,
    margin,
    marginNote: null,
    dependsNote: null,
  };
}

export function reasonAboutVerdict(
  evaluation: VehicleEvaluation,
  priorities: PriorityReasoning[],
  context: ReasoningContext,
): Verdict {
  const margin = marginToNext(evaluation, context);

  if (!evaluation.isRecommendation) {
    return challengerVerdict(evaluation, context, margin);
  }

  const name = evaluation.vehicle.name;
  const budget = context.budget.budget;

  /*
   * The headline is the conclusion and nothing else. Whether the budget
   * narrowed the field belongs in `budgetNote`, said once, below.
   */
  const headline =
    evaluation.rank > 1 && budget != null
      ? context.costs[evaluation.vehicle.id]?.budgetStatus === "over"
        ? /* Nothing that can win fits the budget, and the headline mustn't say otherwise. */
          sentence(`${name} is the strongest match for what you told Lens, though it's over your ${formatEUR(budget)}/month budget`)
        : sentence(
            `${name} is the strongest match for what you told Lens that`,
            fitsConfirmed(evaluation, context)
              ? `also fits your ${formatEUR(budget)}/month budget`
              : `isn't already over your ${formatEUR(budget)}/month budget`,
          )
      : sentence(`${name} is the strongest match for what you told us`);

  return {
    headline: judgeable(evaluation)
      ? headline
      : sentence(
          `${name} is the best estimate for what you told us, but FINN's data`,
          "doesn't cover enough of your top two priorities to recommend it with confidence",
        ),
    reasons: describeReasons(priorities),
    budgetNote: describeBudgetOverride(evaluation, context),
    margin,
    marginNote: describeMargin(margin),
    dependsNote: describeDependsOn(evaluation, context),
  };
}

const judgeable = (evaluation: VehicleEvaluation): boolean =>
  evaluation.score.judgeable;

/**
 * "This could change depending on …", said only when filling a gap FINN left
 * could put the runner-up ahead of the recommendation.
 */
function describeDependsOn(
  evaluation: VehicleEvaluation,
  context: ReasoningContext,
): string | null {
  const gaps = dependsOnFor(context, evaluation.vehicle);
  if (!gaps.length) return null;

  const electric = (id: number) =>
    context.vehicles.find((vehicle) => vehicle.id === id)?.fuelType === "Electric";

  const phrases = [...new Set(gaps.map((gap) => gapPhrase(gap, electric(gap.vehicleId))))];

  return sentence(
    `This could change depending on ${joinCapped(phrases, 3)},`,
    "which FINN doesn't publish",
  );
}
