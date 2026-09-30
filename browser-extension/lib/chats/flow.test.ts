import { describe, expect, it } from "vitest";

import { FULL } from "./depth";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { EVIDENCE } from "@/lib/lens-chat/evidence";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { EMPTY_UNDERSTANDING, withBudget } from "@/lib/lens-chat/understanding";

import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { chatAnswers, judgementFrom, judgeWith } from "./judge";
import { answer, askNext, changeAnswers, changeOne, coveredBy, explainAs, rentalMonths, rewind, rewindable, setImportance, startChat, startMonth, stepFor, summaryOf, withinLimits } from "./flow";
import { readTyped } from "./typing";
import type { Chat, ChatMessage, SavedSettings, StepId } from "./types";

/*
 * A whole conversation with Lens, walked without a browser: every step is a
 * pure function of the chat before it.
 */

const cars = () => [GARAGE.safeCompact(), GARAGE.familySuv(), GARAGE.cityHatch(), GARAGE.longRangeEv(), GARAGE.thirstyPetrol()];
const TODAY = new Date("2026-09-29T10:00:00Z");

type Ask = Extract<ChatMessage, { kind: "ask" }>;

const openAsk = (chat: Chat): Ask | null => {
    const last = [...chat.messages].reverse().find((message) => message.kind === "ask");
    return last?.kind === "ask" && !last.answered ? last : null;
};

const texts = (chat: Chat) => chat.messages.filter((message) => message.kind === "text" && message.from === "lens").map((message) => (message as { text: string }).text);

/** Answers whatever Lens asks with `picks[step]`, until it stops asking questions. */
function walk(chat: Chat, picks: Partial<Record<StepId | "offer", string[]>>): Chat {
    let current = chat;

    for (let guard = 0; guard < 40; guard += 1) {
        const ask = openAsk(current);
        if (!ask || ask.step.id === "confirm" || ask.step.id === "keep" || ask.step.id === "start" || ask.step.id === "noNeeds") return current;

        const id = ask.step.id.startsWith("offer-") ? "offer" : ask.step.id.startsWith("life-") ? "life" : ask.step.id;
        const own = new Set(ask.step.choices.map((choice) => choice.id));
        /* The needs are asked a group at a time: each group gets the picks that are its own. */
        /* Nothing scripted is answered as the page would: with whatever it shows picked. */
        const chosen = (picks[id as StepId | "offer"] ?? ask.step.selected ?? []).filter((pick) => id !== "life" || own.has(pick));
        current = answer(current, ask.id, chosen, cars(), TODAY).chat;
    }

    throw new Error("Lens never stopped asking");
}

describe("a first chat", () => {
    it("greets, says what's about to happen, then asks what the car has to do", () => {
        const chat = startChat(null, cars(), TODAY, FULL);
        const [hello, how] = texts(chat);

        expect(hello).toMatch(/I'm Lens/);
        expect(how).toMatch(/chip/);
        expect(how).toMatch(/trophy/);
        expect(openAsk(chat)?.step.id).toBe("life-passengers");
        expect(chat.phase).toBe("asking");
        expect(chat.judgement).toBeNull();
    });

    it("asks each question once, then says what it will judge by and asks whether to keep it", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), {
            life: ["passengers-2", "kids", "motorway"],
            budget: ["budget-500"],
            period: ["period-12"],
            distance: ["km-1500"],
        });

        const asked = chat.messages.filter((message): message is Ask => message.kind === "ask").map((message) => message.step.id);

        for (const group of ["life-passengers", "life-people", "life-driving", "life-weather", "life-loads", "life-you"]) {
            expect(asked.filter((id) => id === group), group).toHaveLength(1);
        }
        /* A group's follow-up comes straight after it, before the next group. */
        expect(asked.indexOf("follow-kids")).toBe(asked.indexOf("life-people") + 1);
        expect(asked.indexOf("follow-motorway")).toBe(asked.indexOf("life-driving") + 1);
        expect(asked).toContain("budget");
        expect(asked).toContain("period");
        expect(asked).toContain("distance");
        expect(asked.at(-1)).toBe("confirm");
        expect(chat.phase).toBe("keep");

        const summary = chat.messages.find((message) => message.kind === "summary");
        expect(summary?.kind === "summary" && summary.lines.find((line) => line.label === "Monthly limit")?.value).toBe("€500 all in");
        expect(summary?.kind === "summary" && summary.priorities.reduce((sum, item) => sum + item.share, 0)).toBeGreaterThan(95);

        expect(chat.understanding.budget?.monthly).toBe(500);
        expect(chat.understanding.monthlyKm?.value).toBe(1500);
        expect(chat.understanding.rental).toMatchObject({ from: "2026-10", to: "2027-09" });
        expect(chat.understanding.needs.map((need) => need.id)).toEqual(expect.arrayContaining(["life-kids", "life-motorway"]));
        expect(chat.title).toMatch(/Travelling with children/);
    });

    it("records each tap as the reader's own words, and answers it", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        const { chat } = answer(start, openAsk(start)!.id, ["passengers-2"], cars(), TODAY);
        const said = chat.messages.filter((message) => message.from === "reader");

        expect(said.at(-1)).toMatchObject({ kind: "text", text: "Usually two other people." });
        expect(texts(chat).at(-1)).toMatch(/Got it — two passengers\. .*rear doors/);
    });

    it("takes no limit and no period as answers, not as questions to repeat", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids"], budget: [], period: [], distance: [] });

        expect(chat.understanding.budget).toBeNull();
        expect(chat.understanding.waived).toEqual(expect.arrayContaining(["budget", "rental"]));
        expect(openAsk(chat)?.step.id).toBe("confirm");
    });

    it("won't judge fit on nothing: with no needs named, it says so and asks again", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: [] });

        expect(openAsk(chat)?.step.id).toBe("noNeeds");
        expect(texts(chat).at(-1)).toMatch(/nothing to judge how well each car fits you/);

        const again = answer(chat, openAsk(chat)!.id, ["add"], cars(), TODAY).chat;
        expect(openAsk(again)?.step.id).toBe("life-passengers");
    });

    it("waits for the summary to be looked over, then asks whether to keep the answers", () => {
        const asked = walk(startChat(null, cars(), TODAY, FULL), { life: ["city"], budget: ["budget-400"] });
        const confirm = openAsk(asked)!;

        expect(confirm.step.id).toBe("confirm");
        expect(confirm.step.choices.map((choice) => choice.label)).toEqual(["Looks good to me — let's go"]);
        expect(asked.messages.filter((message) => message.kind === "ask").some((message) => message.kind === "ask" && message.step.id === "keep")).toBe(false);

        const going = answer(asked, confirm.id, ["go"], cars(), TODAY);
        expect(going.after).toBe("wait");
        expect(openAsk(going.chat)?.step.id).toBe("keep");
        /* A tap too soon can be taken back to the summary. */
        expect(openAsk(rewind(going.chat))?.step.id).toBe("confirm");
    });

    it("keeps the answers as settings or for this chat, then asks for a judgement", () => {
        const looked = walk(startChat(null, cars(), TODAY, FULL), { life: ["city"], budget: ["budget-400"] });
        const asked = answer(looked, openAsk(looked)!.id, ["go"], cars(), TODAY).chat;
        const keep = openAsk(asked)!;

        const saved = answer(asked, keep.id, ["keep-settings"], cars(), TODAY);
        expect(saved.after).toBe("judge");
        expect(saved.chat.kept).toBe("settings");
        expect(saved.chat.phase).toBe("ready");

        const here = answer(asked, keep.id, ["keep-chat"], cars(), TODAY);
        expect(here.chat.kept).toBe("chat");
    });

    it("doesn't ask what the reader has already said in their own words", () => {
        const chat = startChat(null, cars(), TODAY, FULL);
        const typed = askNext({ ...chat, understanding: withBudget(chat.understanding, 650, "650 max"), queue: ["budget", "distance"] }, cars());

        expect(openAsk(typed)?.step.id).toBe("distance");
    });
});

