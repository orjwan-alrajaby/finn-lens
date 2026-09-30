import { buildRecommendation } from "@/lib/reasoning-engine";
import type { Answers } from "@/lib/reasoning-engine/answers";
import { bandForScore } from "@/lib/reasoning-engine/bands";
import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { FIT_BANDS, type FitLevel } from "@/lib/reasoning-engine/fit";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import { asPhrase } from "@/lib/lens-chat/evidence";
import { allowedByRules, alternativesWithinLimits, compareRows, runLens, summariseMatch, type CarLine, type LensRun } from "@/lib/lens-chat/run";
import { ruledOut, toAnswers, type Translation, type Understanding } from "@/lib/lens-chat/understanding";
import type { PinnedFinnCar } from "@/lib/types";

import type { CarSnapshot, Chat, ChatMessage, Judgement, Verdict } from "./types";

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
 * How a chat's answers become the engine's: the priorities the reader's
 * needs point to, in their order or the reader's own, each judged on all of
 * its equipment with what they asked for counting more.
 */
export const chatAnswers = (u: Understanding): Translation =>
    /*
     * The Lens way — priorities in order, each judged on all its equipment —
     * for every chat that has Lens preferences; chats from before rank on
     * what was asked alone, as they did when they were judged.
     */
    u.lens ? toAnswers(BASE_ANSWERS, u, undefined, { fill: false, native: true }) : toAnswers(BASE_ANSWERS, u, undefined, { fill: false, onlyAsked: true });

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

    rows.forEach((row, index) => {
        verdicts[row.id] = lineVerdict(row, index + 1, row.isMatch);
    });

    const understandingRules = judged.translation.profile.rules;
    const allowed = new Set(allowedByRules(cars, understandingRules).map((car) => car.id));
    const nothingLeft = run.ruledOut?.nothingLeft ?? false;

    /* Over a limit the reader made a rule: set aside like a rule's cars, not graded. */
    for (const id of run.overLimit?.ids ?? []) {
        verdicts[id] = {
            band: "unknown",
            label: "Ruled out",
            rank: null,
            winner: false,
            over: "budget",
            setAside: `Over your €${run.overLimit!.limit.toLocaleString("en-GB")} limit, which you said to keep to`,
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
});

export function resultMessage(
    judged: Judged,
    cars: PinnedFinnCar[],
    headline: string,
    urls: Record<number, string>,
    id: string,
    at: string,
): Extract<ChatMessage, { kind: "result" }> {
    const { run } = judged;
    const summary = summariseMatch(run);
    const winner = compareRows(run, 1)[0] ?? null;

    const note = run.ruledOut?.nothingLeft
        ? "Every car here broke one of your rules, so I judged them all as if the rules weren't there."
        : run.nearestToLimit
          ? `Nothing here fits your budget, so I ranked the cars closest to it — up to about €${run.nearestToLimit.upTo} a month.`
          : summary.note;

    return {
        id,
        at,
        from: "lens",
        kind: "result",
        headline,
        count: cars.length,
        winner: winner ? snapshot(winner, urls) : null,
        reason: summary.reason,
        note,
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
