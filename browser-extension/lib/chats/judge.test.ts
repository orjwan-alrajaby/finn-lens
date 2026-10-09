import { describe, expect, it } from "vitest";

import { priorityWeights, totalFor } from "@/lib/reasoning-engine/scoring";
import { BASELINE, GARAGE, garageCar } from "@/lib/reasoning-engine/test-garage";
import { EVIDENCE } from "@/lib/lens-chat/evidence";
import { tellFitStory } from "@/lib/lens-chat/fit-story";
import { whyNot } from "@/lib/lens-chat/why-not";
import { parkingContext, widthContext } from "@/lib/lens-chat/dimensions";
import { applyChoices, guideSteps } from "@/lib/lens-chat/guide";
import { EMPTY_UNDERSTANDING, withBudget, withRental, withSuggestion, type Understanding } from "@/lib/lens-chat/understanding";
import type { PinnedFinnCar } from "@/lib/types";

import { applyFollowUp, FOLLOW_UPS, WORTH_A_LOOK } from "./follow-ups";
import { BASE_ANSWERS, chatAnswers, judgementAt, judgementFrom, judgeWith, resultMessage, whyLines, withJudgement } from "./judge";
import { withBubbles } from "@/lib/lens-chat/bubbles";
import { withDeals } from "@/lib/lens-chat/deals";
import { readEvidence } from "@/lib/lens-chat/evidence";
import { rentalFor } from "./flow";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

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

    it("names the car its one thing to know is about, so the reader can find it on the page", () => {
        const page = fleet().slice(0, 24);
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"], environment: ["moderate"] }), 700, "Up to €700 a month.");
        const result = judgeWith(u, page, "24 cars")!;
        const message = resultMessage(result, page, "24 cars", {}, "m1", "at", u);
        const [tradeoff] = result.run.narrative.tradeoffs;

        expect(tradeoff?.rival).toBeTruthy();
        expect(message.know).toContain(tradeoff!.rival!.name);
        expect(message.knowCar).toEqual({ id: tradeoff!.rival!.vehicleId, name: tradeoff!.rival!.name });
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
        const u = applyChoices(EMPTY_UNDERSTANDING, guideSteps([]).find((step) => step.id === "life")!, ["co2-matters"]);
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
        const split = shares(picked("kids", "co2-matters"));
        const kids = (split.practicality ?? 0) + (split.comfort ?? 0);

        expect(kids).toBeCloseTo(split.environmental!, 5);
    });

    it("never claims the reader ranked priorities they only reached through their needs", () => {
        const { run } = judgeWith(picked("kids", "city"), cars(), "5 cars")!;

        expect(run.narrative.verdict.reasons.join(" ")).not.toMatch(/You put|your #/);
        expect(run.narrative.tradeoffs.map((item) => item.sentences.join(" ")).join(" ")).not.toMatch(/your #\d|you ranked/);
    });
});

describe("how much a need counts", () => {
    it("doubles with each step on the reader's own scale", async () => {
        const { NEED_WEIGHT } = await import("@/lib/lens-chat/understanding");

        expect(NEED_WEIGHT.essential / NEED_WEIGHT.important).toBe(2);
        expect(NEED_WEIGHT.important / NEED_WEIGHT.niceToHave).toBe(2);
    });
});

describe("earlier results", () => {
    const judged = (budget: number) => {
        const u = withBudget(applyChoices(EMPTY_UNDERSTANDING, guideSteps([]).find((step) => step.id === "life")!, ["kids"]), budget, "");
        return judgeWith(u, cars(), "5 cars")!;
    };
    const blank = { id: "c", title: "", createdAt: "", updatedAt: "", messages: [], understanding: EMPTY_UNDERSTANDING, queue: [], phase: "judged" as const, kept: null, revising: false, judgement: null };

    it("tags each result with the judgement it came from", () => {
        const first = judged(900);

        expect(resultMessage(first, cars(), "5 cars", {}, "m1", "2026-09-30T10:00:00Z").judgement).toBe("2026-09-30T10:00:00Z");
    });

    it("keeps the judgement a new one replaces, and finds either again", () => {
        const one = judgementFrom(judged(900), cars(), EMPTY_UNDERSTANDING, "5 cars", "", {}, "first");
        const two = judgementFrom(judged(400), cars(), EMPTY_UNDERSTANDING, "5 cars", "", {}, "second");
        const chat = withJudgement(withJudgement(blank, one), two);

        expect(chat.judgement?.at).toBe("second");
        expect(chat.earlier?.map((item) => item.at)).toEqual(["first"]);
        expect(judgementAt(chat, "first")).toEqual({ judgement: one, latest: false });
        expect(judgementAt(chat, "second")).toEqual({ judgement: two, latest: true });
        /* A result from before results were tagged, or one whose judgement is gone, opens on the latest. */
        expect(judgementAt(chat, null)).toEqual({ judgement: two, latest: true });
        expect(judgementAt(chat, "gone")).toEqual({ judgement: two, latest: true });
    });
});

