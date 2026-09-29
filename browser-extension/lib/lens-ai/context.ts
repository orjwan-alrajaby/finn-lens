import {
    CATEGORIES,
    CATEGORY_IDS,
    FINN_INCLUDED_MONTHLY_KM,
    SIGNALS,
} from "@/lib/reasoning-engine/constants";
import {
    categoryDetail,
    describeRentalProblem,
    evaluateChallenger,
    periodLabel,
} from "@/lib/reasoning-engine";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import type { AdviceNarrative } from "@/lib/reasoning-engine/narrative";
import type {
    CategoryDetail,
    CategoryId,
    PriorityBreakdown,
    Recommendation,
} from "@/lib/reasoning-engine/types";
import { configurationName } from "@/lib/car-labels";
import type { PinnedFinnCar } from "@/lib/types";

import { carLabel } from "./outcome";
import type { LensFacts } from "./contract";

/**
 * Everything Lens knows about this comparison, and nothing it doesn't.
 *
 * This is the only material an answer may be written from. It is assembled
 * from the engine's output — scores, costs, the narrative's own sentences, the
 * head-to-heads — and from FINN's fields as Lens normalised them. No figure in
 * here is computed for the model's benefit that Lens doesn't already compute
 * for the page, and the model is told that anything absent is unknown.
 *
 * Detail is spent where questions land: the recommendation and its realistic
 * alternatives get their full equipment picture across *every* priority — so
 * "would it suit long road trips?" has an answer even when Long Distance isn't
 * ranked — while the rest of the pinned set gets a line each.
 */

const labels = (keys: readonly string[]) =>
    keys.map((key) => SIGNALS[key as keyof typeof SIGNALS]?.label ?? key);

const LIMITATIONS = [
    "Subscription prices are FINN's price with no down payment, on the term shown for each car: FINN's default term, or with a rental period, the shortest term that covers it. FINN's data doesn't say whether a contract can be ended early or extended.",
    "Monthly cost is subscription + estimated energy + estimated excess mileage only. Insurance, maintenance, tyres and registration are not included.",
    `FINN's subscription includes ${FINN_INCLUDED_MONTHLY_KM} km a month; extra kilometres are charged at each car's own rate.`,
    "Energy cost uses one flat price per litre or kWh that the reader set.",
    "Plug-in hybrid energy is priced as fuel only, so it is a floor, not a total.",
    "Environmental Impact is tailpipe CO₂ per km on the EU A–G class scale — not a lifecycle assessment. Plug-in hybrids are capped because their official figure assumes a charging habit Lens can't confirm.",
    "Equipment is read from FINN's listing. Something 'not listed' may be absent or just unlisted; 'unknown' means FINN sent no answer.",
    "Crash protection, handling, ride comfort, rear legroom, boot space, fast charging and reliability are not in FINN's data and are not scored.",
    "The budget is a hard eligibility rule: a car that can't be confirmed to fit never wins ahead of one that can. It never adds or removes points.",
];

function priorityFacts(
    car: PinnedFinnCar,
    rec: Recommendation,
    id: CategoryId,
) {
    const { context } = rec;
    const score = context.scores.find((item) => item.vehicleId === car.id);
    const weight = context.weights.find((item) => item.priority === id);

    const detail: CategoryDetail =
        score?.details[id] ??
        categoryDetail(id, car, [car], context.preferences, context.categoryFeatures);

    const env = detail.environmental;

    return {
        priority: CATEGORIES[id].label,
        yourRank: weight?.rank ?? null,
        countsTowardResult: Boolean(weight),
        score: detail.assessed ? detail.score : null,
        assessed: detail.assessed,
        listed: labels(detail.matched),
        notListed: labels(detail.missing),
        unknown: labels(detail.unknown),
        raisedAndListed: detail.pickedMatched.map((item) => ({
            feature: SIGNALS[item.key]?.label ?? item.key,
            influence: item.importance,
        })),
        raisedButNotListed: detail.pickedMissing.map((item) => ({
            feature: SIGNALS[item.key]?.label ?? item.key,
            influence: item.importance,
        })),
        standardEquipmentMissing: labels(detail.expectedMissing),
        measurement: detail.numeric?.display ?? null,
        ...(env
            ? {
                  environmental: {
                      co2: env.co2?.display ?? null,
                      reading: env.co2?.label ?? null,
                      meaning: env.co2?.explanation ?? null,
                      efficiency: env.efficiency
                          ? `${env.efficiency.label} (${env.efficiency.display})`
                          : null,
                      confidence: env.confidence,
                      caveats: env.caveats,
                  },
              }
            : {}),
    };
}

