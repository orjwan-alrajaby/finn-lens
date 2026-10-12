import { describe, expect, it } from "vitest";

import { chatAnswers } from "@/lib/chats/judge";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";

import { BUBBLES, bubbleById, EMPTY_BUBBLE, figuresOf, importanceOf, itemsOf, needOf, OFTEN, recommendedBecause, suggestedRules, withBubbles, withBubbleState, withItem, withoutItem, worthHere } from "./bubbles";
import { EVIDENCE, NEARLY_EVERY, readEvidence, type EvidenceId } from "./evidence";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import { EMPTY_UNDERSTANDING, ruledOut, withBudget } from "./understanding";
import { applyChoices, guideSteps } from "./guide";

const bubble = (id: string) => bubbleById(id)!;
const state = (patch: Partial<typeof EMPTY_BUBBLE> = {}) => ({ ...EMPTY_BUBBLE, ...patch });
const levels = (u: typeof EMPTY_UNDERSTANDING) =>
    new Map(Object.values(chatAnswers(u).answers.features).flatMap((items) => (items ?? []).map((item) => [item.key, item.importance] as const)));

describe("the bubbles, as the spec lists them", () => {
    it("name only what Lens can check: counted and suggested items can be raised, checked items are standard equipment", () => {
        for (const item of BUBBLES) {
            const chips = item.chips?.options ?? [];
            const counted = [...item.counts, ...chips.flatMap((chip) => chip.counts ?? [])];
            const suggested = [...item.worth, ...chips.flatMap((chip) => chip.worth ?? [])];
            const checked = [...item.checks, ...chips.flatMap((chip) => chip.checks ?? [])];

            for (const id of [...counted, ...suggested]) expect(EVIDENCE[id]?.raisable, `${item.id}: ${id}`).toBe(true);
            for (const id of checked) expect(EVIDENCE[id]?.raisable === false && EVIDENCE[id]?.scoredIn != null, `${item.id}: ${id}`).toBe(true);
        }
    });

    it("count two or three items at most, and say what they can't check only where it changes how an answer reads", () => {
        for (const item of BUBBLES) {
            expect(item.counts.length, item.id).toBeLessThanOrEqual(3);
            for (const chip of item.chips?.options ?? []) expect((chip.counts ?? []).length, `${item.id}/${chip.id}`).toBeLessThanOrEqual(2);
            /* Boot space under lots to carry, and nowhere else. */
            if (item.id === "carry") expect(item.cantCheck).toBe("FINN lists a boot size, but not whether it's measured with the rear seats up or folded, so Lens doesn't compare boots on it.");
            else expect(item.cantCheck, item.id).toBe("");
        }
    });

    it("suggest only deal-breakers the rules question has", () => {
        const rules = new Set([...guideSteps([]).find((step) => step.id === "rules")!.choices.map((choice) => choice.id), "firm-budget"]);

        for (const item of BUBBLES) for (const id of suggestedRules(item, state({ chips: (item.chips?.options ?? []).map((chip) => chip.id) }))) expect(rules.has(id), id).toBe(true);
    });
});

describe("every answer does something", () => {
    /*
     * Everything an answer can change: what's counted, checked and suggested,
     * how much the bubble counts, the deal-breakers it suggests, the figure it
     * judges on, and — for the budget's — how firm the limit is.
     */
    const effect = (id: string, chips: string[]) => {
        const b = bubble(id);
        const s = state({ chips });
        const budget = withBubbles(withBudget(EMPTY_UNDERSTANDING, 500, "Up to €500 a month."), { [id]: chips } as never).budget;
        return JSON.stringify([itemsOf(b, s), importanceOf(b, s), suggestedRules(b, s), figuresOf(b, s), budget]);
    };

    /* The default, named: "the environment" with no answer judges CO₂ the same way, as a typed "eco-friendly" does. */
    const SAME_AS_SKIPPING = new Set(["environment:moderate"]);

    it("changes something against leaving the question unanswered, where it can be left", () => {
        for (const item of BUBBLES.filter((b) => b.chips && b.chips.mode !== "required")) {
            for (const chip of item.chips!.options) {
                if (SAME_AS_SKIPPING.has(`${item.id}:${chip.id}`)) continue;
                expect(effect(item.id, [chip.id]), `${item.id}: ${chip.id}`).not.toBe(effect(item.id, []));
            }
        }
    });

    it("differs from every other answer to the same question", () => {
        for (const item of BUBBLES.filter((b) => b.chips)) {
            const options = item.chips!.options;
            for (const [index, chip] of options.entries())
                for (const other of options.slice(index + 1)) expect(effect(item.id, [chip.id]), `${item.id}: ${chip.id} vs ${other.id}`).not.toBe(effect(item.id, [other.id]));
        }
    });
});

