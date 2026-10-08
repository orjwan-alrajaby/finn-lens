import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { rentalFor, startChat } from "@/lib/chats/flow";
import { judgementFrom, judgeWith } from "@/lib/chats/judge";
import { withBubbles } from "@/lib/lens-chat/bubbles";
import { withDeals } from "@/lib/lens-chat/deals";
import { sayOnce, tellFitStory } from "@/lib/lens-chat/fit-story";
import { EMPTY_UNDERSTANDING, withBudget, type Understanding } from "@/lib/lens-chat/understanding";
import { buildCostAnalysis } from "@/lib/reasoning-engine";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import type { JudgedCar } from "./useJudgedCar";
import { WinnerView } from "./WinnerView";

/*
 * The winner's drawer, as the reader opens it: why it won and what it costs,
 * and everything else a tap away — all of it open in the PDF.
 */

/* The drawer talks to the page through the bridge, which listens for it as soon as it loads; here there's no page. */
vi.mock("@/lib/chats/bridge", () => ({ requestOpenDrawer: () => Promise.resolve(), requestShowCar: () => Promise.resolve({ shown: true }) }));

/* Lens's avatar and the drawer's links ask the extension for things; outside the browser there is none. */
(globalThis as unknown as { browser: unknown }).browser = { runtime: { getURL: (path: string) => path } };

const page = fleet().slice(0, 24);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function winner(u: Understanding = withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"] }), 700, "Up to €700 a month.")): JudgedCar {
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
        story: sayOnce(tellFitStory(judged.run, u, judged.translation.lessRelevant, null, id)),
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

        expect(weighed).toMatch(/What counted, by the questions I asked — the biggest part of the decision first\. Who rides with you (\d+)% You have kids · a baby or toddler seat Top priority \1% Looked at: Rear doors/);
        expect(weighed).not.toMatch(/counts \d+%|\b(Highly|Moderately|Somewhat)\b|Practicality|Climate Suitability/);
        /* And the car's total, out of 100, with its band and where the bands start. */
        expect(weighed).toMatch(/Total: this car scored (\d+) out of 100 (Strong|Good|Partial|Limited) match \1\/100 How it did on each of the above, by their share\. Strong match from 65, Good from 45, Partial from 25\./);
    });

    it("sorts how it fits into what it meets in full and in part, and says where it falls short — never what you'd give up", () => {
        const u = withBudget(withBubbles(EMPTY_UNDERSTANDING, { help: ["traffic", "parking"], long: [], city: ["street"], comfort: ["warm"] }), 600, "Up to €600 a month.");
        const words = text(renderToStaticMarkup(createElement(WinnerView, { value: winner(u), print: true })));
        /* The section's own heading: the last time it's named before the next section, after the hint that points to it. */
        const fallsShort = words.lastIndexOf("Where it falls short", words.indexOf("Why not the others"));
        const fits = words.slice(words.indexOf("How it fits what you told me"), fallsShort);
        const short = words.slice(fallsShort, words.indexOf("Why not the others"));

        expect(fits).toMatch(/Complete match .* Partial match What it lacks for these is under “Where it falls short”\./);
        expect(short).toMatch(/Worth considering It falls short on what you marked Important — worth weighing before you decide\. City driving Important/);
        expect(words).not.toContain("What you'd give up");
    });

    it("lets the reader find each of the next cars on the page, but not in the PDF", () => {
        const value = winner();
        const html = renderToStaticMarkup(createElement(WinnerView, { value }));
        const others = html.slice(html.indexOf("Why not the others"));
        const names = [...others.matchAll(/aria-label="Show the ([^"]+) on the page"/g)].map((match) => match[1]);

        expect(names.length).toBeGreaterThan(0);
        expect(names.every((name) => others.includes(`>${name}</p>`))).toBe(true);
        expect(renderToStaticMarkup(createElement(WinnerView, { value, print: true }))).not.toMatch(/aria-label="Show the [^"]+ on the page"/);
    });

    it("has everything open in the PDF", () => {
        const html = renderToStaticMarkup(createElement(WinnerView, { value: winner(), print: true }));

        expect(folded(html)).toEqual([]);
        expect(text(html)).toContain("How I weighed it");
    });
});

describe("the drawer of a pick past a limit", () => {
    /* FINN's snapshot offers these cars on short terms only: two years fits none of them. */
    function past(): JudgedCar {
        const u = rentalFor(withDeals(withBubbles(EMPTY_UNDERSTANDING, { carry: ["trailer"] }), ["towbar"], { towbar: "must" }), 24, "", new Date("2026-10-07T10:00:00Z"));
        const judged = judgeWith(u, page, "24 cars")!;
        const id = judged.run.recommendation.winner.id;
        const car = page.find((item) => item.id === id)!;
        const judgement = judgementFrom(judged, page, u, "24 cars", "", {}, "2026-10-07T10:00:00Z");

        return { ...winner(), chat: { ...startChat(null, page), judgement }, judgement, judged, car, verdict: judgement.verdicts[id]!, story: tellFitStory(judged.run, u, judged.translation.lessRelevant, null, id), cost: buildCostAnalysis(car, judged.run.answers.preferences, judged.run.recommendation.context.costs[id]) };
    }

    it("calls it the closest match, as the chat does", () => {
        const words = text(renderToStaticMarkup(createElement(WinnerView, { value: past(), print: true })));

        expect(words).toContain("Closest match, of 24 cars");
        expect(words).not.toContain("Best for you");
    });

    it("says a runner-up that misses the dates is not for them, rather than nothing", () => {
        const words = text(renderToStaticMarkup(createElement(WinnerView, { value: past(), print: true })));

        expect(words.slice(words.indexOf("Why not the others"))).toMatch(/\/month · not for your dates/);
    });

    it("is the best for you when every limit holds", () => {
        expect(text(renderToStaticMarkup(createElement(WinnerView, { value: winner(), print: true })))).toContain("Best for you, of 24 cars");
    });
});
