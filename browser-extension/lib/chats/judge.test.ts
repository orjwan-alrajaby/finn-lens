import { describe, expect, it } from "vitest";

import { priorityWeights, totalFor } from "@/lib/reasoning-engine/scoring";
import { BASELINE, GARAGE, garageCar } from "@/lib/reasoning-engine/test-garage";
import { EVIDENCE } from "@/lib/lens-chat/evidence";
import { tellFitStory } from "@/lib/lens-chat/fit-story";
import { applyChoices, guideSteps } from "@/lib/lens-chat/guide";
import { EMPTY_UNDERSTANDING, withBudget, withRental, withSuggestion, type Understanding } from "@/lib/lens-chat/understanding";
import type { PinnedFinnCar } from "@/lib/types";

import { applyFollowUp, FOLLOW_UPS, WORTH_A_LOOK } from "./follow-ups";
import { BASE_ANSWERS, chatAnswers, judgementFrom, judgeWith, resultMessage } from "./judge";

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

describe("counting only what the reader asked for", () => {
    const life = () => guideSteps([]).find((step) => step.id === "life")!;
    const picked = (...ids: string[]) => applyChoices(EMPTY_UNDERSTANDING, life(), ids);

    /** Every piece of a need's equipment, other than a rule's, is raised in a ranked priority. */
    const everythingCounts = (u: Understanding) => {
        const { answers } = chatAnswers(u);

        for (const need of u.needs) {
            for (const entry of need.evidence) {
                const home = EVIDENCE[entry.id].scoredIn;
                if (!home || entry.unwanted) continue;

                expect(answers.priorities, `${need.label}: ${entry.id}`).toContain(home);
                expect(answers.features[home].map((item) => item.key), `${need.label}: ${entry.id}`).toContain(entry.id);
            }
        }
    };

    it("ranks a need on the priorities its equipment is scored in, and no others", () => {
        /* Kids in the back used to name Safety, which holds none of its equipment, and miss Comfort, which holds its rear USB ports. */
        const { answers } = chatAnswers(picked("kids"));

        expect(answers.priorities).toContain("practicality");
        expect(answers.priorities).toContain("comfort");
        expect(answers.priorities).not.toContain("safetyAssistance");
    });

    it("counts every piece of equipment of every need, follow-up and offer", () => {
        for (const choice of life().choices) {
            const u = picked(choice.id);
            everythingCounts(u);

            const followUp = FOLLOW_UPS[choice.id];
            for (const option of followUp?.choices ?? []) everythingCounts(applyFollowUp(u, followUp!, [option.id]));

            for (const offer of WORTH_A_LOOK[choice.id] ?? []) everythingCounts(withSuggestion(u, offer.id, offer.why, `life-${choice.id}`));
        }
    });

    it("brings Long Distance Travel, and its range limit, only to needs about distance", () => {
        const aboutDistance = new Set(["commute", "motorway", "roadtrips"]);

        for (const choice of life().choices.filter((item) => !aboutDistance.has(item.id))) {
            const u = picked(choice.id);
            const followUp = FOLLOW_UPS[choice.id];
            const variants = [
                u,
                ...(followUp?.choices ?? []).map((option) => applyFollowUp(u, followUp!, [option.id])),
                ...(WORTH_A_LOOK[choice.id] ?? []).map((offer) => withSuggestion(u, offer.id, offer.why, `life-${choice.id}`)),
            ];

            for (const variant of variants) {
                expect(chatAnswers(variant).answers.priorities, choice.id).not.toContain("longDistance");
            }
        }
    });

    it("keeps every priority a reader's needs reach, past the five a settings screen allows", () => {
        const u = picked(...life().choices.map((choice) => choice.id));

        everythingCounts(u);
        expect(chatAnswers(u).answers.priorities.length).toBeGreaterThan(5);
    });

    it("keeps every accepted item, past the five a settings screen allows", () => {
        const winter = FOLLOW_UPS.winter!;
        let u = applyFollowUp(picked("winter"), winter, ["snow"]);
        u = withSuggestion(u, "hasHeatPump", "", "life-winter");
        u = withSuggestion(u, "hasHeadlightCleaningSystem", "", "life-winter");

        expect(chatAnswers(u).answers.features.climateSuitability.length).toBeGreaterThan(5);
        everythingCounts(u);
    });

    it("never moves a score for equipment nobody asked about", () => {
        const plain = garageCar({ id: 901, name: "Plain" });
        const loaded = garageCar({ id: 902, name: "Loaded", extra: ["hasBlindSpotAssist", "hasMatrixLedHeadlights", "hasPremiumSoundSystem", "hasSunroof"] });
        const { run } = judgeWith(picked("kids"), [plain, loaded], "2 cars")!;

        expect(totalFor(run.recommendation.scores, 901)).toBe(totalFor(run.recommendation.scores, 902));
    });

    it("counts a standard item the reader named, like ISOFIX for kids", () => {
        const withIsofix = garageCar({ id: 903, name: "With ISOFIX" });
        const without = garageCar({ id: 904, name: "Without ISOFIX", features: BASELINE.filter((key) => key !== "hasIsofix") });
        const { run } = judgeWith(picked("kids"), [withIsofix, without], "2 cars")!;

        expect(totalFor(run.recommendation.scores, 903)).toBeGreaterThan(totalFor(run.recommendation.scores, 904));
    });

    it("doesn't raise a rule's own equipment: every car left already has it", () => {
        const u = ruled("must-tow");
        const { answers } = chatAnswers(u);

        expect(Object.values(answers.features).flat().map((item) => item.key)).not.toContain("hasTowbar");
    });

    it("doesn't score a rule's equipment when another need names it too", () => {
        /* A commute counts an automatic gearbox; with "automatic only" as well, every car left has one. */
        const u = applyChoices(picked("commute"), guideSteps([]).find((step) => step.id === "rules")!, ["automatic"]);
        const { answers } = chatAnswers(u);

        expect(Object.values(answers.features).flat().map((item) => item.key)).not.toContain("hasAutomaticTransmission");
        expect(answers.priorities).not.toContain("cityParking");
    });
});