describe("what a bubble counts", () => {
    it("kids: rear doors counted, ISOFIX checked; a baby seat makes it a must have and suggests an electric tailgate", () => {
        /* Kids always come with a child seat now: a booster asks nothing beyond the bubble's own. */
        expect(itemsOf(bubble("kids"), state({ chips: ["booster"] }))).toMatchObject({ counts: ["rearDoors"], checks: ["hasIsofix"], worth: ["hasSplitFoldingRearSeats"] });

        const baby = state({ chips: ["baby"] });
        expect(importanceOf(bubble("kids"), baby)).toBe("essential");
        expect(itemsOf(bubble("kids"), baby).worth).toContain("hasElectricTailgate");
    });

    it("starts at “Matters”, takes how often, and keeps the reader's own say over both", () => {
        expect(importanceOf(bubble("long"), state())).toBe("important");
        expect(importanceOf(bubble("long"), state({ often: "rarely" }))).toBe("niceToHave");
        expect(importanceOf(bubble("long"), state({ often: "weekly" }))).toBe("essential");
        expect(importanceOf(bubble("long"), state({ often: "weekly", importance: "niceToHave" }))).toBe("niceToHave");
        expect(OFTEN.traffic.choices.map((choice) => choice.importance)).toEqual(["niceToHave", "important", "essential"]);
    });

    it("comforts: nothing counted until one is picked, every comfort suggested until then", () => {
        expect(needOf(bubble("comfort"), state())).toBeNull();
        expect(itemsOf(bubble("comfort"), state()).worth).toContain("hasHeatedSeats");
        expect(itemsOf(bubble("comfort"), state({ chips: ["warm"] }))).toMatchObject({ counts: ["hasHeatedSeats"], worth: [] });
    });

    it("help: the chips picked are counted, and the others' items suggested", () => {
        const items = itemsOf(bubble("help"), state({ chips: ["parking"] }));

        expect(items.counts).toEqual(["hasThreeSixtyDegreesCamera"]);
        expect(items.checks).toContain("hasParkingSensors");
        expect(items.worth).toEqual(expect.arrayContaining(["hasMatrixLedHeadlights", "hasBlindSpotAssist", "hasRearCrosswalkWarning"]));
    });

    it("weather: each kind counts its own, and only snow suggests all-wheel drive", () => {
        expect(itemsOf(bubble("weather"), state({ chips: ["wet"] })).counts).toEqual(["hasRainSlashLightSensors", "hasFogLights"]);
        expect(itemsOf(bubble("weather"), state({ chips: ["wet"] })).worth).not.toContain("hasHeatedSeats");
        expect(itemsOf(bubble("weather"), state({ chips: ["snow"] })).worth).toContain("hasAllWheelDrive");
    });

    it("takes cold winters with rain, and counts the cold for snow without it", () => {
        const wetAndCold = withBubbles(EMPTY_UNDERSTANDING, { weather: ["wet", "cold"] });
        expect(wetAndCold.bubbles?.weather?.chips).toEqual(["wet", "cold"]);
        expect(itemsOf(bubble("weather"), state({ chips: ["wet", "cold"] })).counts).toEqual(
            expect.arrayContaining(["hasRainSlashLightSensors", "hasFogLights", "hasHeatedSeats", "hasHeatedSteeringWheel"]),
        );

        /* Snow can't come without cold: its own items cover it. Rain alone counts no warmth. */
        expect(itemsOf(bubble("weather"), state({ chips: ["snow"] })).counts).toEqual(expect.arrayContaining(["hasHeatedSeats", "hasHeatedSteeringWheel"]));
        expect(itemsOf(bubble("weather"), state({ chips: ["wet"] })).counts).not.toContain("hasHeatedSeats");
        expect(bubble("weather").chips!.exclusive).toBeUndefined();
    });

    it("a garage makes width count one step more", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { city: ["garage"] });

        expect(levels(u).get("compactWidth")).toBe("high");
        expect(levels(u).get("compactLength")).toBe("medium");
    });
});

describe("the reader's corrections", () => {
    it("takes an item out, offers it back, and adds a suggestion at the bubble's level", () => {
        let u = withBubbles(EMPTY_UNDERSTANDING, { city: ["street"] });
        u = withoutItem(u, "city", "compactLength");

        expect(itemsOf(bubble("city"), u.bubbles!.city!).counts).not.toContain("compactLength");
        expect(itemsOf(bubble("city"), u.bubbles!.city!).worth).toContain("compactLength");
        expect(levels(u).has("compactLength")).toBe(false);

        u = withItem(u, "city", "hasThreeSixtyDegreesCamera");
        expect(levels(u).get("hasThreeSixtyDegreesCamera")).toBe("medium");
    });

    it("keeps what was said about a bubble when the bubbles are answered again, and forgets one no longer tapped", () => {
        let u = withBubbles(EMPTY_UNDERSTANDING, { long: [], dog: [] });
        u = withBubbleState(u, "long", { often: "weekly" });
        u = withBubbles(u, { long: [] });

        expect(u.bubbles?.long?.often).toBe("weekly");
        expect(u.bubbles?.dog).toBeUndefined();
        expect(u.needs.map((need) => need.id)).toEqual(["bubble-long"]);
    });
});