describe("why, in the reader's words", () => {
    const page = fleet().slice(0, 24);
    const u = withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"], environment: ["bonus"] });

    it("says what the pick has for each bubble, the strongest first, and only what it has", () => {
        const judged = judgeWith(u, page, "24 cars")!;
        const winner = page.find((car) => car.id === judged.run.recommendation.winner.id)!;
        const lines = whyLines(winner, u);

        expect(lines[0]?.said).toBe("You have kids");
        for (const line of lines) expect(line.has.length).toBeGreaterThan(0);
        for (const line of lines.filter((item) => item.said === "You have kids")) expect(line.has).toEqual(readEvidence(winner, "rearDoors") === "listed" ? ["rear doors"] : []);
        expect(lines.find((line) => line.said === "You care about the environment")?.has[0]).toMatch(/g\/km · Class [A-G]/);
    });

    it("goes into the result with every reason and the trade-offs — how each thing was weighed is the drawer's", () => {
        const judged = judgeWith(u, page, "24 cars")!;
        const message = resultMessage(judged, page, "24 cars", {}, "m1", "at", u);

        expect(message.reasons?.[0]).toBe(message.reason);
        expect(message.tradeoffs?.length).toBe(judged.run.narrative.tradeoffs.length);
        expect(message).not.toHaveProperty("because");
    });

    it("says one thing to know: a limit first, else the biggest trade-off — never the engine's uncertainty first", () => {
        const judged = judgeWith(u, page, "24 cars")!;
        const { verdict, tradeoffs } = judged.run.narrative;
        const message = resultMessage(judged, page, "24 cars", {}, "m1", "at", u);

        if (verdict.budgetNote) expect(message.know).toBe(verdict.budgetNote);
        else if (tradeoffs[0]) expect(message.know?.startsWith(`${tradeoffs[0].headline}.`)).toBe(true);
        expect(tradeoffs.length + (verdict.budgetNote ? 1 : 0)).toBeGreaterThan(0);
    });
});

describe("a result past the reader's dates", () => {
    /* FINN's snapshot offers these cars on short terms only: two years fits none of them. */
    const page = fleet().slice(0, 24);
    const twoYears = rentalFor(withDeals(withBubbles(EMPTY_UNDERSTANDING, { carry: ["trailer"] }), ["towbar"], { towbar: "must" }), 24, "", new Date("2026-10-07T10:00:00Z"));

    it("says no car here fits them, first, and calls the pick the closest match", () => {
        const judged = judgeWith(twoYears, page, "24 cars")!;
        const message = resultMessage(judged, page, "24 cars", {}, "m1", "at", twoYears);

        expect(judged.run.recommendation.rentalFallback).toBe("noneFit");
        expect(message.know).toMatch(/^None of the cars here fits your dates — .+ only offers terms up to \d+ months, which doesn't cover November 2026 to October 2028\. It's the best fit for everything else you told me\.$/);
        expect(message.closest).toBe(true);
    });

    it("says which limit each runner-up is past", () => {
        const judged = judgeWith(twoYears, page, "24 cars")!;
        const message = resultMessage(judged, page, "24 cars", {}, "m1", "at", twoYears);

        for (const car of message.runnersUp) expect(car.over ?? null, car.name).toBe(car.overLimit ? (car.over === "budget" ? "budget" : "period") : null);
        expect(message.runnersUp.some((car) => car.over === "period")).toBe(true);
    });

    it("isn't the closest match when every limit holds", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"] });
        const judged = judgeWith(u, page, "24 cars")!;

        expect(resultMessage(judged, page, "24 cars", {}, "m1", "at", u).closest).toBeUndefined();
    });
});

describe("a result with nothing within the budget", () => {
    it("writes the price it looked up to as money", () => {
        const page = fleet();
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { weather: ["snow"] }), 150, "");
        const judged = judgeWith(u, page, "728 cars")!;
        const message = resultMessage(judged, page, "728 cars", {}, "m1", "at", u);

        expect(judged.run.nearestToLimit).not.toBeNull();
        expect(message.know).toMatch(/up to about €\d{1,3}(,\d{3})* a month\.$/);
        expect(message.closest).toBe(true);
    });
});

