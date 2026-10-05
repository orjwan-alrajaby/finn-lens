import { describe, expect, it } from "vitest";

import { chatAnswers } from "@/lib/chats/judge";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";

import { BUBBLES, bubbleById, EMPTY_BUBBLE, importanceOf, itemsOf, needOf, OFTEN, suggestedRules, withBubbles, withBubbleState, withItem, withoutItem } from "./bubbles";
import { EVIDENCE, type EvidenceId } from "./evidence";
import { EMPTY_UNDERSTANDING, ruledOut } from "./understanding";
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

    it("count two or three items at most, and say what they can't check", () => {
        for (const item of BUBBLES) {
            expect(item.counts.length, item.id).toBeLessThanOrEqual(3);
            for (const chip of item.chips?.options ?? []) expect((chip.counts ?? []).length, `${item.id}/${chip.id}`).toBeLessThanOrEqual(2);
            if (item.id !== "budget") expect(item.cantCheck, item.id).not.toBe("");
        }
    });

    it("suggest only deal-breakers the rules question has", () => {
        const rules = new Set([...guideSteps([]).find((step) => step.id === "rules")!.choices.map((choice) => choice.id), "firm-budget"]);

        for (const item of BUBBLES) for (const id of suggestedRules(item, state({ chips: (item.chips?.options ?? []).map((chip) => chip.id) }))) expect(rules.has(id), id).toBe(true);
    });
});

describe("what a bubble counts", () => {
    it("kids: rear doors counted, ISOFIX checked; a baby seat makes it a must have and suggests an electric tailgate", () => {
        expect(itemsOf(bubble("kids"), state())).toMatchObject({ counts: ["rearDoors"], checks: ["hasIsofix"], worth: ["hasSplitFoldingRearSeats"] });

        const baby = state({ chips: ["baby"] });
        expect(importanceOf(bubble("kids"), baby)).toBe("essential");
        expect(itemsOf(bubble("kids"), baby).worth).toContain("hasElectricTailgate");
        expect(itemsOf(bubble("kids"), state({ chips: ["older"] })).worth).toEqual(expect.arrayContaining(["hasThreeZoneAutomaticClimateControls", "hasBackUSBPorts"]));
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

    it("can't be snow and ice and mostly dry at once", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { weather: ["snow", "cold"] });
        expect(u.bubbles?.weather?.chips).toEqual(["snow"]);
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