describe("into the engine's answers", () => {
    it("weighs what the bubbles count and nothing else", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: [], night: [] });
        const raised = [...levels(u).keys()] as EvidenceId[];

        expect(raised.sort()).toEqual(["hasCorneringLights", "hasMatrixLedHeadlights", "rearDoors"].sort());
    });

    it("checks standard equipment only in priorities already weighed", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: [], traffic: [] });
        const { answers } = chatAnswers(u);

        expect(answers.preferences.checked?.practicality).toEqual(["hasIsofix"]);
        /* "Automatic gearbox" lives in City & Parking, which nothing here weighs. */
        expect(answers.preferences.checked?.cityParking).toBeUndefined();
        expect(answers.priorities).not.toContain("cityParking");
    });

    it("never raises what a deal-breaker already demands", () => {
        const rules = guideSteps([]).find((step) => step.id === "rules")!;
        const u = applyChoices(withBubbles(EMPTY_UNDERSTANDING, { carry: ["trailer"] }), rules, ["must-tow"]);

        expect(ruledOut(u).map((rule) => rule.id)).toContain("hasTowbar");
        expect(levels(u).has("hasTowbar")).toBe(false);
        expect(levels(u).get("towingCapacity1500")).toBe("medium");
    });

    it("judges the environment and a budget on their figures", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { environment: ["decides"], budget: [] });
        const { answers } = chatAnswers(u);

        expect(answers.priorities).toEqual(expect.arrayContaining(["environmental", "efficiency"]));
        expect(answers.priorities[0]).toBe("environmental");
        expect(CATEGORIES.environmental.numericOnly).toBe(true);
    });
});

describe("short labels, explained behind the “i”", () => {
    it("keeps every bubble and chip label short, and gives each a brief explanation", () => {
        for (const item of BUBBLES) {
            expect(item.label.length, item.id).toBeLessThanOrEqual(24);
            expect(item.means.length, item.id).toBeGreaterThan(15);
            for (const chip of item.chips?.options ?? []) {
                expect(chip.label.length, `${item.id}/${chip.id}`).toBeLessThanOrEqual(32);
                expect(chip.description.length, `${item.id}/${chip.id}`).toBeGreaterThan(12);
            }
        }
    });
});

describe("adults or teens", () => {
    it("are taken to ride in the back: rear doors, with 3-zone climate and rear USB suggested — no follow-up asked", () => {
        const items = itemsOf(bubble("adults"), state());

        expect(bubble("adults").label).toBe("Adults or teens");
        expect(bubble("adults").chips).toBeUndefined();
        expect(items.counts).toEqual(["rearDoors"]);
        expect(items.worth).toEqual(expect.arrayContaining(["hasThreeZoneAutomaticClimateControls", "hasBackUSBPorts"]));
    });

    it("leave kids to child seats: baby or toddler, or booster — at least one, either or both", () => {
        const kids = bubble("kids").chips!;

        expect(kids.ask).toBe("Which child seat?");
        expect(kids.options.map((option) => option.label)).toEqual(["Baby or toddler seat", "Booster seat"]);
        expect(kids).toMatchObject({ mode: "required", multiple: true });
    });

    it("has no seat count among who rides with you: that's a deal-breaker or sealer now", () => {
        expect(bubbleById("six-seats")).toBeUndefined();
    });
});


describe("recommended, from what the reader said", () => {
    const said = (picks: Parameters<typeof withBubbles>[1]) => withBubbles(EMPTY_UNDERSTANDING, picks);

    it("recommends a comfort the earlier answers point to, saying which", () => {
        expect(recommendedBecause("hasHeatedSeats", said({ weather: ["cold", "wet"] }))).toBe("Recommended because you said winters are cold.");
        expect(recommendedBecause("hasLumbarSupport", said({ long: [], traffic: [] }))).toBe("Recommended because you said you drive long distances, and you sit in traffic a lot.");
        expect(recommendedBecause("hasHeatedSteeringWheel", said({ weather: ["snow"], long: [] }))).toBe(
            "Recommended because you said winters bring snow and ice, and you spend a lot of time on the road.",
        );
    });

    it("doesn't recommend what nothing said points to, or warmth for time on the road alone, or rain alone", () => {
        expect(recommendedBecause("hasHeatedSteeringWheel", said({ long: [], traffic: [] }))).toBeNull();
        expect(recommendedBecause("hasHeatedSeats", said({ weather: ["wet"] }))).toBeNull();
        expect(recommendedBecause("hasSunroof", said({ weather: ["hot"], long: [] }))).toBeNull();
    });

    it("never recommends a bubble's own chips by its own answers", () => {
        expect(recommendedBecause("hasHeatedSeats", said({ weather: ["snow"] }), "weather")).toBeNull();
    });
});