function carFacts(car: PinnedFinnCar, rec: Recommendation, cars: PinnedFinnCar[]) {
    const cost = rec.context.costs[car.id];

    return {
        id: car.id,
        car: carLabel(car, cars),
        configuration: configurationName(car),
        engine: car.engine,
        fuelType: car.fuelType,
        transmission: car.transmission,
        year: car.year,
        powerHp: car.power?.inHp ?? null,
        doors: car.doors || null,
        seats: car.capacity?.seats || null,
        lengthMm: car.dimensions?.length || null,
        electricRangeKm:
            car.electric && typeof car.electric.range === "number"
                ? car.electric.range
                : null,
        dcCharge10to80Minutes: car.dcChargeMinutes ?? null,
        driverAssistanceLevel: car.driverAssistanceLevel ?? null,
        equipmentListSupplied: car.featuresSupplied ?? null,
        contract: cost
            ? {
                  pricedOnTermMonths: cost.contract.term?.months ?? null,
                  termsOfferedMonths: cost.contract.termsOffered,
                  monthsBeyondYourPeriod: cost.contract.extraMonths,
                  earliestDelivery: cost.contract.term?.deliveryFrom ?? null,
                  latestDeliveryListed: cost.contract.term?.deliveryTo ?? null,
                  deliveryMaySlipWeeks: cost.contract.term?.deviationWeeks ?? null,
                  fitsYourRentalPeriod:
                      cost.contract.status === "notSet" ? "noPeriodSet" : cost.contract.status,
                  whyNot: describeRentalProblem(cost.contract),
                  downPayment: "none — prices assume nothing paid upfront",
              }
            : null,
        monthlyCost: cost
            ? {
                  total: cost.totalMonthly,
                  complete: cost.complete,
                  subscription: cost.subscription.amount,
                  energy: cost.energy.amount,
                  energyIsFloor: cost.energy.isFloor,
                  excessMileage: cost.excessMileage.amount,
                  missing: cost.missing,
                  budgetStatus: cost.budget == null ? "noBudgetSet" : cost.budgetStatus,
                  overBudgetBy:
                      cost.budgetDifference != null && cost.budgetDifference > 0
                          ? cost.budgetDifference
                          : null,
                  underBudgetBy:
                      cost.budgetDifference != null && cost.budgetDifference <= 0
                          ? -cost.budgetDifference
                          : null,
              }
            : null,
        priorities: CATEGORY_IDS.map((id) => priorityFacts(car, rec, id)),
    };
}

