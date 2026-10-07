import { buildRecommendation, describeRentalProblem, formatEUR } from "@/lib/reasoning-engine";
import { calculateCost, missingPiece } from "@/lib/reasoning-engine/cost";
import type { Answers } from "@/lib/reasoning-engine/answers";
import { bandForScore } from "@/lib/reasoning-engine/bands";
import { CATEGORIES, DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { assessEnvironment } from "@/lib/reasoning-engine/environmental";
import { lowerFirst } from "@/lib/reasoning-engine/format";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import { bubblesIn, figuresOf } from "@/lib/lens-chat/bubbles";
import { demandOf } from "@/lib/lens-chat/deals";
import { FIT_BANDS, type FitLevel } from "@/lib/reasoning-engine/fit";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import { asPhrase, EVIDENCE, evidenceMet, measuredDisplay } from "@/lib/lens-chat/evidence";
import { allowedByRules, alternativesWithinLimits, compareRows, runLens, summariseMatch, type CarLine, type LensRun } from "@/lib/lens-chat/run";
import { NEED_WEIGHT, ruledOut, toAnswers, type Translation, type Understanding } from "@/lib/lens-chat/understanding";
import type { PinnedFinnCar } from "@/lib/types";

import type { CarSnapshot, Chat, ChatMessage, Judgement, Verdict } from "./types";
import { wholePercents } from "./weighing";

/**
 * A chat's judgement: the reader's answers, run through the real engine over
 * the cars on the page.
 *
 * One run feeds everything that is said about it — the result in the chat,
 * the chip on each card, the drawer behind each chip — so none of them can
 * disagree with another. The drawer re-runs it from the same understanding
 * over the same cars rather than reading a stored ranking, which is why
 * `judgeWith` must stay deterministic.
 */

/**
 * What a chat starts from before the reader has said anything.
 *
 * No budget: the engine's default is a placeholder, and a limit the reader
 * never gave must not set cars aside. No raised equipment either: the
 * engine's defaults raise five features per priority from published buyer
 * surveys, and in a chat that would be Lens deciding what this reader wants.
 * Only what the reader said counts at all — see `chatAnswers`.
 */
export const BASE_ANSWERS: Answers = {
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES, monthlyBudget: 0 },
    features: Object.fromEntries(Object.keys(DEFAULT_CATEGORY_FEATURES).map((id) => [id, []])) as unknown as Answers["features"],
    basedOn: null,
};

/**
 * How a chat's answers become the engine's: only what the reader's needs
 * point to, and within a priority only the equipment they asked for — so a
 * band says how much of what they asked for a car has, and nothing else.
 */
export const chatAnswers = (u: Understanding): Translation => toAnswers(BASE_ANSWERS, u, undefined, { fill: false, onlyAsked: true });

export interface Judged {
    run: LensRun;
    translation: Translation;
}

export function judgeWith(u: Understanding, cars: PinnedFinnCar[], headline: string): Judged | null {
    const translation = chatAnswers(u);
    const run = runLens(cars, translation.answers, "page", headline, ruledOut(u), u.budget?.firm === true);

    return run ? { run, translation } : null;
}

/** How many earlier judgements a chat keeps for its earlier results to open on. */
const EARLIER = 20;

/**
 * A chat with a new judgement: the latest replaced, and the one it replaces
 * kept, so the result that came from it still opens on what it said.
 */
export function withJudgement(chat: Chat, judgement: Judgement): Chat {
    return {
        ...chat,
        judgement,
        earlier: chat.judgement ? [...(chat.earlier ?? []), chat.judgement].slice(-EARLIER) : chat.earlier,
    };
}

/** A judgement of this chat by when it was made; the latest where none is named or it's gone. */
export function judgementAt(chat: Chat, at: string | null): { judgement: Judgement | null; latest: boolean } {
    const found = at ? [chat.judgement, ...(chat.earlier ?? [])].find((item) => item?.at === at) : null;

    return found && found !== chat.judgement ? { judgement: found, latest: false } : { judgement: chat.judgement, latest: true };
}

