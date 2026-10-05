import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { BUBBLES } from "@/lib/lens-chat/bubbles";
import { EMPTY_UNDERSTANDING } from "@/lib/lens-chat/understanding";

import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { chatAnswers, judgementFrom, judgeWith } from "./judge";
import { addItem, answer, askNext, keepShort, openedWhy, changeAnswers, changeOne, removeItem, rentalMonths, rewind, rewindable, setImportance, startChat, startMonth, stepFor, summaryOf } from "./flow";
import type { Chat, ChatMessage, SavedSettings, StepId } from "./types";

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

        current = answer(current, ask.id, picks[ask.step.id] ?? [], page, TODAY).chat;
    }

    throw new Error("Lens never stopped asking");
}

describe("a first chat", () => {
    it("greets, says what's about to happen, then asks about the reader's life", () => {
        const chat = startChat(null, cars(), TODAY);

        expect(texts(chat)[0]).toMatch(/I'm Lens/);
        expect(texts(chat)[1]).toMatch(/show you what I understood before I judge anything/);
        expect(openAsk(chat)?.step.ask).toBe("Tell me about your life. Tap everything that fits.");
        expect(openAsk(chat)?.step.choices.map((choice) => choice.id)).toEqual(BUBBLES.map((bubble) => bubble.id));
    });

    it("asks four to six questions, then says what it understood", () => {
        const short = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "city", "city:street"], budget: ["budget-500"], period: ["period-12"] });
        const long = walk(startChat(null, cars(), TODAY), { bubbles: ["long", "traffic", "budget"], "often-long": ["weekly"], "often-traffic": ["medium"], budget: ["budget-700"], distance: ["km-1500"] });

        expect(asked(short)).toEqual(["bubbles", "budget", "period", "rules", "confirm"]);
        expect(asked(long)).toEqual(["bubbles", "often-long", "often-traffic", "budget", "period", "distance", "rules", "confirm"]);
        expect(texts(short).at(-1)).toMatch(/^Here's what I understood/);
    });

    it("asks how far they drive only when something they said makes it matter, and says it assumed otherwise", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["dog"] });

        expect(asked(chat)).not.toContain("distance");
        expect(lastSummary(chat).lines.find((line) => line.label === "Driving")?.value).toMatch(/assumed — you didn't say/);
    });

    it("records the bubbles in the reader's own words, chips and all", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["kids", "kids:baby", "weather", "weather:snow", "weather:wet"] });
        const said = chat.messages.filter((message) => message.kind === "text" && message.from === "reader").map((message) => (message as { text: string }).text);

        expect(said[0]).toBe("I have kids — a baby or toddler seat. The weather here is tough — snow & ice and rain & fog.");
        expect(texts(chat)[2]).toMatch(/^Got it — you have kids and the weather where you live is tough\./);
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
        expect(openAsk(again)?.step.id).toBe("bubbles");
    });

    it("waits for the summary to be looked over, then asks whether to keep the answers", () => {
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["night"] });
        const confirm = openAsk(chat)!;

        expect(confirm.step.choices.map((choice) => choice.label)).toEqual(["Looks good to me — let's go"]);

        const going = answer(chat, confirm.id, ["go"], cars(), TODAY);
        expect(going.after).toBe("wait");
        expect(openAsk(going.chat)?.step.id).toBe("keep");

        const kept = answer(going.chat, openAsk(going.chat)!.id, ["keep-settings"], cars(), TODAY);
        expect(kept.after).toBe("judge");
        expect(kept.chat.kept).toBe("settings");
    });

    it("doesn't ask about the reader's life again once they've said it in their own words", () => {
        const typed = { ...EMPTY_UNDERSTANDING, needs: [{ id: "commute", label: "The commute", importance: "important" as const, said: "", priorities: ["longDistance" as const], evidence: [{ id: "driverAssistLevel2" as const, use: "", unwanted: false, mustHave: false }], notInData: null, status: "active" as const }] };
        const chat = askNext({ ...startChat(null, cars(), TODAY), understanding: typed, queue: ["bubbles", "budget"] }, cars());

        expect(openAsk(chat)?.step.id).toBe("budget");
    });
});

