import { describe, expect, it } from "vitest";

import { judgeWith } from "@/lib/chats/judge";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { withBubbles } from "./bubbles";
import { sayOnce, tellFitStory } from "./fit-story";
import { EMPTY_UNDERSTANDING, withBudget, type Understanding } from "./understanding";

/*
 * How a car fits what the reader said, each reading said once: a figure or a
 * piece of equipment two needs share is told under the first, and named as
 * counting for the other.
 */

const page = fleet().slice(0, 24);

function story(u: Understanding, carId?: number) {
    const judged = judgeWith(u, page, "24 cars")!;
    return { judged, story: tellFitStory(judged.run, u, judged.translation.lessRelevant, null, carId ?? null) };
}

describe("each reading said once", () => {
    it("draws a figure two needs judge on once, counting for both", () => {
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { environment: ["clean"], budget: [] }), 700, "Up to €700 a month.");
        const told = story(u).story;
        const once = sayOnce(told);

        expect(told.sections.filter((section) => section.figure?.kind === "efficiency")).toHaveLength(2);

        const rows = once.sections.filter((section) => section.figure?.kind === "efficiency");
        expect(rows).toHaveLength(1);
        expect([rows[0]!.figure!.need, ...(rows[0]!.alsoFor ?? [])]).toEqual(["A greener car", "Using little fuel or electricity"]);
    });

    it("lists equipment two needs share under the first, and names the other there", () => {
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { long: [], traffic: [] }), 600, "Up to €600 a month.");
        const once = sayOnce(story(u).story);
        const lines = once.sections.flatMap((section) => section.lines);

        /* Only in the first need; the second has nothing of its own left, so it's named on that line. */
        expect(lines.filter((line) => line.reads === "level2Assistance" || /Level 2/.test(line.text))).toHaveLength(1);
        expect(lines.find((line) => /Level 2/.test(line.text))?.alsoFor).toEqual(["Time in traffic"]);
        expect(once.sections.map((section) => section.short)).not.toContain("Time in traffic");
    });

    it("leaves the story it was given as it was", () => {
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { environment: ["clean"], budget: [] }), 700, "Up to €700 a month.");
        const told = story(u).story;
        const before = JSON.stringify(told);

        sayOnce(told);

        expect(JSON.stringify(told)).toBe(before);
    });
});

describe("a car that has what this one lacks", () => {
    it("names one within the reader's limits for a line the car falls short on, and only there", () => {
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { help: ["traffic", "parking"], long: [], city: ["street"], comfort: ["warm"] }), 600, "Up to €600 a month.");
        const { judged, story: told } = story(u);
        const costs = judged.run.recommendation.context.costs;
        const lines = told.sections.flatMap((section) => section.lines);
        const rivals = lines.filter((line) => line.rival);

        expect(rivals.length).toBeGreaterThan(0);

        for (const line of rivals) {
            expect(line.met).toBe(false);
            expect(line.rival!.id).not.toBe(judged.run.recommendation.winner.id);
            expect(costs[line.rival!.id]?.budgetStatus).toBe("within");
            expect(line.rival!.text.startsWith(line.rival!.name)).toBe(true);
        }

        expect(lines.filter((line) => line.met !== false).every((line) => !line.rival)).toBe(true);
    });

    it("gives the catch the car it names, so the reader can find it", () => {
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { help: ["traffic", "parking"], long: [], city: ["street"], comfort: ["warm"] }), 600, "Up to €600 a month.");
        const told = story(u).story;

        expect(told.catch?.alternative).toBeTruthy();
        expect(told.catch?.alternative?.startsWith(told.catch!.car!.name)).toBe(true);
        expect(page.some((car) => car.id === told.catch!.car!.id)).toBe(true);
    });

    it("doesn't lend the match's trade-off to another car's drawer", () => {
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"], environment: ["moderate"] }), 700, "Up to €700 a month.");
        const { judged } = story(u);
        const match = story(u).story;
        const other = judged.run.recommendation.ranked.find((car) => car.id !== judged.run.recommendation.winner.id)!;
        const theirs = story(u, other.id).story;

        /* The match's own catch is its biggest trade-off here; the runner-up's isn't the same sentence. */
        expect(match.catch?.text).toBe(judged.run.narrative.tradeoffs[0]?.sentences[0]);
        expect(theirs.catch?.text).not.toBe(match.catch?.text);
    });
});