describe("a chat from saved settings", () => {
    const settings = (): SavedSettings => {
        const asked = walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids"], budget: ["budget-700"], period: ["period-6"] });

        return { savedAt: TODAY.toISOString(), fromChatId: asked.id, understanding: asked.understanding, rentalMonths: rentalMonths(asked.understanding), depth: FULL };
    };

    it("greets the reader back with what it will judge by, and offers to judge straight away", () => {
        const chat = startChat(settings(), cars(), TODAY);

        expect(texts(chat)[0]).toMatch(/Welcome back/);
        expect(chat.messages.some((message) => message.kind === "summary")).toBe(true);
        expect(openAsk(chat)?.step.choices.map((choice) => choice.id)).toEqual(["judge", "change", "scratch"]);
        expect(chat.kept).toBe("settings");

        expect(answer(chat, openAsk(chat)!.id, ["judge"], cars(), TODAY).after).toBe("judge");
    });

    it("keeps the period as a length, starting from whenever the new chat starts", () => {
        const later = new Date("2027-03-02T10:00:00Z");
        const chat = startChat(settings(), cars(), later);

        expect(chat.understanding.rental).toMatchObject({ from: "2027-04", to: "2027-09" });
    });

    it("asks which answers to change, then asks those again with the last answers picked", () => {
        const chat = startChat(settings(), cars(), TODAY);
        const { chat: which } = answer(chat, openAsk(chat)!.id, ["change"], cars(), TODAY);

        expect(openAsk(which)?.step.id).toBe("changeWhich");

        const { chat: changing } = answer(which, openAsk(which)!.id, ["life-passengers", "life-people"], cars(), TODAY);
        const ask = openAsk(changing)!;

        expect(changing.revising).toBe(true);
        expect(ask.step.id).toBe("life-passengers");
        expect(ask.step.selected).toEqual(["passengers-2"]);

        const who = answer(changing, ask.id, ["passengers-2"], cars(), TODAY).chat;
        expect(openAsk(who)?.step.selected).toEqual(["kids"]);
    });

    it("starts from nothing, when asked, without touching the settings", () => {
        const chat = startChat(settings(), cars(), TODAY);
        const { chat: fresh } = answer(chat, openAsk(chat)!.id, ["scratch"], cars(), TODAY);

        expect(fresh.understanding.needs).toEqual([]);
        expect(fresh.kept).toBeNull();
        expect(openAsk(fresh)?.step.id).toBe("life-passengers");
    });
});

describe("after a judgement", () => {
    /* Only whether there is a judgement matters here, not what it says. */
    const judged = (): Chat => ({
        ...walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids", "winter"], budget: ["budget-500"] }),
        phase: "judged",
        judgement: { carIds: [] } as unknown as Chat["judgement"],
    });

    it("asks whether to change all the answers or only some", () => {
        const changed = changeAnswers(judged(), cars());
        const ask = openAsk(changed)!;

        expect(ask.step.id).toBe("changeHow");
        expect(ask.step.choices.map((choice) => choice.label)).toEqual(["Change all my answers", "Change some of my answers"]);
    });

    it("asks every question again for all of them, with what was said already picked", () => {
        const changed = changeAnswers(judged(), cars());
        const all = answer(changed, openAsk(changed)!.id, ["all"], cars(), TODAY).chat;
        /* All of them includes how much Lens asks and explains, with what was chosen already picked. */
        expect(openAsk(all)?.step).toMatchObject({ id: "askDepth", selected: ["thorough"] });

        const asks = answer(all, openAsk(all)!.id, ["thorough"], cars(), TODAY).chat;
        const explains = answer(asks, openAsk(asks)!.id, ["detailed"], cars(), TODAY).chat;
        const ask = openAsk(explains)!;

        expect(ask.step.id).toBe("life-passengers");
        expect(ask.step.selected).toEqual(["passengers-2"]);
        expect(all.kept).toBeNull();
    });

    it("asks only the picked questions for some, then says back what it will judge by", () => {
        const changed = changeAnswers(judged(), cars());
        const some = answer(changed, openAsk(changed)!.id, ["some"], cars(), TODAY).chat;
        const which = openAsk(some)!;

        expect(which.step.id).toBe("changeWhich");
        expect(which.step.choices.find((choice) => choice.id === "budget")?.description).toBe("Now: €500 a month.");
        expect(which.step.choices.find((choice) => choice.id === "life-people")?.description).toBe("Now: travelling with children.");

        const picked = answer(some, which.id, ["budget"], cars(), TODAY).chat;
        expect(openAsk(picked)?.step.id).toBe("budget");
        expect(openAsk(picked)?.step.selected).toEqual(["budget-500"]);

        const done = answer(picked, openAsk(picked)!.id, ["budget-700"], cars(), TODAY).chat;
        expect(openAsk(done)?.step.id).toBe("confirm");
        expect(done.understanding.budget?.monthly).toBe(700);
        expect(done.understanding.needs.map((need) => need.id)).toContain("life-kids");
    });

    it("keeps everything when the reader changes their mind", () => {
        const changed = changeAnswers(judged(), cars());
        const never = answer(changed, openAsk(changed)!.id, [], cars(), TODAY).chat;

        expect(openAsk(never)).toBeNull();
        expect(never.phase).toBe("judged");
        expect(texts(never).at(-1)).toMatch(/keep everything as it is/);
    });
});

