import { describe, expect, it } from "vitest";

import { BUBBLES } from "@/lib/lens-chat/bubbles";
import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { guideSteps } from "@/lib/lens-chat/guide";

import { FOLLOW_UPS, offerReason, WORTH_A_LOOK } from "./follow-ups";

/*
 * Wherever Lens puts a need and a feature together, it says why they belong
 * together. "You mentioned travelling with children. Sunroof: a glass panel in the roof."
 * named the feature and left the reader to guess the connection — so every
 * link carries its reason, and a link with no honest reason isn't made.
 */

const needs = guideSteps([]).find((step) => step.id === "life")!.choices;

describe("the link between a need and its equipment", () => {
    it("says why each need counts each of its features", () => {
        /* The one choice with no need is a single passenger, who asks nothing of the car. */
        for (const choice of needs.filter((item) => item.need)) {
            for (const id of choice.need!.evidence) {
                expect(choice.need!.reasons?.[id], `${choice.id} → ${id}`).toMatch(/\w{3,}/);
            }
        }
    });

    it("says why a follow-up answer adds each feature", () => {
        for (const followUp of Object.values(FOLLOW_UPS)) {
            for (const choice of followUp.choices) {
                for (const add of choice.add ?? []) expect(add.why, `${followUp.need}/${choice.id} → ${add.id}`).toMatch(/\w{3,}/);
            }
        }
    });

    it("says why each piece of equipment is worth a look for its need", () => {
        for (const [need, entries] of Object.entries(WORTH_A_LOOK)) {
            expect(needs.some((choice) => choice.id === need), need).toBe(true);
            for (const entry of entries) expect(entry.why, `${need} → ${entry.id}`).toMatch(/\w{3,}/);
        }
    });

    it("doesn't offer a sunroof for kids, or anything else it can't give a reason for", () => {
        expect(WORTH_A_LOOK.kids?.map((entry) => entry.id)).not.toContain("hasSunroof");
        expect(offerReason("life-kids", "hasSunroof")).toBeUndefined();
    });

    it("says why each bubble counts each of its items", () => {
        /* Comforts are named by the reader themselves: “Warm seats” is the reason for heated seats. */
        for (const bubble of BUBBLES.filter((item) => item.id !== "comfort")) {
            const counted = [...bubble.counts, ...(bubble.chips?.options ?? []).flatMap((chip) => chip.counts ?? [])];
            for (const id of counted) expect(bubble.why?.[id], `${bubble.id} → ${id}`).toMatch(/\w{3,}/);
        }
    });
});

describe("the limits Lens states", () => {
    it("calls a car compact exactly up to the length and width it says", async () => {
        const { LENGTH_ANCHORS, WIDTH_ANCHORS } = await import("@/lib/reasoning-engine/evidence");
        const { listedUpTo, readEvidence } = await import("@/lib/lens-chat/evidence");
        const { purposeOf } = await import("@/lib/lens-chat/guide");
        const sized = (length: number, width: number) => {
            const car = GARAGE.safeCompact();
            return { ...car, dimensions: { ...car.dimensions, length, width } };
        };

        const long = listedUpTo(LENGTH_ANCHORS);
        const wide = listedUpTo(WIDTH_ANCHORS);

        expect(purposeOf("compactLength")).toContain(`${(long / 1000).toString()} m`);
        expect(readEvidence(sized(long, 1700), "compactLength")).toBe("listed");
        expect(readEvidence(sized(long + 1, 1700), "compactLength")).toBe("notListed");
        expect(readEvidence(sized(4000, wide), "compactWidth")).toBe("listed");
        expect(readEvidence(sized(4000, wide + 1), "compactWidth")).toBe("notListed");
    });
});
