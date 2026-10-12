import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { BUBBLES } from "@/lib/lens-chat/bubbles";
import { EMPTY_UNDERSTANDING, ruledOut } from "@/lib/lens-chat/understanding";

import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { askBeforeResult, chatAnswers, judgementFrom, judgeWith, letGoAsk, resultMessage, rulesSignature } from "./judge";
import { buildCostAnalysis } from "@/lib/reasoning-engine/cost";
import type { Understanding } from "@/lib/lens-chat/understanding";
import { syncBubbles, withBubbles } from "@/lib/lens-chat/bubbles";
import { readEvidence } from "@/lib/lens-chat/evidence";
import { DEAL_MEANS, demandOf, letGo, withDeals } from "@/lib/lens-chat/deals";
import { IMPORTANCE, IMPORTANCE_LABEL as LEVEL_LABEL } from "@/lib/lens-chat/importance";
import { SOURCES } from "@/lib/sources";
import { addMonths } from "@/lib/reasoning-engine/contract";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { activeFollowUp, addItem, answer, doneAdjusting, followUps, neverMind, askNext, keepShort, openedWhy, changeAnswers, changeOne, removeItem, rentalMonths, rewind, rewindable, setImportance, startChat as beginChat, startMonth, stepFor, summaryOf } from "./flow";
import type { Chat, ChatMessage, SavedSettings, StepId } from "./types";

/** A first chat, past "Got it — let's start": most tests begin at the first question. */
function startChat(...args: Parameters<typeof beginChat>): ReturnType<typeof beginChat> {
    const chat = beginChat(...args);
    const intro = [...chat.messages].reverse().find((message) => message.kind === "ask" && !message.answered && message.step.id === "intro");
    return intro ? answer(chat, intro.id, ["go"], args[1], args[2]).chat : chat;
}

/*
 * A whole conversation with Lens, walked without a browser: every step is a
 * pure function of the chat before it. The conversation is the one in
 * docs/LIFE-BUBBLES-SPEC-v2.md.
 */

const cars = () => [GARAGE.safeCompact(), GARAGE.familySuv(), GARAGE.cityHatch(), GARAGE.longRangeEv(), GARAGE.thirstyPetrol()];
const TODAY = new Date("2026-09-29T10:00:00Z");

type Ask = Extract<ChatMessage, { kind: "ask" }>;
type Summary = Extract<ChatMessage, { kind: "summary" }>;

const openAsk = (chat: Chat): Ask | null => {
    const last = [...chat.messages].reverse().find((message) => message.kind === "ask");
    return last?.kind === "ask" && !last.answered ? last : null;
};

const texts = (chat: Chat) => chat.messages.filter((message) => message.kind === "text" && message.from === "lens").map((message) => (message as { text: string }).text);
const asked = (chat: Chat) => chat.messages.filter((message): message is Ask => message.kind === "ask").map((message) => message.step.id);
const lastSummary = (chat: Chat) => [...chat.messages].reverse().find((message): message is Summary => message.kind === "summary")!;
const block = (chat: Chat, id: string) => lastSummary(chat).bubbles?.find((item) => item.id === id);

/** Answers whatever Lens asks with `picks[step]`, until it stops asking questions. */
function walk(chat: Chat, picks: Partial<Record<StepId, string[]>>, page = cars()): Chat {
    let current = chat;

    for (let guard = 0; guard < 20; guard += 1) {
        const ask = openAsk(current);
        if (!ask || ask.step.id === "confirm" || ask.step.id === "keep" || ask.step.id === "start" || ask.step.id === "noNeeds") return current;

        /* A section of the bubbles takes the scripted bubbles that are its own. */
        const own = new Set(ask.step.choices.map((choice) => choice.id));
        const chosen = ask.step.id.startsWith("bubbles-") ? (picks.bubbles ?? []).filter((id) => own.has(id.split(":")[0]!)) : (picks[ask.step.id] ?? []);
        current = answer(current, ask.id, chosen, page, TODAY).chat;
    }

    throw new Error("Lens never stopped asking");
}

/** Answers each section of the bubbles with the picks that are its own, up to the first question that isn't one. */
function throughBubbles(chat: Chat, picks: string[]): Chat {
    let current = chat;

    for (let ask = openAsk(current); ask?.step.id.startsWith("bubbles-"); ask = openAsk(current)) {
        const own = new Set(ask.step.choices.map((choice) => choice.id));
        current = answer(current, ask.id, picks.filter((id) => own.has(id.split(":")[0]!)), cars(), TODAY).chat;
    }

    return current;
}

const SECTIONS = ["bubbles-people", "bubbles-driving", "bubbles-copes", "bubbles-matters"];

describe("a first chat", () => {
    it("greets, says what's about to happen, then asks about the reader's life", () => {
        const chat = startChat(null, cars(), TODAY);

        expect(texts(chat)[0]).toMatch(/I'm Lens/);
        expect(asked(chat)[0]).toBe("intro");
        expect(chat.messages.find((message): message is Ask => message.kind === "ask")!.step.ask).toMatch(/show you what I understood before I judge anything/);
        expect(openAsk(chat)?.step.ask).toBe("First, who rides with you?");
        expect(openAsk(chat)?.step.choices.map((choice) => choice.label)).toEqual(["Kids", "Adults or teens", "A dog"]);
    });

    it("asks the bubbles a section at a time, how often after the driving, then the limits, and says what it understood", () => {
        const short = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "city", "city:street"], budget: ["budget-500"], period: ["period-12"] });
        const long = walk(startChat(null, cars(), TODAY), { bubbles: ["long", "traffic", "budget"], "often-long": ["weekly"], "often-traffic": ["medium"], budget: ["budget-700"], distance: ["km-1500"] });

        expect(asked(short)).toEqual(["intro", ...SECTIONS, "budget", "period", "from", "fuel", "deals", "confirm"]);
        expect(asked(long)).toEqual(["intro", "bubbles-people", "bubbles-driving", "often-long", "often-traffic", "bubbles-copes", "bubbles-matters", "budget", "period", "distance", "fuel", "deals", "confirm"]);
        expect(texts(short).at(-1)).toBe("Here's what you told me, and what I understood:");
    });

    it("asks how far they drive only when something they said makes it matter, and says it assumed otherwise", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });

        expect(asked(chat)).not.toContain("distance");
        expect(lastSummary(chat).lines.find((line) => line.label === "Driving")?.value).toMatch(/assumed — you didn't say/);
    });

    it("records the bubbles in the reader's own words, chips and all", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "weather", "weather:snow", "weather:wet"] });
        const said = chat.messages.filter((message) => message.kind === "text" && message.from === "reader").map((message) => (message as { text: string }).text);

        expect(said[0]).toBe("Got it — let's start.");
        expect(said[1]).toBe("I have kids — a baby or toddler seat.");
        expect(said[3]).toBe("The weather here is tough — snow and ice, and rain and fog.");
        expect(texts(chat)[1]).toBe("Got it — you have kids.");
        expect(texts(chat)[2]).toBe("Fine — nothing in particular for how you drive.");
    });

    it("takes no limit and no period as answers, not as questions to repeat", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });

        expect(chat.understanding.waived).toEqual(["budget", "rental"]);
        expect(askNext({ ...chat, queue: ["budget", "period"] }, cars()).messages.filter((message) => message.kind === "ask" && message.step.id === "budget")).toHaveLength(1);
    });

    it("won't judge fit on nothing: with no bubble tapped, it says so and asks again", () => {
        const chat = walk(startChat(null, cars(), TODAY), {});

        expect(openAsk(chat)?.step.id).toBe("noNeeds");
        expect(texts(chat).at(-1)).toMatch(/haven't told me anything the car has to do/);

        const again = answer(chat, openAsk(chat)!.id, ["add"], cars(), TODAY).chat;
        expect(openAsk(again)?.step.id).toBe("bubbles-people");
    });

    it("waits for the summary to be looked over, then asks whether to keep the answers", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["night"] });
        const confirm = openAsk(chat)!;

        expect(confirm.step.choices.map((choice) => choice.label)).toEqual(["Looks good to me — continue", "This doesn't look right"]);

        const going = answer(chat, confirm.id, ["go"], cars(), TODAY);
        expect(going.after).toBe("wait");
        expect(openAsk(going.chat)?.step.id).toBe("keep");

        const kept = answer(going.chat, openAsk(going.chat)!.id, ["keep-settings"], cars(), TODAY);
        expect(kept.after).toBe("judge");
        expect(kept.chat.kept).toBe("settings");
    });

    it("shows a bubble already said in the reader's own words as picked in its section", () => {
        const said = withBubbles(EMPTY_UNDERSTANDING, { long: [] });
        const chat = askNext({ ...startChat(null, cars(), TODAY), understanding: said, queue: ["bubbles-driving", "budget"] }, cars());

        expect(openAsk(chat)?.step).toMatchObject({ id: "bubbles-driving", selected: ["long"] });
    });
});

describe("standard equipment the summary says it checks", () => {
    const checks = (u: Understanding) =>
        Object.fromEntries(summaryOf(u, "summary", cars()).bubbles!.map((item) => [item.id, item.checks.map((check) => check.label)]));

    it("is said only where it can mark a car down: inside a priority something else is scored in", () => {
        /* Time in traffic scores long-distance help, not city driving: the gearbox would be checked in name only. */
        expect(checks(withBubbles(EMPTY_UNDERSTANDING, { traffic: [] })).traffic).not.toContain("Automatic gearbox");
        /* With city driving scored, it is checked — and said, under the first answer that asks for it. */
        const both = checks(withBubbles(EMPTY_UNDERSTANDING, { city: [], traffic: [] }));
        expect([...both.city!, ...both.traffic!]).toContain("Automatic gearbox");
    });

    it("is promised behind a bubble's “i” only where it's checked however the bubble's question is answered", () => {
        const standard = (group: string, id: string) =>
            (stepFor(`bubbles-${group}` as StepId, cars())!.choices.find((choice) => choice.id === id) as { standard?: { labels: string[] } }).standard?.labels ?? [];

        expect(standard("driving", "traffic")).not.toContain("Automatic gearbox");
        expect(standard("driving", "city")).toEqual(expect.arrayContaining(["Automatic gearbox", "Parking sensors"]));
        expect(standard("driving", "city")).not.toContain("Automatic emergency braking");
    });

    it("matches what the engine checks, for every bubble on its own", () => {
        for (const item of BUBBLES) {
            const u = withBubbles(EMPTY_UNDERSTANDING, { [item.id]: item.chips?.mode === "required" ? [item.chips.options[0]!.id] : [] } as never);
            const engine = new Set(Object.values(chatAnswers(u).answers.preferences.checked ?? {}).flat());
            const said = summaryOf(u, "summary", cars()).bubbles!.flatMap((bubble) => bubble.checks.map((check) => check.id));
            for (const id of said) expect(engine.has(id as never), `${item.id}: ${id}`).toBe(true);
        }
    });
});