describe("a conversation, not a form", () => {
    const asked = (chat: Chat) => chat.messages.filter((message): message is Ask => message.kind === "ask").map((message) => message.step.id);

    it("says why it asks every question", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids", "city"], "follow-kids": ["older"], budget: ["budget-500"] });

        for (const message of chat.messages) {
            if (message.kind === "ask" && message.step.id !== "start") expect(message.step.why, message.step.id).toBeTruthy();
        }
    });

    it("shows what each need means, and what it will look for", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        const chat = answer(start, openAsk(start)!.id, ["passengers-2"], cars(), TODAY).chat;
        const kids = openAsk(chat)!.step.choices.find((choice) => choice.id === "kids")!;

        expect(kids.description).toMatch(/ISOFIX anchors for child seats/);
        expect(kids.looksFor).toContain("ISOFIX child seat anchors");
        expect(openAsk(chat)!.step.ask).toMatch(/who are they/i);
    });

    it("asks how many ride along before who they are, and lets the count decide seats and doors", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        const count = openAsk(start)!.step;

        expect(count.multiple).toBe(false);
        expect(count.choices.map((choice) => choice.label)).toEqual(["1", "2", "3", "4", "5 or more"]);
        expect(count.none).toBe("Just me");

        const four = answer(start, openAsk(start)!.id, ["passengers-4"], cars(), TODAY).chat;
        const seats = four.understanding.needs.find((need) => need.id === "life-passengers-4")!;

        expect(four.understanding.passengers).toBe(4);
        expect(seats.evidence.map((entry) => entry.id)).toEqual(["rearDoors", "seatsFivePlus"]);
        expect(openAsk(four)?.step.id).toBe("life-people");
    });

    it("asks nobody's kind of passenger when it's just the reader — only whether a pet comes", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        const alone = answer(start, openAsk(start)!.id, [], cars(), TODAY).chat;
        const pets = openAsk(alone)!.step;

        expect(alone.understanding.passengers).toBe(0);
        expect(pets.ask).toMatch(/pets/i);
        expect(pets.choices.map((choice) => choice.id)).toEqual(["dog"]);
        expect(pets.none).toBe("No pets");
    });

    it("adds nothing for one adult beside the driver, and says so", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        const one = answer(start, openAsk(start)!.id, ["passengers-1"], cars(), TODAY).chat;

        expect(one.understanding.needs).toEqual([]);
        expect(texts(one).at(-1)).toMatch(/beside you/);

        const adult = answer(one, openAsk(one)!.id, ["adults"], cars(), TODAY).chat;

        expect(adult.understanding.needs).toEqual([]);
        expect(texts(adult).at(-1)).toMatch(/nothing extra to check/);
    });

    it("asks what kind of winter, and counts what that winter needs", () => {
        const winterFor = (kind: string) =>
            walk(startChat(null, cars(), TODAY, FULL), { life: ["winter"], "follow-winter": [kind] })
                .understanding.needs.find((need) => need.id === "life-winter")!
                .evidence.map((entry) => entry.id);

        expect(winterFor("wet")).toEqual(expect.arrayContaining(["hasRainSlashLightSensors", "hasFogLights"]));
        expect(winterFor("wet")).not.toContain("hasAllWheelDrive");
        expect(winterFor("cold")).not.toContain("hasFogLights");
        expect(winterFor("snow")).toEqual(expect.arrayContaining(["hasAllWheelDrive", "hasRainSlashLightSensors", "hasFogLights"]));
    });

    it("writes \"&\" on chips and \"and\" in sentences", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["city", "street", "nervous"], "rank-1": ["cityParking"] });
        const top = chat.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "rank-1")!;

        expect(top.step.choices.map((choice) => choice.label)).toContain("City & Parking");
        expect(texts(chat).join(" ")).toMatch(/city and parking/);
    });

    it("counts only the help that matches what makes driving stressful", () => {
        const evidenceFor = (worries: string[]) =>
            walk(startChat(null, cars(), TODAY, FULL), { life: ["nervous"], "follow-nervous": worries })
                .understanding.needs.find((need) => need.id === "life-nervous")!
                .evidence.map((entry) => entry.id);

        expect(evidenceFor(["parking"])).toEqual(["hasThreeSixtyDegreesCamera", "hasParkingSensors"]);
        expect(evidenceFor(["traffic"])).toEqual(["hasBlindSpotAssist", "hasLaneKeepingAssist"]);
        /* None of them: the need keeps everything it started with. */
        expect(evidenceFor([])).toEqual(expect.arrayContaining(["hasBlindSpotAssist", "hasThreeSixtyDegreesCamera", "hasRearCrosswalkWarning"]));
    });

    it("asks what's carried by name, so no second question is needed to find out", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["bulky", "towing"] });
        const loads = chat.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "life-loads")!;

        expect(loads.step.ask).toMatch(/carry or tow/);
        expect(asked(chat).filter((id) => id.startsWith("follow-"))).toEqual([]);
        expect(chat.understanding.needs.map((need) => need.id)).toEqual(expect.arrayContaining(["life-bulky", "life-towing"]));
    });

    it("asks the needs a group at a time, each keeping the others' answers", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        const count = answer(start, openAsk(start)!.id, ["passengers-2"], cars(), TODAY).chat;
        const people = answer(count, openAsk(count)!.id, ["kids"], cars(), TODAY).chat;
        const afterFollowUp = answer(people, openAsk(people)!.id, ["boosters"], cars(), TODAY).chat;

        expect(openAsk(afterFollowUp)?.step.id).toBe("life-driving");
        expect(openAsk(afterFollowUp)!.step.choices.map((choice) => choice.id)).not.toContain("kids");

        const driving = answer(afterFollowUp, openAsk(afterFollowUp)!.id, [], cars(), TODAY).chat;
        const ids = driving.understanding.needs.map((need) => need.id);

        expect(ids).toContain("life-kids");
        expect(texts(driving).at(-1)).toMatch(/won't add anything for how you drive/);
        expect(driving.messages.filter((message) => message.from === "reader").at(-1)).toMatchObject({ text: "None of these" });

        expect(openAsk(driving)?.step.id).toBe("life-parking");

        const parking = answer(driving, openAsk(driving)!.id, [], cars(), TODAY).chat;
        const weather = answer(parking, openAsk(parking)!.id, [], cars(), TODAY).chat;
        expect(weather.messages.filter((message) => message.from === "reader").at(-1)).toMatchObject({ text: "Nothing unusual" });
    });

    it("follows a need up where the answer changes what it looks for, and says what changed", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        const count = answer(start, openAsk(start)!.id, ["passengers-2"], cars(), TODAY).chat;
        const { chat } = answer(count, openAsk(count)!.id, ["kids"], cars(), TODAY);

        expect(openAsk(chat)?.step.id).toBe("follow-kids");

        const older = answer(chat, openAsk(chat)!.id, ["older"], cars(), TODAY).chat;
        const kids = older.understanding.needs.find((need) => need.id === "life-kids")!;

        expect(kids.evidence.map((entry) => entry.id)).not.toContain("hasIsofix");
        expect(texts(older).at(-1)).toMatch(/won't count ISOFIX/);
        expect(openAsk(older)?.step.id).toBe("life-driving");

        const driving = answer(older, openAsk(older)!.id, ["motorway"], cars(), TODAY).chat;
        expect(openAsk(driving)?.step.id).toBe("follow-motorway");

        const weekly = answer(driving, openAsk(driving)!.id, ["weekly"], cars(), TODAY).chat;
        expect(weekly.understanding.needs.find((need) => need.id === "life-motorway")?.importance).toBe("essential");
    });

    it("offers equipment the cars here differ on, says why, and counts it on a yes, in a chat from before features were asked", () => {
        /* Saved mid-chat, before the offers were reached: judged the old way, so they're still asked. */
        const asked = walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids"] });
        const old = askNext({ ...asked, understanding: { ...asked.understanding, lens: undefined }, queue: ["offers"] }, cars());
        const chat = walk(old, { offer: ["yes"] });
        const offers = chat.messages.filter((message): message is Ask => message.kind === "ask" && Boolean(message.step.offer));

        expect(offers.length).toBeGreaterThan(0);
        expect(offers[0]!.step.why).toMatch(/^You mentioned travelling with children\. .+\. \d+ of the 5 cars here list it and \d+ don't/);

        for (const offer of offers) expect(EVIDENCE[offer.step.offer!.id].raisable).toBe(true);

        const counted = offers.map((offer) => offer.step.offer!.id);
        const evidence = chat.understanding.needs.flatMap((need) => need.evidence.map((entry) => entry.id));
        for (const id of counted) expect(evidence).toContain(id);
    });

    it("takes the reader's own amount, length and distance", () => {
        let chat = startChat(null, cars(), TODAY, FULL);
        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;
        while (openAsk(chat)?.step.id !== "budget") chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 650 }).chat;
        expect(chat.understanding.budget?.monthly).toBe(650);

        /* The rules come between: "nothing over €650" is one of them now. */
        expect(openAsk(chat)?.step.id).toBe("rules");
        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 9 }).chat;
        expect(chat.understanding.rental).toMatchObject({ from: "2026-10", to: "2027-06" });

        chat = answer(chat, openAsk(chat)!.id, [], cars(), TODAY, { amount: 1200 }).chat;
        expect(chat.understanding.monthlyKm?.value).toBe(1200);
    });

    it("changes one answer from the summary, and comes straight back to it", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["city", "garage"], budget: ["budget-400"] });
        const changing = changeOne(chat, "budget", cars());

        expect(openAsk(changing)?.step.id).toBe("budget");
        expect(openAsk(changing)?.step.selected).toEqual(["budget-400"]);

        const done = answer(changing, openAsk(changing)!.id, ["budget-700"], cars(), TODAY).chat;
        expect(done.understanding.budget?.monthly).toBe(700);
        expect(openAsk(done)?.step.id).toBe("confirm");
    });

    it("sets how much a need counts from the summary, redrawing the same card", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["city", "winter"] });
        const summary = [...chat.messages].reverse().find((message) => message.kind === "summary")!;
        const next = setImportance(chat, "life-city", "niceToHave");
        const redrawn = next.messages.find((message) => message.id === summary.id);

        expect(next.understanding.needs.find((need) => need.id === "life-city")?.importance).toBe("niceToHave");
        expect(redrawn?.kind === "summary" && redrawn.needs?.find((need) => need.id === "life-city")?.importance).toBe("niceToHave");
    });
});

