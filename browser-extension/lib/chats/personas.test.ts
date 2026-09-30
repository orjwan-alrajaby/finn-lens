import { describe, expect, it } from "vitest";

import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { EVIDENCE, readEvidence } from "@/lib/lens-chat/evidence";
import { tellFitStory } from "@/lib/lens-chat/fit-story";
import { ruledOut } from "@/lib/lens-chat/understanding";
import type { PinnedFinnCar } from "@/lib/types";

import { answer, startChat } from "./flow";
import { judgementFrom, judgeWith } from "./judge";
import { readTyped } from "./typing";
import type { Chat, ChatMessage } from "./types";

/*
 * Fourteen people, each talked through the chat the way they would answer
 * it, over FINN's whole inventory and over one page of it — and then held to
 * what a judgement must never do: break a rule it was given, say the budget
 * holds when it doesn't, weigh something nobody asked about, count a need's
 * equipment nowhere, or explain the result with a car that couldn't have won.
 *
 * Each check here was a real inconsistency found by running these people
 * through the chat over FINN's live inventory.
 */

const TODAY = new Date("2026-09-30T10:00:00Z");

type Ask = Extract<ChatMessage, { kind: "ask" }>;
type Picks = Record<string, string[] | { amount: number } | { text: string }>;

const openAsk = (chat: Chat): Ask | null => {
    const last = [...chat.messages].reverse().find((message) => message.kind === "ask");
    return last?.kind === "ask" && !last.answered ? last : null;
};

/** Answers every question as the persona would, until Lens asks to keep the answers. */
async function converse(cars: PinnedFinnCar[], picks: Picks): Promise<Chat> {
    let chat = startChat(null, cars, TODAY);

    for (let guard = 0; guard < 40; guard += 1) {
        const ask = openAsk(chat);
        if (!ask || ask.step.id === "keep") break;

        const key = ask.step.id.startsWith("offer-") ? "offer" : ask.step.id;
        /* A question with nothing scripted is answered as the page would: Continue, with whatever it shows picked. */
        const pick = picks[key] ?? picks[ask.step.id.startsWith("life-") ? "life" : key] ?? ask.step.selected ?? [];
        const own = new Set(ask.step.choices.map((choice) => choice.id));

        if (Array.isArray(pick)) {
            chat = answer(chat, ask.id, pick.filter((id) => own.has(id) || !ask.step.id.startsWith("life-")), cars, TODAY).chat;
        } else if ("amount" in pick) {
            chat = answer(chat, ask.id, [], cars, TODAY, { amount: pick.amount }).chat;
        } else {
            const read = await readTyped(chat, pick.text, cars, null);
            chat = answer(chat, ask.id, [], cars, TODAY, { heard: { text: pick.text, understanding: read.understanding, reply: read.reply } }).chat;
        }
    }

    return chat;
}

