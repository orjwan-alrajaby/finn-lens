import type { PinnedFinnCar } from "@/lib/types";
import type { CostBreakdown, ReasoningContext } from "../types";
import type { CostPosition, CostReasoning } from "./types";

import { formatEUR, formatKm } from "../format";
import { classifyMonthlyCostGap, isEffectivelyLevel } from "./magnitude";
import { paragraph, sentence } from "./phrase";

/**
 * Money, said precisely.
 *
 * Three rules run through this file:
 *
 * - a rental price, an energy estimate and a total are three different
 *   numbers, and the reader is told which one they're looking at;
 * - an estimate is never presented as a certainty;
 * - what we couldn't calculate is named, not rounded to zero.
 *
 * Cost is not one of the user's ranked priorities — in this product the
 * budget is a hard eligibility constraint the user set explicitly. That is
 * why cost reasoning always appears: the user asked for it directly.
 */

function position(
  vehicle: PinnedFinnCar,
  breakdown: CostBreakdown | undefined,
): CostPosition | null {
  if (!breakdown) return null;

  return {
    vehicleId: vehicle.id,
    name: vehicle.name,
    total: breakdown.totalMonthly,
    subscription: breakdown.subscription.amount,
    energy: breakdown.energy.amount,
    excessMileage: breakdown.excessMileage.amount,
    complete: breakdown.complete,
    budgetStatus: breakdown.budgetStatus,
  };
}

/**
 * The cheapest realistic alternative we can fully cost.
 *
 * Drawn from the recommendation's alternatives rather than everything pinned,
 * so "you could pay less" always names a car the reader could actually take
 * instead — not the cheapest thing in the list regardless of whether it
 * matches anything they asked for.
 *
 * Restricted to complete estimates on purpose: a car with an unknown energy
 * cost must never be presented as the cheap option just because part of its
 * total is missing.
 */
function cheapestComparable(
  context: ReasoningContext,
  candidates: PinnedFinnCar[],
  excludeIds: number[],
): CostPosition | null {
  const positions = candidates
    .map((vehicle) => position(vehicle, context.costs[vehicle.id]))
    .filter(
      (item): item is CostPosition =>
        item != null && item.complete && !excludeIds.includes(item.vehicleId),
    );

  if (!positions.length) return null;

  return positions.reduce((cheapest, item) =>
    item.total < cheapest.total ? item : cheapest,
  );
}

const UNKNOWN_LABEL: Record<string, string> = {
  missingSubscriptionPrice: "the monthly subscription price",
  missingConsumption: "the fuel or electricity it uses",
  missingEnergyPrice: "the energy price to apply",
  missingExtraKmPrice: "the price of kilometres beyond the included allowance",
  plugInElectricityExcluded: "the electricity a plug-in hybrid charges on",
};

/** Splits the total into the parts it's actually made of. */
function describeComposition(
  subject: CostPosition,
  monthlyKm: number,
): string | null {
  const parts: string[] = [];

  if (subject.subscription != null) {
    parts.push(`${formatEUR(subject.subscription)} subscription`);
  }

  if (subject.energy != null) {
    parts.push(`about ${formatEUR(subject.energy)} of estimated energy`);
  }

  if (subject.excessMileage != null && subject.excessMileage > 0) {
    parts.push(
      `about ${formatEUR(subject.excessMileage)} for kilometres beyond FINN's allowance`,
    );
  }

  if (parts.length < 2) return null;

  const [first, ...rest] = parts;

  return sentence(
    `That's ${first}, plus ${rest.join(", plus ")}, at the`,
    `${formatKm(monthlyKm)}/month you told us you drive`,
  );
}

/** How this car's monthly total compares with one specific alternative. */
function describeAgainst(
  subject: CostPosition,
  other: CostPosition,
  role: "rival" | "cheapest",
): string | null {
  if (!subject.complete || !other.complete) return null;

  const difference = subject.total - other.total;
  const magnitude = classifyMonthlyCostGap(difference, other.total);

  if (isEffectivelyLevel(magnitude)) {
    return sentence(
      `${other.name} works out at roughly the same —`,
      `${formatEUR(other.total)}/month against ${formatEUR(subject.total)}`,
    );
  }

  const amount = formatEUR(Math.abs(difference));

  if (difference > 0) {
    return sentence(
      role === "cheapest"
        ? `${other.name} is the cheapest of the close alternatives:`
        : `${other.name} costs less:`,
      `${formatEUR(other.total)}/month, about ${amount} less than this one`,
    );
  }

  /*
   * Nothing we can fully cost came in lower than the subject, so the
   * "cheapest alternative" line is really a statement about the subject.
   */
  return role === "cheapest"
    ? sentence(
        "None of the close alternatives we can fully cost comes in lower —",
        `the nearest is ${other.name} at ${formatEUR(other.total)}/month`,
      )
    : sentence(
        `That's about ${amount}/month less than ${other.name}`,
      );
}

export function reasonAboutCost(
  vehicle: PinnedFinnCar,
  rivalVehicle: PinnedFinnCar | null,
  context: ReasoningContext,
  alternatives: PinnedFinnCar[] = context.vehicles,
): CostReasoning {
  const breakdown = context.costs[vehicle.id];

  const subject =
    position(vehicle, breakdown) ??
    ({
      vehicleId: vehicle.id,
      name: vehicle.name,
      total: 0,
      subscription: null,
      energy: null,
      excessMileage: null,
      complete: false,
      budgetStatus: "unknown",
    } satisfies CostPosition);

  const rival = rivalVehicle
    ? position(rivalVehicle, context.costs[rivalVehicle.id])
    : null;

  const cheapest = cheapestComparable(context, alternatives, [
    vehicle.id,
    ...(rival ? [rival.vehicleId] : []),
  ]);

  const unknowns = (breakdown?.missing ?? []).map(
    (reason) => UNKNOWN_LABEL[reason] ?? reason,
  );

  const headline = subject.complete
    ? sentence(
        `At your mileage we estimate ${formatEUR(subject.total)}/month in total`,
      )
    : sentence(
        `We can only account for ${formatEUR(subject.total)}/month of this car's cost`,
      );

  const sentences = paragraph(
    headline,
    describeComposition(subject, context.preferences.monthlyKm),
    unknowns.length
      ? sentence(
          `We couldn't work out ${unknowns.join(" or ")}, so the real cost is higher`,
          `than the ${formatEUR(subject.total)}/month above`,
          "— we've left it out rather than counting it as zero",
        )
      : null,
    rival ? describeAgainst(subject, rival, "rival") : null,
    cheapest ? describeAgainst(subject, cheapest, "cheapest") : null,
  );

  return {
    subject,
    rival,
    cheapest,
    budget: context.budget.budget,
    budgetDifference: breakdown?.budgetDifference ?? null,
    monthlyKm: context.preferences.monthlyKm,
    unknowns,
    sentences,
  };
}
