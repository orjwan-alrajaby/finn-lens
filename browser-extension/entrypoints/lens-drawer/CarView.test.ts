import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { startChat } from "@/lib/chats/flow";
import { judgementFrom, judgeWith } from "@/lib/chats/judge";
import { withBubbles } from "@/lib/lens-chat/bubbles";
import { sayOnce, tellFitStory } from "@/lib/lens-chat/fit-story";
import { whyNot } from "@/lib/lens-chat/why-not";
import { EMPTY_UNDERSTANDING, withBudget } from "@/lib/lens-chat/understanding";
import { buildCostAnalysis } from "@/lib/reasoning-engine";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { CarView } from "./CarView";
import type { JudgedCar } from "./useJudgedCar";

/*
 * A car that made the cut and didn't win, as its drawer shows it — and as the
 * PDF it can be saved to.
 */

vi.mock("@/lib/chats/bridge", () => ({ requestOpenDrawer: () => Promise.resolve(), requestShowCar: () => Promise.resolve({ shown: true }) }));
(globalThis as unknown as { browser: unknown }).browser = { runtime: { getURL: (path: string) => path } };

const page = fleet().slice(0, 24);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function runnerUp(): { value: JudgedCar; winnerName: string } {
    const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"] }), 700, "Up to €700 a month.");
    const judged = judgeWith(u, page, "24 cars")!;
    const winnerId = judged.run.recommendation.winner.id;
    const id = judged.run.recommendation.ranked.find((car) => car.id !== winnerId)!.id;
    const car = page.find((item) => item.id === id)!;
    const urls = { [winnerId]: "https://www.finn.com/de-DE/product/winner" };
    const judgement = judgementFrom(judged, page, u, "24 cars", "", urls, "2026-10-05T10:00:00Z");
    const versus = whyNot(judged.run, id);

    return {
        winnerName: versus!.match,
        value: {
            chat: { ...startChat(null, page), judgement },
            judgement,
            latest: true,
            judged,
            car,
            verdict: judgement.verdicts[id]!,
            isWinner: false,
            story: sayOnce(tellFitStory(judged.run, u, judged.translation.lessRelevant, null, id)),
            versus,
            cost: buildCostAnalysis(car, judged.run.answers.preferences, judged.run.recommendation.context.costs[id]),
            missing: 0,
            url: null,
        },
    };
}

describe("a car that didn't win", () => {
    it("says why it didn't win near the top, with a gold button to the winner", () => {
        const { value, winnerName } = runnerUp();
        const words = text(renderToStaticMarkup(createElement(CarView, { value })));

        expect(words.indexOf("Why it didn't win")).toBeGreaterThan(-1);
        expect(words.indexOf("Why it didn't win")).toBeLessThan(words.indexOf("What you told me, and what it has"));
        expect(words).toContain(`See ${winnerName}`);
        expect(words).not.toContain("Finn Lens · how this car fits you");
    });

    it("saves as a PDF: a masthead, the winner as a link to FINN, and no on-screen buttons", () => {
        const { value, winnerName } = runnerUp();
        const html = renderToStaticMarkup(createElement(CarView, { value, print: true }));
        const words = text(html);

        expect(words).toMatch(/^ ?Finn Lens · how this car fits you From your chat “Chat [A-Z2-9]{3}-[A-Z2-9]{3}”, judged 5 October 2026/);
        expect(words).toContain("Why it didn't win");
        expect(html).toContain(`href="https://www.finn.com/de-DE/product/winner"`);
        expect(words).toContain(`See the ${winnerName} on FINN`);
        /* The drawer's own buttons are in the markup only to be dropped from the file. */
        expect(html).toMatch(/<div class="finn-lens-screen-only mt-3 [^"]*"><button/);
    });
});