describe("the bubbles", () => {
    /* Every bubble at once, as a chat from before the sections asks them. */
    const bubbles = () => stepFor("bubbles", cars())!;

    it("say what each means and what each checks behind its “i”", () => {
        const step = bubbles();
        const kids = step.choices.find((choice) => choice.id === "kids")!;

        expect(kids.means).toMatch(/^Children in a child seat\./);
        expect(kids.features?.[0]).toMatchObject({ label: "Rear doors", does: expect.stringMatching(/so children get in and out/) });
        expect(stepFor("bubbles-people", cars())!.why).toMatch(/The “i” on each says what I'd check/);
    });

    it("open their chips under themselves, with “&” on chips and “and” in sentences", () => {
        const step = bubbles();

        expect(step.bubbleChips?.weather).toMatchObject({ ask: "What's it like?", required: true, multiple: true });
        expect(step.bubbleChips?.weather?.options.map((option) => option.label)).toEqual(["Snow & ice", "Rain & fog", "Cold winters", "Hot summers"]);
        expect(step.bubbleChips?.city).toMatchObject({ ask: "Where do you park most often?", max: 2, required: false });
        expect(step.bubbleChips?.comfort).toMatchObject({ ask: "Which comforts?", max: 7, required: false });
        expect(step.bubbleChips?.comfort?.options).toHaveLength(13);
        expect(step.choices.find((choice) => choice.id === "help")?.label).toBe("Help driving & parking");

        for (const choice of step.choices) expect(choice.said).not.toMatch(/&/);
    });

    it("keep the chips a bubble allows: either child seat or both, two places parked, any weathers together", () => {
        const next = throughBubbles(startChat(null, cars(), TODAY), ["kids", "kids:baby", "kids:booster", "city", "city:street", "city:garage", "city:open", "weather", "weather:snow", "weather:cold"]);

        expect(next.understanding.bubbles?.kids?.chips).toEqual(["baby", "booster"]);
        expect(next.understanding.bubbles?.city?.chips).toEqual(["street", "garage"]);
        expect(next.understanding.bubbles?.weather?.chips).toEqual(["snow", "cold"]);
    });

    it("ask how often only for the bubbles that need it, and let the answer set how much they count", () => {
        const people = startChat(null, cars(), TODAY);
        const driving = answer(people, openAsk(people)!.id, [], cars(), TODAY).chat;
        const next = answer(driving, openAsk(driving)!.id, ["long"], cars(), TODAY).chat;

        expect(openAsk(next)?.step).toMatchObject({ id: "often-long", ask: "How often do you drive long distances?" });

        const rarely = answer(next, openAsk(next)!.id, ["rarely"], cars(), TODAY).chat;
        expect(rarely.understanding.needs.find((need) => need.id === "bubble-long")?.importance).toBe("niceToHave");
        expect(texts(rarely).at(-1)).toBe("Long distances will count as nice to have.");
        expect(openAsk(rarely)?.step.id).toBe("bubbles-copes");
    });
});

describe("here's what I understood", () => {
    const understood = () =>
        walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "city", "city:street", "comfort"], budget: ["budget-700"] });

    it("shows each bubble: what it checks, what's standard and what might matter — and no list of what it can't check", () => {
        const kids = block(understood(), "kids")!;

        expect(kids.heading).toBe("You have kids · a baby or toddler seat");
        expect(kids.counts.map((item) => item.label)).toEqual(["Rear doors"]);
        expect(kids.checks.map((item) => item.label)).toEqual(["ISOFIX child seat anchors"]);
        expect(kids.cantCheck).toBe("");
        expect(kids).toMatchObject({ importance: "essential", importanceSaid: true });
    });

    it("says how much a bubble counts even when nothing said so — and that it's the default", () => {
        const city = block(understood(), "city")!;

        expect(city).toMatchObject({ importance: "important", importanceSaid: false });
    });

    it("suggests only what the cars here differ on, and nothing another bubble already checks", () => {
        const summary = lastSummary(understood());
        const counted = new Set(summary.bubbles!.flatMap((item) => item.counts.map((count) => count.id)));

        for (const item of summary.bubbles!) for (const worth of item.worth) expect(counted.has(worth.id), worth.id).toBe(false);
        /* Street parking counts the reversing camera already, so the city bubble doesn't suggest it. */
        expect(summary.bubbles!.find((item) => item.id === "city")!.worth.map((item) => item.id)).not.toContain("hasOneEightyDegreesReversingCamera");
    });

    it("says a comforts bubble counts nothing until the reader says which", () => {
        const comfort = block(understood(), "comfort")!;

        expect(comfort.counts).toEqual([]);
        expect(comfort.empty).toBe("Tell me which, and I'll count them.");
    });

    it("has no priority names or percentages", () => {
        const summary = lastSummary(understood());

        expect(summary.priorities).toBeUndefined();
        expect(JSON.stringify(summary)).not.toMatch(/%|Practicality|City & Parking/);
    });

    it("takes an item out, offers it back, and redraws the same card", () => {
        const chat = understood();
        const card = lastSummary(chat);
        const out = removeItem(chat, "city", "compactLength", cars());
        const redrawn = out.messages.find((message) => message.id === card.id) as Summary;

        expect(redrawn.bubbles!.find((item) => item.id === "city")!.counts.map((item) => item.id)).not.toContain("compactLength");
        expect(chatAnswers(out.understanding).answers.features.cityParking.map((item) => item.key)).not.toContain("compactLength");

        const back = addItem(out, "city", "compactLength", cars());
        expect(chatAnswers(back.understanding).answers.features.cityParking.map((item) => item.key)).toContain("compactLength");
    });

    it("sets how much a bubble counts, and keeps it over the default", () => {
        const chat = understood();
        const next = setImportance(chat, "bubble-city", "niceToHave", cars());

        expect(block(next, "city")).toMatchObject({ importance: "niceToHave", importanceSaid: true });
        expect(next.understanding.needs.find((need) => need.id === "bubble-city")?.importance).toBe("niceToHave");
    });
});

describe("deal-breakers and deal-sealers", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);
    const toDeals = (bubbles: string[], budget: string[] = []) => {
        let chat = startChat(null, page(), TODAY);
        for (let guard = 0; guard < 20 && openAsk(chat)?.step.id !== "deals"; guard += 1) {
            const ask = openAsk(chat)!;
            const own = new Set(ask.step.choices.map((choice) => choice.id));
            const picks =
                ask.step.id === "budget"
                    ? budget
                    : ask.step.id.startsWith("bubbles-")
                      ? bubbles.filter((id) => own.has(id.split(":")[0]!))
                      : ask.step.id.startsWith("often-")
                        ? [ask.step.choices[0]!.id]
                        : [];
            chat = answer(chat, ask.id, picks, page(), TODAY).chat;
        }
        return chat;
    };
    const row = (chat: Chat, id: string) => openAsk(chat)!.step.deals!.find((item) => item.id === id);

    it("comes in sections, what the bubbles point to first, each saying why behind its “i”", () => {
        const step = openAsk(toDeals(["carry", "carry:trailer", "environment"]))!.step;
        const yours = step.deals!.filter((item) => item.group === "yours");

        expect(step.ask).toBe("Any deal-breakers or deal-sealers?");
        expect(step.groups?.map((group) => group.title)).toEqual(["From what you told me", "Money & time", "The car itself"]);
        expect(yours.map((item) => item.id).sort()).toEqual(["co2", "towbar"]);
        /* The environment already weighs CO₂: the row asks only whether it's a line, and says so. */
        expect(yours.find((item) => item.id === "co2")).toMatchObject({
            options: ["must"],
            note: "You care about the environment, so lower CO₂ already ranks higher. “Must have” sets aside every car above class C.",
        });
        expect(yours.find((item) => item.id === "towbar")?.suggested).toBe("Recommended because you said a trailer or caravan.");
        expect(step.deals!.slice(0, 2).map((item) => item.group)).toEqual(["yours", "yours"]);
    });

    it("offers only what each row can do: a rule where it splits the cars, a seal where Lens can score it", () => {
        const chat = toDeals(["dog"]);

        /* What Lens can only rule on can't seal the deal, and says so. */
        /* Electric or not is "What can it run on?" now, not a row. */
        expect(row(chat, "electric")).toBeUndefined();
        /* Wanted or not: "Must be" and "Mustn't be" an SUV, both rules. */
        expect(row(chat, "suv")).toMatchObject({ label: "SUV", options: ["must", "mustNot"] });
        expect(row(chat, "suv")?.note).toBe("I can only rule on this, not weigh it — so it can't seal the deal.");
        expect(row(chat, "automatic")?.options).toEqual(["must", "seal"]);
        expect(row(chat, "co2")).toMatchObject({ label: "Low CO₂ emissions", options: ["must", "seal"] });
    });

    it("says why “Must be” is missing where no car here would be left", () => {
        const page = fleet().sort((a, b) => a.id - b.id).slice(300, 324);
        const frugal = stepFor("deals", page, EMPTY_UNDERSTANDING)!.deals!.find((item) => item.id === "frugal")!;

        expect(frugal.options).toEqual(["seal"]);
        expect(frugal.note).toBe("None of the cars here is frugal for its kind, so “Must be” would set every car aside.");
    });

    it("leaves out low CO₂ where only electric cars are left: every one is class A", () => {
        const page = fleet().sort((a, b) => a.id - b.id).slice(0, 48);
        const u = { ...EMPTY_UNDERSTANDING, needs: [{ id: "fuel", label: "What it runs on", importance: "essential", said: "", priorities: [], evidence: (["petrolCar", "dieselCar", "plugInHybrid"] as const).map((id) => ({ id, use: "", unwanted: true, mustHave: false })), notInData: null, status: "active" }] } as unknown as Understanding;

        expect(stepFor("deals", page, EMPTY_UNDERSTANDING)!.deals!.some((item) => item.id === "co2")).toBe(true);
        expect(stepFor("deals", page, u)!.deals!.some((item) => item.id === "co2")).toBe(false);
    });

    it("star frugal for its kind for a budget, as money: what a car uses is part of what it costs", () => {
        const page = fleet().sort((a, b) => a.id - b.id).slice(100, 124);
        const deal = (u: Understanding) => stepFor("deals", page, u)!.deals!.find((item) => item.id === "frugal")!;
        const budget = deal(withBubbles(EMPTY_UNDERSTANDING, { budget: [] }));

        expect(budget).toMatchObject({ group: "yours", suggested: "Recommended because you're on a budget.", options: ["must"] });
        expect(budget.description).toMatch(/^Cheaper to run than cars on the same fuel/);
        expect(budget.note).toBe("You're on a budget, so using less for its kind already ranks higher. “Must be” sets aside every car that isn't.");
        /* With nothing weighing it already, it can seal the deal, and sits with the money. */
        expect(deal(withBubbles(EMPTY_UNDERSTANDING, { dog: [] }))).toMatchObject({ group: "money", options: ["must", "seal"] });
    });

    it("on the summary, say the bubble ranks and the deal-breaker sets aside", () => {
        const moderate = withBubbles(EMPTY_UNDERSTANDING, { environment: ["moderate"] });
        const note = (u: Understanding) => summaryOf(u, "summary", cars()).bubbles!.find((item) => item.id === "environment")!.figureNote;

        expect(note(moderate)).toBe("Lower CO₂ ranks higher; no car is set aside for it.");
        expect(note(withDeals(moderate, ["co2"], { co2: "must" }))).toBe("Your deal-breaker sets aside every car above class C; among the rest, lower CO₂ ranks higher.");
        expect(summaryOf(withBubbles(EMPTY_UNDERSTANDING, { budget: [] }), "summary", cars()).bubbles!.find((item) => item.id === "budget")!.figureNote).toBe(
            "Using less for its kind ranks higher; no car is set aside for it.",
        );
    });

    it("keeps only SUVs, or none, as the reader says", () => {
        const suv = (state: "must" | "mustNot") => ruledOut(withDeals(EMPTY_UNDERSTANDING, ["suv"], { suv: state }));

        expect(suv("must")).toEqual([expect.objectContaining({ id: "suvBody", mode: "must" })]);
        expect(suv("mustNot")).toEqual([expect.objectContaining({ id: "suvBody", mode: "without" })]);
    });

    it("sets cars aside for a deal-breaker, and counts a deal-sealer as a top priority without setting any aside", () => {
        const chat = toDeals(["dog"]);
        const done = answer(chat, openAsk(chat)!.id, ["suv=mustNot", "towbar=seal"], page(), TODAY).chat;
        const said = done.messages.filter((message) => message.kind === "text" && message.from === "reader").at(-1);

        expect(ruledOut(done.understanding).map((rule) => [rule.id, rule.mode])).toEqual([["suvBody", "without"]]);
        expect(done.understanding.needs.find((need) => need.id === "sealer-towbar")).toMatchObject({ importance: "essential", evidence: [{ id: "hasTowbar" }] });
        expect(chatAnswers(done.understanding).answers.features.practicality).toContainEqual(expect.objectContaining({ key: "hasTowbar", importance: "high" }));
        expect(said).toMatchObject({ text: "It mustn't be an SUV. A towbar would seal it." });
        expect(texts(done).at(-2)).toBe("Noted. Before judging, I'll set aside any SUV. A towbar will count as a top priority.");
        expect(lastSummary(done).lines.filter((line) => line.step === "deals").map((line) => line.value)).toEqual(["No SUV", "A towbar"]);
    });

    it("asks it again as it was, and takes back what's set to “Doesn't matter”", () => {
        const chat = toDeals(["dog"]);
        const done = answer(chat, openAsk(chat)!.id, ["automatic=must", "towbar=seal"], page(), TODAY).chat;
        const again = changeOne(done, "deals", page());

        expect(openAsk(again)?.step.selected?.sort()).toEqual(["automatic=must", "towbar=seal"]);

        const cleared = answer(again, openAsk(again)!.id, [], page(), TODAY).chat;
        expect(ruledOut(cleared.understanding)).toEqual([]);
        expect(cleared.understanding.needs.some((need) => need.id.startsWith("sealer-"))).toBe(false);
    });

    it("offers “over my limit” once there's a limit, under money", () => {
        const chat = toDeals(["dog"], ["budget-500"]);

        expect(row(chat, "limit")).toMatchObject({ group: "money", options: ["mustNot"] });
        expect(row(toDeals(["dog"]), "limit")).toBeUndefined();

        const firm = answer(chat, openAsk(chat)!.id, ["limit=mustNot"], page(), TODAY).chat;
        expect(firm.understanding.budget).toMatchObject({ monthly: 500, firm: true, kind: "hardMax" });
        expect(summaryOf(firm.understanding).lines.find((line) => line.label === "Monthly limit")?.value).toBe("€500 all in, nothing over it");
    });

    it("sets aside cars over a firm limit rather than grading them", () => {
        const chat = toDeals(["city"], ["budget-500"]);
        const firm = answer(chat, openAsk(chat)!.id, ["limit=mustNot"], page(), TODAY).chat;
        const judged = judgeWith(firm.understanding, page(), "24 cars")!;
        const verdicts = judgementFrom(judged, page(), firm.understanding, "", "", {}, "").verdicts;
        const over = judged.run.overLimit?.ids ?? [];

        expect(over.length).toBeGreaterThan(0);
        for (const id of over) expect(verdicts[id]).toMatchObject({ label: "Ruled out", rank: null });
    });

    it("stops checking what a deal-breaker settles", () => {
        const chat = toDeals(["carry", "carry:trailer"]);
        const done = walk(answer(chat, openAsk(chat)!.id, ["towbar=must"], page(), TODAY).chat, {}, page());

        expect(block(done, "carry")!.counts.map((item) => item.id)).not.toContain("hasTowbar");
    });
});


