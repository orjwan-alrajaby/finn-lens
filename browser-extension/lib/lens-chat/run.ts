import {
    alternativeOptions,
    buildAdviceNarrative,
    buildRecommendation,
    describeRentalProblem,
} from "@/lib/reasoning-engine";
import { bandForScore } from "@/lib/reasoning-engine/bands";
import { FIT_BANDS, type FitLevel } from "@/lib/reasoning-engine/fit";
import type { AdviceNarrative } from "@/lib/reasoning-engine/narrative";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import type { Recommendation } from "@/lib/reasoning-engine/types";
import type { ScopeKind } from "@/lib/lens-ai/contract";
import { carLabel } from "@/lib/lens-ai/outcome";
import { configurationName } from "@/lib/car-labels";
import type { PinnedFinnCar } from "@/lib/types";

import type { Answers } from "@/lib/reasoning-engine/answers";
import { evidenceMet, type EvidenceId } from "./evidence";
import type { Rule } from "./understanding";

/**
 * One run of the real Lens engine over a chat's candidate set, and the
 * readings the chat shows of it.
 *
 * Everything the chat says about a result — the match, the alternatives, "why
 * this car", the comparison — is read off the `Recommendation` and the
 * `AdviceNarrative` the advice page already renders. No model is involved in
 * any of it; a model only ever adds a sentence on top.
 */

export interface LensRun {
    scope: ScopeKind;
    /** What the reader ruled out, and what it cost the field. Null when nothing was. */
    ruledOut: {
        evidence: Rule[];
        setAside: number;
        /** True when every car was ruled out, so the ranking ignored the rule. */
        nothingLeft: boolean;
    } | null;
    /**
     * Set when no car here stays within the reader's limit: Lens ranked only
     * the cars nearest it, rather than the best car at any price.
     */
    nearestToLimit: {
        /** The cheapest monthly cost here, and how far above it Lens looked. */
        cheapest: number;
        upTo: number;
        /** Cars left out of the ranking for being further over the limit. */
        setAside: number;
        /** The car that would have won at any price, and what it costs. */
        bestAtAnyPrice: { id: number; name: string; monthly: number } | null;
    } | null;
    /** "Comparing 12 cars on this page". */
    scopeHeadline: string;
    answers: Answers;
    recommendation: Recommendation;
    narrative: AdviceNarrative;
    /**
     * Cars Lens shows as the same match as the pick, and what they cost.
     *
     * Two cars on the same number are two cars Lens can't tell apart on what
     * it checks — so the reader is owed the reason the pick is the pick, and
     * that reason is the price.
     */
    level: { others: number; cheapest: boolean; nextUp: number | null } | null;
}

/** How far above the cheapest car here Lens still looks when nothing fits the limit. */
const NEAR_LIMIT_EUR = 50;
const NEAR_LIMIT_SHARE = 0.1;

/**
 * The cars a reader's rules leave in: "not an SUV" sets SUVs aside, "electric
 * only" keeps only electric cars. An unknown is not proof a car has what was
 * ruled out, so it stays. Shared with the recommendation page, which has to
 * rank the same cars the chat did.
 */
export function allowedByRules(cars: PinnedFinnCar[], rules: Rule[]): PinnedFinnCar[] {
    if (!rules.length) return cars;

    return cars.filter((car) =>
        rules.every((rule) =>
            rule.mode === "without" ? evidenceMet(car, rule.id, true) !== false : evidenceMet(car, rule.id, false) === true,
        ),
    );
}