describe("the drawer's story about a car that isn't the pick", () => {
    /* A page where the pick is within €700 and cars that score higher aren't. */
    const page = fleet().slice(144, 168);
    const u = withDeals(withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["older"], weather: ["snow"] }), 700, "Up to €700 a month."), ["automatic", "awd", "co2"], {
        automatic: "seal",
        awd: "must",
        co2: "seal",
    });
    const judged = judgeWith(u, page, "24 cars")!;
    const { run, translation } = judged;
    const pick = run.recommendation.winner;
    /* One whose cost FINN's data gives in full, so the story can say "about". */
    const over = run.recommendation.ranked.find(
        (car) => car.id !== pick.id && run.recommendation.context.costs[car.id]?.budgetStatus === "over" && run.recommendation.context.costs[car.id]?.complete,
    )!;

    it("says it's over the limit — not that nothing here fits, when the pick does", () => {
        expect(run.recommendation.context.costs[pick.id]?.budgetStatus).toBe("within");

        const story = tellFitStory(run, u, translation.lessRelevant, null, over.id);
        const budget = story.sections.find((section) => section.key === "budget")!;

        expect(budget.title).toBe("It's over your €700 limit");
        expect(budget.lines[0]!.text).toMatch(/^At about €[\d,]+\/month, it's €[\d,]+ over the maximum you gave me\.$/);
        expect(JSON.stringify(story)).not.toMatch(/Nothing here stays within|This is the closest match/);
    });

    it("doesn't say the pick covers more, when this one scored higher and lost on the limit", () => {
        const higher = run.recommendation.ranked.find((car) => car.id !== pick.id && totalFor(run.recommendation.scores, car.id) > totalFor(run.recommendation.scores, pick.id))!;
        const sentences = whyNot(run, higher.id)!.sentences.join(" ");

        expect(sentences).toMatch(/over the €700 you gave me, so it couldn't win whatever it carries/);
        expect(sentences).not.toMatch(/simply covers a little more/);
    });

    it("names a deal-sealer as the thing itself, with its article", () => {
        const story = tellFitStory(run, u, translation.lessRelevant, null, pick.id);
        const sealer = story.sections.find((section) => section.key === "sealer-automatic")!;

        expect(sealer.title).toBe("It has an automatic");
        expect(sealer.short).toBe("An automatic gearbox would seal it");
        expect(JSON.stringify(story)).not.toMatch(/the basics for an automatic|It has automatic gearbox/);
    });
});

describe("what the pick gives up, in a chat", () => {
    const page = fleet().slice(0, 24);
    const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { city: ["open"], comfort: ["keyless", "sound"] }), 500, "Up to €500 a month.");
    const { run } = judgeWith(u, page, "24 cars")!;
    const { context } = run.recommendation;

    it("names an alternative only where the reader could take it", () => {
        for (const tradeoff of run.narrative.tradeoffs) {
            if (!tradeoff.rival) continue;
            const cost = context.costs[tradeoff.rival.vehicleId];
            expect(cost?.budgetStatus, tradeoff.headline).not.toBe("over");
            expect(cost?.contract.status, tradeoff.headline).not.toBe("doesNotFit");
        }
    });

    it("says why it matters in what the reader asked for, never an engine category or a ranking they didn't give", () => {
        const said = run.narrative.tradeoffs.map((tradeoff) => tradeoff.relevance).join(" ");

        expect(run.narrative.tradeoffs.length).toBeGreaterThan(0);
        expect(said).not.toMatch(/raised it under|You ranked|your #\d/);
    });
});

describe("a car's size beside a parking bay", () => {
    it("is arithmetic against a bay to picture — not a typical one, and nothing about the mirrors FINN doesn't say", () => {
        const car = fleet()[0]!;
        const said = [parkingContext(car), widthContext(car)].join(" ");

        expect(said).toMatch(/m (shorter|longer) than a 5 m parking bay|a few centimetres of a 5 m parking bay/);
        expect(said).toMatch(/by FINN's width$/);
        expect(said).not.toMatch(/typical|before the mirrors/);
    });
});

describe("why, for a figure", () => {
    it("names a car's CO₂ or fuel use only where it's something it got right", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { environment: ["moderate"], budget: [] });
        const thirsty = fleet().find((car) => readEvidence(car, "lowCo2") === "notListed" && readEvidence(car, "frugal") === "notListed")!;
        const clean = fleet().find((car) => readEvidence(car, "lowCo2") === "listed" && car.fuelType !== "Electric")!;

        expect(whyLines(thirsty, u)).toEqual([]);
        expect(whyLines(clean, u).find((line) => line.said === "You care about the environment")?.has[0]).toMatch(/g\/km · Class [A-C]/);
    });
});

describe("the pick's chip", () => {
    const page = fleet().slice(0, 24);

    it("is the closest match when no car fits the dates, as the chat and the drawer say", () => {
        const u = rentalFor(withDeals(withBubbles(EMPTY_UNDERSTANDING, { carry: ["trailer"] }), ["towbar"], { towbar: "must" }), 24, "", new Date("2026-10-07T10:00:00Z"));
        const judged = judgeWith(u, page, "24 cars")!;
        const verdicts = judgementFrom(judged, page, u, "24 cars", "", {}, "at").verdicts;

        expect(verdicts[judged.run.recommendation.winner.id]?.closest).toBe(true);
        expect(Object.values(verdicts).filter((verdict) => verdict.closest)).toHaveLength(1);
    });

    it("is the best for you when every limit holds", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"] });
        const judged = judgeWith(u, page, "24 cars")!;

        expect(judgementFrom(judged, page, u, "24 cars", "", {}, "at").verdicts[judged.run.recommendation.winner.id]?.closest).toBeUndefined();
    });
});