describe("a chat from saved settings", () => {
    const settings = (): SavedSettings => {
        const asked = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:booster", "long"], "often-long": ["monthly"], budget: ["budget-700"], period: ["period-6"] });

        return { savedAt: TODAY.toISOString(), fromChatId: asked.id, understanding: asked.understanding, rentalMonths: rentalMonths(asked.understanding) };
    };

    it("greets the reader back with what it understood, and offers to judge straight away", () => {
        const chat = startChat(settings(), cars(), TODAY);

        expect(texts(chat)[0]).toMatch(/Welcome back/);
        expect(lastSummary(chat).bubbles?.map((item) => item.id)).toEqual(["kids", "long"]);
        expect(openAsk(chat)?.step.choices.map((choice) => choice.id)).toEqual(["judge", "change", "scratch"]);
        expect(answer(chat, openAsk(chat)!.id, ["judge"], cars(), TODAY).after).toBe("judge");
    });

    it("keeps the period as a length, starting from whenever the new chat starts", () => {
        const chat = startChat(settings(), cars(), new Date("2027-03-02T10:00:00Z"));

        expect(chat.understanding.rental).toMatchObject({ from: "2027-04", to: "2027-09" });
    });

    it("asks which answers to change, then asks those again with the last answers picked", () => {
        const chat = startChat(settings(), cars(), TODAY);
        const which = answer(chat, openAsk(chat)!.id, ["change"], cars(), TODAY).chat;

        expect(openAsk(which)?.step.choices.find((choice) => choice.id === "bubbles-people")?.description).toBe("Now: you have kids.");
        expect(openAsk(which)?.step.choices.find((choice) => choice.id === "bubbles-driving")?.description).toBe("Now: you drive long distances.");
        expect(openAsk(which)?.step.choices.find((choice) => choice.id === "often-long")?.description).toBe("Now: about once a month.");

        const changing = answer(which, openAsk(which)!.id, ["bubbles-driving"], cars(), TODAY).chat;
        expect(openAsk(changing)?.step).toMatchObject({ id: "bubbles-driving", selected: ["long"] });

        /* How often is asked again with it, as it was; the other sections stay as they were. */
        const again = answer(changing, openAsk(changing)!.id, ["long"], cars(), TODAY).chat;
        expect(again.understanding.bubbles?.kids?.chips).toEqual(["booster"]);
        expect(openAsk(again)?.step).toMatchObject({ id: "often-long", selected: ["monthly"] });
    });

    it("starts from nothing, when asked, without touching the settings", () => {
        const chat = startChat(settings(), cars(), TODAY);
        const fresh = answer(chat, openAsk(chat)!.id, ["scratch"], cars(), TODAY).chat;

        expect(fresh.understanding.needs).toEqual([]);
        expect(fresh.kept).toBeNull();
        expect(openAsk(fresh)?.step.id).toBe("bubbles-people");
    });
});

describe("after a judgement", () => {
    const judged = (): Chat => ({
        ...walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "weather", "weather:snow"], budget: ["budget-500"] }),
        phase: "judged",
        judgement: { carIds: [] } as unknown as Chat["judgement"],
    });

    it("asks whether to change all the answers or only some", () => {
        const ask = openAsk(changeAnswers(judged(), cars()))!;

        expect(ask.step.id).toBe("changeHow");
        expect(ask.step.choices.map((choice) => choice.label)).toEqual(["Change all my answers", "Change some of my answers"]);
    });

    it("asks every question again for all of them, with what was said already picked", () => {
        const changed = changeAnswers(judged(), cars());
        const all = answer(changed, openAsk(changed)!.id, ["all"], cars(), TODAY).chat;

        expect(openAsk(all)?.step).toMatchObject({ id: "bubbles-people", selected: ["kids"] });
        expect(all.kept).toBeNull();
    });

    it("asks only the picked questions for some, then says back what it understood", () => {
        const changed = changeAnswers(judged(), cars());
        const some = answer(changed, openAsk(changed)!.id, ["some"], cars(), TODAY).chat;
        const which = openAsk(some)!;

        expect(which.step.choices.find((choice) => choice.id === "budget")?.description).toBe("Now: €500 a month.");
        /* How often is offered only for a bubble that asks it. */
        expect(which.step.choices.map((choice) => choice.id)).not.toContain("often-long");

        const picked = answer(some, which.id, ["budget"], cars(), TODAY).chat;
        expect(openAsk(picked)?.step).toMatchObject({ id: "budget", selected: ["budget-500"] });

        const done = answer(picked, openAsk(picked)!.id, ["budget-700"], cars(), TODAY).chat;
        expect(openAsk(done)?.step.id).toBe("confirm");
        expect(done.understanding.budget?.monthly).toBe(700);
        expect(done.understanding.bubbles?.kids).toBeDefined();
    });

    it("keeps everything when the reader changes their mind — exactly as it was", () => {
        const before = judged();
        const changed = changeAnswers(before, cars());
        const never = answer(changed, openAsk(changed)!.id, [], cars(), TODAY).chat;

        expect(never.messages).toEqual(before.messages);
        expect(never.phase).toBe("judged");
        expect(never.beforeChange).toBeUndefined();
        expect(never.history ?? []).toEqual(before.history ?? []);
    });
});

describe("the reader's own numbers", () => {
    it("takes the reader's own amount, length, start and distance", () => {
        let chat = throughBubbles(startChat(null, cars(), TODAY), ["budget"]);

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 650 }).chat;
        expect(chat.understanding.budget?.monthly).toBe(650);

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 9 }).chat;
        expect(chat.understanding.rental).toMatchObject({ from: "2026-10", to: "2027-06" });

        /* Three months from now: the same nine months, starting in December. */
        expect(openAsk(chat)?.step.id).toBe("from");
        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 3 }).chat;
        expect(chat.understanding.rental).toMatchObject({ from: "2026-12", to: "2027-08" });

        expect(openAsk(chat)?.step.id).toBe("distance");
        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 1200 }).chat;
        expect(chat.understanding.monthlyKm?.value).toBe(1200);
    });

    it("changes one answer from the summary, and comes straight back to it", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["city"], budget: ["budget-400"] });
        const changing = changeOne(chat, "budget", cars());

        expect(openAsk(changing)?.step).toMatchObject({ id: "budget", selected: ["budget-400"] });

        const done = answer(changing, openAsk(changing)!.id, ["budget-700"], cars(), TODAY).chat;
        expect(done.understanding.budget?.monthly).toBe(700);
        expect(openAsk(done)?.step.id).toBe("confirm");
    });
});

describe("dates", () => {
    it("starts a rental next month, since FINN delivers in weeks", () => {
        expect(startMonth(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01");
    });
});

describe("taking an answer back", () => {
    const start = () => {
        const people = startChat(null, cars(), TODAY);
        const driving = answer(people, openAsk(people)!.id, [], cars(), TODAY).chat;
        return answer(driving, openAsk(driving)!.id, ["long"], cars(), TODAY).chat;
    };

    it("undoes everything the last answer did, and asks the question again with it picked", () => {
        const before = start();
        const weekly = answer(before, openAsk(before)!.id, ["weekly"], cars(), TODAY).chat;

        expect(weekly.understanding.needs.find((need) => need.id === "bubble-long")?.importance).toBe("essential");
        expect(rewindable(weekly)).toBe(weekly.messages.filter((message) => message.from === "reader").at(-1)!.id);

        const back = rewind(weekly);

        expect(openAsk(back)?.step).toMatchObject({ id: "often-long", selected: ["weekly"] });
        expect(back.messages).toHaveLength(before.messages.length);
        expect(back.understanding).toEqual(before.understanding);
    });

    it("steps back one answer at a time, to the section with what was picked", () => {
        const back = rewind(start());

        expect(openAsk(back)?.step).toMatchObject({ id: "bubbles-driving", selected: ["long"] });
        expect(back.understanding.bubbles?.long).toBeUndefined();
        expect(openAsk(rewind(back))?.step.id).toBe("bubbles-people");
    });

    it("offers no way back once the answers are kept and judged", () => {
        const looked = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });
        const kept = answer(looked, openAsk(looked)!.id, ["go"], cars(), TODAY).chat;
        const judged = answer(kept, openAsk(kept)!.id, ["keep-chat"], cars(), TODAY).chat;

        expect(judged.history).toEqual([]);
        expect(rewindable(judged)).toBeNull();
    });
});

describe("chats from before the bubbles", () => {
    it("skip the old group, follow-up and offer questions still queued", () => {
        const chat = askNext({ ...startChat(null, cars(), TODAY), queue: ["life-people", "focus", "offers", "budget"] as StepId[] }, cars());

        expect(openAsk(chat)?.step.id).toBe("budget");
        expect(stepFor("life-people" as StepId, cars())).toBeNull();
    });
});

describe("a bubble a deal-breaker settles", () => {
    it("says the rule settles it, and leaves no need to repeat it", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "dog"], deals: ["doors=must"] });

        expect(block(chat, "kids")).toMatchObject({ counts: [], settled: "A deal-breaker already sets aside every car without rear doors." });
        expect(chat.understanding.needs.map((need) => need.id)).not.toContain("bubble-kids");
    });
});

describe("see why, remembered", () => {
    const withResults = (chat: Chat, n: number): Chat => ({
        ...chat,
        messages: [...chat.messages, ...Array.from({ length: n }, (_, index) => ({ id: `r${index}`, at: "", from: "lens", kind: "result", headline: "", count: 0, winner: null, reason: null, note: null, runnersUp: [], setAside: 0 }) as ChatMessage)],
    });

    it("opens later results with everything once the reader opens two in a row, until “Keep it short”", () => {
        const chat = withResults(startChat(null, cars(), TODAY), 2);
        const once = openedWhy(chat, "r1");

        expect(once.longResults).toBe(false);

        const twice = openedWhy(once, "r0");
        expect(twice.longResults).toBe(true);
        expect(keepShort(twice)).toMatchObject({ longResults: false, opened: [] });
    });

    it("doesn't count two opens of results that aren't the last two", () => {
        const chat = openedWhy(openedWhy(withResults(startChat(null, cars(), TODAY), 3), "r0"), "r1");

        expect(chat.longResults).toBe(false);
    });
});

