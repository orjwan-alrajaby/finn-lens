import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { BUBBLES } from "@/lib/lens-chat/bubbles";
import { EMPTY_UNDERSTANDING, ruledOut } from "@/lib/lens-chat/understanding";

import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { chatAnswers, judgementFrom, judgeWith, letGoAsk, resultMessage } from "./judge";
import { withBubbles } from "@/lib/lens-chat/bubbles";
import { DEAL_MEANS, withDeals } from "@/lib/lens-chat/deals";
import { IMPORTANCE, IMPORTANCE_LABEL as LEVEL_LABEL } from "@/lib/lens-chat/importance";
import { addMonths } from "@/lib/reasoning-engine/contract";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { activeFollowUp, addItem, allChips, answer, doneAdjusting, followUps, askNext, keepShort, openedWhy, changeAnswers, changeOne, removeItem, rentalMonths, rewind, rewindable, setImportance, startChat as beginChat, startMonth, stepFor, summaryOf } from "./flow";
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
        expect(openAsk(chat)?.step.choices.map((choice) => choice.label)).toEqual(["Kids", "Adults", "A dog"]);
    });

    it("asks the bubbles a section at a time, how often after the driving, then the limits, and says what it understood", () => {
        const short = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "city", "city:street"], budget: ["budget-500"], period: ["period-12"] });
        const long = walk(startChat(null, cars(), TODAY), { bubbles: ["long", "traffic", "budget"], "often-long": ["weekly"], "often-traffic": ["medium"], budget: ["budget-700"], distance: ["km-1500"] });

        expect(asked(short)).toEqual(["intro", ...SECTIONS, "budget", "period", "from", "deals", "confirm"]);
        expect(asked(long)).toEqual(["intro", "bubbles-people", "bubbles-driving", "often-long", "often-traffic", "bubbles-copes", "bubbles-matters", "budget", "period", "distance", "deals", "confirm"]);
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
        expect(said[3]).toBe("The weather here is tough — snow and ice and rain and fog.");
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

