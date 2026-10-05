import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";

import { answer, startChat } from "./flow";
import { readBack, readTyped } from "./typing";

/*
 * The reader's own words, read into the same understanding the taps build.
 */

const cars = () => [GARAGE.safeCompact(), GARAGE.familySuv(), GARAGE.cityHatch()];
const ask = (chat: ReturnType<typeof startChat>) => [...chat.messages].reverse().find((message) => message.kind === "ask")!;

describe("typing", () => {
    it("adds what was typed to what was tapped, without doubling anything", async () => {
        const start = startChat(null, cars());
        const tapped = answer(start, ask(start).id, ["kids"], cars()).chat;

        const read = await readTyped(tapped, "actually I can go up to 650 a month", cars(), null);
        const labels = read.understanding.needs.filter((need) => need.status === "active").map((need) => need.label);

        expect(read.understanding.budget?.monthly).toBe(650);
        expect(labels.filter((label) => label === "Travelling with children")).toHaveLength(1);
        expect(read.changes.map((change) => change.label)).toEqual(["Budget"]);
    });

    it("reads only what was said, never a stock set of needs", async () => {
        const start = startChat(null, cars());
        const read = await readTyped(start, "we have two kids and I can't spend more than 600 a month", cars(), null);

        expect(read.understanding.budget?.monthly).toBe(600);
        expect(Object.keys(read.understanding.bubbles ?? {})).toEqual(["kids"]);
        expect(read.understanding.needs.map((need) => need.id)).toEqual(["bubble-kids"]);
    });
});

describe("words beside the bubbles", () => {
    it("puts typed words on the bubbles they mean, so one dog is one bubble", async () => {
        const start = startChat(null, cars());
        const text = "2 teenagers & a big dog";
        const read = await readTyped(start, text, cars(), null);
        const { chat } = answer(start, ask(start).id, ["kids", "dog"], cars(), new Date(), {
            heard: { text, understanding: read.understanding, reply: readBack(text, read, true) },
        });

        expect(chat.understanding.needs.map((need) => need.id).sort()).toEqual(["bubble-dog", "bubble-kids"]);
        expect(readBack(text, read, true)).toBe("I read “2 teenagers & a big dog” as travelling with children and travelling with a dog.");
        expect(chat.messages.filter((message) => message.kind === "text" && message.from === "reader").at(-1)).toMatchObject({ text: "I have kids. I travel with a dog. 2 teenagers & a big dog." });
    });

    it("keeps a bubble the words landed on beside the taps", async () => {
        const start = startChat(null, cars());
        const text = "and long drives to see my parents";
        const read = await readTyped(start, text, cars(), null);
        const { chat } = answer(start, ask(start).id, ["city"], cars(), new Date(), { heard: { text, understanding: read.understanding, reply: "" } });

        expect(Object.keys(chat.understanding.bubbles ?? {}).sort()).toEqual(["city", "long"]);
        /* A bubble the words added asks its own question. */
        expect(ask(chat).kind === "ask" && ask(chat).step.id).toBe("often-long");
    });

    it("reads snow onto the weather bubble's own chip", async () => {
        const read = await readTyped(startChat(null, cars()), "we get a lot of snow", cars(), null);

        expect(read.understanding.bubbles?.weather?.chips).toEqual(["snow"]);
    });

    it("hears safety or comfort waved away as not wanted", async () => {
        const start = startChat(null, cars());

        for (const text of ["I don't care about safety because I drive carefully.", "I don't care much about long-distance comfort."]) {
            const read = await readTyped(start, text, cars(), null);
            expect(read.understanding.needs, text).toEqual([]);
        }
    });
});

describe("a long list of needs", () => {
    it("still hears a need typed after sixteen others", async () => {
        const many = Array.from({ length: 16 }, (_, index) => ({
            id: `need-${index}`, label: `Need ${index}`, importance: "important" as const, said: "", priorities: ["comfort" as const],
            evidence: [], notInData: null, status: "active" as const,
        }));
        const start = startChat(null, cars());
        const read = await readTyped({ ...start, understanding: { ...start.understanding, needs: many } }, "something with low fuel consumption", cars(), null);

        expect(read.heardAs).toContain("using little fuel or electricity");
        expect(read.understanding.needs).toHaveLength(17);
    });
});

describe("words about CO₂ and consumption", () => {
    it("reads them onto their own needs, not onto each other", async () => {
        const start = startChat(null, cars());
        const green = await readTyped(start, "I'd like something eco-friendly", cars(), null);
        const frugal = await readTyped(start, "it shouldn't guzzle fuel, low fuel consumption", cars(), null);

        expect(green.understanding.bubbles?.environment?.chips).toEqual(["matters"]);
        expect(green.heardAs).toEqual(["CO₂ emissions"]);
        expect(frugal.understanding.needs.map((need) => need.id)).toEqual(["life-efficiency-matters"]);
        expect(Object.keys(frugal.understanding.bubbles ?? {})).toEqual([]);
    });
});