/* -------------------------------------------------------------------------- */
/* The chips                                                                  */
/* -------------------------------------------------------------------------- */

const lineVerdict = (line: CarLine, rank: number, winner: boolean): Verdict => ({
    band: line.band,
    label: FIT_BANDS[line.band].label,
    rank,
    winner,
    setAside: null,
    over: line.budget === "over" ? "budget" : line.rental === "doesNotFit" ? "period" : null,
});

/**
 * What every card judged should say.
 *
 * Three kinds of car, and each is told apart:
 *
 * - **Ranked** — the winner first, whatever its raw place (the budget or the
 *   rental period may have moved it), then the rest in the engine's order.
 * - **Set aside by the reader's own rules** — "not electric", "no SUV". Never
 *   graded as if the rule weren't there.
 * - **Left out for being further over the limit** — when nothing fits the
 *   budget, Lens ranks only the cars nearest it. These are still graded, on
 *   a ranking of everything the rules allow, and say why they weren't ranked.
 */
export function verdictsFor(judged: Judged, cars: PinnedFinnCar[]): Record<number, Verdict> {
    const { run } = judged;
    const verdicts: Record<number, Verdict> = {};
    const rows = compareRows(run, Number.POSITIVE_INFINITY);

    const closest = closestMatch(run);

    rows.forEach((row, index) => {
        verdicts[row.id] = { ...lineVerdict(row, index + 1, row.isMatch), ...(row.isMatch && closest ? { closest } : {}) };
    });

    const understandingRules = judged.translation.profile.rules;
    const allowed = new Set(allowedByRules(cars, understandingRules).map((car) => car.id));
    const nothingLeft = run.ruledOut?.nothingLeft ?? false;

    /* Over a limit the reader made a rule: set aside like a rule's cars, not graded. */
    for (const id of run.overLimit?.ids ?? []) {
        const limit = `€${run.overLimit!.limit.toLocaleString("en-GB")}`;
        const car = cars.find((item) => item.id === id);
        /* Not confirmed within it: say exactly what FINN's data is missing for this car. */
        const breakdown = run.overLimit!.unconfirmed.includes(id) && car ? calculateCost(car, run.answers.preferences) : null;

        verdicts[id] = {
            band: "unknown",
            label: "Ruled out",
            rank: null,
            winner: false,
            over: "budget",
            setAside: breakdown
                ? `Can't be confirmed within your ${limit} limit, which you said to keep to — missing ${breakdown.missing.map((reason) => missingPiece(reason, breakdown)).join("; and ")}`
                : `Over your ${limit} limit, which you said to keep to`,
        };
    }

    const unranked = cars.filter((car) => !(car.id in verdicts));
    const overLimit = unranked.filter((car) => nothingLeft || allowed.has(car.id));

    if (overLimit.length) {
        /* Graded among everything the rules allow, so the band means the same as elsewhere. */
        const pool = cars.filter((car) => nothingLeft || allowed.has(car.id));
        const full = buildRecommendation(pool, run.answers.priorities, run.answers.preferences, run.answers.features);

        for (const car of overLimit) {
            const score = full?.scores.find((item) => item.vehicleId === car.id);
            const band: FitLevel = full && score?.judgeable ? bandForScore(totalFor(full.scores, car.id)) : "unknown";

            verdicts[car.id] = {
                band,
                label: FIT_BANDS[band].label,
                rank: null,
                winner: false,
                setAside: "Further over your budget than the cars Lens ranked",
                over: "budget",
            };
        }
    }

    for (const car of cars) {
        if (car.id in verdicts) continue;

        const broken = understandingRules.find((rule) => !allowedByRules([car], [rule]).length);

        verdicts[car.id] = {
            band: "unknown",
            label: "Ruled out",
            rank: null,
            winner: false,
            over: null,
            setAside: broken
                ? broken.mode === "without"
                    ? `You ruled out ${asPhrase(broken.id)}`
                    : `You asked for ${asPhrase(broken.id)} only`
                : "Set aside by your rules",
        };
    }

    return verdicts;
}

