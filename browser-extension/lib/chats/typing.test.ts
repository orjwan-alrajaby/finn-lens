import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";

import { answer, startChat } from "./flow";
import { readBack, readTyped } from "./typing";

/*
 * The reader's own words, read into the same understanding the taps build.
 */

const cars = () => [GARAGE.safeCompact(), GARAGE.familySuv(), GARAGE.cityHatch()];

describe("typing", () => {
    it("adds what was typed to what was tapped, without doubling anything", async () => {
        const start = startChat(null, cars());
        const counted = answer(start, start.messages.at(-1)!.id, ["passengers-2"], cars()).chat;
        const tapped = answer(counted, counted.messages.at(-1)!.id, ["kids"], cars()).chat;

        const read = await readTyped(tapped, "actually I can go up to 650 a month", cars(), null);
        const labels = read.understanding.needs.filter((need) => need.status === "active").map((need) => need.label);

        expect(read.understanding.budget?.monthly).toBe(650);
        expect(labels.filter((label) => label === "Travelling with children")).toHaveLength(1);
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

describe("words beside the taps", () => {
    const ask = (chat: ReturnType<typeof startChat>) => [...chat.messages].reverse().find((message) => message.kind === "ask")!;

    it("puts typed words on the answers they mean, so one dog is one need", async () => {
        const start = startChat(null, cars());
        const counted = answer(start, ask(start).id, ["passengers-4"], cars()).chat;
        const text = "2 teenagers & a big dog";
        const read = await readTyped(counted, text, cars(), null);
        const { chat } = answer(counted, ask(counted).id, ["kids", "dog"], cars(), new Date(), {
            heard: { text, understanding: read.understanding, reply: readBack(text, read, true) },
        });
        const ids = chat.understanding.needs.map((need) => need.id);

        expect(ids.filter((id) => /dog/.test(id))).toEqual(["life-dog"]);
        expect(ids.filter((id) => /kid/.test(id))).toEqual(["life-kids"]);
        expect(readBack(text, read, true)).toBe("I read “2 teenagers & a big dog” as children and pets.");
        const texts = chat.messages.filter((message) => message.kind === "text");
        expect(texts.filter((message) => message.from === "reader").at(-1)).toMatchObject({ text: "Children. A pet. 2 teenagers & a big dog." });
        /* Nothing Lens only quotes is promised as checked. */
        expect(texts.at(-1)).toMatchObject({ from: "lens" });
        expect((texts.at(-1) as { text: string }).text).not.toMatch(/boot space/i);
    });

    it("counts a typed answer to this question as tapped, so its follow-up is asked", async () => {
        const start = startChat(null, cars());
        const counted = answer(start, ask(start).id, ["passengers-2"], cars()).chat;
        const read = await readTyped(counted, "two teenagers", cars(), null);
        const { chat } = answer(counted, ask(counted).id, [], cars(), new Date(), { heard: { text: "two teenagers", understanding: read.understanding, reply: "" } });

        expect(ask(chat).kind === "ask" && ask(chat).step.id).toBe("follow-kids");
    });

    it("asks the count with numbers only, since who they are comes next", () => {
        const start = startChat(null, cars());
        const count = ask(start);

        expect(count.kind === "ask" && count.step.custom).toBeUndefined();
    });

    it("hears safety or comfort waved away as not wanted", async () => {
        const start = startChat(null, cars());

        for (const text of ["I don't care about safety because I drive carefully.", "I don't care much about long-distance comfort."]) {
            const read = await readTyped(start, text, cars(), null);
            expect(read.understanding.needs, text).toEqual([]);
        }
    });
});
