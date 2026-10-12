import type { PinnedFinnCar } from "@/lib/types";
import type {
  BudgetPartition,
  GearboxPartition,
  RentalPartition,
  DependsOnGap,
  ReasoningContext,
  VehicleScore,
} from "./types";

/**
 * Who may win, who they were checked against, and what could change it.
 *
 * Kept apart from `index.ts` so the explanation layer can ask the same
 * questions the recommendation did without importing the recommendation.
 */

/**
 * The pool a winner may be drawn from, preferring certainty.
 *
 * Three hard rules. The gearbox is weighed first — a car the reader isn't
 * allowed to drive is no use on any dates — then the rental period, since a
 * car that can't be rented for the reader's dates is no use at any price,
 * while one over budget is still a car they could take. Within each, confirmed
 * beats unknown beats ruled out — so with no period and no gearbox rule set
 * this is exactly the budget rule alone.
 */
export function pickEligible(
  budget: BudgetPartition,
  ranked: PinnedFinnCar[],
  rental?: RentalPartition,
  gearbox?: GearboxPartition,
): PinnedFinnCar[] {
  const ids = (cars: PinnedFinnCar[]) => new Set(cars.map((car) => car.id));

  const within = ids(budget.within);
  const budgetUnknown = ids(budget.unknown);
  const fits = rental ? ids(rental.fits) : null;
  const rentalUnknown = rental ? ids(rental.unknown) : null;
  const drivable = gearbox ? ids(gearbox.fits) : null;
  const gearboxUnknown = gearbox ? ids(gearbox.unknown) : null;

  const tier = (vehicle: PinnedFinnCar) => {
    const rentalRank = !fits || fits.has(vehicle.id) ? 0 : rentalUnknown!.has(vehicle.id) ? 1 : 2;
    const budgetRank = within.has(vehicle.id) ? 0 : budgetUnknown.has(vehicle.id) ? 1 : 2;

    const gearboxRank = !drivable || drivable.has(vehicle.id) ? 0 : gearboxUnknown!.has(vehicle.id) ? 1 : 2;

    return gearboxRank * 9 + rentalRank * 3 + budgetRank;
  };

  const tiers = new Map(ranked.map((vehicle) => [vehicle.id, tier(vehicle)]));
  const best = Math.min(...tiers.values());

  return ranked.filter((vehicle) => tiers.get(vehicle.id) === best);
}

const scoreOf = (context: ReasoningContext, vehicle: PinnedFinnCar) =>
  context.scores.find((score) => score.vehicleId === vehicle.id) as VehicleScore;

/** The ranked cars in the winner's budget pool. */
export function budgetPool(context: ReasoningContext): PinnedFinnCar[] {
  /* Already in ranked order: `pickEligible` filters `ranked` itself. */
  return pickEligible(context.budget, context.ranked, context.rental, context.gearbox);
}

/**
 * The winner: the best car in the budget pool that can be judged on the
 * reader's top two priorities, or — when none can — the pool's best estimate.
 */
export function pickWinner(context: ReasoningContext): PinnedFinnCar | null {
  const pool = budgetPool(context);

  return pool.find((vehicle) => scoreOf(context, vehicle).judgeable) ?? pool[0] ?? null;
}

/** The next car in the winner's budget pool that can be judged. */
export function runnerUpFor(
  context: ReasoningContext,
  winnerId: number,
): PinnedFinnCar | null {
  return (
    budgetPool(context).find(
      (vehicle) => vehicle.id !== winnerId && scoreOf(context, vehicle).judgeable,
    ) ?? null
  );
}

/**
 * Missing evidence that could reorder the winner and the runner-up.
 *
 * The winner with every unknown at its worst against the runner-up with every
 * unknown at its best. Only if the runner-up could then come out ahead is any
 * gap worth naming — and then every gap on either car is named, since any of
 * them could be the one that decides it.
 */
export function dependsOnFor(
  context: ReasoningContext,
  winner: PinnedFinnCar,
): DependsOnGap[] {
  const runnerUp = runnerUpFor(context, winner.id);
  if (!runnerUp) return [];

  const winnerScore = scoreOf(context, winner);
  const runnerUpScore = scoreOf(context, runnerUp);

  if (runnerUpScore.bounds.high <= winnerScore.bounds.low) return [];

  return [...gapsOf(winner, winnerScore), ...gapsOf(runnerUp, runnerUpScore)];
}

function gapsOf(vehicle: PinnedFinnCar, score: VehicleScore): DependsOnGap[] {
  const base = { vehicleId: vehicle.id, name: vehicle.name };

  return [
    ...(score.gaps.equipmentKnown
      ? []
      : [{ ...base, kind: "equipmentList" as const }]),
    ...score.gaps.unknownItems.map((gap) => ({
      ...base,
      kind: "item" as const,
      priority: gap.priority,
      key: gap.key,
    })),
    ...score.gaps.unassessed.map((priority) => ({
      ...base,
      kind: "priority" as const,
      priority,
    })),
  ];
}