const PERSONAS: { name: string; picks: Picks }[] = [
    { name: "a young family parking on the street", picks: { life: ["passengers-2", "kids", "city", "street"], "follow-kids": ["seats"], rules: [], budget: { amount: 600 }, period: ["period-12"], distance: ["km-1000"], offer: ["yes"] } },
    { name: "a sales rep on the motorway every week, automatic only", picks: { life: ["commute", "motorway"], "follow-commute": ["long"], "follow-motorway": ["weekly"], rules: ["automatic"], budget: { amount: 800 }, period: ["period-24"], distance: { amount: 3000 }, offer: ["yes"] } },
    { name: "an electric-only city dweller for six months", picks: { life: ["co2-decides", "tech", "city", "garage"], rules: ["electric-only"], budget: { amount: 450 }, period: ["period-6"], distance: ["km-500"], offer: ["no"] } },
    { name: "a nervous new driver who puts safety first", picks: { life: ["nervous", "safety"], "follow-nervous": ["parking", "traffic"], rules: [], budget: ["budget-400"], period: ["period-12"], distance: ["km-500"], focus: ["life-safety"], offer: ["yes"] } },
    { name: "a dog owner in snow who needs all-wheel drive", picks: { life: ["dog", "winter", "bulky"], "follow-winter": ["snow"], rules: ["awd"], budget: ["budget-700"], period: ["period-18"], distance: ["km-1500"], offer: ["yes"] } },
    { name: "a road-trip couple who won't go electric", picks: { life: ["passengers-1", "adults", "roadtrips", "comfort"], rules: ["not-electric"], budget: { amount: 900 }, period: ["period-24"], distance: ["km-1500"], offer: ["yes"] } },
    { name: "a caravan owner who must tow", picks: { life: ["towing", "motorway"], "follow-motorway": ["monthly"], rules: ["must-tow"], budget: ["budget-1000"], period: ["period-12"], distance: { amount: 2000 }, offer: ["yes"] } },
    { name: "a student on €300 in the city", picks: { life: ["city", "street"], rules: [], budget: ["budget-300"], period: ["period-6"], distance: ["km-500"], offer: ["no"] } },
    { name: "a night-shift nurse who types", picks: { "life-people": { text: "I drive home after night shifts on unlit country roads, and I can't spend more than 550 a month" }, rules: [], period: ["period-12"], distance: ["km-1500"], offer: ["yes"] } },
    { name: "a big family who need six seats", picks: { life: ["passengers-5", "kids", "bulky"], "follow-kids": ["boosters"], rules: ["six-seats"], budget: ["budget-1000"], period: ["period-24"], distance: { amount: 2000 }, offer: ["yes"] } },
    { name: "someone who cares only about emissions, with no budget or dates", picks: { life: ["co2-matters"], rules: [], budget: [], period: [], distance: ["km-1000"], offer: ["no"] } },
    { name: "a family who type everything at once", picks: { "life-people": { text: "We're a family of four with a dog. I commute 40 minutes each way on the Autobahn, our winters are snowy, and we can spend around 700 a month." }, rules: [], period: ["period-12"], distance: ["km-2500"], offer: ["yes"] } },
    { name: "someone who picks every need", picks: { life: ["passengers-4", "kids", "dog", "adults", "city", "commute", "motorway", "roadtrips", "night", "winter", "street", "garage", "summer", "bulky", "bikes", "towing", "nervous", "safety", "tech", "comfort", "co2-matters", "efficiency-matters"], rules: [], budget: { amount: 800 }, period: ["period-12"], distance: ["km-1500"], offer: ["yes"] } },
    { name: "a nervous electric-only city driver on €350", picks: { life: ["nervous", "city", "street"], "follow-nervous": ["parking", "reversing"], rules: ["electric-only"], budget: { amount: 350 }, period: ["period-12"], distance: ["km-500"], offer: ["yes"] } },
];