export function runLens(
    cars: PinnedFinnCar[],
    answers: Answers,
    scope: ScopeKind,
    scopeHeadline: string,
    /** Evidence the reader ruled out: those cars are set aside before ranking. */
    ruledOut: Rule[] = [],
): LensRun | null {
    if (!cars.length) return null;

    /*
     * Ruling a car out is not scoring it. Lens has no measure of body type
     * and shouldn't invent one — but someone who says they don't want an SUV
     * has given a constraint, and the honest answer is the best car that
     * isn't one. When nothing survives, everything comes back and the story
     * says so rather than pretending the constraint was met.
     */
    const allowed = allowedByRules(cars, ruledOut);
    const setAside = cars.length - allowed.length;
    const nothingLeft = allowed.length === 0;

    const pool = nothingLeft ? cars : allowed;
    const rank = (candidates: PinnedFinnCar[]) =>
        buildRecommendation(candidates, answers.priorities, answers.preferences, answers.features);

    let recommendation = rank(pool);

    if (!recommendation) return null;

    /*
     * Nothing stays within the limit. The engine's answer is then the best
     * car at any price — right for the advice page, where the reader studies
     * the ranking, and wrong in a conversation with someone who said "500 is
     * the absolute maximum": a €926 car came back as their closest match
     * when others were €150 nearer. So the ranking is redone over the cars
     * nearest the limit, and the story says that's what happened.
     */
    let nearestToLimit: LensRun["nearestToLimit"] = null;

    if (recommendation.isFallback && recommendation.fallbackReason === "allOverBudget") {
        const costs = recommendation.context.costs;
        const priced = pool.filter((car) => costs[car.id]?.complete);
        const cheapest = Math.min(...priced.map((car) => costs[car.id]!.totalMonthly));

        if (priced.length > 1 && Number.isFinite(cheapest)) {
            const upTo = Math.round(cheapest + Math.max(NEAR_LIMIT_EUR, cheapest * NEAR_LIMIT_SHARE));
            const near = priced.filter((car) => costs[car.id]!.totalMonthly <= upTo);
            const atAnyPrice = recommendation.winner;
            const narrowed = near.length && near.length < pool.length ? rank(near) : null;

            if (narrowed) {
                nearestToLimit = {
                    cheapest: Math.round(cheapest),
                    upTo,
                    setAside: pool.length - near.length,
                    bestAtAnyPrice:
                        narrowed.winner.id === atAnyPrice.id
                            ? null
                            : {
                                  id: atAnyPrice.id,
                                  name: carLabel(atAnyPrice, pool),
                                  monthly: Math.round(costs[atAnyPrice.id]?.totalMonthly ?? 0),
                              },
                };
                recommendation = narrowed;
            }
        }
    }

    return {
        scope,
        scopeHeadline,
        answers,
        level: levelWith(recommendation),
        nearestToLimit,
        ruledOut: ruledOut.length ? { evidence: ruledOut, setAside, nothingLeft } : null,
        recommendation,
        narrative: buildAdviceNarrative(
            recommendation.evaluation,
            recommendation.context,
            recommendation.alternatives,
        ),
    };
}

/**
 * The cars the reader is shown as the same match as the winner.
 *
 * "The same match" means the number on the card: the fit, rounded, which is
 * all the reader ever sees. Where two cars carry it, the engine now puts the
 * cheaper one first — this says so, and says by how much.
 */
function levelWith(recommendation: Recommendation): LensRun["level"] {
    const { winner, ranked, context } = recommendation;
    const shown = (car: PinnedFinnCar) => totalFor(context.scores, car.id);
    const monthly = (car: PinnedFinnCar) => {
        const cost = context.costs[car.id];

        return cost?.complete ? cost.totalMonthly : null;
    };

    const mine = monthly(winner);
    const others = ranked.filter((car) => car.id !== winner.id && shown(car) === shown(winner));

    if (!others.length) return null;

    const dearer = others.map(monthly).filter((cost): cost is number => cost != null && mine != null && cost > mine);

    return {
        others: others.length,
        cheapest: mine != null && others.every((car) => (monthly(car) ?? Infinity) >= mine),
        nextUp: dearer.length ? Math.round(Math.min(...dearer) - (mine ?? 0)) : null,
    };
}

/* -------------------------------------------------------------------------- */
/* The match                                                                  */
/* -------------------------------------------------------------------------- */

export interface CarLine {
    id: number;
    name: string;
    configuration: string;
    image: string | null;
    total: number;
    band: FitLevel;
    bandLabel: string;
    monthly: number;
    costComplete: boolean;
    budget: "within" | "over" | "unknown" | "notSet";
    rental: "fits" | "doesNotFit" | "unknown" | "notSet";
    /** Why it doesn't fit the rental period, when it doesn't. */
    rentalProblem: string | null;
}