describe("the bubbles", () => {
    const bubbles = () => openAsk(startChat(null, cars(), TODAY))!.step;

    it("say what each means and what each checks behind its “i”", () => {
        const step = bubbles();
        const kids = step.choices.find((choice) => choice.id === "kids")!;

        expect(kids.means).toMatch(/Children in the car/);
        expect(kids.features?.[0]).toMatchObject({ label: "Rear doors", does: expect.stringMatching(/so children get in and out/) });
        expect(step.why).toMatch(/correct any of it/);
    });

    it("open their chips under themselves, with “&” on chips and “and” in sentences", () => {
        const step = bubbles();

        expect(step.bubbleChips?.weather).toMatchObject({ ask: "What's it like?", required: true, multiple: true });
        expect(step.bubbleChips?.weather?.options.map((option) => option.label)).toEqual(["Snow & ice", "Rain & fog", "Cold but mostly dry", "Hot summers"]);
        expect(step.bubbleChips?.city).toMatchObject({ ask: "Where do you park most often?", max: 2, required: false });
        expect(step.choices.find((choice) => choice.id === "help")?.label).toBe("I want help driving & parking");

        for (const choice of step.choices) expect(choice.said).not.toMatch(/&/);
    });

    it("keep the chips a bubble allows: one child seat, two places parked, never snow and dry together", () => {
        const chat = startChat(null, cars(), TODAY);
        const next = answer(chat, openAsk(chat)!.id, ["kids", "kids:baby", "kids:older", "city", "city:street", "city:garage", "city:open", "weather", "weather:snow", "weather:cold"], cars(), TODAY).chat;

        expect(next.understanding.bubbles?.kids?.chips).toEqual(["baby"]);
        expect(next.understanding.bubbles?.city?.chips).toEqual(["street", "garage"]);
        expect(next.understanding.bubbles?.weather?.chips).toEqual(["snow"]);
    });

    it("ask how often only for the bubbles that need it, and let the answer set how much they count", () => {
        const chat = startChat(null, cars(), TODAY);
        const next = answer(chat, openAsk(chat)!.id, ["long"], cars(), TODAY).chat;

        expect(openAsk(next)?.step).toMatchObject({ id: "often-long", ask: "How often do you drive long distances?" });

        const rarely = answer(next, openAsk(next)!.id, ["rarely"], cars(), TODAY).chat;
        expect(rarely.understanding.needs.find((need) => need.id === "bubble-long")?.importance).toBe("niceToHave");
        expect(texts(rarely).at(-1)).toBe("Long distances will count as nice to have.");
        expect(openAsk(rarely)?.step.id).toBe("budget");
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

describe("deal-breakers", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);
    const toRules = (bubbles: string[], budget: string[] = []) => {
        let chat = startChat(null, page(), TODAY);
        for (let guard = 0; guard < 20 && openAsk(chat)?.step.id !== "rules"; guard += 1) {
            const ask = openAsk(chat)!;
            chat = answer(chat, ask.id, ask.step.id === "budget" ? budget : ask.step.id === "bubbles" ? bubbles : ask.step.id.startsWith("often-") ? [ask.step.choices[0]!.id] : [], page(), TODAY).chat;
        }
        return chat;
    };

    it("puts what the bubbles point to first, and says why", () => {
        const rules = openAsk(toRules(["carry", "carry:trailer", "environment"]))!.step;
        const first = rules.choices.slice(0, 2).map((choice) => choice.id);

        expect(first).toEqual(expect.arrayContaining(["must-tow", "low-co2"]));
        expect(rules.why).toMatch(/“Must tow” is first because you carry a lot/);
    });

    it("asks the limit before the rules, and offers it as one", () => {
        const chat = toRules(["dog"], ["budget-500"]);
        const rules = openAsk(chat)!.step;

        expect(rules.choices[0]).toMatchObject({ id: "firm-budget", label: "Nothing over €500" });

        const firm = answer(chat, openAsk(chat)!.id, ["firm-budget"], page(), TODAY).chat;
        expect(firm.understanding.budget).toMatchObject({ monthly: 500, firm: true, kind: "hardMax" });
        /* The rules are the last question: the summary follows the reply. */
        expect(texts(firm).at(-2)).toBe("Noted. Before judging, I'll set aside any car over €500 a month.");
        expect(summaryOf(firm.understanding).lines.find((line) => line.label === "Monthly limit")?.value).toBe("€500 all in, nothing over it");
    });

    it("sets aside cars over a firm limit rather than grading them", () => {
        const chat = toRules(["city"], ["budget-500"]);
        const firm = answer(chat, openAsk(chat)!.id, ["firm-budget"], page(), TODAY).chat;
        const judged = judgeWith(firm.understanding, page(), "24 cars")!;
        const verdicts = judgementFrom(judged, page(), firm.understanding, "", "", {}, "").verdicts;
        const over = judged.run.overLimit?.ids ?? [];

        expect(over.length).toBeGreaterThan(0);
        for (const id of over) expect(verdicts[id]).toMatchObject({ label: "Ruled out", rank: null });
    });

    it("stops checking what a deal-breaker settles", () => {
        const chat = toRules(["carry", "carry:trailer"]);
        const done = walk(answer(chat, openAsk(chat)!.id, ["must-tow"], page(), TODAY).chat, {}, page());

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

        expect(openAsk(which)?.step.choices.find((choice) => choice.id === "bubbles")?.description).toBe("Now: you have kids and you drive long distances.");
        expect(openAsk(which)?.step.choices.find((choice) => choice.id === "often-long")?.description).toBe("Now: about once a month.");

        const changing = answer(which, openAsk(which)!.id, ["bubbles"], cars(), TODAY).chat;
        expect(openAsk(changing)?.step.selected).toEqual(["kids", "kids:older", "long"]);

        /* How often is asked again with it, as it was. */
        const again = answer(changing, openAsk(changing)!.id, ["kids", "long"], cars(), TODAY).chat;
        expect(openAsk(again)?.step).toMatchObject({ id: "often-long", selected: ["monthly"] });
    });

    it("starts from nothing, when asked, without touching the settings", () => {
        const chat = startChat(settings(), cars(), TODAY);
        const fresh = answer(chat, openAsk(chat)!.id, ["scratch"], cars(), TODAY).chat;

        expect(fresh.understanding.needs).toEqual([]);
        expect(fresh.kept).toBeNull();
        expect(openAsk(fresh)?.step.id).toBe("bubbles");
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

        expect(openAsk(all)?.step).toMatchObject({ id: "bubbles", selected: ["kids", "weather", "weather:snow"] });
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
    it("takes the reader's own amount, length and distance", () => {
        let chat = startChat(null, cars(), TODAY);
        chat = answer(chat, openAsk(chat)!.id, ["budget"], cars(), TODAY).chat;

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 650 }).chat;
        expect(chat.understanding.budget?.monthly).toBe(650);

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 9 }).chat;
        expect(chat.understanding.rental).toMatchObject({ from: "2026-10", to: "2027-06" });

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
        const first = startChat(null, cars(), TODAY);
        return answer(first, openAsk(first)!.id, ["long"], cars(), TODAY).chat;
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

    it("steps back one answer at a time, to the bubbles with what was picked", () => {
        const back = rewind(start());

        expect(openAsk(back)?.step).toMatchObject({ id: "bubbles", selected: ["long"] });
        expect(back.understanding.bubbles).toBeUndefined();
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
        const chat = walk(startChat(null, cars(), TODAY), { bubbles: ["six-seats", "dog"], rules: ["six-seats"] });

        expect(block(chat, "six-seats")).toMatchObject({ counts: [], settled: "Six or more seats is a deal-breaker, so every car left has it." });
        expect(chat.understanding.needs.map((need) => need.id)).not.toContain("bubble-six-seats");
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
        const start = startChat(null, cars(), TODAY);
        const step = openAsk(start)!.step;
        const dry = answer(start, openAsk(start)!.id, ["weather", "weather:wet", "weather:cold"], cars(), TODAY).chat;
        const wet = answer(start, openAsk(start)!.id, ["weather", "weather:snow", "weather:wet", "weather:hot"], cars(), TODAY).chat;

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

    it("moves the environment's own answer with how much it counts, so the two never disagree", () => {
        const chat = understood({ bubbles: ["environment", "environment:decides"] });
        const next = setImportance(chat, "bubble-environment", "niceToHave", cars());

        expect(next.understanding.bubbles?.environment).toMatchObject({ chips: ["bonus"], importance: null });
        expect(block(next, "environment")).toMatchObject({ heading: "You care about the environment · a bonus", importance: "niceToHave" });
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
        const chat = walk(startChat(null, page, TODAY), { bubbles: ["weather", "weather:snow"], rules: ["not-electric"] }, page);
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