describe("answers that can't all be true", () => {
    const understood = (picks: Partial<Record<StepId, string[]>>) => walk(startChat(null, cars(), TODAY), picks);

    it("takes every weather together — cold winters beside rain or snow — and keeps all four", () => {
        const step = stepFor("bubbles-copes", cars())!;
        const all = throughBubbles(startChat(null, cars(), TODAY), ["weather", "weather:snow", "weather:wet", "weather:cold", "weather:hot"]);

        expect(step.bubbleChips?.weather?.exclusive).toBeUndefined();
        expect(all.understanding.bubbles?.weather?.chips).toEqual(["snow", "wet", "cold", "hot"]);
    });

    it("doesn't offer “No fixed limit” to someone who said they're on a budget", () => {
        const onBudget = understood({ bubbles: ["budget"] });
        const budget = (chat: Chat) => chat.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "budget")!.step;

        expect(budget(onBudget).none).toBeUndefined();
        expect(budget(onBudget).custom).toBeDefined();
        expect(budget(understood({ bubbles: ["dog"] })).none).toBe("No fixed limit");
    });

    it("doesn't offer a few hundred kilometres a month to someone who drives long distances every day", () => {
        const distance = (often: string) =>
            understood({ bubbles: ["long"], "often-long": [often] }).messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "distance")!.step;

        expect(distance("daily").choices.map((choice) => choice.id)).toEqual(["km-1500", "km-2500"]);
        expect(distance("daily").why).toMatch(/every day, so I've left out distances shorter/);
        expect(distance("weekly").choices.map((choice) => choice.id)).toContain("km-500");
    });

    it("keeps how green apart from how much it counts: setting one leaves the other", () => {
        const chat = understood({ bubbles: ["environment", "environment:zero"] });
        const next = setImportance(chat, "bubble-environment", "niceToHave", cars());

        expect(next.understanding.bubbles?.environment).toMatchObject({ chips: ["zero"], importance: "niceToHave" });
        expect(block(next, "environment")).toMatchObject({ heading: "You care about the environment · totally green", importance: "niceToHave" });
    });

    it("shows each item once, and takes it out of every bubble that counts it", () => {
        const chat = understood({ bubbles: ["long", "traffic"] });

        expect(block(chat, "long")!.counts.map((item) => item.id)).toContain("driverAssistLevel2");
        expect(block(chat, "traffic")).toMatchObject({ counts: [], shared: [{ id: "driverAssistLevel2", label: "Level 2 driver assistance" }] });

        const out = removeItem(chat, "traffic", "driverAssistLevel2", cars());
        expect(chatAnswers(out.understanding).answers.features.longDistance.map((item) => item.key)).not.toContain("driverAssistLevel2");
        expect(block(out, "long")!.counts.map((item) => item.id)).not.toContain("driverAssistLevel2");
    });

    it("doesn't suggest a heat pump to someone who won't go electric", () => {
        const page = fleet().sort((a, b) => a.id - b.id).slice(0, 24);
        const chat = walk(startChat(null, page, TODAY), { bubbles: ["weather", "weather:snow"], fuel: ["fuel-petrolCar", "fuel-dieselCar", "fuel-plugInHybrid"] }, page);
        const electric = walk(startChat(null, page, TODAY), { bubbles: ["weather", "weather:snow"] }, page);

        expect(block(chat, "weather")!.worth.map((item) => item.id)).not.toContain("hasHeatPump");
        expect(block(electric, "weather")!.worth.map((item) => item.id)).toContain("hasHeatPump");
    });

    it("says a bubble with nothing left to check counts nothing, rather than offering how much", () => {
        const chat = understood({ bubbles: ["kids", "dog"] });
        const out = removeItem(chat, "kids", "rearDoors", cars());

        expect(block(out, "kids")).toMatchObject({ counting: false, counts: [], empty: expect.stringMatching(/^I'm not checking anything for this now/) });
        expect(out.understanding.needs.map((need) => need.id)).not.toContain("bubble-kids");
    });
});

describe("questions in sections, and the changes to them", () => {
    const step = (id: StepId, u = EMPTY_UNDERSTANDING) => stepFor(id, cars(), u)!;

    it("tells shopping apart from bulky things", () => {
        const carry = step("bubbles-copes").bubbleChips!.carry!;
        const chat = throughBubbles(startChat(null, cars(), TODAY), ["carry", "carry:shopping"]);

        expect(carry.options.map((option) => option.label)).toEqual(["Shopping", "Bulky things", "Bikes, skis, roof box", "Trailer or caravan"]);
        expect(carry.options.find((option) => option.id === "bulky")?.description).toMatch(/^Furniture, a pram, sports kit\./);
        expect(chat.understanding.needs.find((need) => need.id === "bubble-carry")?.evidence.map((entry) => entry.id)).toEqual(["hasElectricTailgate"]);
    });

    it("offers every comfort FINN lists that Lens can check, each by its name", () => {
        const comfort = BUBBLES.find((bubble) => bubble.id === "comfort")!;
        const counted = new Set(comfort.chips!.options.flatMap((option) => option.counts ?? []));

        for (const id of [...CATEGORIES.comfort.features, "hasHeatedSeats", "hasHeatedSteeringWheel", "hasSeatCooling", "hasAuxiliaryHeater", "hasLumbarSupport", "hasHeadUpDisplay"]) expect(counted.has(id as never), id).toBe(true);
        expect(comfort.chips!.options.map((option) => option.label)).toEqual(expect.arrayContaining(["Heated wheel", "Wireless CarPlay / Android Auto", "Wireless charging", "Premium sound"]));
        for (const option of comfort.chips!.options) expect(option.description.length, option.id).toBeGreaterThan(12);
    });

    it("asks how green, each answer saying what Lens will judge on and suggest", () => {
        const environment = step("bubbles-matters").bubbleChips!.environment!;

        expect(environment.ask).toBe("How green should the car be?");
        expect(environment.options.map((option) => option.label)).toEqual(["Clean for its fuel type", "Moderately green", "Totally green"]);
        expect(environment.options[0]!.description).toMatch(/petrol and diesel too.*FINN Lens's benchmark for cars that run on the same thing, and suggest “frugal for its kind” as a deal-breaker\. A plug-in hybrid can't be judged on it\. None of the cars here is frugal for its kind, so I won't offer it as a deal-breaker here\.$/);
        expect(environment.options[1]!.description).toMatch(/^Low CO₂ on the German label: class A to C, 115 g\/km or less\./);
        expect(environment.options[2]!.description).toMatch(/^Electric: FINN lists them in CO₂ class A, which on the German label is 0 g\/km\..*FINN's CO₂ figure says nothing about making the electricity\.$/);
    });

    it("asks the limit as all costs together, and says what that covers", () => {
        const budget = step("budget");

        expect(budget.ask).toBe("What's the most you'd spend a month, all costs together?");
        expect(budget.why).toMatch(/^All costs together: FINN's monthly price \(VAT included\), plus .* fuel or charging, plus the mileage package/);
    });

    it("lets a budget be a hard limit — set aside, not offered again as a deal-breaker — or have some give", () => {
        const hard = walk(startChat(null, cars(), TODAY), { bubbles: ["dog", "budget", "budget:hard"], budget: ["budget-700"] });
        const soft = walk(startChat(null, cars(), TODAY), { bubbles: ["dog", "budget", "budget:soft"], budget: ["budget-700"] });
        const rules = (chat: Chat) => chat.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "rules")?.step;

        expect(hard.understanding.budget).toMatchObject({ monthly: 700, kind: "hardMax", firm: true });
        expect(rules(hard)?.choices.map((choice) => choice.id) ?? []).not.toContain("firm-budget");
        expect(texts(hard)).toContain("€700 a month, all costs together. Anything over it is set aside.");

        expect(soft.understanding.budget).toMatchObject({ monthly: 700, kind: "target", firm: false });
        expect(lastSummary(soft).lines.find((line) => line.label === "Monthly limit")?.value).toBe("€700 all in, a little over is fine (up to about €805)");
        expect(soft.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "budget")!.step.why).toMatch(/up to about 15% over it still count/);
    });

    it("asks from when, with the soonest first, only once there's a length", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"], period: ["period-12"] });
        const from = chat.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "from")!.step;
        const soonest = startMonth(new Date());

        expect(from.ask).toBe("From when do you need it?");
        expect(from.choices.map((choice) => choice.id)).toEqual([0, 1, 2, 3].map((offset) => `from-${addMonths(soonest, offset)}`));
        expect(from.choices[0]!.label).toMatch(/^As soon as possible: /);
        expect(stepFor("from", cars(), EMPTY_UNDERSTANDING)).toBeNull();
        expect(asked(walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] }))).not.toContain("from");
    });

    it("keeps the length when the start moves", () => {
        const chat = throughBubbles(startChat(null, cars(), TODAY), ["dog"]);
        const limit = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;
        const length = answer(limit, openAsk(limit)!.id, ["period-12"], cars(), TODAY).chat;
        const later = addMonths(startMonth(new Date()), 2);
        const moved = answer(length, openAsk(length)!.id, [`from-${later}`], cars(), TODAY).chat;

        expect(moved.understanding.rental).toMatchObject({ from: later, to: addMonths(later, 11) });
        expect(texts(moved).at(-1)).toMatch(/^From .* to .*\. I'll price each car on the FINN term that covers it\.$/);
    });
});

describe("comforts recommended by earlier answers", () => {
    it("puts the recommended ones first, each saying why, and picks none of them", () => {
        /* A page where each of them is on some cars and not others. */
        const page = fleet().sort((a, b) => a.id - b.id).slice(0, 40);
        let chat = startChat(null, page, TODAY);
        for (const picks of [[], ["long", "traffic"], ["weekly"], ["medium"], ["weather", "weather:snow"]]) chat = answer(chat, openAsk(chat)!.id, picks, page, TODAY).chat;

        const ask = openAsk(chat)!;
        const comfort = ask.step.bubbleChips!.comfort!.options;
        const recommended = comfort.filter((option) => option.recommended);

        expect(ask.step.id).toBe("bubbles-matters");
        expect(comfort.slice(0, recommended.length)).toEqual(recommended);
        expect(recommended.map((option) => option.id)).toEqual(expect.arrayContaining(["warm", "wheel", "preheat", "lumbar", "phone", "charging"]));
        expect(comfort.find((option) => option.id === "wheel")?.recommended).toBe("Recommended because you said winters bring snow and ice, and you spend a lot of time on the road.");
        expect(comfort.find((option) => option.id === "sunroof")?.recommended).toBeUndefined();
        expect(ask.step.selected).toEqual([]);
    });

    it("aren't recommended where they can't tell the cars here apart, and say why", () => {
        const inventory = fleet();
        const has = (id: Parameters<typeof readEvidence>[1]) => inventory.filter((car) => readEvidence(car, id) === "listed");
        const lacks = (id: Parameters<typeof readEvidence>[1]) => inventory.filter((car) => readEvidence(car, id) === "notListed");
        const u = withBubbles(EMPTY_UNDERSTANDING, { weather: ["snow"], long: [] });
        const option = (cars: typeof inventory, id: string) => stepFor("bubbles-matters", cars, u)!.bubbleChips!.comfort!.options.find((item) => item.id === id)!;

        /* A heated wheel on every car here: snow and ice would recommend it anywhere else. */
        const everyOne = option(has("hasHeatedSteeringWheel").slice(0, 12), "wheel");
        expect(everyOne.recommended).toBeUndefined();
        expect(everyOne.description).toBe("A heated steering wheel. Nearly every car here has it, so it won't set the cars apart.");

        const noOne = option(lacks("hasHeatedSteeringWheel").slice(0, 12), "wheel");
        expect(noOne.recommended).toBeUndefined();
        expect(noOne.description).toBe("A heated steering wheel. None of the cars here list it.");

        const some = option([...has("hasHeatedSteeringWheel").slice(0, 6), ...lacks("hasHeatedSteeringWheel").slice(0, 6)], "wheel");
        expect(some.recommended).toMatch(/^Recommended because you said winters bring snow and ice/);
        expect(some.description).toBe("A heated steering wheel.");
    });
});