function carLine(run: LensRun, car: PinnedFinnCar): CarLine {
    const { context, scores } = run.recommendation;
    const score = scores.find((item) => item.vehicleId === car.id);
    const cost = context.costs[car.id];
    const total = totalFor(scores, car.id);
    const band: FitLevel = score?.judgeable ? bandForScore(total) : "unknown";

    return {
        id: car.id,
        name: carLabel(car, context.vehicles),
        configuration: configurationName(car),
        image: car.images?.thumbnail || null,
        total,
        band,
        bandLabel: FIT_BANDS[band].label,
        monthly: cost?.totalMonthly ?? 0,
        costComplete: cost?.complete ?? false,
        budget: cost?.budget == null ? "notSet" : cost.budgetStatus,
        rental: cost?.contract.status ?? "notSet",
        rentalProblem: cost ? describeRentalProblem(cost.contract) : null,
    };
}

export interface MatchSummary {
    eyebrow: string;
    car: CarLine;
    /** The engine's first reason, in the words the advice page uses. */
    reason: string | null;
    /** The one note that qualifies the verdict: budget, closeness, missing data. */
    note: string | null;
    tradeoff: { headline: string; text: string } | null;
    /** The FINN term the price is on, and months past the reader's period. */
    term: { months: number; extraMonths: number | null } | null;
    alternatives: (CarLine & { hook: string | null; costDifference: number | null })[];
    candidateCount: number;
    singleCar: boolean;
}

export function summariseMatch(run: LensRun): MatchSummary {
    const { recommendation, narrative } = run;
    const { winner, alternatives, context } = recommendation;
    const singleCar = context.vehicles.length === 1;
    const contract = context.costs[winner.id]?.contract;

    const eyebrow = singleCar
        ? "How this car fits you"
        : recommendation.gearboxFallback === "noneFit"
          ? "Closest match — nothing here is an automatic"
          : recommendation.rentalFallback === "noneFit"
          ? "Closest match — nothing here fits your rental period"
          : recommendation.isFallback
            ? "Closest match — nothing here fits your budget"
            : "Your Lens match";

    const [tradeoff] = narrative.tradeoffs;

    return {
        eyebrow,
        car: carLine(run, winner),
        reason: narrative.verdict.reasons[0] ?? null,
        note:
            narrative.verdict.budgetNote ??
            narrative.verdict.marginNote ??
            narrative.verdict.dependsNote ??
            null,
        tradeoff: tradeoff
            ? { headline: tradeoff.headline, text: tradeoff.sentences[0] ?? tradeoff.evidence }
            : null,
        term: contract?.term
            ? { months: contract.term.months, extraMonths: contract.extraMonths }
            : null,
        alternatives: alternativeOptions(context, alternatives, winner, winner.id)
            .slice(0, 3)
            .map((option) => ({
                ...carLine(run, option.vehicle),
                hook: option.hook,
                costDifference: option.costDifference,
            })),
        candidateCount: context.vehicles.length,
        singleCar,
    };
}

/**
 * Alternatives for someone with hard limits: the best-ranked cars that respect
 * them first, and only then the closest ones that don't, flagged as such. The
 * engine's own alternatives are chosen by closeness of score, which is right
 * for the advice page and wrong for "I can't spend more than €500".
 */
export function alternativesWithinLimits(run: LensRun, limit = 3): CarLine[] {
    const { ranked, winner, context } = run.recommendation;

    const within = (car: PinnedFinnCar) => {
        const cost = context.costs[car.id];
        return Boolean(cost) && (cost!.budget == null || cost!.budgetStatus === "within") &&
            (cost!.contract.status === "notSet" || cost!.contract.status === "fits");
    };

    const others = ranked.filter((car) => car.id !== winner.id);

    return [...others.filter(within), ...others.filter((car) => !within(car))]
        .slice(0, limit)
        .map((car) => carLine(run, car));
}

/* -------------------------------------------------------------------------- */
/* Comparison                                                                 */
/* -------------------------------------------------------------------------- */

/** The ranked candidates, best first, as far as a compact table has room for. */
export function compareRows(run: LensRun, limit = 8): (CarLine & { isMatch: boolean; rank: number })[] {
    const { ranked, winner } = run.recommendation;

    /* The match first, whatever its raw rank — the budget or rental period may have moved it. */
    const ordered = [winner, ...ranked.filter((car) => car.id !== winner.id)];

    return ordered.slice(0, limit).map((car) => ({
        ...carLine(run, car),
        isMatch: car.id === winner.id,
        rank: ranked.findIndex((item) => item.id === car.id) + 1,
    }));
}
