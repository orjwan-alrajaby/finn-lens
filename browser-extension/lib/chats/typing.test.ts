import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { withDeals } from "@/lib/lens-chat/deals";
import { ruledOut } from "@/lib/lens-chat/understanding";

import { answer, selectedFor, startChat as beginChat, stepFor, summaryOf } from "./flow";
import { readBack, readTyped } from "./typing";

/** A first chat, past "Got it — let's start": most tests begin at the first question. */
function startChat(...args: Parameters<typeof beginChat>): ReturnType<typeof beginChat> {
    const chat = beginChat(...args);
    const intro = [...chat.messages].reverse().find((message) => message.kind === "ask" && !message.answered && message.step.id === "intro");
    return intro ? answer(chat, intro.id, ["go"], args[1], args[2]).chat : chat;
}

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
        const { chat } = answer(start, ask(start).id, ["kids"], cars(), new Date(), { heard: { text, understanding: read.understanding, reply: "" } });

        expect(Object.keys(chat.understanding.bubbles ?? {}).sort()).toEqual(["kids", "long"]);
        /* Words about another section land there, and show as picked when it's asked. */
        expect(ask(chat)).toMatchObject({ step: { id: "bubbles-driving", selected: ["long"] } });
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

        /* "Eco-friendly" doesn't say how green: the bubble alone, judged on the CO₂ label. */
        expect(green.understanding.bubbles?.environment?.chips).toEqual([]);
        expect(green.heardAs).toEqual(["a greener car"]);
        expect(frugal.understanding.needs.map((need) => need.id)).toEqual(["life-efficiency-matters"]);
        expect(Object.keys(frugal.understanding.bubbles ?? {})).toEqual([]);
    });
});

describe("words about what it runs on", () => {
    const fuel = (u: Awaited<ReturnType<typeof readTyped>>["understanding"]) =>
        u.needs.find((need) => need.id === "fuel")?.evidence.filter((entry) => entry.unwanted).map((entry) => entry.id).sort();

    it("read “I don't want an electric car” as not electric — never as electric only", async () => {
        const read = await readTyped(startChat(null, cars()), "I don't want an electric car", cars(), null);

        expect(fuel(read.understanding)).toEqual(["electricCar"]);
        expect(ruledOut(read.understanding).some((rule) => rule.id === "electricCar" && rule.mode === "must")).toBe(false);
        expect(read.heardAs).toEqual(["not electric"]);
    });

    it("read “it must be electric” as what “What can it run on?” sets for electric, so that question shows it picked", async () => {
        const read = await readTyped(startChat(null, cars()), "it must be electric", cars(), null);

        expect(fuel(read.understanding)).toEqual(["dieselCar", "petrolCar", "plugInHybrid"]);
        expect(read.understanding.needs.some((need) => need.id === "electric")).toBe(false);
    });

    it("read “it doesn't have to be electric” as no rule at all", async () => {
        const read = await readTyped(startChat(null, cars()), "it doesn't have to be electric", cars(), null);

        expect(ruledOut(read.understanding)).toEqual([]);
    });
});

describe("words that are a deal-breaker row's own", () => {
    it("set that row, so “Doesn't matter” on it takes the rule back", async () => {
        /* A page where the cars differ on the gearbox, so the row can be a deal-breaker. */
        const page = fleet().slice(0, 24);
        const start = startChat(null, page);
        const read = await readTyped(start, "I need an automatic", page, null);
        const deals = stepFor("deals", page, read.understanding)!;

        expect(read.understanding.needs.map((need) => need.id)).toEqual(["rules-automatic"]);
        expect(read.heardAs).toEqual(["must have an automatic gearbox"]);
        expect(selectedFor(deals, read.understanding)).toContain("automatic=must");

        const cleared = withDeals(read.understanding, deals.deals!.map((row) => row.id), {});
        expect(ruledOut(cleared)).toEqual([]);
    });

    it("say “no SUVs” as the SUV row, without a size nobody asked for", async () => {
        const read = await readTyped(startChat(null, cars()), "no SUVs please", cars(), null);

        expect(read.understanding.needs.map((need) => need.id)).toEqual(["rules-no-suv"]);
        expect(read.reply).toBe("Not an SUV.");
    });
});

describe("words about towing, distance and money", () => {
    it("read a caravan as carrying a trailer", async () => {
        const read = await readTyped(startChat(null, cars()), "we tow a caravan", cars(), null);

        expect(read.understanding.bubbles?.carry?.chips).toEqual(["trailer"]);
    });

    it("read a distance a month or a year as the distance, not as long drives", async () => {
        const month = await readTyped(startChat(null, cars()), "I drive 2000 km a month", cars(), null);
        const year = await readTyped(startChat(null, cars()), "about 30,000 km a year", cars(), null);

        expect(month.understanding.monthlyKm?.value).toBe(2000);
        expect(month.understanding.bubbles?.long).toBeUndefined();
        expect(month.heardAs).toEqual(["distance: about 2,000 km a month"]);
        expect(year.understanding.monthlyKm?.value).toBe(2500);
    });

    it("read a limit with a stretch as both, and say it back without calling it firm", async () => {
        const read = await readTyped(startChat(null, cars()), "around 650, could stretch to 700", cars(), null);

        expect(read.understanding.budget).toMatchObject({ monthly: 650, stretchTo: 700 });
        expect(read.reply).not.toMatch(/firm/);
        expect(summaryOf(read.understanding).lines.find((line) => line.label === "Monthly limit")?.value).toBe("€650 all in, up to €700 at a push");
    });
});
