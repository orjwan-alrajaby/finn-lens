import { describe, expect, it } from "vitest";

import { judgeWith } from "@/lib/chats/judge";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { withBubbles } from "./bubbles";
import { tellFitStory } from "./fit-story";
import { EMPTY_UNDERSTANDING, withBudget } from "./understanding";

/*
 * Another car's drawer can point to the winner as the car that has what this
 * one lacks. It's called the winner there too, and marked as the winner, so
 * its button takes the winner's gold.
 */
describe("the winner, named from another car's drawer", () => {
    it("is called the winner and marked as it, wherever “Worth knowing” points to it", () => {
        const page = fleet().slice(0, 24);
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"] }), 700, "Up to €700 a month.");
        const judged = judgeWith(u, page, "24 cars")!;
        const winner = judged.run.recommendation.winner.id;

        const pointing = judged.run.recommendation.ranked
            .filter((car) => car.id !== winner)
            .map((car) => tellFitStory(judged.run, u, judged.translation.lessRelevant, null, car.id).catch)
            .filter((item) => item?.car?.id === winner);

        expect(pointing.length).toBeGreaterThan(0);
        for (const item of pointing) {
            expect(item!.car!.winner).toBe(true);
            expect(item!.alternative).toMatch(new RegExp(`^The winner “${item!.car!.name}” `));
        }
    });
});