describe("what a chip's “i” promises to suggest", () => {
    const inventory = fleet();
    const has = (id: Parameters<typeof readEvidence>[1]) => inventory.filter((car) => readEvidence(car, id) === "listed");
    const lacks = (id: Parameters<typeof readEvidence>[1]) => inventory.filter((car) => readEvidence(car, id) === "notListed");
    const snow = (cars: typeof inventory) => stepFor("bubbles-copes", cars)!.bubbleChips!.weather!.options.find((option) => option.id === "snow")!.description!;

    it("says where the cars here won't keep it, and why", () => {
        const page = [...lacks("hasAuxiliaryHeater").filter((car) => readEvidence(car, "hasAllWheelDrive") === "notListed").slice(0, 10)];

        expect(snow(page)).toMatch(/ None of the cars here list pre-heating, so I won't suggest it\. None of the cars here list all-wheel drive, so I won't offer it as a deal-breaker here\.$/);
    });

    it("says nothing more where they will", () => {
        const page = [...has("hasAuxiliaryHeater").slice(0, 4), ...lacks("hasAuxiliaryHeater").slice(0, 8)];
        const mixed = [...page.filter((car) => readEvidence(car, "hasAllWheelDrive") !== "listed"), ...has("hasAllWheelDrive").slice(0, 3)];

        expect(snow(mixed)).toMatch(/though no help braking\.$/);
        expect(snow([])).toMatch(/though no help braking\.$/);
    });
});

describe("the intro", () => {
    it("says how it works, then waits for “Got it — let's start” before the first question", () => {
        const chat = beginChat(null, cars(), TODAY);
        const intro = openAsk(chat)!;

        expect(intro.step).toMatchObject({ id: "intro", ask: expect.stringMatching(/^Here's how it works/) });
        expect(intro.step.choices.map((choice) => choice.label)).toEqual(["Got it — let's start"]);

        const started = answer(chat, intro.id, ["go"], cars(), TODAY).chat;
        expect(openAsk(started)?.step.id).toBe("bubbles-people");
        expect(rewindable(started)).toBeNull();
    });

    it("isn't shown to a reader starting from saved settings", () => {
        const saved: SavedSettings = { understanding: withBubbles(EMPTY_UNDERSTANDING, { dog: [] }), rentalMonths: null, savedAt: TODAY.toISOString() } as SavedSettings;
        expect(openAsk(beginChat(saved, cars(), TODAY))?.step.id).toBe("start");
    });
});

describe("progress through the questions", () => {
    const progress = (chat: Chat) => (openAsk(chat) as Ask & { progress?: { done: number; total: number } }).progress;

    it("counts each question answered against how many there are, the total growing only when an answer adds one", () => {
        let chat = startChat(null, cars(), TODAY);
        /* Four sections, the limit, how long, from when, what it runs on, deal-breakers. */
        expect(progress(chat)).toEqual({ done: 0, total: 9 });

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;
        expect(progress(chat)).toEqual({ done: 1, total: 9 });

        /* Long distances asks how often, and makes how far you drive matter: two more. */
        chat = answer(chat, openAsk(chat)!.id, ["long"], cars(), TODAY).chat;
        expect(openAsk(chat)?.step.id).toBe("often-long");
        expect(progress(chat)).toEqual({ done: 2, total: 11 });
    });

    it("ends on the last question, and starts again for a change of some answers", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });
        const asks = chat.messages.filter((message): message is Ask & { progress?: { done: number; total: number } } => message.kind === "ask" && message.step.id === "deals");
        /* "Not sure yet" for how long: no "from when?", so eight, not nine. */
        expect(asks.at(-1)?.progress).toEqual({ done: 7, total: 8 });

        const go = answer(chat, openAsk(chat)!.id, ["go"], cars(), TODAY).chat;
        const changing = changeOne(go, "budget", cars());
        expect(progress(changing)).toEqual({ done: 0, total: 1 });
    });

    it("keeps the total while “how long?” is the question, since “from when?” follows it", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: [] }, cars());
        const totals = chat.messages
            .filter((message): message is Ask & { progress?: { done: number; total: number } } => message.kind === "ask" && ["budget", "period", "from"].includes(message.step.id))
            .map((message) => message.progress?.total);

        /* "Not sure yet" to how long takes "from when?" away after it's answered, never before. */
        expect(totals.slice(0, 2)).toEqual([9, 9]);
    });

    it("isn't shown on “how it works”, the summary's “looks good” or “what would you like to do?”", () => {
        expect(progress(beginChat(null, cars(), TODAY))).toBeUndefined();
        expect(progress(walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] }))).toBeUndefined();
    });
});

describe("follow-ups in a section", () => {
    it("lists the chip rows the tapped bubbles opened, in order, and which have an answer", () => {
        const step = stepFor("bubbles-copes", cars())!;

        expect(followUps(step, [])).toEqual([]);
        expect(followUps(step, ["weather", "carry", "carry:shopping"])).toEqual([
            { bubble: "weather", ask: "What's it like?", answered: false },
            { bubble: "carry", ask: "What do you carry?", answered: true },
        ]);
    });
});

describe("the follow-up the reader is on", () => {
    const step = () => stepFor("bubbles-matters", cars())!;

    it("is the environment's once it's opened under an answered “Which comforts?”, not the comforts'", () => {
        const picked = ["comfort", "comfort:warm", "comfort:wheel", "environment"];

        expect(activeFollowUp(step(), picked, "environment")).toEqual({ bubble: "environment", ask: "How green should the car be?", answered: false });
        expect(followUps(step(), picked).map((item) => [item.bubble, item.answered])).toEqual([
            ["comfort", true],
            ["environment", false],
        ]);
    });

    it("is none once that bubble is untapped, or when the last one tapped asks nothing more", () => {
        expect(activeFollowUp(step(), ["comfort", "comfort:warm"], "environment")).toBeNull();
        expect(activeFollowUp(step(), ["comfort", "comfort:warm", "help"], "help")?.bubble).toBe("help");
        expect(activeFollowUp(stepFor("bubbles-people", cars())!, ["kids", "dog"], "dog")).toBeNull();
    });
});

describe("“This doesn't look right”", () => {
    const looked = () => walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "dog"] });
    const adjusting = () => {
        const chat = looked();
        return answer(chat, openAsk(chat)!.id, ["adjust"], cars(), TODAY).chat;
    };

    it("opens the Adjust panel, asking nothing more until Done", () => {
        const chat = adjusting();

        expect(chat.adjusting).toBe(true);
        expect(openAsk(chat)).toBeFalsy();
        expect(texts(chat).at(-1)).toMatch(/^Let's fix it\. In the Adjust panel/);
    });

    it("says back what Lens understood now on Done, with the same two choices, edits and all", () => {
        const edited = setImportance(adjusting(), "bubble-dog", "niceToHave", cars());
        const done = doneAdjusting(edited, cars());

        expect(done.adjusting).toBe(false);
        expect(texts(done).at(-1)).toBe("Here's what I understood now:");
        expect(lastSummary(done).bubbles?.find((bubble) => bubble.id === "dog")?.importance).toBe("niceToHave");
        expect(openAsk(done)?.step.choices.map((choice) => choice.id)).toEqual(["go", "adjust"]);

        const going = answer(done, openAsk(done)!.id, ["go"], cars(), TODAY);
        expect(openAsk(going.chat)?.step.id).toBe("keep");
    });

    it("closes the panel when a line's Change asks its question in the chat, or the answer is taken back", () => {
        const changing = changeOne(adjusting(), "budget", cars());
        expect(changing.adjusting).toBe(false);
        expect(openAsk(changing)?.step.id).toBe("budget");

        const back = rewind(adjusting());
        expect(back.adjusting).toBe(false);
        expect(openAsk(back)?.step.id).toBe("confirm");
    });

    it("does nothing on Done when not adjusting", () => {
        const chat = looked();
        expect(doneAdjusting(chat, cars())).toBe(chat);
    });
});

describe("letting a deal-breaker go, when no car has them all", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);
    const strict = () => {
        const u = withDeals(withBubbles(EMPTY_UNDERSTANDING, { dog: [] }), ["electric", "automatic", "awd", "doors", "co2"], { electric: "mustNot", automatic: "must", awd: "must", doors: "must", co2: "must" });
        return { ...startChat(null, page(), TODAY), understanding: u, queue: [], phase: "judged" as const };
    };
    const ask = (chat: Chat) => {
        const judged = judgeWith(chat.understanding, page(), "24 cars")!;
        const question = letGoAsk(judged.run, "lg1", TODAY.toISOString())!;
        return { judged, chat: { ...chat, messages: [...chat.messages, question] } };
    };

    it("asks which matters least, each saying what letting it go opens up, the most first", () => {
        const { judged, chat } = ask(strict());
        const step = openAsk(chat)!.step;

        expect(step.ask).toBe("No car here has all of your deal-breakers — so which matters least to you?");
        expect(step.choices.map((choice) => choice.label)).toEqual(expect.arrayContaining(["Must have all-wheel drive", "Mustn't be electric"]));
        const fits = step.choices.map((choice) => judged.run.ruledOut!.withoutEach.find((row) => row.id === choice.id)!.fits);
        expect(fits).toEqual([...fits].sort((a, b) => b - a));
        expect(step.none).toBe("Keep them all");
        expect(resultMessage(judged, page(), "24 cars", {}, "r1", TODAY.toISOString()).know).toBe(
            "No car here has all of your deal-breakers, and you kept them all — so this is the best fit for everything else you told me.",
        );
    });

    it("turns the ones let go into deal-sealers and judges again, and can't be taken back", () => {
        const { chat } = ask(strict());
        const { chat: next, after } = answer(chat, openAsk(chat)!.id, ["hasAllWheelDrive"], page(), TODAY);

        expect(after).toBe("judge");
        expect(ruledOut(next.understanding).map((rule) => rule.id)).not.toContain("hasAllWheelDrive");
        expect(next.understanding.needs.find((need) => need.id === "sealer-awd")?.importance).toBe("essential");
        expect(texts(next).at(-1)).toBe("“Must have all-wheel drive” isn't a deal-breaker now, but it still counts as a top priority. Judging again…");
        expect(rewindable(next)).toBeNull();
    });

    it("keeps them all when asked to, then shows the result — and won't ask again on these rules", () => {
        const { judged, chat } = ask(strict());
        const { chat: next, after } = answer(chat, openAsk(chat)!.id, [], page(), TODAY);

        expect(after).toBe("judge");
        expect(ruledOut(next.understanding)).toHaveLength(5);
        expect(texts(next).at(-1)).toBe("Fine — they all stay. Here's the best fit for everything else you told me.");
        expect(next.keptRules).toBe(rulesSignature(next.understanding));
        expect(askBeforeResult(next, judged.run, "x", "")).toBeNull();
    });

    it("is asked before the result, not after it — and again when the rules change", () => {
        const { judged, chat } = ask(strict());

        expect(askBeforeResult(strict(), judged.run, "x", "")?.step.id).toBe("letGo");
        /* Kept on one set of rules, a different set asks again. */
        const kept = { ...chat, keptRules: "must:hasTowbar" };
        expect(askBeforeResult(kept, judged.run, "x", "")?.step.id).toBe("letGo");
    });

    it("isn't asked when some car has them all", () => {
        const u = withDeals(withBubbles(EMPTY_UNDERSTANDING, { dog: [] }), ["automatic"], { automatic: "must" });
        expect(letGoAsk(judgeWith(u, page(), "24 cars")!.run, "x", "")).toBeNull();
    });
});

describe("one scale for how much something counts", () => {
    it("is Top priority · Important · Nice to have, each twice the next, and none of them a rule", () => {
        expect(Object.values(LEVEL_LABEL)).toEqual(["Top priority", "Important", "Nice to have"]);
        expect(IMPORTANCE.essential.means).toMatch(/twice as much as Important/);
        expect(IMPORTANCE.niceToHave.means).toMatch(/half as much as Important/);
        /* "Must have" is a deal-breaker's word only. */
        for (const level of Object.values(IMPORTANCE)) expect(`${level.label} ${level.means}`).not.toMatch(/must have|matters\b|a big part|a small part/i);
    });

    it("is what how often says back, in a sentence", () => {
        let chat = startChat(null, cars(), TODAY);
        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;
        chat = answer(chat, openAsk(chat)!.id, ["long"], cars(), TODAY).chat;
        const weekly = answer(chat, openAsk(chat)!.id, ["weekly"], cars(), TODAY).chat;
        const monthly = answer(chat, openAsk(chat)!.id, ["monthly"], cars(), TODAY).chat;

        expect(texts(weekly).at(-1)).toBe("Long distances will count as a top priority.");
        expect(texts(monthly).at(-1)).toBe("Long distances will count as important.");
    });
});

