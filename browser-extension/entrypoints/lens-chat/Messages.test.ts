import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { answer, startChat } from "@/lib/chats/flow";
import type { Chat, ChatMessage } from "@/lib/chats/types";
import { GARAGE } from "@/lib/reasoning-engine/test-garage";

import { MessageList } from "./Messages";

/*
 * The bubbles question and "Here's what I understood", rendered as the
 * reader gets them.
 */

const cars = () => [GARAGE.safeCompact(), GARAGE.familySuv(), GARAGE.cityHatch(), GARAGE.longRangeEv(), GARAGE.thirstyPetrol()];
const TODAY = new Date("2026-09-29T10:00:00Z");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const noop = () => {};

/* Lens's avatar asks the extension for its icon; outside the browser there is none. */
(globalThis as unknown as { browser: unknown }).browser = { runtime: { getURL: (path: string) => path } };

const render = (messages: ChatMessage[]) =>
    renderToStaticMarkup(
        createElement(MessageList, {
            messages,
            typing: false,
            busy: false,
            onAnswer: noop,
            onOpenCar: noop,
            onImportance: noop,
            onChange: noop,
            onRemove: noop,
            onAdd: noop,
        }),
    );

const openAsk = (chat: Chat) => [...chat.messages].reverse().find((message) => message.kind === "ask" && !message.answered)!;

describe("the bubbles", () => {
    it("open the chips of a tapped bubble under it, and hold Continue until a required one is picked", () => {
        const chat = startChat(null, cars(), TODAY);
        const ask = openAsk(chat) as Extract<ChatMessage, { kind: "ask" }>;
        const tapped = { ...ask, step: { ...ask.step, selected: ["city", "city:street", "weather"] } };
        const html = render([tapped]);
        const words = text(html);

        expect(words).toContain("Tell me about your life. Tap everything that fits.");
        expect(words).toContain("Where do you park most often? Up to 2.");
        expect(words).toContain("What's it like?");
        expect(words).toContain("Pick at least one, so I know what to check.");
        /* Untapped bubbles keep their chips closed. */
        expect(words).not.toContain("Does the youngest ride in a child seat?");
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
    });
});

describe("here's what I understood", () => {
    it("shows each bubble with what it checks, what might matter, what it can't check and how much it counts", () => {
        let chat = startChat(null, cars(), TODAY);
        for (const picks of [["kids", "kids:baby", "city", "city:street"], ["budget-500"], ["period-12"], []]) chat = answer(chat, openAsk(chat).id, picks, cars(), TODAY).chat;

        const words = text(render(chat.messages));

        expect(words).toContain("Your life");
        expect(words).toContain("You have kids · a baby or toddler seat");
        expect(words).toMatch(/I'll check Rear doors .*ISOFIX child seat anchors/);
        expect(words).toContain("I can't check rear legroom");
        expect(words).toContain("My guess — change it if it's wrong");
        expect(words).toContain("Must have");
        expect(words).toContain("Looks good to me — let's go");
        expect(words).not.toMatch(/\d+%/);
    });
});

describe("the result", () => {
    const result = (): Extract<ChatMessage, { kind: "result" }> => ({
        id: "r1",
        at: "",
        from: "lens",
        kind: "result",
        headline: "5 cars",
        count: 5,
        winner: { id: 1, name: "Škoda Karoq", configuration: "1.5 TSI", image: null, monthly: 520, band: "good", bandLabel: "Good match", url: null, overLimit: false },
        reason: "It has the most of what you raised.",
        reasons: ["It has the most of what you raised.", "It's the narrowest here."],
        why: [
            { said: "You live in the city", has: ["4.18 m long", "reversing camera"] },
            { said: "You have kids", has: ["rear doors"] },
        ],
        tradeoffs: [{ headline: "€44/month more than MG S5", text: "At your mileage it's about €44 more." }],
        because: [{ said: "You have kids", importance: "essential", into: ["Practicality"] }],
        note: null,
        runnersUp: [{ id: 2, name: "MG S5", configuration: "", image: null, monthly: 476, band: "good", bandLabel: "Good match", url: null, overLimit: false }],
        setAside: 0,
    });

    it("is short: the pick, why for each bubble, and one thing to know", () => {
        const words = text(render([result()]));

        expect(words).toContain("Your strongest match");
        expect(words).toContain("You live in the city → 4.18 m long, reversing camera");
        expect(words).toContain("One thing to know €44/month more than MG S5. At your mileage it's about €44 more.");
        expect(words).toContain("See why");
        expect(words).not.toContain("What decided it");
        expect(words).not.toContain("Next closest");
    });

    it("opens with everything once the reader keeps asking", () => {
        const words = text(
            renderToStaticMarkup(
                createElement(MessageList, { messages: [result()], typing: false, busy: false, onAnswer: noop, onOpenCar: noop, onImportance: noop, onChange: noop, onRemove: noop, onAdd: noop, longResults: true }),
            ),
        );

        expect(words).toContain("What decided it");
        expect(words).toContain("Because you said… You have kids — must have → Practicality");
        expect(words).toContain("Next closest");
        expect(words).toContain("Keep it short");
    });
});