describe("the bubbles", () => {
    /* Every bubble at once, as a chat from before the sections asks them. */
    const bubbles = () => stepFor("bubbles", cars())!;

    it("say what each means and what each checks behind its “i”", () => {
        const step = bubbles();
        const kids = step.choices.find((choice) => choice.id === "kids")!;

        expect(kids.means).toMatch(/Children in the car/);
        expect(kids.features?.[0]).toMatchObject({ label: "Rear doors", does: expect.stringMatching(/so children get in and out/) });
        expect(stepFor("bubbles-people", cars())!.why).toMatch(/The “i” on each says what I'd check/);
    });

    it("open their chips under themselves, with “&” on chips and “and” in sentences", () => {
        const step = bubbles();

        expect(step.bubbleChips?.weather).toMatchObject({ ask: "What's it like?", required: true, multiple: true });
        expect(step.bubbleChips?.weather?.options.map((option) => option.label)).toEqual(["Snow & ice", "Rain & fog", "Cold & dry", "Hot summers"]);
        expect(step.bubbleChips?.city).toMatchObject({ ask: "Where do you park most often?", max: 2, required: false });
        expect(step.choices.find((choice) => choice.id === "help")?.label).toBe("Help driving & parking");

        for (const choice of step.choices) expect(choice.said).not.toMatch(/&/);
    });

    it("keep the chips a bubble allows: one child seat, two places parked, never snow and dry together", () => {
        const next = throughBubbles(startChat(null, cars(), TODAY), ["kids", "kids:baby", "kids:older", "city", "city:street", "city:garage", "city:open", "weather", "weather:snow", "weather:cold"]);

        expect(next.understanding.bubbles?.kids?.chips).toEqual(["baby"]);
        expect(next.understanding.bubbles?.city?.chips).toEqual(["street", "garage"]);
        expect(next.understanding.bubbles?.weather?.chips).toEqual(["snow"]);
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

    it("shows each bubble: what it checks, what's standard, what might matter, and what it can't check", () => {
        const kids = block(understood(), "kids")!;

        expect(kids.heading).toBe("You have kids · a baby or toddler seat");
        expect(kids.counts.map((item) => item.label)).toEqual(["Rear doors"]);
        expect(kids.checks.map((item) => item.label)).toEqual(["ISOFIX child seat anchors"]);
        expect(kids.cantCheck).toMatch(/rear legroom/);
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
        expect(step.groups?.map((group) => group.title)).toEqual(["From what you told me", "Fuel & emissions", "The car itself"]);
        expect(yours.map((item) => item.id).sort()).toEqual(["co2", "towbar"]);
        expect(yours.find((item) => item.id === "towbar")?.suggested).toBe("Suggested because you carry a lot.");
        expect(step.deals!.slice(0, 2).map((item) => item.group)).toEqual(["yours", "yours"]);
    });

    it("offers only what each row can do: a rule where it splits the cars, a seal where Lens can score it", () => {
        const chat = toDeals(["dog"]);

        /* What Lens can only rule on can't seal the deal, and says so. */
        expect(row(chat, "electric")).toMatchObject({ label: "Electric", options: ["must", "mustNot"] });
        expect(row(chat, "suv")).toMatchObject({ label: "SUV", options: ["mustNot"] });
        expect(row(chat, "suv")?.description).toMatch(/I can only rule on this, not weigh it — so it can't seal the deal\.$/);
        expect(row(chat, "automatic")?.options).toEqual(["must", "seal"]);
        expect(row(chat, "co2")).toMatchObject({ label: "Low CO₂ emissions", options: ["must", "seal"] });
    });

    it("sets cars aside for a deal-breaker, and counts a deal-sealer as a top priority without setting any aside", () => {
        const chat = toDeals(["dog"]);
        const done = answer(chat, openAsk(chat)!.id, ["electric=mustNot", "towbar=seal"], page(), TODAY).chat;
        const said = done.messages.filter((message) => message.kind === "text" && message.from === "reader").at(-1);

        expect(ruledOut(done.understanding).map((rule) => [rule.id, rule.mode])).toEqual([["electricCar", "without"]]);
        expect(done.understanding.needs.find((need) => need.id === "sealer-towbar")).toMatchObject({ importance: "essential", evidence: [{ id: "hasTowbar" }] });
        expect(chatAnswers(done.understanding).answers.features.practicality).toContainEqual(expect.objectContaining({ key: "hasTowbar", importance: "high" }));
        expect(said).toMatchObject({ text: "It mustn't be electric. A towbar would seal it." });
        expect(texts(done).at(-2)).toBe("Noted. Before judging, I'll set aside any electric car. A towbar will count as a top priority.");
        expect(lastSummary(done).lines.filter((line) => line.step === "deals").map((line) => line.value)).toEqual(["No electric car", "A towbar"]);
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
        const asked = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:older", "long"], "often-long": ["monthly"], budget: ["budget-700"], period: ["period-6"] });

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
        expect(again.understanding.bubbles?.kids?.chips).toEqual(["older"]);
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

    it("keeps everything when the reader changes their mind", () => {
        const changed = changeAnswers(judged(), cars());
        const never = answer(changed, openAsk(changed)!.id, [], cars(), TODAY).chat;

        expect(openAsk(never)).toBeNull();
        expect(never.phase).toBe("judged");
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

    it("won't take mostly dry weather beside rain or snow, but takes rain, snow and hot summers together", () => {
        const step = stepFor("bubbles-copes", cars())!;
        const dry = throughBubbles(startChat(null, cars(), TODAY), ["weather", "weather:wet", "weather:cold"]);
        const wet = throughBubbles(startChat(null, cars(), TODAY), ["weather", "weather:snow", "weather:wet", "weather:hot"]);

        expect(step.bubbleChips?.weather?.exclusive).toEqual([["snow", "cold"], ["wet", "cold"]]);
        expect(dry.understanding.bubbles?.weather?.chips).toEqual(["wet"]);
        expect(wet.understanding.bubbles?.weather?.chips).toEqual(["snow", "wet", "hot"]);
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
        const chat = walk(startChat(null, page, TODAY), { bubbles: ["weather", "weather:snow"], deals: ["electric=mustNot"] }, page);
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

    it("offers Select all only where several can be picked with no limit, and never two that can't both be true", () => {
        const copes = step("bubbles-copes");
        const matters = step("bubbles-matters");

        expect(allChips(copes.bubbleChips!.weather!)).toEqual(["snow", "wet", "hot"]);
        expect(allChips(copes.bubbleChips!.carry!)).toEqual(["shopping", "bulky", "bikes", "trailer"]);
        expect(allChips(matters.bubbleChips!.comfort!)?.length).toBe(14);
        /* One child seat; two places parked at most. */
        expect(allChips(step("bubbles-people").bubbleChips!.kids!)).toBeNull();
        expect(allChips(step("bubbles-driving").bubbleChips!.city!)).toBeNull();
    });

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
        expect(environment.options[0]!.description).toMatch(/petrol and diesel too.*others that run on the same thing/);
        expect(environment.options[1]!.description).toMatch(/plug-in hybrids are usually here/);
        expect(environment.options[2]!.description).toMatch(/^Electric: 0 g\/km of CO₂ on the road.*Making the electricity isn't counted/);
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
        let chat = startChat(null, cars(), TODAY);
        for (const picks of [[], ["long", "traffic"], ["weekly"], ["medium"], ["weather", "weather:snow"]]) chat = answer(chat, openAsk(chat)!.id, picks, cars(), TODAY).chat;

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
        /* Four sections, the limit, how long, from when, deal-breakers. */
        expect(progress(chat)).toEqual({ done: 0, total: 8 });

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;
        expect(progress(chat)).toEqual({ done: 1, total: 8 });

        /* Long distances asks how often, and makes how far you drive matter: two more. */
        chat = answer(chat, openAsk(chat)!.id, ["long"], cars(), TODAY).chat;
        expect(openAsk(chat)?.step.id).toBe("often-long");
        expect(progress(chat)).toEqual({ done: 2, total: 10 });
    });

    it("ends on the last question, and starts again for a change of some answers", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });
        const asks = chat.messages.filter((message): message is Ask & { progress?: { done: number; total: number } } => message.kind === "ask" && message.step.id === "deals");
        /* "Not sure yet" for how long: no "from when?", so seven, not eight. */
        expect(asks.at(-1)?.progress).toEqual({ done: 6, total: 7 });

        const go = answer(chat, openAsk(chat)!.id, ["go"], cars(), TODAY).chat;
        const changing = changeOne(go, "budget", cars());
        expect(progress(changing)).toEqual({ done: 0, total: 1 });
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
        expect(resultMessage(judged, page(), "24 cars", {}, "r1", TODAY.toISOString()).know).toMatch(/^No car here has all of your deal-breakers, so what to let go of is your call/);
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

    it("keeps them all when asked to, and judges nothing again", () => {
        const { chat } = ask(strict());
        const { chat: next, after } = answer(chat, openAsk(chat)!.id, [], page(), TODAY);

        expect(after).toBe("wait");
        expect(ruledOut(next.understanding)).toHaveLength(5);
        expect(texts(next).at(-1)).toBe("Fine — they all stay. The pick above is the best fit for everything else you told me.");
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
        });
    });
});

