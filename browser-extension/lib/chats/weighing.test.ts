import { describe, expect, it } from "vitest";

import { withBubbles } from "@/lib/lens-chat/bubbles";
import { withDeals } from "@/lib/lens-chat/deals";
import { EMPTY_UNDERSTANDING } from "@/lib/lens-chat/understanding";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { summaryOf } from "./flow";
import { weighingOf, wholePercents } from "./weighing";

const cars = () => fleet().sort((a, b) => a.id - b.id).slice(0, 60);

describe("how it was weighed", () => {
    it("lists each thing said, strongest first, with shares that add up to the whole decision", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], dog: [], city: ["street"] });
        const { needs } = weighingOf(u, summaryOf(u, "s", cars()));

        expect(needs.map((need) => need.importance)).toEqual(["essential", "important", "important"]);
        expect(needs.reduce((sum, need) => sum + need.share, 0)).toBeCloseTo(1, 6);
        /* Top priority counts twice an important need. */
        expect(needs[0]!.share).toBeCloseTo(needs[1]!.share * 2, 6);
        expect(needs[0]).toMatchObject({ label: "You have kids · a baby or toddler seat", looksAt: ["Rear doors"] });
    });

    it("weighs a deal-sealer as a top priority, and says what set cars aside", () => {
        const base = withBubbles(EMPTY_UNDERSTANDING, { dog: [] });
        const u = withDeals(base, ["towbar", "suv"], { towbar: "seal", suv: "mustNot" });
        const weighing = weighingOf(u, summaryOf(u, "s", cars()));

        expect(weighing.needs[0]).toMatchObject({ label: "A towbar would seal it", importance: "essential" });
        expect(weighing.setAside).toEqual([{ label: "Deal-breakers", value: "No SUV" }]);
    });

    it("puts a hard limit with what set cars aside, and the rest of the money and dates apart", () => {
        const u = { ...withBubbles(EMPTY_UNDERSTANDING, { dog: [] }), budget: { monthly: 500, kind: "hardMax" as const, firm: true, said: "", stretchTo: null } };
        const weighing = weighingOf(u, summaryOf(u, "s", cars()));

        expect(weighing.setAside.map((line) => line.label)).toContain("Monthly limit");
        expect(weighing.terms.map((line) => line.label)).not.toContain("Monthly limit");
        expect(weighing.terms.map((line) => line.label)).toContain("Driving");
    });
});

describe("percentages", () => {
    it("are whole numbers that always add up to 100", () => {
        expect(wholePercents([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33]);
        expect(wholePercents([4 / 7, 2 / 7, 1 / 7])).toEqual([57, 29, 14]);
        expect(wholePercents([1])).toEqual([100]);
        expect(wholePercents([])).toEqual([]);
    });

    it("go with each need, strongest first", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], dog: [], city: ["street"] });
        const { needs } = weighingOf(u, summaryOf(u, "s", cars()));

        expect(needs.map((need) => need.percent)).toEqual([50, 25, 25]);
    });
});
