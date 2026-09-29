import { describe, expect, it } from "vitest";

import type { WireUnderstanding } from "@/lib/lens-ai/contract";

import { heardLines, matchSentence } from "./plain";
import { EMPTY_UNDERSTANDING, readUnderstanding } from "./understanding";

/*
 * The sentences the reader checks Lens against. They are the whole of what a
 * person sees before they decide whether Lens understood them, so they have to
 * read like something a person would say — the failures worth a test are the
 * ones that make them read like a machine.
 */

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

const need = (label: string) => ({
    id: label.toLowerCase().replace(/\W+/g, "-"),
    label,
    importance: "important" as const,
    said: label,
    priorities: [],
    evidence: [],
    notInData: "",
    status: "active" as const,
});

const read = (overrides: Partial<WireUnderstanding>) =>
    readUnderstanding(wire(overrides), EMPTY_UNDERSTANDING, undefined, "2026-09");

describe("what Lens heard, in sentences", () => {
    it("lets commas join needs that are phrases with their own and", () => {
        const heard = heardLines(read({ needs: [need("Getting a child seat in and out"), need("Room for the weekly shop")] }));

        expect(heard.lookingFor).toBe("getting a child seat in and out, room for the weekly shop");
    });

    it("keeps the plain and when no need needs one of its own", () => {
        const heard = heardLines(read({ needs: [need("Parking without the stress"), need("Room for the weekly shop")] }));

        expect(heard.lookingFor).toBe("parking without the stress and room for the weekly shop");
    });

    it("leaves a single need's own wording alone", () => {
        const heard = heardLines(read({ needs: [need("Navigating and parking in the city")] }));

        expect(heard.lookingFor).toBe("navigating and parking in the city");
    });

    it("keeps the commas in the limits line, which mean something", () => {
        const heard = heardLines(
            read({
                budget: { kind: "target", monthly: 600, stretchTo: 700, said: "around 600, 700 at a push" },
                monthlyKm: { value: 1000, said: "about a thousand kilometres" },
            }),
        );

        expect(heard.limits).toBe("around €600 a month, €700 at a stretch and about 1,000 km a month");
    });

    it("reads their own words back rather than a subject heading", () => {
        const heard = heardLines(
            read({
                context: [
                    { label: "Family setup", said: "Two kids, one still in a car seat" },
                    { label: "One child still rear-facing", said: "the little one is still rear-facing" },
                ],
            }),
        );

        expect(heard.situation).toBe("two kids, one still in a car seat and one child still rear-facing");
    });

    it("drops a subject heading it has no words to replace with", () => {
        const heard = heardLines(read({ context: [{ label: "Driving routine", said: "" }] }));

        expect(heard.situation).toBe("");
    });

    it("says nothing at all when nothing was said", () => {
        const heard = heardLines(EMPTY_UNDERSTANDING);

        expect(Object.values(heard).every((line) => line === "")).toBe(true);
    });
});

describe("why this car, in one sentence", () => {
    const story = (sections: { short: string; tone: "good" | "note" | "bad"; kind: "need" | "budget" }[]) =>
        ({
            sections: sections.map((section, index) => ({ ...section, key: `s${index}`, lines: [], said: "" })),
        }) as unknown as Parameters<typeof matchSentence>[0];

    it("says what a car avoids rather than covering nothing", () => {
        expect(
            matchSentence(
                story([
                    { short: "Nothing big and stressful to drive", tone: "good", kind: "need" },
                    { short: "Seeing what's around you", tone: "good", kind: "need" },
                    { short: "Within your limit", tone: "good", kind: "budget" },
                ]),
            ),
        ).toBe("Covers seeing what's around you, and avoids anything big and stressful to drive — within what you wanted to spend.");
    });

    it("keeps the money clause on a comma when the sentence has none", () => {
        expect(
            matchSentence(
                story([
                    { short: "Parking without the stress", tone: "good", kind: "need" },
                    { short: "Within your limit", tone: "good", kind: "budget" },
                ]),
            ),
        ).toBe("Covers parking without the stress, within what you wanted to spend.");
    });

    it("says plainly when the closest car costs more than they wanted", () => {
        expect(
            matchSentence(
                story([
                    { short: "Parking without the stress", tone: "good", kind: "need" },
                    { short: "Over your limit", tone: "bad", kind: "budget" },
                ]),
            ),
        ).toBe("Covers parking without the stress — but not what you wanted to spend.");
    });
});

describe("the limits line", () => {
    it("keeps the day someone said they need the car", () => {
        const heard = heardLines(
            read({ rental: { from: "2027-03", to: "2027-09", startDay: 3, said: "from the 3rd of March until September" } }),
        );

        expect(heard.limits).toBe("from 3 March 2027 to September 2027");
    });

    it("says months when no day was given", () => {
        const heard = heardLines(read({ rental: { from: "2027-03", to: "2027-09", startDay: null, said: "March to September" } }));

        expect(heard.limits).toBe("from March 2027 to September 2027");
    });
});
