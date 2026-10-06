import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { startChat } from "@/lib/chats/flow";
import { judgementFrom, judgeWith } from "@/lib/chats/judge";
import { withBubbles } from "@/lib/lens-chat/bubbles";
import { tellFitStory } from "@/lib/lens-chat/fit-story";
import { EMPTY_UNDERSTANDING, withBudget } from "@/lib/lens-chat/understanding";
import { buildCostAnalysis } from "@/lib/reasoning-engine";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import type { JudgedCar } from "./useJudgedCar";
import { WinnerView } from "./WinnerView";

/*
 * The winner's drawer, as the reader opens it: why it won and what it costs,
 * and everything else a tap away — all of it open in the PDF.
 */

/* The drawer talks to the page through the bridge, which listens for it as soon as it loads; here there's no page. */
vi.mock("@/lib/chats/bridge", () => ({ requestOpenDrawer: () => Promise.resolve() }));

/* Lens's avatar and the drawer's links ask the extension for things; outside the browser there is none. */
(globalThis as unknown as { browser: unknown }).browser = { runtime: { getURL: (path: string) => path } };

const page = fleet().slice(0, 24);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function winner(): JudgedCar {
    const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"] }), 700, "Up to €700 a month.");
    const judged = judgeWith(u, page, "24 cars")!;
    const id = judged.run.recommendation.winner.id;
    const car = page.find((item) => item.id === id)!;
    const judgement = judgementFrom(judged, page, u, "24 cars", "", {}, "2026-10-05T10:00:00Z");

    return {
        chat: { ...startChat(null, page), judgement },
        judgement,
        latest: true,
        judged,
        car,
        verdict: judgement.verdicts[id]!,
        isWinner: true,
        story: tellFitStory(judged.run, u, judged.translation.lessRelevant, null, id),
        versus: null,
        cost: buildCostAnalysis(car, judged.run.answers.preferences, judged.run.recommendation.context.costs[id]),
        missing: 0,
        url: null,
    };
}

const folded = (html: string) => [...html.matchAll(/<details[^>]*>\s*<summary[^>]*>\s*<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1]!.replace(/&#x27;/g, "'"));

describe("the winner's drawer", () => {
    it("opens on why it won and what it costs, with the rest a tap each", () => {
        const html = renderToStaticMarkup(createElement(WinnerView, { value: winner() }));

        expect(text(html)).toContain("Why it won");
        expect(text(html)).toContain("What it costs");
        expect(folded(html)).toEqual(expect.arrayContaining(["How it fits what you told me", "Why not the others", "How I weighed it"]));
        expect(folded(html)).not.toContain("Why it won");
        expect(folded(html)).not.toContain("What it costs");
    });

    it("weighs it in the reader's terms: what they said, how much each counted, what Lens looked at — no engine categories or percentages", () => {
        const words = text(renderToStaticMarkup(createElement(WinnerView, { value: winner(), print: true })));
        const weighed = words.slice(words.indexOf("How I weighed it"));

        expect(weighed).toMatch(/What counted, strongest first\. The bar is each one's part of the decision\. You have kids · a baby or toddler seat Top priority Looked at: Rear doors/);
        expect(weighed).not.toMatch(/counts \d+%|\b(Highly|Moderately|Somewhat)\b|Practicality|Climate Suitability/);
    });

    it("has everything open in the PDF", () => {
        const html = renderToStaticMarkup(createElement(WinnerView, { value: winner(), print: true }));

        expect(folded(html)).toEqual([]);
        expect(text(html)).toContain("How I weighed it");
    });
});