describe("dates", () => {
    it("starts a rental next month, since FINN delivers in weeks", () => {
        expect(startMonth(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01");
    });
});

describe("what Lens says back", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);
    const askOf = (chat: Chat) => openAsk(chat)!;

    it("can read every example it gives for an answer in your own words", async () => {
        let chat = startChat(null, page(), TODAY, FULL);
        const examples: string[] = [];

        for (let guard = 0; guard < 20 && openAsk(chat) && askOf(chat).step.id !== "confirm"; guard += 1) {
            const { step } = askOf(chat);
            const example = step.custom?.kind === "text" ? /“(.+)”/.exec(step.custom.placeholder)?.[1] : null;
            if (example) examples.push(example);
            chat = answer(chat, askOf(chat).id, step.id === "life-driving" ? ["city"] : [], page(), TODAY).chat;
        }

        expect(examples.length).toBeGreaterThanOrEqual(5);
        for (const example of examples) {
            const read = await readTyped(startChat(null, page(), TODAY, FULL), example, page(), null);
            expect(read.heardAs, example).not.toEqual([]);
        }
        /* Lens's reader pauses up to a second a read, as if typing. */
    }, 20_000);

    it("lists the help it counts once, not reply after reply joined with \"and\"", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["nervous"], "follow-nervous": ["parking", "traffic", "reversing"] });
        const reply = texts(chat).find((text) => text.startsWith("Got it — I'll count"))!;

        expect(reply.match(/ and /g)).toHaveLength(1);
    });

    it("asks how much CO₂ and consumption matter as questions of their own, answered in words", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["tech", "co2-decides", "efficiency-bonus"] });
        const asks = chat.messages.filter((message): message is Ask => message.kind === "ask");
        const you = asks.find((ask) => ask.step.id === "life-you")!;
        const co2 = asks.find((ask) => ask.step.id === "life-co2")!;

        expect(you.step.choices.map((choice) => choice.id)).not.toContain("emissions");
        expect(co2.step.multiple).toBe(false);
        expect(co2.step.choices.map((choice) => choice.label)).toEqual(["A lot — it could decide it", "It matters", "A little — it's a bonus"]);
        expect(co2.step.none).toBe("Not really");
        expect(texts(chat)).toContain("CO₂ emissions will count as a must-have.");
        expect(texts(chat)).toContain("Using little fuel or electricity will count as nice to have.");
        expect(chat.understanding.needs.find((need) => need.id === "life-efficiency-bonus")?.priorities).toEqual(["efficiency"]);
    });

    it("says rules so they can't be misread, and stops looking for what a rule settles", () => {
        let chat = startChat(null, page(), TODAY, FULL);
        for (let guard = 0; guard < 20 && askOf(chat).step.id !== "rules"; guard += 1) {
            chat = answer(chat, askOf(chat).id, askOf(chat).step.id === "life-driving" ? ["commute"] : [], page(), TODAY).chat;
        }
        chat = answer(chat, askOf(chat).id, ["automatic", "no-suv"], page(), TODAY).chat;

        expect(texts(chat).at(-1)).toBe("Noted. Before judging, I'll set aside any car that isn't an automatic, and any SUV.");

        const summary = summaryOf(chat.understanding);
        expect(summary.lines.find((line) => line.label === "Rules")?.value).toBe("Automatic only and no SUV");
        expect(summary.needs?.find((need) => need.id === "life-commute")?.looksFor).not.toContain("Automatic gearbox");
    });
});