describe("must, mustn't, or seals it", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);

    it("says each back in the reader's words", () => {
        let chat = walk(startChat(null, page(), TODAY), { bubbles: ["dog"] }, page());
        chat = rewind(chat);
        const ask = openAsk(chat)!;
        expect(ask.step.id).toBe("deals");

        const done = answer(chat, ask.id, ["automatic=must", "co2=seal"], page(), TODAY).chat;
        const said = done.messages.filter((message) => message.kind === "text" && message.from === "reader").at(-1);

        expect(said).toMatchObject({ text: "It must have an automatic gearbox. Low CO₂ emissions would seal it." });
        expect(lastSummary(walk(done, {}, page())).lines.find((line) => line.label === "Deal-sealers")?.value).toBe("Low CO₂ emissions");
    });

    it("says what each option means on hover", () => {
        expect(DEAL_MEANS).toEqual({
            must: "A deal-breaker: any car without it is set aside before I score anything.",
            mustNot: "A deal-breaker: any car that is one is set aside before I score anything.",
            seal: "A deal-sealer: counts as a top priority, but a car without it can still win if it's clearly better at everything else.",
            flex: "Still a deal-breaker, but a car also counts if it can be rented with the start a month earlier or later — and it says which.",
        });
    });
});


describe("a hard limit a car can't be confirmed within", () => {
    it("rules it out, saying exactly what FINN's data is missing", () => {
        /* A plug-in FINN's figures match nothing for in the EU data: its electricity can't be priced. */
        const plugIn = fleet().find((car) => car.fuelType === "Plug-in Hybrid" && car.model === "CX-60")!;
        const petrol = fleet().filter((car) => car.fuelType === "Petrol").sort((a, b) => a.id - b.id).slice(0, 20);
        const field = [plugIn, ...petrol];
        const base = withBubbles(EMPTY_UNDERSTANDING, { dog: [] });
        const probe = judgeWith(base, field, "cars")!.run.recommendation.context.costs;
        const limit = Math.ceil(Math.max(probe[plugIn.id]!.totalMonthly, Math.min(...petrol.map((car) => probe[car.id]!.totalMonthly)))) + 1;
        const u = { ...base, budget: { monthly: limit, kind: "hardMax" as const, firm: true, said: "", stretchTo: null } };
        const judged = judgeWith(u, field, "cars")!;
        const verdict = judgementFrom(judged, field, u, "", "", {}, "").verdicts[plugIn.id]!;

        expect(judged.run.overLimit?.unconfirmed).toContain(plugIn.id);
        expect(verdict).toMatchObject({ label: "Ruled out", rank: null });
        expect(verdict.setAside).toMatch(
            /^Can't be confirmed within your €[\d,]+ limit, which you said to keep to — missing how much electricity this plug-in hybrid uses — FINN lists only its fuel figure \(3\.8 L\/100km\), and its figures don't match a car in the EU's registration data$/,
        );
    });
});


describe("what it can run on", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 60);
    const toFuel = (bubbles: string[]) => {
        let chat = startChat(null, page(), TODAY);
        for (let guard = 0; guard < 20 && openAsk(chat)?.step.id !== "fuel"; guard += 1) {
            const ask = openAsk(chat)!;
            const own = new Set(ask.step.choices.map((choice) => choice.id));
            chat = answer(chat, ask.id, ask.step.id.startsWith("bubbles-") ? bubbles.filter((id) => own.has(id.split(":")[0]!)) : ask.step.id.startsWith("often-") ? [ask.step.choices[0]!.id] : [], page(), TODAY).chat;
        }
        return chat;
    };

    it("offers the fuels on the page, each saying what it means — plug-ins saying what FINN leaves out", () => {
        const step = openAsk(toFuel(["dog"]))!.step;
        const here = new Set(page().map((car) => car.fuelType));

        expect(step.ask).toBe("What can it run on?");
        expect(step.multiple).toBe(true);
        expect(step.none).toBe("Any of them");
        expect(step.choices.length).toBe(here.size);
        expect(step.choices.find((choice) => choice.id === "fuel-plugInHybrid")?.description).toMatch(/FINN gives only their official fuel figure, so for the electricity I use the EU's official figure for the same car, from its registration data — where I can match it, and I say when I can't\./);
        expect(stepFor("fuel", page().filter((car) => car.fuelType === "Petrol"))).toBeNull();
    });

    it("stars what how green the reader wants points to", () => {
        expect(openAsk(toFuel(["environment", "environment:zero"]))!.step.choices.filter((choice) => choice.recommended).map((choice) => choice.id)).toEqual(["fuel-electricCar"]);
        expect(openAsk(toFuel(["environment", "environment:moderate"]))!.step.choices.filter((choice) => choice.recommended).map((choice) => choice.id).sort()).toEqual(["fuel-electricCar", "fuel-plugInHybrid"]);
        expect(openAsk(toFuel(["environment", "environment:clean"]))!.step.choices.some((choice) => choice.recommended)).toBe(false);
    });

    it("sets aside every fuel not picked, says it on its own line, and takes any — or all — as no rule", () => {
        const chat = toFuel(["dog"]);
        const picked = answer(chat, openAsk(chat)!.id, ["fuel-electricCar", "fuel-plugInHybrid"], page(), TODAY).chat;

        expect(ruledOut(picked.understanding).map((rule) => [rule.id, rule.mode]).sort()).toEqual([
            ["dieselCar", "without"],
            ["petrolCar", "without"],
        ]);
        expect(texts(picked).at(-1)).toBe("Electric or plug-in hybrid only, then — I'll set aside the rest before scoring.");
        const done = walk(picked, {}, page());
        expect(lastSummary(done).lines.find((line) => line.label === "Runs on")?.value).toBe("Electric or plug-in hybrid");
        expect(lastSummary(done).lines.find((line) => line.label === "Deal-breakers")?.value).toBe("None");

        const all = answer(chat, openAsk(chat)!.id, openAsk(chat)!.step.choices.map((choice) => choice.id), page(), TODAY).chat;
        const any = answer(chat, openAsk(chat)!.id, [], page(), TODAY).chat;
        expect(ruledOut(all.understanding)).toEqual([]);
        expect(ruledOut(any.understanding)).toEqual([]);
        expect(texts(any).at(-1)).toBe("Any of them, then.");
    });

    it("is let go of as “Not petrol”, and then simply allows it again", () => {
        const chat = toFuel(["dog"]);
        const picked = answer(chat, openAsk(chat)!.id, ["fuel-electricCar"], page(), TODAY).chat;
        const rule = ruledOut(picked.understanding).find((item) => item.id === "petrolCar")!;

        expect(demandOf(rule)).toBe("Not petrol");
        const freed = letGo(picked.understanding, ["petrolCar"]);
        expect(ruledOut(freed).map((item) => item.id)).not.toContain("petrolCar");
        expect(freed.needs.find((need) => need.id === "fuel")?.evidence.some((entry) => entry.id === "petrolCar")).toBe(false);
    });
});

describe("fuels, said only as FINN's data has them", () => {
    it("claims nothing about how a fuel works, and names FINN's own “Hybrid” engines where they're filed", () => {
        const page = fleet().filter((car) => car.fuelType === "Petrol" || car.fuelType === "Diesel");
        const step = stepFor("fuel", page)!;
        const petrol = step.choices.find((choice) => choice.id === "fuel-petrolCar")!;
        const named = page.filter((car) => car.fuelType === "Petrol" && /\bhybrid\b/i.test(car.engine));

        expect(petrol.description).toMatch(/^Cars FINN lists as petrol, each priced on its listed fuel use\./);
        expect(petrol.description).toContain(`FINN files ${named.length} cars here with “Hybrid” in the engine name under petrol`);
        for (const choice of stepFor("fuel", fleet())!.choices) expect(choice.description).not.toMatch(/you don't plug in|battery you charge|charged at home|petrol engine and/i);

        const noHybrids = page.filter((car) => !named.includes(car));
        expect(stepFor("fuel", noHybrids)!.choices.find((choice) => choice.id === "fuel-petrolCar")!.description).not.toContain("Hybrid");
    });

    it("stars a fuel for moderately green only where most of its cars here are low CO₂, and says how many", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { environment: ["moderate"] });
        const step = stepFor("fuel", fleet(), u)!;
        const plugIn = step.choices.find((choice) => choice.id === "fuel-plugInHybrid")!;
        const diesel = step.choices.find((choice) => choice.id === "fuel-dieselCar")!;

        expect(plugIn.recommended).toMatch(/^Recommended because you said moderately green: \d+ of the \d+ plug-in hybrid cars here have low CO₂ emissions \(class A to C\)\.$/);
        expect(diesel.recommended).toBeUndefined();
    });
});

describe("all-wheel drive for snow and ice", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 60);
    const toDeals = (bubbles: string[]) => {
        let chat = startChat(null, page(), TODAY);
        for (let guard = 0; guard < 20 && openAsk(chat)?.step.id !== "deals"; guard += 1) {
            const ask = openAsk(chat)!;
            const own = new Set(ask.step.choices.map((choice) => choice.id));
            chat = answer(chat, ask.id, ask.step.id.startsWith("bubbles-") ? bubbles.filter((id) => own.has(id.split(":")[0]!)) : [], page(), TODAY).chat;
        }
        return openAsk(chat)!.step;
    };

    it("is recommended, first, saying which answer recommended it, and what the ADAC found — both ways — with its source", () => {
        const step = toDeals(["weather", "weather:snow"]);
        const awd = step.deals!.find((row) => row.id === "awd")!;

        expect(awd).toMatchObject({ group: "yours", suggested: "Recommended because you said snow and ice." });
        expect(step.deals![0]!.id).toBe("awd");
        /* Said plainly; the link carries who found it. */
        expect(awd.description).toBe("Power to all four wheels, with more grip pulling away and accelerating on snow. However, no help braking in the cold or on snow, and no substitute for winter tyres.");
        expect(awd.description).not.toMatch(/ADAC/);
        expect(awd.sources).toEqual([SOURCES.adacAwd]);
    });

    it("isn't recommended for rain, or for cold and dry", () => {
        expect(toDeals(["weather", "weather:wet"]).deals!.find((row) => row.id === "awd")?.suggested).toBeUndefined();
        expect(toDeals(["weather", "weather:cold"]).deals!.find((row) => row.id === "awd")?.suggested).toBeUndefined();
    });
});

describe("never mind — keep my answers", () => {
    const looked = () => walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "dog"], budget: ["budget-500"] });

    it("puts everything back after a Change tapped by mistake, Adjust panel and all", () => {
        const before = { ...looked(), adjusting: true };
        const changing = changeOne(before, "budget", cars());

        expect(changing.beforeChange).toBeDefined();
        expect(openAsk(changing)?.step.id).toBe("budget");

        const back = neverMind(changing);
        expect(back.messages).toEqual(before.messages);
        expect(back.understanding).toEqual(before.understanding);
        expect(back.adjusting).toBe(true);
        expect(back.beforeChange).toBeUndefined();
    });

    it("goes back to before the first change, however many questions in", () => {
        const before = looked();
        const changing = changeAnswers(before, cars());
        const some = answer(changing, openAsk(changing)!.id, ["some"], cars(), TODAY).chat;
        const which = answer(some, openAsk(some)!.id, ["budget", "period"], cars(), TODAY).chat;
        const budget = answer(which, openAsk(which)!.id, ["budget-700"], cars(), TODAY).chat;

        expect(budget.understanding.budget?.monthly).toBe(700);
        expect(neverMind(budget).understanding.budget?.monthly).toBe(500);
        expect(neverMind(budget).messages).toEqual(before.messages);
    });

    it("isn't offered once the changed questions are done", () => {
        const changing = changeOne(looked(), "budget", cars());
        const done = answer(changing, openAsk(changing)!.id, ["budget-700"], cars(), TODAY).chat;

        expect(openAsk(done)?.step.id).toBe("confirm");
        expect(done.beforeChange).toBeUndefined();
        expect(neverMind(done)).toBe(done);
    });
});