describe("the rules, in the story", () => {
    it("says what a car has or is once, where the rule is, and not again as a need", () => {
        const towing = garageCar({ id: 911, name: "Tows", extra: ["hasTowbar"], transmission: "Automatic" });
        const plain = garageCar({ id: 912, name: "Plain", transmission: "Manual" });
        const rules = guideSteps([towing, plain]).find((step) => step.id === "rules")!;
        const u = applyChoices(EMPTY_UNDERSTANDING, rules, ["must-tow", "automatic"]);
        const { run, translation } = judgeWith(u, [towing, plain], "2 cars")!;
        const story = tellFitStory(run, u, translation.lessRelevant, null);
        const titles = story.sections.map((section) => section.title);

        expect(titles).toContain("It is an automatic and has a towbar");
        expect(titles.filter((title) => /towbar|automatic/i.test(title))).toHaveLength(1);
    });
});

describe("the rental period, in the story", () => {
    it("says plainly when a car can't be rented for the dates, and 'may not' only when FINN can't tell", () => {
        const term = { months: 6, privateMonthly: 400, businessMonthly: 340, deliveryFrom: "2026-09-25", deliveryTo: "2026-12-31", deviationWeeks: 1 };
        const short = { ...garageCar({ id: 921, name: "Six Months Only" }), contract: { terms: [term], defaultMonths: null } };
        const u = withRental(EMPTY_UNDERSTANDING, "2026-10", "2027-09", "a year from October");
        const { run, translation } = judgeWith(u, [short], "1 car")!;
        const titles = tellFitStory(run, u, translation.lessRelevant, null).sections.map((section) => section.title);

        expect(titles).toContain("It can't be rented for October 2026 to September 2027");
        expect(titles.join(" ")).not.toMatch(/may not work/);
    });
});

describe("what the band was worked out from", () => {
    it("names the CO₂ figure, not a list, for a reader who asked about emissions alone", () => {
        const u = applyChoices(EMPTY_UNDERSTANDING, guideSteps([]).find((step) => step.id === "life")!, ["emissions"]);
        const { run, translation } = judgeWith(u, cars(), "5 cars")!;
        const { bandMeaning } = tellFitStory(run, u, translation.lessRelevant, null);

        expect(bandMeaning).toMatch(/the CO₂ figure FINN lists for it/);
        expect(bandMeaning).not.toMatch(/things you asked for|weighted/);
    });
});

describe("how much each need counts", () => {
    const life = () => guideSteps([]).find((step) => step.id === "life")!;
    const picked = (...ids: string[]) => applyChoices(EMPTY_UNDERSTANDING, life(), ids);
    const shares = (u: Understanding) => chatAnswers(u).answers.preferences.priorityShares!;

    it("weighs one need's equipment the same wherever it is scored, not by the order of its priorities", () => {
        /* Two needs of equal importance, one priority each: an even split, not 2:1. */
        const { answers } = chatAnswers(picked("dog", "tech"));
        const weights = priorityWeights(answers.priorities, answers.preferences.priorityShares);

        expect(weights.map((item) => item.weightPercent)).toEqual([50, 50]);
    });

    it("counts a need by its importance, however many items Lens checks for it", () => {
        /* Kids (five items) and emissions (one figure), both important: equal shares. */
        const split = shares(picked("kids", "emissions"));
        const kids = (split.practicality ?? 0) + (split.comfort ?? 0);

        expect(kids).toBeCloseTo(split.environmental!, 5);
    });

    it("never claims the reader ranked priorities they only reached through their needs", () => {
        const { run } = judgeWith(picked("kids", "city"), cars(), "5 cars")!;

        expect(run.narrative.verdict.reasons.join(" ")).not.toMatch(/You put|your #/);
        expect(run.narrative.tradeoffs.map((item) => item.sentences.join(" ")).join(" ")).not.toMatch(/your #\d|you ranked/);
    });
});