describe("the summary", () => {
    it("lists each piece of equipment once, and says how many a need shares with those above", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["nervous", "safety"], "follow-nervous": ["traffic"] });
        const needs = summaryOf(chat.understanding).needs!;
        const nerves = needs.find((need) => need.id === "life-nervous")!;
        const safety = needs.find((need) => need.id === "life-safety")!;

        expect(nerves.looksFor).toContain("Blind spot warning");
        expect(safety.looksFor).not.toContain("Blind spot warning");
        expect(safety.also).toBeGreaterThan(0);
        expect(needs.flatMap((need) => need.looksFor)).toEqual([...new Set(needs.flatMap((need) => need.looksFor))]);

        const figures = walk(startChat(null, cars(), TODAY, FULL), { life: ["co2-matters", "efficiency-matters"] });
        const figureNeeds = summaryOf(figures.understanding).needs!;
        expect(figureNeeds.find((need) => need.id === "life-co2-matters")?.looksFor).toEqual(["Each car's CO₂ per km"]);
        expect(figureNeeds.find((need) => need.id === "life-efficiency-matters")?.looksFor).toEqual(["Each car's consumption, against others of its kind"]);
    });

    it("names the needs behind each priority's weight", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids", "bulky"], "follow-kids": ["seats"] });
        const practicality = summaryOf(chat.understanding).priorities.find((priority) => priority.label === "Practicality")!;

        expect(practicality.from).toEqual(expect.arrayContaining(["Travelling with children", "Bulky loads"]));
    });
});

describe("city driving and parking", () => {
    it("judges city driving on the traffic, and asks everyone where they park", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["city", "open-car-park"] });
        const city = chat.understanding.needs.find((need) => need.id === "life-city")!;
        const parking = chat.understanding.needs.find((need) => need.id === "life-open-car-park")!;

        expect(city.evidence.map((entry) => entry.id)).not.toContain("hasParkingSensors");
        expect(parking.evidence.map((entry) => entry.id)).toContain("hasRearCrosswalkWarning");

        const noCity = chat.messages.filter((message): message is Ask => message.kind === "ask").map((message) => message.step.id);
        expect(noCity).toContain("life-parking");
        expect(noCity).not.toContain("follow-city");
    });

    it("adds nothing for a driveway, and says so", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["city", "driveway"] });

        expect(chat.understanding.needs.map((need) => need.id)).toEqual(["life-city"]);
        expect(texts(chat).join(" ")).toMatch(/A driveway leaves plenty of room/);
    });
});

describe("common sense in what can be picked", () => {
    it("takes every regular kind of driving, and the one or two places parked most", () => {
        const chat = walk(startChat(null, cars(), TODAY, FULL), { life: ["city", "night", "roadtrips", "street", "garage", "open-car-park"] });
        const ids = chat.understanding.needs.map((need) => need.id);
        const parking = chat.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "life-parking")!;

        expect(ids).toEqual(expect.arrayContaining(["life-city", "life-night", "life-roadtrips"]));
        expect(parking.step.max).toBe(2);
        expect(ids.filter((id) => ["life-street", "life-garage", "life-open-car-park"].includes(id))).toEqual(["life-street", "life-garage"]);
    });

    it("says what each answer means, and that a city commute is both", () => {
        const start = startChat(null, cars(), TODAY, FULL);
        let chat = start;
        const meanings: Record<string, string | undefined> = {};

        for (let guard = 0; guard < 12 && openAsk(chat)?.step.id.startsWith("life-"); guard += 1) {
            /* Counts, a driveway and how-much answers say what they mean on the chip itself. */
            for (const choice of openAsk(chat)!.step.choices) if (!/^(passengers|co2|efficiency)-/.test(choice.id) && choice.id !== "driveway") meanings[choice.id] = choice.means;
            chat = answer(chat, openAsk(chat)!.id, openAsk(chat)!.step.id === "life-passengers" ? ["passengers-2"] : [], cars(), TODAY).chat;
        }

        expect(Object.keys(meanings).length).toBeGreaterThan(15);
        for (const [id, means] of Object.entries(meanings)) expect(means, id).toMatch(/\w{3,}/);
        expect(meanings.commute).toMatch(/pick City driving too/);
    });

    it("never keeps two answers that can't both be true", () => {
        expect(withinLimits({ exclusive: [["electric-only", "not-electric"]] }, ["electric-only", "automatic", "not-electric"])).toEqual(["electric-only", "automatic"]);

        const start = startChat(null, cars(), TODAY, FULL);
        const one = answer(start, openAsk(start)!.id, ["passengers-1"], cars(), TODAY).chat;
        const who = openAsk(one)!;

        expect(who.step.exclusive).toEqual([["kids", "adults"]]);
        expect(answer(one, who.id, ["kids", "adults", "dog"], cars(), TODAY).chat.understanding.needs.map((need) => need.id)).toEqual(["life-kids", "life-dog"]);
    });
});

describe("how often", () => {
    it("asks motorway drives on a scale whose answers don't overlap", () => {
        const start = walk(startChat(null, cars(), TODAY, FULL), { life: ["motorway"], "follow-motorway": ["daily"] });
        const often = start.messages.find((message): message is Ask => message.kind === "ask" && message.step.id === "follow-motorway")!;

        expect(often.step.choices.map((choice) => choice.label)).toEqual(["Every day", "Every week, or most weekends", "About once a month", "A few times a year"]);
        expect(start.understanding.needs.find((need) => need.id === "life-motorway")?.importance).toBe("essential");
    });
});

describe("answers that mostly overlap", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);

    it("sets aside an answer another picked one mostly covers, and says what they share", () => {
        const parking = stepFor("life-parking", page())!;
        const shared = coveredBy(parking, "garage", "multi-storey");

        /* A home garage and a multi-storey car park share width, folding mirrors and sensors: three of four. */
        expect(shared?.length).toBeGreaterThanOrEqual(3);
        expect(withinLimits(parking, ["garage", "multi-storey"])).toEqual(["garage"]);
        /* Which stays is the reader's first pick. */
        expect(withinLimits(parking, ["multi-storey", "garage"])).toEqual(["multi-storey"]);
    });

    it("leaves answers that only share a little", () => {
        const driving = stepFor("life-driving", page())!;

        expect(coveredBy(driving, "city", "commute")).toBeNull();
        expect(withinLimits(driving, ["city", "commute", "night"])).toEqual(["city", "commute", "night"]);
    });

    it("holds in the conversation, not only on the page", () => {
        let chat = startChat(null, page(), TODAY, FULL);
        while (openAsk(chat)?.step.id !== "life-parking") chat = answer(chat, openAsk(chat)!.id, [], page(), TODAY).chat;
        chat = answer(chat, openAsk(chat)!.id, ["garage", "multi-storey"], page(), TODAY).chat;

        expect(chat.understanding.needs.map((need) => need.id)).toEqual(["life-garage"]);
    });
});

describe("the kinds of driving", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);

    it("takes up to three, and not two that are the same kind of driving", () => {
        const driving = stepFor("life-driving", page())!;

        expect(driving.max).toBe(3);
        expect(withinLimits(driving, ["city", "night", "roadtrips"])).toEqual(["city", "night", "roadtrips"]);
        expect(withinLimits(driving, ["motorway", "roadtrips", "city"])).toEqual(["motorway", "city"]);
        expect(withinLimits(driving, ["city", "commute", "night", "motorway"])).toEqual(["city", "commute", "night"]);
    });

    it("keeps the stricter overlap to driving: children don't set pets aside", () => {
        const people = stepFor("life-people", page(), { ...EMPTY_UNDERSTANDING, passengers: 3 })!;

        expect(withinLimits(people, ["kids", "dog", "adults"])).toEqual(["kids", "dog", "adults"]);
    });
});