/* -------------------------------------------------------------------------- */
/* The result, as the chat says it                                            */
/* -------------------------------------------------------------------------- */

const snapshot = (line: CarLine, urls: Record<number, string>): CarSnapshot => ({
    id: line.id,
    name: line.name,
    configuration: line.configuration,
    image: line.image,
    monthly: line.costComplete ? Math.round(line.monthly) : null,
    band: line.band,
    bandLabel: line.bandLabel,
    url: urls[line.id] ?? null,
    overLimit: line.budget === "over" || line.rental === "doesNotFit",
    /* Which limit: a €224 car that only fails the dates isn't "over your limit". */
    over: line.budget === "over" ? "budget" : line.rental === "doesNotFit" ? "period" : null,
});

const RANK: Record<NeedImportance, number> = { essential: 0, important: 1, niceToHave: 2 };

/**
 * What a car has for each bubble, strongest first: the equipment FINN lists
 * on it, a size it's within, its CO₂ or consumption reading. Only what it
 * has — what it lacks is a trade-off, said elsewhere — and only bubbles
 * where it has something.
 */
export function whyLines(car: PinnedFinnCar, u: Understanding): { said: string; has: string[] }[] {
    const environment = assessEnvironment(car);

    return bubblesIn(u)
        .map(({ bubble, state }) => ({ bubble, state, need: u.needs.find((need) => need.id === `bubble-${bubble.id}` && need.status === "active") }))
        .filter((item): item is typeof item & { need: NonNullable<(typeof item)["need"]> } => item.need != null)
        .sort((a, b) => RANK[a.need.importance] - RANK[b.need.importance])
        .map(({ bubble, state, need }) => {
            const judgedOn = figuresOf(bubble, state);
            const has = need.evidence.filter((entry) => evidenceMet(car, entry.id) === true).map((entry) => measuredDisplay(car, entry.id) ?? lowerFirst(EVIDENCE[entry.id].label));
            /*
             * A figure only where it's something the car got right, by Lens's
             * own lines: low CO₂ (class A to C), or frugal for its kind. "143
             * g/km · Class E" or "moderate fuel use" isn't a reason it won.
             */
            const figures = [
                judgedOn.includes("environmental") && environment?.co2 && evidenceMet(car, "lowCo2") === true ? environment.co2.display : null,
                judgedOn.includes("efficiency") && environment?.efficiency && evidenceMet(car, "frugal") === true
                    ? `${lowerFirst(environment.efficiency.label)} (${environment.efficiency.display})`
                    : null,
            ].filter((item): item is string => item != null);

            return { said: bubble.you, has: [...has, ...figures] };
        })
        .filter((line) => line.has.length > 0);
}

/**
 * How much each thing the reader said counted, in their own terms: what they
 * said, how much it counts, its share of the decision and what Lens looked at
 * for it — the drawer's "How I weighed it" in brief, and never the engine's
 * priority names ("Comfort → Climate Suitability" read as nonsense). The
 * share is the one the engine is given: a need's weight over every need's.
 */
