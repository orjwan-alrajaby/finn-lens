import { describe, expect, it } from "vitest";

import { copyFeatures, type Answers } from "@/lib/reasoning-engine/answers";
import type { WireNeed, WireUnderstanding } from "@/lib/lens-ai/contract";
import {
    DEFAULT_CATEGORY_FEATURES,
    DEFAULT_PREFERENCES,
    DEFAULT_PRIORITIES,
} from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import type { PinnedFinnCar } from "@/lib/types";

import { evidenceForNeeds, tellFitStory } from "./fit-story";
import { matchSentence } from "./plain";
import { runLens } from "./run";
import { carNamed, whyNot } from "./why-not";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import { bootLitres } from "@/lib/reasoning-engine/evidence";
import { EMPTY_UNDERSTANDING, groundInWhatWasSaid, readQuestion, readUnderstanding, ruledOut, toAnswers, waiveEssential } from "./understanding";

/*
 * What the second round of real conversations showed Lens getting wrong,
 * held here so it stays fixed. Each case is a reading a live model actually
 * produced, cut down to the part that went wrong.
 */

const base = (): Answers => ({
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
});

/* A finn.com page's worth of FINN's real fleet, spread across price and body. */
const all = fleet().sort((a, b) => a.id - b.id);
const cars: PinnedFinnCar[] = Array.from({ length: 48 }, (_, index) => all[Math.floor((index * all.length) / 48)]!);

const need = (overrides: Partial<WireNeed>): WireNeed => ({
    id: "need",
    label: "A need",
    importance: "important",
    said: "",
    priorities: [],
    evidence: [],
    notInData: null,
    status: "active",
    ...overrides,
});

const wire = (overrides: Partial<WireUnderstanding>): WireUnderstanding => ({
    budget: null,
    rental: null,
    monthlyKm: null,
    needs: [],
    context: [],
    capabilities: [],
    droppedPriorities: [],
    tension: "",
    notModelled: [],
    cleared: [],
    ...overrides,
});

function compare(reading: WireUnderstanding, page = cars) {
    const understanding = waiveEssential(readUnderstanding(reading, EMPTY_UNDERSTANDING, undefined, "2026-09"), "rental");
    const translation = toAnswers(base(), understanding);
    const run = runLens(page, translation.answers, "page", "Comparing cars on this page", ruledOut(understanding))!;

    return { understanding, translation, run, story: tellFitStory(run, understanding, translation.lessRelevant, null) };
}

describe("what the reader wants absent", () => {
    const threeKids = wire({
        needs: [
            need({
                id: "five-not-seven",
                label: "Seating five without a massive car",
                importance: "essential",
                priorities: ["practicality"],
                evidence: [
                    { id: "seatsFivePlus", use: "", mustHave: true },
                    { id: "seatsSixPlus", use: "", unwanted: true },
                ],
            }),
        ],
    });

    it("is never raised as a feature for the engine to reward", () => {
        const { translation } = compare(threeKids);

        expect(translation.answers.features.practicality.map((item) => item.key)).not.toContain("seatsSixPlus");
    });

    it("isn't named as the catch when the car honours it", () => {
        const { story } = compare(threeKids);

        expect(story.catch?.text ?? "").not.toMatch(/fewer than six seats/i);
    });
});

describe("where a need puts its weight", () => {
    it("doesn't let one incidental sensor put an unrelated priority first", () => {
        const { translation } = compare(
            wire({
                needs: [
                    need({
                        id: "dark-roads",
                        label: "Confidence on dark unlit roads",
                        importance: "essential",
                        priorities: ["climateSuitability", "safetyAssistance"],
                        evidence: [
                            { id: "hasMatrixLedHeadlights", use: "keeps more of the road lit" },
                            { id: "hasRainSlashLightSensors", use: "switches the lights on when it gets dark" },
                        ],
                    }),
                    need({
                        id: "beside",
                        label: "Cars appearing beside you",
                        priorities: ["safetyAssistance"],
                        evidence: [{ id: "hasBlindSpotAssist", use: "warns you about a car you can't see" }],
                    }),
                ],
            }),
        );

        expect(translation.order[0]?.id).toBe("safetyAssistance");
    });
});