/** Everything wrong with how a chat judged these cars, as sentences; empty when nothing is. */
function problemsWith(chat: Chat, cars: PinnedFinnCar[]): string[] {
    const u = chat.understanding;
    const judged = judgeWith(u, cars, `${cars.length} cars`);
    if (!judged) return ["no judgement"];

    const { run, translation } = judged;
    const { recommendation } = run;
    const { context, winner } = recommendation;
    const cost = context.costs[winner.id]!;
    const { verdict } = run.narrative;
    const verdicts = judgementFrom(judged, cars, u, "", "", {}, "").verdicts;
    const rules = ruledOut(u);
    const problems: string[] = [];

    /* The rules hold. */
    for (const rule of rules) {
        const kept = rule.mode === "must" ? readEvidence(winner, rule.id) === "listed" : readEvidence(winner, rule.id) !== "listed";
        if (!kept && !run.ruledOut?.nothingLeft) problems.push(`the winner breaks "${rule.label}"`);
    }

    /* Over budget only when nothing that could win is within it — and then said so. */
    if (u.budget && cost.budgetStatus === "over") {
        const takeable = cars.filter(
            (car) =>
                context.costs[car.id]?.budgetStatus === "within" &&
                verdicts[car.id]?.setAside == null &&
                ["fits", "notSet"].includes(context.costs[car.id]!.contract.status),
        );
        if (takeable.length) problems.push(`the winner is over budget while ${takeable.length} cars that could win are within it`);
        if (!recommendation.isFallback) problems.push("the winner is over budget but the run isn't flagged");
        if (/isn't already over|also fits your/.test(verdict.headline)) problems.push(`the headline says the budget holds: ${verdict.headline}`);
    }

    /* No car within the limits in a better band than the winner. */
    const order = ["strong", "good", "partial", "limited", "unknown"];
    const better = Object.entries(verdicts).filter(
        ([id, item]) => Number(id) !== winner.id && item.rank != null && !item.over && order.indexOf(item.band) < order.indexOf(verdicts[winner.id]!.band),
    );
    if (better.length) problems.push(`${better.length} cars within the limits sit in a better band than the winner`);

    /* The margin is measured against a car that could have won in its place — within the same limits it is — and never against itself. */
    const margin = verdict.marginNote ?? "";
    if (margin.startsWith(`${winner.name} `)) problems.push(`the margin compares the winner with its own model: ${margin}`);
    const level = /^(?:Another )?(.+?)(?: \(.*\))? (?:finishes level with it|scores the same)/.exec(margin);
    if (level) {
        const total = totalFor(recommendation.scores, winner.id);
        const named = cars.filter((car) => car.name === level[1] && car.id !== winner.id);
        if (!named.some((car) => Math.abs(totalFor(recommendation.scores, car.id) - total) <= 1 && verdicts[car.id]?.over == verdicts[winner.id]?.over)) {
            problems.push(`the margin names a car that isn't level, or couldn't have won: ${margin}`);
        }
    }

    /* A car that lost on dates and on price is said to have lost on both. */
    const higher = /^(.+?) scores higher overall, but it (only offers|is due|can't be delivered)/.exec(verdict.budgetNote ?? "");
    if (higher && u.budget && cars.filter((car) => car.name === higher[1]).every((car) => context.costs[car.id]?.budgetStatus === "over")) {
        problems.push(`the note blames only the dates on ${higher[1]}, which is over budget too`);
    }

    /* Every need's equipment counts where it is scored, a rule's never, and nothing else. */
    for (const need of u.needs.filter((item) => item.status === "active")) {
        const trace = translation.profile.trace.find((item) => item.need === need.label);

        for (const priority of trace?.priorities.map((item) => item.id) ?? []) {
            /* CO₂ and consumption are figures: a need about them holds no equipment by design. */
            if (!CATEGORIES[priority].numericOnly && !need.evidence.some((entry) => EVIDENCE[entry.id].scoredIn === priority)) {
                problems.push(`${need.label} brings in ${priority} without any equipment scored there`);
            }
        }

        for (const entry of need.evidence) {
            const home = EVIDENCE[entry.id].scoredIn;
            if (entry.unwanted || rules.some((rule) => rule.id === entry.id) || !home) continue;

            if (!translation.answers.priorities.includes(home)) problems.push(`${entry.id} (${need.label}) counts nowhere`);
            else if (!translation.answers.features[home].some((item) => item.key === entry.id)) problems.push(`${entry.id} (${need.label}) isn't raised`);
        }
    }

    /* The story says each rule once, in English, and the reasons claim no ranking the reader never gave. */
    const story = tellFitStory(run, u, translation.lessRelevant, null);
    for (const section of story.sections) {
        const need = u.needs.find((item) => item.id === section.key);
        if (need && need.evidence.length && need.evidence.every((entry) => rules.some((rule) => rule.id === entry.id))) {
            problems.push(`the story repeats the rule "${need.label}" as a need`);
        }
        if (/^It is an? (towbar|all-wheel)|with help for/.test(section.title)) problems.push(`the story reads badly: ${section.title}`);
    }
    if (/You put|your #\d/.test(verdict.reasons.join(" "))) problems.push(`the reasons claim a ranking: ${verdict.reasons[0]}`);

    return problems;
}

const everything = fleet();
/* A page's worth, as FINN might show one. */
const page = everything.slice(0, 24);

describe.each([
    ["FINN's whole inventory", everything],
    ["one page of it", page],
] as const)("judging %s", (_scope, cars) => {
    it.each(PERSONAS)("holds up for $name", async ({ picks }) => {
        const chat = await converse([...cars], picks);

        expect(problemsWith(chat, [...cars])).toEqual([]);
    });
});