export function becauseOf(u: Understanding): { said: string; importance: NeedImportance; into: string[]; share: number }[] {
    const counted = u.needs.filter((need) => need.status === "active" && need.priorities.length > 0);
    const total = counted.reduce((sum, need) => sum + NEED_WEIGHT[need.importance], 0);
    const percents = wholePercents(counted.map((need) => (total ? NEED_WEIGHT[need.importance] / total : 0)));

    return counted
        .map((need, index) => {
            const bubble = need.id.startsWith("bubble-") ? bubblesIn(u).find((item) => `bubble-${item.bubble.id}` === need.id)?.bubble : null;
            const figures = need.priorities.filter((id) => CATEGORIES[id].numericOnly).map((id) => FIGURE_WORDS[id] ?? CATEGORIES[id].label.toLowerCase());

            return {
                said: bubble ? bubble.you : need.id.startsWith("sealer-") ? `${need.label} would seal it` : need.label,
                importance: need.importance,
                into: [...figures, ...need.evidence.filter((entry) => !entry.unwanted).map((entry) => lowerFirst(EVIDENCE[entry.id].label))],
                share: percents[index]!,
            };
        })
        .sort((a, b) => b.share - a.share);
}

/** A figure Lens judges on, as "because you said" names it. */
const FIGURE_WORDS: Partial<Record<string, string>> = { environmental: "CO₂ per km", efficiency: "fuel or electricity use for its kind" };

/**
 * Whether the pick is past one of the reader's limits — nothing within the
 * budget, nothing for their dates, a deal-breaker no car has and they kept —
 * so it's the closest match, not the strongest. The chat's result and the
 * drawer say it alike.
 */
export function closestMatch(run: LensRun): boolean {
    const { recommendation } = run;

    return Boolean(
        run.ruledOut?.nothingLeft || run.nearestToLimit || recommendation.isFallback || recommendation.rentalFallback === "noneFit" || recommendation.gearboxFallback === "noneFit",
    );
}

/**
 * When no car here can be rented for the reader's dates: said first, since it
 * changes what the pick means — "Audi Q3 only offers terms up to 9 months,
 * which doesn't cover November 2026 to October 2028".
 */
function datesNote(run: LensRun): string | null {
    const { recommendation } = run;
    if (recommendation.rentalFallback !== "noneFit") return null;

    const contract = recommendation.context.costs[recommendation.winner.id]?.contract;
    const problem = contract ? describeRentalProblem(contract) : null;
    const name = compareRows(run, 1)[0]?.name ?? recommendation.winner.name;

    return problem
        ? `None of the cars here fits your dates — ${name} ${problem}. It's the best fit for everything else you told me.`
        : "None of the cars here fits your dates, so this is the best fit for everything else you told me.";
}

export function resultMessage(
    judged: Judged,
    cars: PinnedFinnCar[],
    headline: string,
    urls: Record<number, string>,
    id: string,
    at: string,
    /** What the reader told Lens, for the why lines. Without it, a result says the engine's reasons only. */
    u?: Understanding,
): Extract<ChatMessage, { kind: "result" }> {
    const { run } = judged;
    const summary = summariseMatch(run);
    const winner = compareRows(run, 1)[0] ?? null;

    const note = run.ruledOut?.nothingLeft
        ? `No car here has ${run.ruledOut.evidence.length === 1 ? "what your deal-breaker asks for" : "all of your deal-breakers"}, and you kept ${run.ruledOut.evidence.length === 1 ? "it" : "them all"} — so this is the best fit for everything else you told me.`
        : run.nearestToLimit
          ? `Nothing here fits your budget, so I ranked the cars closest to it — up to about ${formatEUR(run.nearestToLimit.upTo)} a month.`
          : (datesNote(run) ?? summary.note);

    /*
     * One thing to know: a note about a limit first — over budget, nothing
     * within it, every car broke a rule — since it changes what the pick
     * means; else the biggest trade-off; else whatever else the engine noted.
     */
    const limit = run.ruledOut?.nothingLeft || run.nearestToLimit || datesNote(run) ? note : (run.narrative.verdict.budgetNote ?? null);
    const closest = closestMatch(run);
    const [tradeoff] = run.narrative.tradeoffs;
    const know = limit ?? (tradeoff ? `${tradeoff.headline}. ${tradeoff.sentences[0] ?? tradeoff.evidence}` : note);

    return {
        id,
        at,
        from: "lens",
        kind: "result",
        headline,
        count: cars.length,
        ...(closest ? { closest } : {}),
        winner: winner ? snapshot(winner, urls) : null,
        reason: summary.reason,
        ...(u
            ? {
                  why: whyLines(cars.find((car) => car.id === run.recommendation.winner.id) ?? run.recommendation.winner, u),
                  because: becauseOf(u),
              }
            : {}),
        reasons: run.narrative.verdict.reasons,
        tradeoffs: run.narrative.tradeoffs.map((tradeoff) => ({ headline: tradeoff.headline, text: tradeoff.sentences[0] ?? tradeoff.evidence })),
        note,
        know,
        /*
         * The ones that respect the reader's limits first: "closest by score"
         * put a €1,638 car under a €500 limit's pick, which answers a question
         * nobody asked.
         */
        runnersUp: alternativesWithinLimits(run, 3).map((line) => snapshot(line, urls)),
        setAside: (run.ruledOut && !run.ruledOut.nothingLeft ? run.ruledOut.setAside : 0) + (run.overLimit?.ids.length ?? 0),
        /* The judgement made with it carries the same moment: that's how the result finds it again. */
        judgement: at,
    };
}