describe("FINN's boot figure", () => {
    const luggage = wire({
        needs: [
            need({
                id: "luggage",
                label: "Space for weekend luggage",
                priorities: ["practicality"],
                evidence: [{ id: "bootVolume", use: "holds the weekend bags" }],
            }),
        ],
    });

    it("is quoted, but never read as the car meeting a need for space", () => {
        /* The biggest figure on the page: the one likeliest to be read as room, when it may be seats folded. */
        const roomiest = [...cars].filter((car) => bootLitres(car)).sort((a, b) => bootLitres(b)! - bootLitres(a)!)[0]!;
        const { story } = compare(luggage, [roomiest]);
        const section = story.sections.find((item) => item.key === "luggage")!;

        expect(section.lines[0]?.text).toMatch(new RegExp(`${Math.round(bootLitres(roomiest)!)} L boot.*seats up or folded`));
        expect(section.lines[0]?.tone).toBe("note");
        expect(section.tone).not.toBe("good");
    });

    it("reaches the model as the figure, not as 'listed'", () => {
        const { run, understanding } = compare(luggage);
        const rows = evidenceForNeeds(run, understanding)!;

        expect(rows.every((row) => row.evidence["Boot space"] !== "listed")).toBe(true);
    });
});

describe("a measured figure that falls short", () => {
    it("is quoted in the catch, not called unlisted", () => {
        const electric = cars.filter((car) => car.fuelType === "Electric");
        const { story } = compare(
            wire({
                needs: [
                    need({
                        id: "trips",
                        label: "Regular 300 km family visits",
                        priorities: ["longDistance"],
                        evidence: [{ id: "electricRange", use: "covers the trip with fewer stops" }],
                    }),
                ],
            }),
            electric,
        );

        expect(story.catch?.text ?? "").not.toMatch(/doesn't list electric range/);
    });
});

describe("equipment nearly every car has", () => {
    it("is said once, as not setting the car apart", () => {
        const { story } = compare(
            wire({
                needs: [
                    need({
                        id: "safety",
                        label: "Helpful safety systems",
                        priorities: ["safetyAssistance"],
                        evidence: [
                            { id: "hasEmergencyBrakingAssist", use: "brakes if you don't" },
                            { id: "hasLaneKeepingAssist", use: "nudges you back into lane" },
                            { id: "hasBlindSpotAssist", use: "warns you about a car beside you" },
                        ],
                    }),
                ],
            }),
        );
        const lines = story.sections.find((item) => item.key === "safety")!.lines.map((line) => line.text);

        expect(lines.some((line) => /so does nearly every car here/.test(line))).toBe(true);
        expect(lines.filter((line) => /emergency braking/i.test(line))).toHaveLength(1);
    });
});

describe("a question worth holding the comparison for", () => {
    it("isn't asked when everything it turns on is on nearly every car", () => {
        const question = readQuestion(
            {
                ask: "Would you like a car that steers itself into parallel spaces, or are sensors and a camera enough?",
                why: "",
                options: ["Self-steering", "Sensors are fine", "I don't mind"],
                affects: ["hasParkingAssistant", "hasOneEightyDegreesReversingCamera", "hasParkingSensors"],
            },
            [],
            cars,
        );

        expect(question).toBeNull();
    });
});

describe("a figure they aimed at, rather than a limit", () => {
    it("says a car a little above it is a little above it — not that nothing fits", () => {
        const { story, run } = compare(
            wire({
                budget: { kind: "target", monthly: 450, said: "around 450" },
                needs: [need({ id: "parking", label: "Easy parking", priorities: ["cityParking"], evidence: [{ id: "compactLength", use: "fits more spaces" }] })],
            }),
        );
        const monthly = run.recommendation.context.costs[run.recommendation.winner.id]!.totalMonthly;

        if (monthly > 450 && monthly <= 518) {
            expect(story.eyebrow).toBe("Best match");
            expect(matchSentence(story)).toMatch(monthly <= 495 ? /a little above the figure you aimed for/ : /— above the figure you aimed for/);
        } else {
            expect(matchSentence(story)).not.toMatch(/not what you wanted to spend/);
        }
    });
});

describe("what Lens says back about their life", () => {
    it("reads their own sentence instead of a heading like 'Commute distance'", () => {
        const understanding = readUnderstanding(
            wire({ context: [{ label: "Commute distance", said: "60 km each way, four days a week" }] }),
            EMPTY_UNDERSTANDING,
        );

        expect(understanding.context[0]?.label).toBe("60 km each way, four days a week");
    });
});

describe("a limit the reader set, across a turn about something else", () => {
    const first = readUnderstanding(
        wire({ budget: { kind: "target", monthly: 500, said: "probably around 500 euros a month" } }),
        EMPTY_UNDERSTANDING,
        undefined,
        "2026-09",
        "I'd like something efficient and comfortable, probably around 500 euros a month.",
    );
    const firm = readUnderstanding(
        wire({ budget: { kind: "hardMax", monthly: 500, said: "500 is still the absolute maximum" } }),
        first,
        undefined,
        "2026-09",
        "And actually don't increase the budget for that. 500 is still the absolute maximum.",
    );

    it("turns a target into a maximum when they say so", () => {
        expect(firm.budget).toMatchObject({ kind: "hardMax", monthly: 500 });
    });

    it("stays a maximum when a later turn about their mother re-reads it as soft", () => {
        const later = readUnderstanding(
            wire({ budget: { kind: "target", monthly: 550, said: "around 500" } }),
            firm,
            undefined,
            "2026-09",
            "Actually, I don't mind a bigger car anymore.",
        );

        expect(later.budget).toMatchObject({ kind: "hardMax", monthly: 500 });
    });

    it("still changes when they do talk about money", () => {
        const later = readUnderstanding(wire({ budget: { kind: "hardMax", monthly: 450, said: "450 max" } }), firm, undefined, "2026-09", "Make that 450 at most.");

        expect(later.budget).toMatchObject({ kind: "hardMax", monthly: 450 });
    });
});

describe("when nothing stays within a hard maximum", () => {
    const commuter = wire({
        budget: { kind: "hardMax", monthly: 500, said: "500 is the absolute maximum" },
        monthlyKm: { value: 1540, said: "about 70 km a day" },
        needs: [need({ id: "motorway", label: "Motorway commuting", priorities: ["longDistance"], evidence: [{ id: "driverAssistLevel2", use: "keeps lane and distance" }] })],
    });

    it("recommends among the cars nearest the limit, not the best car at any price", () => {
        const { run, story } = compare(commuter);
        const costs = run.recommendation.context.costs;
        const cheapest = Math.min(...cars.map((car) => costs[car.id]?.totalMonthly ?? Infinity).filter(Number.isFinite));

        expect(run.recommendation.isFallback).toBe(true);
        expect(run.nearestToLimit).not.toBeNull();
        expect(costs[run.recommendation.winner.id]!.totalMonthly).toBeLessThanOrEqual(run.nearestToLimit!.upTo);
        expect(run.nearestToLimit!.cheapest).toBeGreaterThanOrEqual(Math.round(cheapest) - 1);

        const budget = story.sections.find((section) => section.key === "budget")!;

        expect(budget.lines.map((line) => line.text).join(" ")).toMatch(/not the best match at any price/);
        /* What the distance adds is said, whether FINN prices it as a mileage package or by the kilometre. */
        expect(budget.lines.map((line) => line.text).join(" ")).toMatch(
            /FINN's [\d,]+ km mileage package, which your distance needs|per-kilometre charge for the [\d,]+ km a month you drive beyond the 500 km it includes/,
        );
    });
});

describe("a question about a rare kind of car", () => {
    it("is still asked when the answer splits the field", () => {
        const question = readQuestion(
            {
                ask: "Should Lens look only at electric cars, or include petrol and hybrids too?",
                why: "Your partner wants electric, and you're worried about range.",
                options: ["Electric only", "Include all", "I don't mind"],
                affects: ["electricCar"],
            },
            [],
            cars,
        );

        expect(question).not.toBeNull();
    });
});

describe("what Lens says in reply", () => {
    it("drops its own bookkeeping when there's something better to say", () => {
        const { reply } = groundInWhatWasSaid(
            "Taking your mother to appointments means easy entry matters more than a tiny car. I've updated your needs to focus on passenger access.",
            EMPTY_UNDERSTANDING,
            [],
        );

        expect(reply).toBe("Taking your mother to appointments means easy entry matters more than a tiny car.");
    });
});

describe("numbers Lens can stand behind", () => {
    it("keeps FINN's allowance and a rounding of the mileage Lens worked out", () => {
        const understanding = readUnderstanding(wire({ monthlyKm: { value: 2064, said: "60 km each way, four days a week" } }), EMPTY_UNDERSTANDING);
        const { reply } = groundInWhatWasSaid(
            "Your 60 km commute raises your monthly mileage to around 2,100 km — well beyond FINN's included 500 km — so extra-mileage pricing will affect every car's total cost.",
            understanding,
            ["My new job will be about 60 km away though, and I'll probably be doing that commute four days a week."],
        );

        expect(reply).toMatch(/around 2,100 km/);
    });

    it("still drops a detail nobody gave", () => {
        const { reply } = groundInWhatWasSaid("Two kids aged 1 and 4 need room. You want safety.", EMPTY_UNDERSTANDING, ["I have two kids"]);

        expect(reply).toBe("You want safety.");
    });
});

describe("two cars Lens shows as the same match", () => {
    /* A page where several cars land on the same displayed total. */
    const run = () => {
        const understanding = waiveEssential(waiveEssential(EMPTY_UNDERSTANDING, "rental"), "budget");
        const translation = toAnswers(base(), understanding);

        return runLens(cars, translation.answers, "page", "Comparing cars on this page")!;
    };

    it("never ranks a dearer car above a cheaper one it can't tell apart", () => {
        const { recommendation } = run();
        const { scores, costs } = recommendation.context;
        const shown = (car: (typeof cars)[number]) => totalFor(scores, car.id);
        const priced = (car: (typeof cars)[number]) => (costs[car.id]?.complete ? costs[car.id]!.totalMonthly : null);

        for (const [index, car] of recommendation.ranked.entries()) {
            for (const later of recommendation.ranked.slice(index + 1)) {
                if (shown(car) !== shown(later)) continue;

                const mine = priced(car);
                const theirs = priced(later);

                /* Both fully costed and level on the number the reader sees: the cheaper comes first. */
                if (mine != null && theirs != null) expect(mine).toBeLessThanOrEqual(theirs);
            }
        }
    });

    it("says the price is why, when the pick is the cheapest of equals", () => {
        const result = run();

        if (result.level?.cheapest) {
            expect(result.level.others).toBeGreaterThan(0);
        } else {
            /* No car shares the pick's total here — then there is nothing to explain. */
            expect(result.level?.cheapest ?? false).toBe(false);
        }
    });
});

describe("why not that one", () => {
    const run = () => {
        const understanding = waiveEssential(waiveEssential(EMPTY_UNDERSTANDING, "rental"), "budget");

        return runLens(cars, toAnswers(base(), understanding).answers, "page", "Comparing cars on this page")!;
    };
    /* A car behind the match, and the only one on the page by its name, so naming it can only mean it. */
    const behind = (result: ReturnType<typeof run>) =>
        result.recommendation.ranked.find(
            (car) =>
                totalFor(result.recommendation.scores, car.id) < totalFor(result.recommendation.scores, result.recommendation.winner.id) &&
                cars.filter((item) => item.name === car.name).length === 1,
        )!;

    it("finds the car the reader named, and not the match", () => {
        const result = run();
        const other = behind(result);
        const found = carNamed(result, `Why didn't you choose the ${other.name}?`);

        expect(found?.id).toBe(other.id);
        expect(carNamed(result, "Why this car?")).toBeNull();
    });

    it("names both cars and says where the match is ahead", () => {
        const result = run();
        const other = behind(result);
        const answer = whyNot(result, other.id)!;
        const said = answer.sentences.join(" ");

        expect(said).toContain(answer.match);
        expect(said).toContain(answer.car);
        /* The engine's own summary says "this car"; an answer about two cars may not. */
        expect(said).not.toMatch(/\bthis car\b/i);
        expect(answer.sentences.length).toBeGreaterThan(1);
    });

    it("leads with the limit when that is what ruled the car out", () => {
        const understanding = waiveEssential(
            readUnderstanding(wire({ budget: { kind: "hardMax", monthly: 500, said: "€500 max" } }), EMPTY_UNDERSTANDING),
            "rental",
        );
        const translation = toAnswers(base(), understanding);
        const result = runLens(cars, translation.answers, "page", "Comparing cars on this page")!;
        const over = result.recommendation.ranked.find((car) => result.recommendation.context.costs[car.id]?.budgetStatus === "over");

        if (!over) return;

        expect(whyNot(result, over.id)!.sentences[0]).toMatch(/over the €500 you gave me/);
    });
});