describe("the Adjust panel's feature chips", () => {
    it("each say what the feature does, and why it's there for this need — for their “i”", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"], weather: ["snow"], environment: ["moderate"] });
        const bubbles = summaryOf(u, "s1", cars()).bubbles!;
        const items = bubbles.flatMap((bubble) => [...bubble.counts, ...bubble.checks, ...bubble.worth]);

        expect(items.length).toBeGreaterThan(5);
        for (const item of items) expect(item.does, item.id).toMatch(/\w{4,}/);
        expect(bubbles.find((bubble) => bubble.id === "kids")!.counts.find((item) => item.id === "rearDoors")?.does).toMatch(/so children get in and out/);
        expect(bubbles.find((bubble) => bubble.id === "environment")?.figureDoes).toMatch(/official CO₂ figure FINN lists/);
    });
});

describe("the reader's own words", () => {
    it("speak in their own voice, saying a shared start once", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["adults", "city", "city:street", "city:garage"] });
        const said = chat.messages.filter((message) => message.from === "reader" && message.kind === "text").map((message) => (message as { text: string }).text);

        expect(said).toContain("Adults or teens ride with me.");
        expect(said).toContain("I live in the city — I park on the street and in a garage.");
        expect(said.join(" ")).not.toMatch(/\byou park\b|beside you/);
    });

    it("end with a full stop when the answer was the question's “none”", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });
        const said = chat.messages.filter((message) => message.from === "reader" && message.kind === "text").map((message) => (message as { text: string }).text);

        expect(said).toContain("Nothing in particular.");
        expect(said).toContain("Not sure yet.");
    });

    it("name the questions they pick to change as they'd say them", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"], budget: ["budget-500"] });
        const changing = changeAnswers(chat, cars());
        const some = answer(changing, openAsk(changing)!.id, ["some"], cars(), TODAY).chat;
        const which = answer(some, openAsk(some)!.id, ["bubbles-driving", "budget"], cars(), TODAY).chat;

        expect(texts(which).length).toBeGreaterThan(0);
        expect(which.messages.some((message) => message.kind === "text" && message.text === "I'd like to change where and how I drive and my monthly limit.")).toBe(true);
    });

    it("say which question a summary “Change” is for", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });

        for (const [step, words] of [["fuel", "what it runs on"], ["deals", "my deal-breakers and sealers"], ["from", "when I need it from"]] as const) {
            const changing = changeOne(chat, step, cars());
            expect(changing.messages.some((message) => message.kind === "text" && message.text === `I'd like to change ${words}.`), step).toBe(true);
        }
    });
});

describe("the summary's headings", () => {
    it("join a bubble's answers with “and”, and a comma where an answer has its own “and”", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { city: ["street", "garage"], weather: ["wet", "cold"] });
        const bubbles = summaryOf(u, "s", cars()).bubbles!;

        expect(bubbles.find((bubble) => bubble.id === "city")?.heading).toBe("You live in the city · you park on the street and in a garage");
        expect(bubbles.find((bubble) => bubble.id === "weather")?.heading).toBe("The weather where you live is tough · rain and fog, and cold winters");
    });

    it("keep what Lens asked and what the reader answered, in order", () => {
        const bubbles = summaryOf(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], weather: ["snow", "wet"] }), "s", cars()).bubbles!;

        expect(bubbles.find((bubble) => bubble.id === "kids")?.asked).toEqual([
            { ask: "Who rides with you?", answer: "Kids" },
            { ask: "Which child seat?", answer: "Baby or toddler seat" },
        ]);
        expect(bubbles.find((bubble) => bubble.id === "weather")?.asked).toEqual([
            { ask: "What does the car have to cope with?", answer: "Tough weather" },
            { ask: "What's it like?", answer: "Snow & ice · Rain & fog" },
        ]);
    });

    it("say why each item is on the list: the chips that name it, else the bubble, and a comfort picked by name", () => {
        const bubbles = summaryOf(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], weather: ["snow", "cold"], comfort: ["lumbar"] }), "s", cars()).bubbles!;
        const because = (bubble: string, item: string) => {
            const found = bubbles.find((each) => each.id === bubble)!;
            return [...found.counts, ...(found.shared ?? [])].find((each) => each.id === item)?.because;
        };

        expect(because("kids", "rearDoors")).toBe("you have kids");
        expect(because("weather", "hasHeatedSeats")).toBe("you said snow and ice, and cold winters");
        expect(because("comfort", "hasLumbarSupport")).toBe("you picked it");
    });
});

describe("changing how long, from the summary", () => {
    it("keeps the month it starts from", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"], period: ["period-12"], from: ["from-2027-01"] });
        expect(chat.understanding.rental).toMatchObject({ from: "2027-01", to: "2027-12" });

        const changing = changeOne(chat, "period", cars());
        const done = answer(changing, openAsk(changing)!.id, ["period-6"], cars(), TODAY).chat;

        expect(done.understanding.rental).toMatchObject({ from: "2027-01", to: "2027-06" });
    });

    it("starts next month once the month it started from has passed", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"], period: ["period-12"] });
        const later = new Date("2027-03-15T10:00:00Z");
        const changing = changeOne(chat, "period", cars());
        const done = answer(changing, openAsk(changing)!.id, ["period-6"], cars(), later).chat;

        expect(done.understanding.rental).toMatchObject({ from: "2027-04", to: "2027-09" });
    });

    it("says “Not sure yet” back as FINN's default term, not as nothing said", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });

        expect(lastSummary(chat).lines.find((line) => line.label === "For")?.value).toBe("Not sure yet — each car on FINN's default term");
    });
});

describe("bubbles that check nothing", () => {
    it("are named when nothing else was said, not called nothing", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["comfort"] });
        const said = texts(chat).at(-1)!;

        expect(openAsk(chat)?.step.id).toBe("noNeeds");
        expect(said).not.toMatch(/You haven't told me anything/);
        expect(said).toMatch(/Comfort matters to you: tell me which, and I'll count them\./);
    });

    it("say they check nothing now, once what adults or teens counted is taken out", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], adults: [] });
        const chat = removeItem({ ...walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "adults"] }), understanding: u }, "kids", "rearDoors", cars());
        const adults = lastSummary(chat).bubbles!.find((bubble) => bubble.id === "adults")!;

        expect(adults.empty).not.toMatch(/beside you/);
        expect(adults.empty).toMatch(/not checking anything/);
    });
});

describe("CO₂ beside electric only", () => {
    const inventory = fleet();
    const green = () => walk(startChat(null, inventory, TODAY), { bubbles: ["environment", "environment:zero", "dog"], fuel: ["fuel-electricCar"] }, inventory);

    it("weighs nothing — every electric car FINN lists is 0 g/km — and the summary says why", () => {
        const chat = green();
        const environment = lastSummary(chat).bubbles!.find((bubble) => bubble.id === "environment")!;

        expect(chat.understanding.needs.some((need) => need.id === "bubble-environment")).toBe(false);
        expect(environment.counting).toBe(false);
        expect(environment.figure).toBeUndefined();
        expect(environment.settled).toMatch(/^You picked electric only, and FINN lists every electric car at 0 g\/km of CO₂/);
        expect(environment.empty).toBeUndefined();
    });

    it("counts again once a fuel is let in", () => {
        const chat = green();
        const back = letGo(chat.understanding, ["petrolCar"]);

        expect(syncBubbles(back).needs.some((need) => need.id === "bubble-environment" && need.priorities.includes("environmental"))).toBe(true);
    });

    it("is said as the reason when it was all the reader gave", () => {
        const chat = walk(startChat(null, inventory, TODAY), { bubbles: ["environment", "environment:zero"], fuel: ["fuel-electricCar"] }, inventory);

        expect(openAsk(chat)?.step.id).toBe("noNeeds");
        expect(texts(chat).at(-1)).toMatch(/You care about the environment: you picked electric only, and FINN lists every electric car at 0 g\/km of CO₂/);
    });
});

describe("sealing a figure", () => {
    it("isn't offered where every car has the same one: a page of electric cars can't be told apart on CO₂", () => {
        const electric = fleet().filter((car) => car.fuelType === "Electric").slice(0, 20);
        const rows = stepFor("deals", electric, withBubbles(EMPTY_UNDERSTANDING, { environment: ["moderate"] }))!.deals!;

        expect(rows.find((row) => row.id === "co2")).toBeUndefined();
        /* Electric cars still differ in how much they use for their kind. */
        expect(rows.find((row) => row.id === "frugal")?.options).toContain("seal");
    });

    it("is offered where the cars differ on it", () => {
        const rows = stepFor("deals", fleet().slice(0, 24), EMPTY_UNDERSTANDING)!.deals!;

        expect(rows.find((row) => row.id === "co2")?.options).toContain("seal");
    });
});