export function buildLensFacts(
    rec: Recommendation,
    narrative: AdviceNarrative,
): LensFacts {
    const { context, winner, alternatives } = rec;
    const cars = context.vehicles;
    const name = (car: PinnedFinnCar) => carLabel(car, cars);

    const raised = CATEGORY_IDS.flatMap((category) =>
        (context.categoryFeatures[category] ?? []).map((item) => ({
            priority: CATEGORIES[category].label,
            feature: SIGNALS[item.key]?.label ?? item.key,
            influence: item.importance,
        })),
    ).filter((item) =>
        context.priorities.some((id) => CATEGORIES[id].label === item.priority),
    );

    return {
        settings: {
            priorities: context.weights.map((weight) => ({
                rank: weight.rank,
                priority: CATEGORIES[weight.priority].label,
                shareOfResultPercent: weight.weightPercent,
            })),
            raisedFeatures: raised,
            monthlyBudget:
                context.preferences.monthlyBudget > 0
                    ? context.preferences.monthlyBudget
                    : "no limit set",
            monthlyKm: context.preferences.monthlyKm,
            contractType: context.preferences.contractType,
            automaticsOnly: context.preferences.automaticOnly,
            rentalPeriod: context.rental.period
                ? `${periodLabel(context.rental.period)} (${context.rental.period.months} months)`
                : "not set",
            energyPrices: {
                petrolPerLitre: context.preferences.petrolPrice,
                dieselPerLitre: context.preferences.dieselPrice,
                electricityPerKWh: context.preferences.electricityPrice,
            },
        },

        recommendation: {
            car: name(winner),
            headline: narrative.verdict.headline,
            reasons: narrative.verdict.reasons,
            budgetNote: narrative.verdict.budgetNote,
            marginNote: narrative.verdict.marginNote,
            dependsOnMissingData: narrative.verdict.dependsNote,
            nothingFitsBudget: rec.isFallback,
            fallbackReason: rec.fallbackReason,
            highestScoringCar: name(rec.topScorer),
            rulesChangedTheAnswer: rec.budgetChangedTheAnswer,
            rentalPeriodFallback: rec.rentalFallback,
            automaticGearboxFallback: rec.gearboxFallback,
            thinEvidenceOnTopPriorities: rec.evidenceFallback,
            checkedAgainst: rec.runnerUp ? name(rec.runnerUp) : null,
        },

        ranking: rec.ranked.map((car, index) => ({
            rank: index + 1,
            car: name(car),
            overallMatch: totalFor(context.scores, car.id),
            role:
                car.id === winner.id
                    ? "recommended"
                    : alternatives.some((alt) => alt.id === car.id)
                      ? "closest alternative"
                      : "also pinned",
            fuelType: car.fuelType,
            estimatedMonthly: context.costs[car.id]?.totalMonthly ?? null,
            costComplete: context.costs[car.id]?.complete ?? null,
            budgetStatus:
                context.costs[car.id]?.budget == null
                    ? "noBudgetSet"
                    : context.costs[car.id]?.budgetStatus,
            /*
             * Every pinned car, not only the detailed ones: "why not that
             * one?" is asked about cars far down the ranking too, and a
             * question without its answer in the facts invites a guess.
             */
            fitsRentalPeriod:
                context.costs[car.id]?.contract.status === "notSet"
                    ? "noPeriodSet"
                    : (context.costs[car.id]?.contract.status ?? null),
            rentalPeriodProblem: context.costs[car.id]
                ? describeRentalProblem(context.costs[car.id]!.contract)
                : null,
            pricedOnTermMonths: context.costs[car.id]?.contract.term?.months ?? null,
            termsOfferedMonths: context.costs[car.id]?.contract.termsOffered ?? [],
            hasDetailedFacts:
                car.id === winner.id || alternatives.some((alt) => alt.id === car.id),
        })),

        whyItWins: narrative.priorities.map((item) => ({
            priority: item.label,
            yourRank: item.rank,
            standing: item.standing,
            explanation: item.sentences,
        })),

        whatYouGiveUp: narrative.tradeoffs.map((tradeoff) => ({
            headline: tradeoff.headline,
            evidence: tradeoff.evidence,
            whyItMatters: tradeoff.relevance,
            carThatHasIt: tradeoff.rival?.name ?? null,
            explanation: tradeoff.sentences,
        })),

        costExplanation: {
            sentences: narrative.cost.sentences,
            couldNotEstimate: narrative.cost.unknowns,
            cheapestFullyCosted: narrative.cost.cheapest
                ? {
                      car: narrative.cost.cheapest.name,
                      total: narrative.cost.cheapest.total,
                  }
                : null,
        },

        /* The recommendation and each realistic alternative, head to head. */
        alternativesVersusRecommendation: alternatives.map((alt) => {
            const comparison = evaluateChallenger(alt, rec).comparison;

            const side = (breakdown: PriorityBreakdown | null) =>
                breakdown && breakdown.versus
                    ? {
                          priority: breakdown.label,
                          yourRank: breakdown.rank,
                          [name(alt)]: breakdown.score,
                          [name(winner)]: breakdown.versus.score,
                      }
                    : null;

            return {
                car: name(alt),
                versus: name(winner),
                overallDifference: comparison?.totalDifference ?? null,
                whereItBeatsTheRecommendation: comparison ? side(comparison.decidingAdvantage) : null,
                whereItFallsShortMost: comparison ? side(comparison.biggestConcession) : null,
                lensSummary: comparison?.summary ?? null,
                monthlyCostDifference:
                    context.costs[alt.id] && context.costs[winner.id]
                        ? context.costs[alt.id]!.totalMonthly -
                          context.costs[winner.id]!.totalMonthly
                        : null,
            };
        }),

        cars: [winner, ...alternatives].map((car) => carFacts(car, rec, cars)),

        limitations: LIMITATIONS,
    };
}