describe("rules about money, CO₂ and consumption", () => {
    const page = () => fleet().sort((a, b) => a.id - b.id).slice(0, 24);
    const toRules = (budget: string[]) => {
        let chat = startChat(null, page(), TODAY, FULL);
        for (let guard = 0; guard < 20 && openAsk(chat)?.step.id !== "rules"; guard += 1) {
            const ask = openAsk(chat)!;
            chat = answer(chat, ask.id, ask.step.id === "budget" ? budget : ask.step.id === "life-driving" ? ["city"] : [], page(), TODAY).chat;
        }
        return chat;
    };

    it("asks the limit before the rules, and offers it as one", () => {
        const chat = toRules(["budget-500"]);
        const rules = openAsk(chat)!.step;

        expect(rules.choices[0]).toMatchObject({ id: "firm-budget", label: "Nothing over €500" });

        const firm = answer(chat, openAsk(chat)!.id, ["firm-budget"], page(), TODAY).chat;
        expect(firm.understanding.budget).toMatchObject({ monthly: 500, firm: true, kind: "hardMax" });
        expect(texts(firm).at(-1)).toBe("Noted. Before judging, I'll set aside any car over €500 a month.");
        expect(summaryOf(firm.understanding).lines.find((line) => line.label === "Monthly limit")?.value).toBe("€500 all in, nothing over it");
    });

    it("doesn't offer the limit as a rule when there's no limit", () => {
        const rules = openAsk(toRules([]))!.step;

        expect(rules.choices.map((choice) => choice.id)).not.toContain("firm-budget");
    });

    it("sets aside cars over a firm limit rather than grading them", () => {
        const chat = toRules(["budget-500"]);
        const firm = answer(chat, openAsk(chat)!.id, ["firm-budget"], page(), TODAY).chat;
        const judged = judgeWith(firm.understanding, page(), "24 cars")!;
        const verdicts = judgementFrom(judged, page(), firm.understanding, "", "", {}, "").verdicts;
        const over = judged.run.overLimit?.ids ?? [];

        expect(over.length).toBeGreaterThan(0);
        for (const id of over) expect(verdicts[id]).toMatchObject({ label: "Ruled out", rank: null });
        expect(judged.run.recommendation.context.costs[judged.run.recommendation.winner.id]?.budgetStatus).not.toBe("over");
    });

    it("offers low CO₂ and frugal as rules where they split the cars", () => {
        const ids = openAsk(toRules(["budget-500"]))!.step.choices.map((choice) => choice.id);

        expect(ids).toEqual(expect.arrayContaining(["low-co2", "frugal"]));
    });
});

describe("taking an answer back", () => {
    const start = () => {
        const first = startChat(null, cars(), TODAY, FULL);
        const count = answer(first, openAsk(first)!.id, ["passengers-2"], cars(), TODAY).chat;
        return answer(count, openAsk(count)!.id, ["kids"], cars(), TODAY).chat;
    };

    it("undoes everything the last answer did, and asks the question again with it picked", () => {
        const before = start();
        const seats = answer(before, openAsk(before)!.id, ["seats"], cars(), TODAY).chat;

        expect(seats.understanding.needs.find((need) => need.id === "life-kids")?.importance).toBe("essential");
        expect(rewindable(seats)).toBe(seats.messages.filter((message) => message.from === "reader").at(-1)!.id);

        const back = rewind(seats);
        const ask = openAsk(back)!;

        expect(ask.step.id).toBe("follow-kids");
        expect(ask.step.selected).toEqual(["seats"]);
        expect(back.messages).toHaveLength(before.messages.length);
        expect(back.understanding).toEqual(before.understanding);
        expect(back.queue).toEqual(before.queue);

        const older = answer(back, ask.id, ["older"], cars(), TODAY).chat;
        expect(older.understanding.needs.find((need) => need.id === "life-kids")?.evidence.map((entry) => entry.id)).not.toContain("hasIsofix");
    });

    it("steps back one answer at a time", () => {
        const back = rewind(start());

        expect(openAsk(back)?.step.id).toBe("life-people");
        expect(back.understanding.needs.map((need) => need.id)).toEqual(["life-passengers-2"]);
        expect(openAsk(rewind(back))?.step.id).toBe("life-passengers");
    });

    it("offers no way back once the answers are kept and judged, or after words typed on their own", () => {
        const looked = walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids"] });
        const kept = answer(looked, openAsk(looked)!.id, ["go"], cars(), TODAY).chat;
        const judged = answer(kept, openAsk(kept)!.id, ["keep-chat"], cars(), TODAY).chat;

        expect(judged.history).toEqual([]);
        expect(rewindable(judged)).toBeNull();

        const typed = { ...start(), messages: [...start().messages, { id: "typed", at: "", from: "reader" as const, kind: "text" as const, text: "hello" }] };
        expect(rewindable(typed)).toBeNull();
    });
});


describe("how much Lens asks", () => {
    const run = (ask: "quick" | "balanced" | "thorough") => {
        const first = startChat(null, cars(), TODAY);
        const asks = answer(first, openAsk(first)!.id, [ask], cars(), TODAY).chat;
        const explains = answer(asks, openAsk(asks)!.id, ["balanced"], cars(), TODAY).chat;
        return walk(explains, { life: ["passengers-2", "kids", "city", "nervous"], "follow-kids": ["boosters"], budget: ["budget-500"], offer: ["yes"] });
    };
    const asked = (chat: Chat) => chat.messages.filter((message): message is Ask => message.kind === "ask").map((message) => message.step.id);

    it("asks how much to ask and explain, first", () => {
        const chat = startChat(null, cars(), TODAY);

        expect(openAsk(chat)?.step.id).toBe("askDepth");
        expect(openAsk(chat)!.step.choices.map((choice) => choice.label)).toEqual(["Quick", "Balanced", "Thorough"]);
        expect(openAsk(answer(chat, openAsk(chat)!.id, ["quick"], cars(), TODAY).chat)?.step.id).toBe("explainDepth");
    });

    it("asks only what it really needs when quick", () => {
        const quick = asked(run("quick"));

        /* The priorities are settled at every depth: proposed and confirmed when quick. */
        expect(quick).toEqual(["askDepth", "explainDepth", "life-passengers", "life-people", "life-driving", "life-you", "prioritiesConfirm", "budget", "confirm"]);
    });

    it("asks the features that matter most when balanced, and every priority's when thorough", () => {
        const balanced = run("balanced");
        const thorough = run("thorough");
        const cards = (chat: Chat) => asked(chat).filter((id) => id.startsWith("features-"));

        expect(asked(balanced)).toEqual(expect.arrayContaining(["follow-kids", "life-weather", "rules", "period", "distance"]));
        expect(cards(balanced)).toEqual(["features-top"]);
        expect(cards(thorough)).toEqual(
            chatAnswers(thorough.understanding)
                .answers.priorities.filter((id) => id !== "environmental" && id !== "efficiency")
                .map((id) => `features-${id}`),
        );
        /* Equipment worth a look is among the features now, never a question of its own. */
        for (const chat of [balanced, thorough]) expect(asked(chat).some((id) => id.startsWith("offer-"))).toBe(false);
    });

    it("asks a question the reader chose to change, whatever the depth", () => {
        const quick = run("quick");
        const judged = { ...quick, phase: "judged" as const, judgement: { carIds: [] } as unknown as Chat["judgement"] };
        const how = changeAnswers(judged, cars());
        const some = answer(how, openAsk(how)!.id, ["some"], cars(), TODAY).chat;
        const which = answer(some, openAsk(some)!.id, ["rules"], cars(), TODAY).chat;

        expect(openAsk(which)?.step.id).toBe("rules");
    });

    it("says both depths in the summary, each with a way to change it", () => {
        const summary = run("quick").messages.find((message) => message.kind === "summary");

        expect(summary?.kind === "summary" && summary.lines.filter((line) => line.step === "askDepth" || line.step === "explainDepth").map((line) => line.value)).toEqual(["Quick", "Balanced"]);
    });
});