export function judgementFrom(
    judged: Judged,
    cars: PinnedFinnCar[],
    u: Understanding,
    headline: string,
    pageUrl: string,
    urls: Record<number, string>,
    at: string,
): Judgement {
    return {
        at,
        carIds: cars.map((car) => car.id),
        winnerId: judged.run.recommendation.winner.id,
        verdicts: verdictsFor(judged, cars),
        headline,
        pageUrl,
        urls,
        understanding: u,
    };
}

/**
 * When no car has every deal-breaker: which would the reader let go of? Each
 * with what letting it go opens up — "without it, 3 cars here fit everything
 * else" — the ones that open up most first. Null when there's no such choice
 * to make.
 */
/** The reader's deal-breakers, as one string: the same rules, the same signature. */
export function rulesSignature(u: Understanding): string {
    return ruledOut(u)
        .map((rule) => `${rule.mode}:${rule.id}`)
        .sort()
        .join(",");
}

/**
 * Asked before the result, not after it: when no car has every deal-breaker,
 * which to let go of is the reader's to say before Lens shows a pick — unless
 * they've already said to keep these very rules. Null when there's nothing
 * to ask.
 */
export function askBeforeResult(from: Chat, run: LensRun, id: string, at: string): Extract<ChatMessage, { kind: "ask" }> | null {
    if (from.keptRules && from.keptRules === rulesSignature(from.understanding)) return null;
    return letGoAsk(run, id, at);
}

export function letGoAsk(run: LensRun, id: string, at: string): Extract<ChatMessage, { kind: "ask" }> | null {
    if (!run.ruledOut?.nothingLeft) return null;

    const rows = [...run.ruledOut.withoutEach].sort((a, b) => b.fits - a.fits);

    return {
        id,
        at,
        from: "lens",
        kind: "ask",
        answered: false,
        step: {
            id: "letGo",
            ask: rows.length === 1 ? `No car here meets “${lowerFirst(demandOf(rows[0]!))}” — could you let it go?` : "No car here has all of your deal-breakers — so which matters least to you?",
            why: "Pick any you could let go of. Each becomes a deal-sealer where I can weigh it: it still counts as a top priority, it just doesn't rule cars out. I'll judge again straight after.",
            multiple: true,
            choices: rows.map((row) => ({
                id: row.id,
                label: demandOf(row),
                said: demandOf(row),
                description: rows.length === 1 ? "Without it, every car here is back in." : row.fits ? `Without it, ${row.fits} ${row.fits === 1 ? "car" : "cars"} here ${row.fits === 1 ? "fits" : "fit"} everything else.` : "Even without it, no car here fits everything else.",
            })),
            none: rows.length === 1 ? "Keep it" : "Keep them all",
        },
    };
}