describe("how green", () => {
    const env = (chips: string[]) => ({ bubble: bubble("environment"), state: state({ chips }) });

    it("judges each answer on its own figure, and suggests its own deal-breaker", () => {
        const clean = env(["clean"]);
        const moderate = env(["moderate"]);
        const zero = env(["zero"]);
        const none = env([]);

        expect(needOf(clean.bubble, clean.state)?.priorities).toEqual(["efficiency"]);
        /* Clean for its kind suggests frugal for its kind, never low CO₂. */
        expect(suggestedRules(clean.bubble, clean.state)).toEqual(["frugal"]);
        expect(needOf(moderate.bubble, moderate.state)?.priorities).toEqual(["environmental"]);
        expect(suggestedRules(moderate.bubble, moderate.state)).toEqual(["low-co2"]);
        expect(needOf(zero.bubble, zero.state)).toMatchObject({ priorities: ["environmental"], importance: "essential" });
        /* Electric is starred on "What can it run on?" instead of suggested as a row. */
        expect(suggestedRules(zero.bubble, zero.state)).toEqual([]);
        /* Nothing picked: the CO₂ label, low CO₂ suggested, as before. */
        expect(needOf(none.bubble, none.state)?.priorities).toEqual(["environmental"]);
        expect(suggestedRules(none.bubble, none.state)).toEqual(["low-co2"]);
    });
});

describe("parallel parking", () => {
    it("counts a shorter car and a 360° camera, and checks the parking aids nearly every car has", () => {
        const items = itemsOf(bubble("help"), state({ chips: ["parallel"] }));

        expect(items.counts).toEqual(expect.arrayContaining(["compactLength", "hasThreeSixtyDegreesCamera"]));
        expect(items.checks).toEqual(expect.arrayContaining(["hasParkingAssistant", "hasParkingSensors"]));
        expect(bubble("help").chips!.options.map((option) => option.label)).toEqual(["Parking", "Parallel parking", "Traffic & lane changes", "Reversing out"]);
    });

    it("claims nothing about the parking assistant FINN doesn't say", () => {
        const parallel = bubble("help").chips!.options.find((option) => option.id === "parallel")!;

        expect(parallel.description).toMatch(/FINN doesn't say which kinds of space a car's parking assistant can handle\.$/);
        expect(parallel.description).not.toMatch(/steers|parks itself|automatically/i);
    });
});

describe("overlaps, handled quietly", () => {
    it("never tell the reader what else to pick, or not to", () => {
        for (const item of BUBBLES) {
            for (const text of [item.means, ...(item.chips?.options ?? []).map((option) => option.description)]) {
                expect(text, item.id).not.toMatch(/no need to pick|pick [\w ]+ too|don't pick|instead of picking/i);
            }
        }
    });

    it("take answers that check the same things together, counting each item once", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { weather: ["snow", "cold"] });
        const items = itemsOf(bubble("weather"), state({ chips: ["snow", "cold"] })).counts;

        expect(u.bubbles?.weather?.chips).toEqual(["snow", "cold"]);
        expect(items.filter((id) => id === "hasHeatedSeats")).toHaveLength(1);
    });
});

describe("suggestions for this page", () => {
    const inventory = fleet();
    /* A page of `have` cars listing it and `without` that FINN says don't. */
    const page = (id: EvidenceId, have: number, without: number) => [
        ...inventory.filter((car) => readEvidence(car, id) === "listed").slice(0, have),
        ...inventory.filter((car) => readEvidence(car, id) === "notListed").slice(0, without),
    ];

    it("aren't made for what nearly every car here has: adding it would move nothing", () => {
        expect(22 / 24).toBeGreaterThanOrEqual(NEARLY_EVERY);
        expect(worthHere(["hasElectricTailgate"], page("hasElectricTailgate", 22, 2))).toEqual([]);
        expect(worthHere(["hasElectricTailgate"], page("hasElectricTailgate", 21, 3))).toEqual(["hasElectricTailgate"]);
    });

    it("nor for what none of them has", () => {
        expect(worthHere(["hasElectricTailgate"], page("hasElectricTailgate", 0, 24))).toEqual([]);
    });

    it("are all shown with no cars in hand", () => {
        expect(worthHere(["hasElectricTailgate"], [])).toEqual(["hasElectricTailgate"]);
    });
});
