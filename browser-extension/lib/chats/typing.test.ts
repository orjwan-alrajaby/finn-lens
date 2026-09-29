import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";

import { answer, startChat } from "./flow";
import { readTyped } from "./typing";

/*
 * The reader's own words, read into the same understanding the taps build.
 */

const cars = () => [GARAGE.safeCompact(), GARAGE.familySuv(), GARAGE.cityHatch()];

describe("typing", () => {
    it("adds what was typed to what was tapped, without doubling anything", async () => {
        const start = startChat(null, cars());
        const tapped = answer(start, start.messages.at(-1)!.id, ["kids", "motorway"], cars()).chat;

        const read = await readTyped(tapped, "actually I can go up to 650 a month", cars(), null);
        const labels = read.understanding.needs.filter((need) => need.status === "active").map((need) => need.label);

        expect(read.understanding.budget?.monthly).toBe(650);
        expect(labels.filter((label) => label === "Kids in the back")).toHaveLength(1);
        expect(labels.filter((label) => label === "Long motorway drives")).toHaveLength(1);
        expect(read.changes.map((change) => change.label)).toEqual(["Budget"]);
    });

    it("reads only what was said, never a stock set of needs", async () => {
        const start = startChat(null, cars());
        const read = await readTyped(start, "we have two kids and I can't spend more than 600 a month", cars(), null);
        const labels = read.understanding.needs.filter((need) => need.status === "active").map((need) => need.label.toLowerCase());

        expect(read.understanding.budget?.monthly).toBe(600);
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.every((label) => /kid|child|famil/.test(label))).toBe(true);
    });
});
