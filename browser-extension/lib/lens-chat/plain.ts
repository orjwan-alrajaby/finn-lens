import { formatEUR, monthLabel } from "@/lib/reasoning-engine";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";

import { asPhrase, ruleLabel } from "./evidence";
import type { FitStory } from "./fit-story";
import { ruledOut, type Understanding } from "./understanding";

/**
 * What Lens understood, and what it found, in sentences.
 *
 * The chat used to answer a person with the shape of its own thinking:
 * labelled sections for limits, needs, evidence, gaps, weights. All of it true
 * and none of it how anyone describes their own life. This turns the same
 * structures into a handful of plain lines — the detail stays one tap away for
 * anyone who wants to check it.
 *
 * Deterministic, and deliberately so: these sentences are what the reader
 * checks Lens against, so they are built from the understanding rather than
 * asked of a model that might flatter it.
 */

const join = (parts: string[]): string => {
    const kept = parts.filter(Boolean);

    if (kept.length <= 1) return kept[0] ?? "";
    if (kept.length === 2) return `${kept[0]} and ${kept[1]}`;

    return `${kept.slice(0, -1).join(", ")} and ${kept.at(-1)}`;
};

/**
 * The same list, without the pile-up of "and"s.
 *
 * Need labels are phrases with their own conjunctions — "getting a child seat
 * in and out", "knowing what's beside and behind you" — and joining two of
 * them with another "and" reads as one run-on thought. When any of them has an
 * "and" of its own, commas do the joining and the phrases keep their wording;
 * splitting them up instead gave "getting a child seat in, out".
 */
const joinLabels = (parts: string[]): string => {
    const kept = parts.filter(Boolean).filter((part, index, all) => all.indexOf(part) === index);

    if (kept.length > 1 && kept.some((part) => /\sand\s/.test(part))) return kept.join(", ");

    return join(kept);
};

const lower = (value: string): string =>
    /^[A-Z]{2,}/.test(value) || value.startsWith("I ") ? value : `${value.charAt(0).toLowerCase()}${value.slice(1)}`;

export interface HeardLines {
    /** Their life, as they described it. */
    situation: string;
    /** The rules a car has to meet. */
    limits: string;
    /** What Lens will look for on each car. */
    lookingFor: string;
    /** What they said not to bother with. */
    notChasing: string;
    /** What they asked about that FINN's data can't settle. */
    cantJudge: string;
}

/** The whole understanding as at most five sentences a person would recognise. */
export function heardLines(u: Understanding): HeardLines {
    const active = u.needs.filter((need) => need.status === "active");

    const limits: string[] = [];

    if (u.budget) {
        /*
         * What they said, not what Lens does with it. The headroom Lens allows
         * itself on a target it was never given a stretch for is a rule of the
         * engine's, and reading it back as though they had said it — "around
         * €600 a month, and no further than €690" — put a number in their
         * mouth and ran the line on. Where it matters, the answer says it.
         */
        limits.push(
            u.budget.kind === "hardMax"
                ? `up to ${formatEUR(u.budget.monthly)} a month all in`
                : u.budget.stretchTo
                  ? `around ${formatEUR(u.budget.monthly)} a month, ${formatEUR(u.budget.stretchTo)} at a stretch`
                  : `around ${formatEUR(u.budget.monthly)} a month`,
        );
    }

    if (u.rental) {
        /* The day matters: FINN publishes an earliest delivery date. */
        const from = u.rental.startDay ? `${u.rental.startDay} ${monthLabel(u.rental.from)}` : monthLabel(u.rental.from);

        limits.push(`from ${from} to ${monthLabel(u.rental.to)}`);
    }
    if (u.monthlyKm) limits.push(`about ${u.monthlyKm.value.toLocaleString("en-GB")} km a month`);

    for (const rule of ruledOut(u)) {
        limits.push(rule.mode === "without" ? `nothing FINN files as ${asPhrase(rule.id)}` : `only ${asPhrase(rule.id)}`);
    }

    const notChasing = [
        ...u.droppedPriorities.map((id) => lower(CATEGORIES[id].label)),
        ...u.needs.filter((need) => need.status === "dropped").map((need) => lower(need.label)),
        ...u.notModelled.filter((item) => item.stance === "doesntCare").map((item) => lower(item.said)),
    ].filter((item, index, all) => all.indexOf(item) === index);

    return {
        situation: joinLabels(u.context.map((item) => lower(item.label))),
        limits: join(limits),
        lookingFor: joinLabels(active.map((need) => lower(need.label))),
        notChasing: joinLabels(notChasing),
        cantJudge: joinLabels(u.notModelled.filter((item) => item.stance !== "doesntCare").map((item) => lower(item.said))),
    };
}

/**
 * Why this car, in one sentence.
 *
 * The result used to open with Lens's own headings — "It stays within your
 * €650 limit", "It partly covers parking without the stress" — which is the
 * shape of the check, not an answer to "why this one?". This says what the car
 * does for them, and leaves the checking to the detail below it.
 */
export function matchSentence(story: FitStory): string {
    const covered = story.sections.filter((section) => section.kind === "need" && section.tone === "good");
    const partly = story.sections.filter((section) => section.kind === "need" && section.tone === "note");
    const money = story.sections.find((section) => section.kind === "budget");

    const labels = [...covered, ...partly].slice(0, 3).map((section) => lower(section.short));
    /*
     * "I don't want anything big" comes back as a need called "Nothing big",
     * and a sentence that opens "Covers nothing big" says the opposite of what
     * the car does. What they ruled out is stated as something the car avoids.
     */
    const avoided = labels.filter((label) => /^(nothing|no)\s/.test(label));
    const wanted = labels.filter((label) => !avoided.includes(label));

    const needs = joinLabels(wanted);
    const away = joinLabels(avoided.map((label) => label.replace(/^nothing\s/, "anything ").replace(/^no\s/, "")));

    const opening = needs && away
        ? `Covers ${needs}, and avoids ${away}`
        : needs
          ? `Covers ${needs}`
          : away
            ? `Avoids ${away}`
            : "The closest Lens can get to what you described";

    if (!money) return `${opening}.`;

    /* A list that already has commas in it can't take another one. */
    const before = opening.includes(",") ? " — " : ", ";

    return money.tone === "good" ? `${opening}${before}within what you wanted to spend.` : `${opening} — but not what you wanted to spend.`;
}

/**
 * What Lens is working with, short enough to sit above a conversation.
 *
 * The strip is a reminder, not a report: a reader glances at it to check Lens
 * is still working on the right thing, and opens "your needs" when they want
 * the whole of it. So each chip is a few words — the money, the dates, what
 * they asked for, what they ruled out — in the order they'd think of them.
 */
export function needChips(u: Understanding): string[] {
    const chips: string[] = [];

    if (u.budget) {
        chips.push(u.budget.kind === "hardMax" ? `${formatEUR(u.budget.monthly)} max` : `Around ${formatEUR(u.budget.monthly)}`);
    }

    if (u.rental) {
        const from = u.rental.startDay ? `${u.rental.startDay} ${shortMonth(u.rental.from)}` : shortMonth(u.rental.from);

        chips.push(`${from}–${shortMonth(u.rental.to)}`);
    }

    for (const rule of ruledOut(u)) chips.push(ruleLabel(rule.id, rule.mode));

    for (const need of u.needs) {
        if (need.status === "active") chips.push(need.label);
    }

    return chips;
}

const shortMonth = (month: string): string => monthLabel(month).split(" ")[0]!.slice(0, 3);