describe("letting go of a fuel", () => {
    it("says the row came from what it can run on, so “Not diesel” isn't a puzzle to someone who tapped Electric", () => {
        /* Electric cars without a towbar and others with one: no car here keeps both rules. */
        const page = [
            ...fleet().filter((car) => car.fuelType === "Electric" && readEvidence(car, "hasTowbar") === "notListed").slice(0, 12),
            ...fleet().filter((car) => car.fuelType === "Diesel" && readEvidence(car, "hasTowbar") === "listed").slice(0, 12),
        ];
        const u = withDeals(walk(startChat(null, page, TODAY), { bubbles: ["carry", "carry:trailer"], fuel: ["fuel-electricCar"] }, page).understanding, ["towbar"], { towbar: "must" });
        const question = letGoAsk(judgeWith(u, page, "24 cars")!.run, "x", "")!;
        const diesel = question.step.choices.find((choice) => choice.id === "dieselCar")!;
        const towbar = question.step.choices.find((choice) => choice.id === "hasTowbar")!;

        expect(diesel.label).toBe("Not diesel");
        expect(diesel.description).toMatch(/It's one you set aside when I asked what it can run on\.$/);
        expect(towbar.description).not.toMatch(/what it can run on/);
    });
});

describe("standard equipment, said where it's asked for", () => {
    it("has a short form too, for one quiet line under the “i”", () => {
        const weather = stepFor("bubbles-copes", cars())!.choices.find((choice) => choice.id === "weather")!;

        expect(weather.standard?.short).toMatch(/^On (every car here\.|nearly every car here; one without it loses a little\.)$/);
    });

    it("names what each answer makes sure of, with a hint that says what's true of the cars here", () => {
        const page = fleet().sort((a, b) => a.id - b.id).slice(0, 40);
        const copes = stepFor("bubbles-copes", page)!;
        const driving = stepFor("bubbles-driving", page)!;
        const weather = copes.choices.find((choice) => choice.id === "weather")!;
        const traffic = driving.choices.find((choice) => choice.id === "traffic")!;

        expect(weather.standard?.labels).toEqual(["Air conditioning"]);
        expect(weather.standard?.hint).toMatch(/^(Every|Nearly every) car here has it, so it won't set the cars apart/);
        /* Adaptive cruise only: the automatic gearbox is checked for time in traffic only beside city driving, so its "i" doesn't promise it. */
        expect(traffic.standard?.labels).toEqual(["Adaptive cruise control"]);
        expect(traffic.standard?.hint).toBe("Nearly every car here has it, so it won't set the cars apart — but a car without it would lose out.");
        expect(traffic.standard?.short).toBe("On nearly every car here; one without it loses a little.");
        expect(copes.bubbleChips!.weather!.options.find((option) => option.id === "hot")?.description).toMatch(/make sure it has air conditioning/);
    });

    it("says “every car here” only when every car here has it", () => {
        const withAc = fleet().filter((car) => readEvidence(car, "hasAirConditioning") === "listed").slice(0, 10);
        const without = fleet().find((car) => readEvidence(car, "hasAirConditioning") === "notListed")!;

        expect(stepFor("bubbles-copes", withAc)!.choices.find((choice) => choice.id === "weather")!.standard!.hint).toBe("Every car here has it, so it won't set the cars apart.");
        expect(stepFor("bubbles-copes", [...withAc, without])!.choices.find((choice) => choice.id === "weather")!.standard!.hint).toBe(
            "Nearly every car here has it, so it won't set the cars apart — but a car without it would lose out.",
        );
    });

    it("says how many cars here have it where that's fewer than nearly all, and never “nearly every car here”", () => {
        const inventory = fleet();
        const withAc = inventory.filter((car) => readEvidence(car, "hasAirConditioning") === "listed").slice(0, 8);
        const without = inventory.filter((car) => readEvidence(car, "hasAirConditioning") === "notListed").slice(0, 2);
        const weather = stepFor("bubbles-copes", [...withAc, ...without])!.choices.find((choice) => choice.id === "weather")!;

        expect(weather.standard!.hint).toBe(
            "Standard on nearly every car FINN lists, but on only 8 of the 10 cars here: a car FINN says is missing it loses a little, and having it earns nothing.",
        );
        expect(weather.standard!.short).toBe("On 8 of the 10 cars here; one without it loses a little.");
        /* With no cars in hand, the fleet is all it can speak for. */
        expect(stepFor("bubbles-copes", [])!.choices.find((choice) => choice.id === "weather")!.standard!.short).toBe("On nearly every car FINN lists; one without it loses a little.");
    });

    it("on the summary, gives the count beside a standard item fewer cars here have", () => {
        const inventory = fleet();
        const withAc = inventory.filter((car) => readEvidence(car, "hasAirConditioning") === "listed").slice(0, 8);
        const without = inventory.filter((car) => readEvidence(car, "hasAirConditioning") === "notListed").slice(0, 2);
        const u = withBubbles(EMPTY_UNDERSTANDING, { weather: ["hot"] });
        const checks = (cars: typeof inventory) => summaryOf(u, "summary", cars).bubbles!.find((item) => item.id === "weather")!.checks;

        expect(checks([...withAc, ...without]).find((item) => item.id === "hasAirConditioning")?.here).toBe("On 8 of the 10 cars here.");
        expect(checks(withAc).find((item) => item.id === "hasAirConditioning")?.here).toBeUndefined();
    });
});

describe("dates as a rule", () => {
    /* Terms and delivery windows set by hand, so each car's fit with the dates is known. */
    const term = (deliveryFrom: string, deliveryTo: string) => ({ months: 12, privateMonthly: 400, businessMonthly: 340, deliveryFrom, deliveryTo, deviationWeeks: 0 });
    const withTerm = (car: ReturnType<typeof fleet>[number], from: string, to: string) => ({ ...car, contract: { defaultMonths: 12, terms: [term(from, to)] } }) as typeof car;
    const page = () => {
        const cars = fleet().sort((a, b) => a.id - b.id).slice(0, 4);
        return [
            withTerm(cars[0]!, "2026-11-01", "2026-11-30"), // November only
            withTerm(cars[1]!, "2026-12-01", "2026-12-31"), // December only
            withTerm(cars[2]!, "2026-12-01", "2026-12-31"),
            withTerm(cars[3]!, "2027-03-01", "2027-03-31"), // March only
        ];
    };
    const dated = (from: string, firm: boolean, flexMonths = 0) =>
        ({ ...withBubbles(EMPTY_UNDERSTANDING, { dog: [] }), rental: { from, to: addMonths(from, 11), startDay: null, said: "", firm, flexMonths } }) as Understanding;

    it("holds the dates as a rule from the moment they're given, until the reader says otherwise", () => {
        const cars = page();
        const chat = walk(startChat(null, cars, TODAY), { bubbles: ["dog"], period: ["period-12"], deals: ["dates=must"] }, cars);
        const asked = chat.messages.find((message) => message.kind === "ask" && message.step.id === "deals");

        /* The row comes already on "My dates only"; Continue keeps it. */
        expect(asked?.kind === "ask" && asked.step.selected).toContain("dates=must");
        expect(chat.understanding.rental).toMatchObject({ firm: true, flexMonths: 0 });
    });

    it("never picks a car that can't be had for dates held as a rule, and says why for each set aside", () => {
        const u = dated("2026-12", true);
        const judged = judgeWith(u, page(), "cars")!;
        const winner = judged.run.recommendation.winner;
        const verdicts = judgementFrom(judged, page(), u, "", "", {}, "").verdicts;

        expect(judged.run.recommendation.context.costs[winner.id]!.contract.status).toBe("fits");
        expect(judged.run.offDates?.ids.sort()).toEqual([page()[0]!.id, page()[3]!.id].sort());
        expect(verdicts[page()[3]!.id]).toMatchObject({ label: "Ruled out", rank: null });
        expect(verdicts[page()[3]!.id]!.setAside).toMatch(/^Can't be rented for your dates, which you said to keep to/);
    });

    it("takes a car a month out when a month either way is fine, and says it isn't the exact dates", () => {
        const u = dated("2026-11", true, 1);
        const judged = judgeWith(u, page(), "cars")!;
        const december = page()[1]!;
        const cost = buildCostAnalysis(december, judged.run.answers.preferences);

        expect(judged.run.offDates?.ids).toEqual([page()[3]!.id]);
        expect(cost.breakdown.contract).toMatchObject({ status: "fits", shiftedMonths: 1 });
        expect(cost.caveats[0]).toMatch(/^Not on your exact dates: it can be rented a month later, December 2026 to November 2027, which you said is fine\./);
    });

    it("asks before any result when no car here can be had, offering the nearest dates one can — and keeping the dates means no pick, not one they can't have", () => {
        const u = dated("2027-06", true);
        const judged = judgeWith(u, page(), "cars")!;
        const chat = { ...startChat(null, page(), TODAY), understanding: u, queue: [], phase: "ready" as const };
        const ask = askBeforeResult(chat, judged.run, "d1", "")!;

        expect(judged.run.offDates?.nothingLeft).toBe(true);
        expect(ask.step).toMatchObject({
            id: "datesOff",
            ask: "No car here can be rented for June 2027 to May 2028. The nearest dates any car here can be rented for are March 2027 to February 2028. What would you like to do?",
            none: "Keep my dates",
        });
        /* A month either way would find nothing here, so it isn't offered. */
        expect(ask.step.choices).toEqual([
            { id: "nearest:2027-03:2028-02", label: "Make it March 2027 to February 2028", said: "March 2027 to February 2028 works.", description: "Starts 3 months earlier, same length. 1 car here can be rented then." },
            { id: "change", label: "Change my dates", said: "I'd like to change my dates." },
        ]);

        const asked = { ...chat, messages: [...chat.messages, ask] };
        const nearest = answer(asked, "d1", ["nearest:2027-03:2028-02"], page(), TODAY);
        expect(nearest.after).toBe("judge");
        expect(nearest.chat.understanding.rental).toMatchObject({ from: "2027-03", to: "2028-02", firm: true, flexMonths: 0 });
        expect(texts(nearest.chat).at(-1)).toBe("March 2027 to February 2028, then. Judging again…");
        const again = judgeWith(nearest.chat.understanding, page(), "cars")!;
        expect(again.run.offDates?.nothingLeft).toBe(false);
        expect(again.run.recommendation.winner.id).toBe(page()[3]!.id);

        const keep = answer(asked, "d1", [], page(), TODAY);
        expect(keep.after).toBe("wait");
        expect(texts(keep.chat).at(-1)).toMatch(/^Then none of the cars on this page can be had for those dates, so I won't pick one\./);

        const change = answer(asked, "d1", ["change"], page(), TODAY);
        expect(openAsk(change.chat)?.step.id).toBe("period");
    });

    it("asks about a month either way when that would find a car, rather than offering the same move twice", () => {
        const u = dated("2027-04", true);
        const judged = judgeWith(u, page(), "cars")!;
        const chat = { ...startChat(null, page(), TODAY), understanding: u, queue: [], phase: "ready" as const };
        const ask = askBeforeResult(chat, judged.run, "d1", "")!;

        expect(ask.step.ask).toBe("No car here can be rented for April 2027 to March 2028. The nearest dates any car here can be rented for are March 2027 to February 2028. Would a month earlier or later work?");
        expect(ask.step.choices.map((choice) => choice.id)).toEqual(["flex", "change"]);

        const flex = answer({ ...chat, messages: [...chat.messages, ask] }, "d1", ["flex"], page(), TODAY);
        expect(flex.after).toBe("judge");
        expect(flex.chat.understanding.rental).toMatchObject({ firm: true, flexMonths: 1 });
    });

    it("offers a shorter period, with the same start, when the one asked for is longer than any term here", () => {
        const u = { ...dated("2026-12", true), rental: { ...dated("2026-12", true).rental!, to: "2029-11" } };
        const judged = judgeWith(u, page(), "cars")!;
        const chat = { ...startChat(null, page(), TODAY), understanding: u, queue: [], phase: "ready" as const };
        const ask = askBeforeResult(chat, judged.run, "d1", "")!;

        expect(ask.step.ask).toBe("No car here can be rented for December 2026 to November 2029. The nearest dates any car here can be rented for are December 2026 to November 2027. What would you like to do?");
        expect(ask.step.choices[0]).toMatchObject({ id: "nearest:2026-12:2027-11", description: "Same start, 12 months instead of 36. 2 cars here can be rented then." });
        expect(ask.step.choices.map((choice) => choice.id)).not.toContain("flex");
    });

    it("is offered as a deal-breaker once there are dates: my dates only, or a month either way", () => {
        const u = dated("2026-12", false);
        const step = stepFor("deals", page(), u)!;
        const row = step.deals!.find((item) => item.id === "dates")!;

        expect(row).toMatchObject({ label: "Available for my dates", options: ["must", "flex"], labels: { must: "My dates only", flex: "A month either way" }, group: "money" });
        expect(step.groups?.find((group) => group.id === "money")?.title).toBe("Money & time");
        expect(stepFor("deals", page(), withBubbles(EMPTY_UNDERSTANDING, { dog: [] }))!.deals!.some((item) => item.id === "dates")).toBe(false);

        const flex = withDeals(u, ["dates"], { dates: "flex" });
        expect(flex.rental).toMatchObject({ firm: true, flexMonths: 1 });
        expect(withDeals(flex, ["dates"], {}).rental).toMatchObject({ firm: false, flexMonths: 0 });
    });
});

describe("deal-breakers for what nearly every car has", () => {
    const inventory = fleet();
    const rows = (cars = inventory, u = EMPTY_UNDERSTANDING) => stepFor("deals", cars, u)!.deals!.map((row) => row.id);

    it("aren't offered: rear doors are on 641 of FINN's 698 cars", () => {
        expect(rows()).not.toContain("doors");
    });

    it("keep the gearbox, which an automatic-only licence can't do without however few manuals there are", () => {
        expect(rows()).toContain("automatic");
    });

    it("stay where the reader has set one, so it can be undone", () => {
        expect(rows(inventory, withDeals(EMPTY_UNDERSTANDING, ["doors"], { doors: "must" }))).toContain("doors");
    });

    it("come back on a page where enough cars go without", () => {
        const twoDoor = inventory.filter((car) => readEvidence(car, "rearDoors") === "notListed").slice(0, 6);
        const fourDoor = inventory.filter((car) => readEvidence(car, "rearDoors") === "listed").slice(0, 18);

        expect(rows([...twoDoor, ...fourDoor])).toContain("doors");
    });

    it("keep the gearbox as a deal-breaker but don't offer it as a sealer where nearly every car here is automatic", () => {
        const manual = inventory.filter((car) => readEvidence(car, "hasAutomaticTransmission") === "notListed").slice(0, 1);
        const automatic = inventory.filter((car) => readEvidence(car, "hasAutomaticTransmission") === "listed").slice(0, 23);
        const options = (cars: typeof inventory) => stepFor("deals", cars, EMPTY_UNDERSTANDING)!.deals!.find((row) => row.id === "automatic")!.options;

        expect(options([...manual, ...automatic])).toEqual(["must"]);
        /* The row says why, from the cars — not that Lens can only rule on it, which isn't so. */
        expect(stepFor("deals", [...manual, ...automatic], EMPTY_UNDERSTANDING)!.deals!.find((row) => row.id === "automatic")!.note).toBe(
            "Nearly every car here has it, so it can't seal the deal.",
        );
        /* Sealed already — after letting it go — so it can be undone. */
        expect(
            stepFor("deals", [...manual, ...automatic], withDeals(EMPTY_UNDERSTANDING, ["automatic"], { automatic: "seal" }))!.deals!.find((row) => row.id === "automatic")!.options,
        ).toContain("seal");
        expect(options([...inventory.filter((car) => readEvidence(car, "hasAutomaticTransmission") === "notListed").slice(0, 6), ...automatic.slice(0, 18)])).toContain("seal");
    });
});