describe("your priorities, in the chat", () => {
    const begin = (ask: "quick" | "balanced" | "thorough") => {
        const first = startChat(null, cars(), TODAY);
        const asks = answer(first, openAsk(first)!.id, [ask], cars(), TODAY).chat;
        return answer(asks, openAsk(asks)!.id, ["balanced"], cars(), TODAY).chat;
    };
    const until = (chat: Chat, id: string, picks: Record<string, string[]>) => {
        let current = chat;
        for (let guard = 0; guard < 25 && openAsk(current) && openAsk(current)!.step.id !== id; guard += 1) {
            const ask = openAsk(current)!;
            const key = ask.step.id.startsWith("life-") ? "life" : ask.step.id;
            const own = new Set(ask.step.choices.map((choice) => choice.id));
            current = answer(current, ask.id, (picks[key] ?? ask.step.selected ?? []).filter((pick) => key !== "life" || own.has(pick)), cars(), TODAY).chat;
        }
        return current;
    };
    const life = { life: ["passengers-2", "kids", "city", "street", "nervous"] };

    it("proposes the order and asks to confirm it when quick", () => {
        const chat = until(begin("quick"), "prioritiesConfirm", life);
        const ask = openAsk(chat)!;

        expect(ask.step.ask).toMatch(/^From what you've told me, I'll weigh .+ first, then .+\. Does that feel right\?$/);

        const ok = answer(chat, ask.id, ["ok"], cars(), TODAY).chat;
        expect(ok.understanding.lens?.order).toEqual(chatAnswers(chat.understanding).answers.priorities);
        expect(openAsk(answer(chat, ask.id, ["order"], cars(), TODAY).chat)?.step.id).toBe("rank-1");
    });

    it("asks only which matters most when balanced, and keeps the rest as proposed", () => {
        const chat = until(begin("balanced"), "top", life);
        const top = openAsk(chat)!;
        const last = top.step.choices.at(-1)!.id;
        const picked = answer(chat, top.id, [last], cars(), TODAY).chat;

        expect(picked.understanding.lens?.order?.[0]).toBe(last);
        expect(openAsk(picked)?.step.id).not.toMatch(/^rank-/);
        expect(texts(picked).at(-1)).toMatch(/first, then the rest as I had them\.$/);
    });

    it("lets a thorough reader add and take out priorities, then put each in its place", () => {
        const chat = until(begin("thorough"), "prioritiesPick", life);
        const pick = openAsk(chat)!;
        const proposed = pick.step.selected!;

        /* Every priority can be added: the ones proposed, picked, and the rest. */
        expect(pick.step.choices.length).toBe(8);
        expect(pick.step.choices.find((choice) => choice.id === proposed[0])?.means).toMatch(/^From what you said: /);

        /* Take the first out, add efficiency. */
        const kept = [...proposed.slice(1), "efficiency"];
        const ranking = answer(chat, pick.id, kept, cars(), TODAY).chat;
        expect(ranking.understanding.lens?.removed).toEqual([proposed[0]]);
        expect(openAsk(ranking)?.step.id).toBe("rank-1");

        const first = answer(ranking, openAsk(ranking)!.id, ["efficiency"], cars(), TODAY).chat;
        expect(openAsk(first)?.step.ask).toBe("And after efficiency?");

        /* The rest as they are: the order stands, and the ranking stops. */
        const rest = answer(first, openAsk(first)!.id, [], cars(), TODAY).chat;
        expect(rest.understanding.lens?.order?.[0]).toBe("efficiency");
        expect(chatAnswers(rest.understanding).answers.priorities).not.toContain(proposed[0]);
        expect(openAsk(rest)?.step.id).not.toMatch(/^rank-/);
    });

    it("lists the priorities first in the summary, with a way to change them", () => {
        const chat = until(begin("quick"), "confirm", { ...life, prioritiesConfirm: ["ok"] });
        const summary = chat.messages.find((message) => message.kind === "summary");

        expect(summary?.kind === "summary" && summary.lines[0]).toMatchObject({ label: "Priorities", step: "priorities" });
    });
});

