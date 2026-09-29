import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import { withBudget } from "@/lib/lens-chat/understanding";

import { answer, askNext, changeAnswers, rentalMonths, startChat, startMonth } from "./flow";
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
function walk(chat: Chat, picks: Partial<Record<StepId, string[]>>): Chat {
    let current = chat;

    for (let guard = 0; guard < 10; guard += 1) {
        const ask = openAsk(current);
        if (!ask || ask.step.id === "keep" || ask.step.id === "start") return current;

        current = answer(current, ask.id, picks[ask.step.id] ?? [], cars(), TODAY).chat;
    }

    throw new Error("Lens never stopped asking");
}

describe("a first chat", () => {
    it("greets, says what's about to happen, then asks what the car has to do", () => {
        const chat = startChat(null, cars(), TODAY);
        const [hello, how] = texts(chat);

        expect(hello).toMatch(/I'm Lens/);
        expect(how).toMatch(/chip/);
        expect(how).toMatch(/trophy/);
        expect(openAsk(chat)?.step.id).toBe("life");
        expect(chat.phase).toBe("asking");
        expect(chat.judgement).toBeNull();
    });

    it("asks each question once, then says what it will judge by and asks whether to keep it", () => {
        const chat = walk(startChat(null, cars(), TODAY), {
            life: ["kids", "motorway"],
            budget: ["budget-500"],
            period: ["period-12"],
            distance: ["km-1500"],
        });

        const asked = chat.messages.filter((message): message is Ask => message.kind === "ask").map((message) => message.step.id);

        expect(asked.filter((id) => id === "life")).toHaveLength(1);
        expect(asked).toContain("budget");
        expect(asked).toContain("period");
        expect(asked).toContain("distance");
        expect(asked.at(-1)).toBe("keep");
        expect(chat.phase).toBe("keep");

        const summary = chat.messages.find((message) => message.kind === "summary");
        expect(summary?.kind === "summary" && summary.lines.find((line) => line.label === "Monthly limit")?.value).toBe("€500 all in");
        expect(summary?.kind === "summary" && summary.priorities.reduce((sum, item) => sum + item.share, 0)).toBeGreaterThan(95);

        expect(chat.understanding.budget?.monthly).toBe(500);
        expect(chat.understanding.monthlyKm?.value).toBe(1500);
        expect(chat.understanding.rental).toMatchObject({ from: "2026-10", to: "2027-09" });
        expect(chat.understanding.needs.map((need) => need.id)).toEqual(expect.arrayContaining(["life:kids", "life:motorway"]));
        expect(chat.title).toMatch(/Kids in the back/);
    });

    it("records each tap as the reader's own words, and answers it", () => {
        const start = startChat(null, cars(), TODAY);
        const { chat } = answer(start, openAsk(start)!.id, ["kids"], cars(), TODAY);
        const said = chat.messages.filter((message) => message.from === "reader");

        expect(said.at(-1)).toMatchObject({ kind: "text", text: "I have kids in the back." });
        expect(texts(chat).at(-1)).toMatch(/Got it/);
    });

    it("takes no limit and no period as answers, not as questions to repeat", () => {
        const chat = walk(startChat(null, cars(), TODAY), { life: [], budget: [], period: [], distance: [] });

        expect(chat.understanding.budget).toBeNull();
        expect(chat.understanding.waived).toEqual(expect.arrayContaining(["budget", "rental"]));
        expect(openAsk(chat)?.step.id).toBe("keep");
    });

    it("keeps the answers as settings or for this chat, then asks for a judgement", () => {
        const asked = walk(startChat(null, cars(), TODAY), { life: ["city"], budget: ["budget-400"] });
        const keep = openAsk(asked)!;

        const saved = answer(asked, keep.id, ["keep-settings"], cars(), TODAY);
        expect(saved.then).toBe("judge");
        expect(saved.chat.kept).toBe("settings");
        expect(saved.chat.phase).toBe("ready");

        const here = answer(asked, keep.id, ["keep-chat"], cars(), TODAY);
        expect(here.chat.kept).toBe("chat");
    });

    it("doesn't ask what the reader has already said in their own words", () => {
        const chat = startChat(null, cars(), TODAY);
        const typed = askNext({ ...chat, understanding: withBudget(chat.understanding, 650, "650 max"), queue: ["budget", "distance"] }, cars());

        expect(openAsk(typed)?.step.id).toBe("distance");
    });
});

describe("a chat from saved settings", () => {
    const settings = (): SavedSettings => {
        const asked = walk(startChat(null, cars(), TODAY), { life: ["kids"], budget: ["budget-700"], period: ["period-6"] });

        return { savedAt: TODAY.toISOString(), fromChatId: asked.id, understanding: asked.understanding, rentalMonths: rentalMonths(asked.understanding) };
    };

    it("greets the reader back with what it will judge by, and offers to judge straight away", () => {
        const chat = startChat(settings(), cars(), TODAY);

        expect(texts(chat)[0]).toMatch(/Welcome back/);
        expect(chat.messages.some((message) => message.kind === "summary")).toBe(true);
        expect(openAsk(chat)?.step.choices.map((choice) => choice.id)).toEqual(["judge", "change", "scratch"]);
        expect(chat.kept).toBe("settings");

        expect(answer(chat, openAsk(chat)!.id, ["judge"], cars(), TODAY).then).toBe("judge");
    });

    it("keeps the period as a length, starting from whenever the new chat starts", () => {
        const later = new Date("2027-03-02T10:00:00Z");
        const chat = startChat(settings(), cars(), later);

        expect(chat.understanding.rental).toMatchObject({ from: "2027-04", to: "2027-09" });
    });

    it("asks again with the last answers picked, when the reader wants to change something", () => {
        const chat = startChat(settings(), cars(), TODAY);
        const { chat: changing } = answer(chat, openAsk(chat)!.id, ["change"], cars(), TODAY);
        const ask = openAsk(changing)!;

        expect(changing.revising).toBe(true);
        expect(ask.step.id).toBe("life");
        expect(ask.step.selected).toEqual(["kids"]);
    });

    it("starts from nothing, when asked, without touching the settings", () => {
        const chat = startChat(settings(), cars(), TODAY);
        const { chat: fresh } = answer(chat, openAsk(chat)!.id, ["scratch"], cars(), TODAY);

        expect(fresh.understanding.needs).toEqual([]);
        expect(fresh.kept).toBeNull();
        expect(openAsk(fresh)?.step.id).toBe("life");
    });
});

describe("after a judgement", () => {
    it("asks every question again, with what was said already picked", () => {
        const asked = walk(startChat(null, cars(), TODAY), { life: ["winter"], budget: ["budget-500"] });
        const changed = changeAnswers({ ...asked, phase: "judged" }, cars());
        const ask = openAsk(changed)!;

        expect(ask.step.id).toBe("life");
        expect(ask.step.selected).toEqual(["winter"]);
        expect(changed.kept).toBeNull();
    });
});

describe("dates", () => {
    it("starts a rental next month, since FINN delivers in weeks", () => {
        expect(startMonth(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01");
    });
});
