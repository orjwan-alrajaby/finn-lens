import type { PinnedFinnCar } from "@/lib/types";
import type { ReasoningContext, VehicleEvaluation } from "../types";
import type { AdviceNarrative, PriorityReasoning } from "./types";

import { totalFor } from "../scoring";
import { reasonAboutCost } from "./cost";
import { reasonAboutPriority } from "./priority";
import { reasonAboutTradeoffs } from "./tradeoffs";
import { reasonAboutVerdict } from "./verdict";

/**
 * The Advice, as structured reasoning.
 *
 * One call produces everything the UI needs to explain a car: why it placed
 * where it did, what it gives the user for each thing they said mattered,
 * what it costs, and what they're accepting in exchange. The UI renders it —
 * it does not decide any of it.
 *
 * Works identically for the recommended car and for any car the user puts in
 * the hot seat. The only input that changes is `isRecommendation`, which
 * affects how the result is framed and never what the numbers say.
 */
export function buildAdviceNarrative(
  evaluation: VehicleEvaluation,
  context: ReasoningContext,
  alternatives: PinnedFinnCar[] = [],
): AdviceNarrative {
  const rivalVehicle: PinnedFinnCar | null =
    context.vehicles.find(
      (item) => item.id === evaluation.comparison?.other.vehicleId,
    ) ?? null;

  /*
   * The cars a compromise or a cost comparison may be drawn from: the
   * recommendation's realistic alternatives, minus the subject itself when
   * the subject is one of them. Falling back to everything pinned keeps the
   * function usable on its own, but the Advice always passes the real set.
   */
  const competitors = (alternatives.length ? alternatives : context.vehicles).filter(
    (item) => item.id !== evaluation.vehicle.id,
  );

  const priorities: PriorityReasoning[] = evaluation.priorities.map((breakdown) =>
    reasonAboutPriority(breakdown, evaluation.vehicle, rivalVehicle),
  );

  const cost = reasonAboutCost(
    evaluation.vehicle,
    rivalVehicle,
    context,
    competitors,
  );

  return {
    vehicle: evaluation.vehicle,
    rank: evaluation.rank,
    total: totalFor(context.scores, evaluation.vehicle.id),
    isRecommendation: evaluation.isRecommendation,
    verdict: reasonAboutVerdict(evaluation, priorities, context),
    priorities,
    cost,
    tradeoffs: reasonAboutTradeoffs(
      evaluation,
      priorities,
      cost,
      context,
      competitors,
    ),
    unsupported: priorities.filter((item) => item.standing === "unsupported"),
  };
}

export * from "./types";
/*
 * The one language primitive the UI needs: a Title Case category label
 * lowercased for the middle of a sentence. The alternative is every
 * component hard-coding its own, which is how "Family Friendly" and "family
 * friendly" end up in the same paragraph.
 */
export { phraseLabel } from "./phrase";
export {
  challengeRows,
  challengeSentences,
  reasonAboutChallenge,
  type ChallengeLine,
  type ChallengeReasoning,
  type UnseparatedPriority,
} from "./challenge";
export {
  classifyMeasurementGap,
  classifyMonthlyCostGap,
  classifyScoreGap,
  classifyTotalGap,
  isEffectivelyLevel,
  isNoticeable,
  type Magnitude,
} from "./magnitude";
