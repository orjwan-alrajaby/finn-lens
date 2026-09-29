import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { applyChoices, guideSteps } from "@/lib/lens-chat/guide";
import { EMPTY_UNDERSTANDING, withBudget, type Understanding } from "@/lib/lens-chat/understanding";
import type { PinnedFinnCar } from "@/lib/types";

import { BASE_ANSWERS, judgementFrom, judgeWith, resultMessage } from "./judge";

/*
 * A chat's judgement, and the chips it puts on FINN's cards. One run feeds
 * both, so the chat's pick and the gold chip are always the same car.
 */

const cars = (): PinnedFinnCar[] => [
    GARAGE.safeCompact(),
    GARAGE.familySuv(),
    GARAGE.cityHatch(),
    GARAGE.longRangeEv(),
    GARAGE.thirstyPetrol(),
];

const judged = (u: Understanding) => judgeWith(u, cars(), "5 cars on this page")!;

const ruled = (id: string): Understanding => {
    const step = guideSteps(cars()).find((item) => item.id === "rules")!;
    return applyChoices(EMPTY_UNDERSTANDING, step, [id]);
};

describe("judging", () => {
    it("starts from no budget: a limit the reader never gave sets nothing aside", () => {
        expect(BASE_ANSWERS.preferences.monthlyBudget).toBe(0);

        const { run } = judged(EMPTY_UNDERSTANDING);
        expect(run.recommendation.isFallback).toBe(false);
    });

    it("gives every car a verdict, and exactly one car the trophy — the chat's pick", () => {
        const result = judged(EMPTY_UNDERSTANDING);
        const judgement = judgementFrom(result, cars(), EMPTY_UNDERSTANDING, "5 cars on this page", "https://www.finn.com/de-DE/subscribe", {}, "2026-09-29T10:00:00Z");

        expect(Object.keys(judgement.verdicts).map(Number).sort()).toEqual(cars().map((car) => car.id).sort());

        const winners = Object.entries(judgement.verdicts).filter(([, verdict]) => verdict.winner);
        expect(winners).toHaveLength(1);
        expect(Number(winners[0]![0])).toBe(judgement.winnerId);
        expect(winners[0]![1].rank).toBe(1);

        const ranks = Object.values(judgement.verdicts).map((verdict) => verdict.rank).sort();
        expect(ranks).toEqual([1, 2, 3, 4, 5]);
    });

    it("sets aside what the reader ruled out, and says why on the chip", () => {
        const u = ruled("electric-only");
        const judgement = judgementFrom(judged(u), cars(), u, "", "", {}, "");
        const petrol = judgement.verdicts[GARAGE.thirstyPetrol().id]!;

        expect(petrol.rank).toBeNull();
        expect(petrol.winner).toBe(false);
        expect(petrol.label).toBe("Ruled out");
        expect(petrol.setAside).toBe("You asked for an electric car only");
        expect(judgement.verdicts[judgement.winnerId!]?.setAside).toBeNull();
    });

    it("says on the chip when a ranked car is over the reader's limit", () => {
        const u = withBudget(EMPTY_UNDERSTANDING, 1, "a euro");
        const judgement = judgementFrom(judged(u), cars(), u, "", "", {}, "");
        const ranked = Object.values(judgement.verdicts).filter((verdict) => verdict.rank != null);

        expect(ranked.length).toBeGreaterThan(0);
        expect(ranked.every((verdict) => verdict.over === "budget")).toBe(true);
    });

    it("says in the chat which car won, and names the ones closest behind it", () => {
        const u = withBudget(EMPTY_UNDERSTANDING, 2000, "up to 2000");
        const result = judged(u);
        const message = resultMessage(result, cars(), "5 cars on this page", { [result.run.recommendation.winner.id]: "https://www.finn.com/x" }, "m1", "at");

        expect(message.winner?.id).toBe(result.run.recommendation.winner.id);
        expect(message.winner?.url).toBe("https://www.finn.com/x");
        expect(message.runnersUp.length).toBeGreaterThan(0);
        expect(message.runnersUp.map((car) => car.id)).not.toContain(message.winner?.id);
        expect(message.count).toBe(5);
    });

    it("comes out the same every time, so the drawer can re-run what the chat judged", () => {
        const first = judgementFrom(judged(EMPTY_UNDERSTANDING), cars(), EMPTY_UNDERSTANDING, "", "", {}, "");
        const again = judgementFrom(judged(EMPTY_UNDERSTANDING), cars(), EMPTY_UNDERSTANDING, "", "", {}, "");

        expect(again.verdicts).toEqual(first.verdicts);
    });
});