describe("how much each feature counts", () => {
    const begin = (ask: "quick" | "balanced" | "thorough") => {
        const first = startChat(null, cars(), TODAY);
        const asks = answer(first, openAsk(first)!.id, [ask], cars(), TODAY).chat;
        return answer(asks, openAsk(asks)!.id, ["balanced"], cars(), TODAY).chat;
    };
    const until = (chat: Chat, id: (step: StepId) => boolean) => {
        let current = chat;
        for (let guard = 0; guard < 40 && openAsk(current) && !id(openAsk(current)!.step.id); guard += 1) {
            const ask = openAsk(current)!;
            const own = new Set(ask.step.choices.map((choice) => choice.id));
            const picks = ask.step.id.startsWith("life-") ? ["passengers-2", "kids", "city", "nervous"].filter((pick) => own.has(pick)) : (ask.step.selected ?? []);
            current = answer(current, ask.id, picks, cars(), TODAY).chat;
        }
        return current;
    };
    const rows = (ask: Ask) => ask.step.levels!.flatMap((group) => group.rows);
    const raised = (chat: Chat) => new Map(Object.values(chatAnswers(chat.understanding).answers.features).flatMap((items) => (items ?? []).map((item) => [item.key, item.importance] as const)));

    it("asks none when quick: the reader's needs set them", () => {
        const chat = until(begin("quick"), (id) => id === "confirm");

        expect(chat.messages.some((message) => message.kind === "ask" && message.step.id.startsWith("features-"))).toBe(false);
        expect(raised(chat).size).toBeGreaterThan(0);
    });

    it("shows what the needs raised and what's worth a look when balanced, each saying why and how many cars here have it", () => {
        const chat = until(begin("balanced"), (id) => id === "features-top");
        const ask = openAsk(chat)!;
        const now = raised(chat);

        expect(ask.step.ask).toMatch(/^Here are the features your answers point to, in the priorit(ies|y) that counts? most for you\. How much should each one count\?$/);
        expect(ask.step.levels!.length).toBeLessThanOrEqual(2);
        for (const row of rows(ask)) {
            expect(row.level).toBe(now.get(row.id) ?? "standard");
            expect(row.because).toMatch(/^From what you said: |^Worth a look/);
        }
        expect(rows(ask).some((row) => row.listed && row.listed.of > 0)).toBe(true);
        /* In the reader's order of priorities. */
        const order = chatAnswers(chat.understanding).answers.priorities;
        const groups = ask.step.levels!.map((group) => order.indexOf(group.category));
        expect(groups).toEqual([...groups].sort((a, b) => a - b));
    });

    it("keeps only what differs from what the needs propose, and a feature set to standard stops counting more", () => {
        const chat = until(begin("balanced"), (id) => id === "features-top");
        const ask = openAsk(chat)!;
        const up = rows(ask).find((row) => row.level === "standard")!;
        const down = rows(ask).find((row) => row.level !== "standard")!;
        const same = rows(ask).find((row) => row !== down && row.level !== "standard");

        const next = answer(chat, ask.id, [`${up.id}=high`, `${down.id}=standard`, ...(same ? [`${same.id}=${same.level}`] : [])], cars(), TODAY).chat;
        const levels = next.understanding.lens?.levels ?? {};

        expect(levels).toMatchObject({ [up.id]: "high", [down.id]: "standard" });
        if (same) expect(levels).not.toHaveProperty(same.id);
        expect(raised(next).get(up.id)).toBe("high");
        expect(raised(next).has(down.id)).toBe(false);
        expect(next.messages.filter((message) => message.from === "reader").at(-1)).toMatchObject({ text: expect.stringMatching(/^Count .+ highly .*as standard\.$|^Count .+ as standard .*highly\.$/) });
    });

    it("keeps them all as they are on “Keep them as they are”", () => {
        const chat = until(begin("balanced"), (id) => id === "features-top");
        const next = answer(chat, openAsk(chat)!.id, [], cars(), TODAY).chat;

        expect(raised(next)).toEqual(raised(chat));
        expect(texts(next).at(-1)).toBe("Good — I'll keep them as they are.");
    });

    it("shows every feature of each priority when thorough, niche ones not counted until raised", () => {
        const chat = until(begin("thorough"), (id) => id.startsWith("features-"));
        const ask = openAsk(chat)!;
        const [group] = ask.step.levels!;

        expect(ask.step.levels).toHaveLength(1);
        expect(ask.step.id).toBe(`features-${group!.category}`);
        expect(rows(ask).map((row) => row.id)).toEqual(expect.arrayContaining([...(CATEGORIES[group!.category].features as readonly string[])].slice(0, 1)));

        const practical = until(chat, (id) => id === "features-practicality");
        const towbar = rows(openAsk(practical)!).find((row) => row.id === "hasTowbar");
        expect(towbar).toMatchObject({ niche: true, level: "standard" });
    });

    it("says what counts more in the summary, and asks every priority's features when that's changed, whatever the depth", () => {
        const chat = until(begin("quick"), (id) => id === "confirm");
        const summary = chat.messages.find((message) => message.kind === "summary");
        const line = summary?.kind === "summary" ? summary.lines.find((item) => item.step === "features") : undefined;

        expect(line?.label).toBe("Counts more");
        expect(line?.value).toMatch(/^(Highly|Moderately|Somewhat): /);

        const change = changeOne(chat, "features", cars());
        expect(openAsk(change)?.step.id).toBe(`features-${chatAnswers(chat.understanding).answers.priorities.find((id) => !CATEGORIES[id].numericOnly)}`);
    });

    it("lets the reader pick their priorities and features to change", () => {
        const quick = until(begin("quick"), (id) => id === "confirm");
        const judged = { ...quick, phase: "judged" as const, judgement: { carIds: [] } as unknown as Chat["judgement"] };
        const how = changeAnswers(judged, cars());
        const some = answer(how, openAsk(how)!.id, ["some"], cars(), TODAY).chat;

        expect(openAsk(some)!.step.choices.map((choice) => choice.id)).toEqual(expect.arrayContaining(["priorities", "features"]));
    });
});

describe("how much Lens explains, after a result", () => {
    it("tells more, or keeps it quick, from then on — without changing what was judged", () => {
        const chat = walk(startChat(null, cars(), TODAY, { ask: "quick", explain: "balanced" }), { life: ["passengers-2", "kids"] });
        const more = explainAs(chat, "detailed");

        expect(more.depth).toEqual({ ask: "quick", explain: "detailed" });
        expect(more.understanding).toBe(chat.understanding);
        expect(more.messages.slice(-2).map((message) => message.kind === "text" && message.text)).toEqual([
            "Tell me more.",
            expect.stringMatching(/^Sure — here's all of my reasoning/),
        ]);
        expect(explainAs(more, "quick").depth?.explain).toBe("quick");
    });
});

describe("fine-tuning from the summary", () => {
    const quick = () => walk(startChat(null, cars(), TODAY, { ask: "quick", explain: "quick" }), { life: ["passengers-2", "kids", "city", "nervous"], prioritiesConfirm: ["ok"], budget: ["budget-500"] });

    it("offers to fine-tune when Lens asked less than everything", () => {
        expect(openAsk(quick())!.step.choices.map((choice) => choice.label)).toEqual(["Looks good to me — let's go", "Let me fine-tune"]);
        expect(openAsk(walk(startChat(null, cars(), TODAY, FULL), { life: ["passengers-2", "kids"] }))!.step.choices.map((choice) => choice.id)).toEqual(["go"]);
    });

    it("asks the priorities and every priority's features, then says back what it will judge by", () => {
        const chat = quick();
        const tuned = answer(chat, openAsk(chat)!.id, ["tune"], cars(), TODAY).chat;

        expect(openAsk(tuned)?.step.id).toBe("prioritiesPick");

        const done = walk(tuned, {});
        const asked = done.messages.slice(chat.messages.length).filter((message): message is Ask => message.kind === "ask").map((message) => message.step.id);

        expect(asked.filter((id) => id.startsWith("features-")).length).toBe(chatAnswers(done.understanding).answers.priorities.filter((id) => !CATEGORIES[id].numericOnly).length);
        expect(asked.at(-1)).toBe("confirm");
        expect(done.depth).toEqual({ ask: "quick", explain: "quick" });
    });
});
