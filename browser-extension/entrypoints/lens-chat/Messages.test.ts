import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { answer, startChat as beginChat, stepFor } from "@/lib/chats/flow";
import { withBubbles } from "@/lib/lens-chat/bubbles";
import { EMPTY_UNDERSTANDING } from "@/lib/lens-chat/understanding";
import type { Chat, ChatMessage } from "@/lib/chats/types";
import { GARAGE } from "@/lib/reasoning-engine/test-garage";

import { MessageList } from "./Messages";

/** A first chat, past "Got it — let's start": most tests begin at the first question. */
function startChat(...args: Parameters<typeof beginChat>): ReturnType<typeof beginChat> {
    const chat = beginChat(...args);
    const intro = [...chat.messages].reverse().find((message) => message.kind === "ask" && !message.answered && message.step.id === "intro");
    return intro ? answer(chat, intro.id, ["go"], args[1], args[2]).chat : chat;
}

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
        /* Every bubble at once, as a chat from before the sections asks them. */
        const step = stepFor("bubbles", cars())!;
        const tapped: Extract<ChatMessage, { kind: "ask" }> = { id: "a1", at: "", from: "lens", kind: "ask", answered: false, step: { ...step, selected: ["city", "city:street", "weather"] } };
        const html = render([tapped]);
        const words = text(html);

        expect(words).toContain("Tell me about your life. Tap everything that fits.");
        /* Several weathers can be true; parking takes two at most; so only the weather offers them all. */
        expect(words).toMatch(/What's it like\? Select all/);
        expect(words).not.toMatch(/Where do you park most often\? Up to 2\. Select all/);
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
        for (const picks of [["kids", "kids:baby"], ["city", "city:street"], [], [], ["budget-500"], ["period-12"], [], []]) chat = answer(chat, openAsk(chat).id, picks, cars(), TODAY).chat;

        const words = text(render(chat.messages));

        expect(words).toContain("Your life");
        /* Each bubble a card of its own, the tones alternating. */
        const html = render(chat.messages);
        expect(html.match(/<li class="space-y-3 rounded-2xl p-3\.5 ring-1 bg-finn-pale-blue/g)).toHaveLength(1);
        expect(html.match(/<li class="space-y-3 rounded-2xl p-3\.5 ring-1 bg-finn-snow/g)).toHaveLength(1);
        expect(words).toContain("You have kids · a baby or toddler seat");
        expect(words).toContain("I'll check — tap × to take one out Rear doors On nearly every car ISOFIX child seat anchors Might matter — tap + to add");
        expect(words).toContain("I can't check rear legroom");
        expect(words).toContain("My guess — tap to change");
        /* Limits and deal-breakers under their own headings. */
        expect(words).toMatch(/Money & time Monthly limit €500 all in Change .* Deal-breakers & sealers Deal-breakers None Change Deal-sealers None Change/);
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

describe("deal-breakers and deal-sealers", () => {
    it("draws a row each, with only what that row can be, and an “i” for each", () => {
        const step = stepFor("deals", cars())!;
        const html = render([{ id: "d1", at: "", from: "lens", kind: "ask", answered: false, step }]);
        const words = text(html);

        expect(words).toContain("Any deal-breakers or deal-sealers?");
        expect(words).toContain("Electric Doesn't matter Must be Mustn't be");
        expect(words).toContain("Towbar Doesn't matter Must have Seals it");
        expect(html).toContain("aria-label=\"What “Towbar” means\"");
        expect(words).toContain("Nothing's off the table");
    });
});

describe("the “i”", () => {
    it("is a tooltip, closed until it's wanted, not a card under the chips", () => {
        const step = stepFor("bubbles-people", cars())!;
        const html = render([{ id: "p1", at: "", from: "lens", kind: "ask", answered: false, step }]);

        expect(html).toContain("aria-label=\"What “Kids” means\"");
        expect(html).not.toContain("role=\"tooltip\"");
        expect(html).not.toContain("role=\"note\"");
    });
});

describe("recommended comforts", () => {
    it("are starred, with what the star means said under the question's why", () => {
        const u = withBubbles(EMPTY_UNDERSTANDING, { weather: ["cold"] });
        const step = stepFor("bubbles-matters", cars(), u)!;
        const html = render([{ id: "m1", at: "", from: "lens", kind: "ask", answered: false, step: { ...step, selected: ["comfort"] } }]);
        const words = text(html);

        /* The key comes under "Why I'm asking", before the chips; the chips no longer list them again. */
        expect(words).toMatch(/Why I'm asking: .* Starred = recommended from your earlier answers\. The “i” on each says why\. Help driving & parking/);
        expect(words).not.toContain("Recommended from what you told me");
        /* Not on a question with nothing starred. */
        expect(text(render([{ id: "p1", at: "", from: "lens", kind: "ask", answered: false, step: stepFor("bubbles-people", cars())! }]))).not.toContain("Starred");
        expect(html).toContain('aria-label="Recommended"');
    });
});

describe("progress", () => {
    it("shows how far through the reader is on the open question, and a pinned copy waiting for it to scroll away", () => {
        const chat = startChat(null, cars(), TODAY);
        const html = render(chat.messages);

        expect(text(html)).toMatch(/Answered 0 of 8 First, who rides with you\? .*Answered 0 of 8 First, who rides with you\?/);
        /* The pinned copy starts hidden, out of the tab order. */
        expect(html).toMatch(/tabindex="-1" aria-hidden="true"/);
    });
});

describe("follow-ups", () => {
    it("ticks each one answered, and counts them above Continue", () => {
        const step = stepFor("bubbles-copes", cars())!;
        const html = render([{ id: "c1", at: "", from: "lens", kind: "ask", answered: false, progress: { done: 2, total: 8 }, step: { ...step, selected: ["weather", "carry", "carry:bulky"] } }]);
        const words = text(html);

        expect(words).toContain("Follow-ups answered: 1 of 2");
        expect(html.match(/aria-label="Answered"/g)).toHaveLength(1);
        expect(html).toContain('role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="8" aria-valuenow="2"');
        /* No block elements inside the pinned button. */
        const pinned = html.slice(html.indexOf('tabindex="-1"'), html.indexOf("</button>", html.indexOf('tabindex="-1"')));
        expect(pinned).not.toMatch(/<(div|p)\b/);
    });

    it("aren't counted on a section with none open", () => {
        const step = stepFor("bubbles-people", cars())!;
        expect(text(render([{ id: "p1", at: "", from: "lens", kind: "ask", answered: false, step }]))).not.toContain("Follow-ups");
    });
});
