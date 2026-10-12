import { describe, expect, it } from "vitest";

import { judgeWith } from "@/lib/chats/judge";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { withBubbles } from "./bubbles";
import { fitCase } from "./fit-case";
import { sayOnce, tellFitStory, type FitStory, type StorySection } from "./fit-story";
import type { LensRun } from "./run";
import { EMPTY_UNDERSTANDING, withBudget, type Understanding } from "./understanding";

/*
 * The winner's fit, sorted by how it came out: met in full, met in part,
 * couldn't be checked — and where it falls short, the part on what the reader
 * said matters most set apart as worth considering. Nothing said twice.
 */

const page = fleet().slice(0, 24);

function judged(u: Understanding) {
    const result = judgeWith(u, page, "24 cars")!;
    const story = sayOnce(tellFitStory(result.run, u, result.translation.lessRelevant, null, result.run.recommendation.winner.id));

    return { run: result.run, story, fit: fitCase(result.run, story) };
}

const row = (key: string, overrides: Partial<StorySection>): StorySection => ({
    key,
    title: key,
    said: key,
    short: key,
    kind: "need",
    importance: "important",
    lines: [],
    summary: key,
    tone: "good",
    ...overrides,
});

const story = (sections: StorySection[]): FitStory => ({ eyebrow: "", carName: "", band: "good", bandLabel: "", bandMeaning: "", sections, catch: null, stillToKnow: null });
const run = { narrative: { tradeoffs: [] }, ruledOut: null } as unknown as LensRun;

describe("sorting the rows by how they came out", () => {
    it("puts what it meets in full, in part and can't tell apart, and moves a row's gaps out of it", () => {
        const fit = fitCase(
            run,
            story([
                row("budget", { kind: "budget", importance: "constraint", lines: [{ tone: "good", text: "Within it." }] }),
                row("kids", { lines: [{ tone: "good", text: "Rear doors.", reads: "rearDoors", met: true }] }),
                row("city", {
                    tone: "note",
                    lines: [
                        { tone: "good", text: "Reversing camera.", reads: "hasOneEightyDegreesReversingCamera", met: true },
                        { tone: "missing", text: "No 360° camera.", reads: "hasThreeSixtyDegreesCamera", met: false },
                    ],
                }),
                row("basics", { tone: "note", lines: [{ tone: "note", text: "Nearly every car has it." }] }),
                row("night", { tone: "unknown", lines: [{ tone: "unknown", text: "FINN doesn't say." }] }),
            ]),
        );

        expect(fit.complete.map((section) => section.key)).toEqual(["budget", "kids", "basics"]);
        expect(fit.partial.map((section) => section.key)).toEqual(["city"]);
        expect(fit.partial[0]!.lines.map((line) => line.text)).toEqual(["Reversing camera."]);
        expect(fit.unclear.map((section) => section.key)).toEqual(["night"]);
        expect(fit.worth).toEqual([expect.objectContaining({ key: "city", about: "city", lines: [expect.objectContaining({ text: "No 360° camera." })] })]);
    });

    it("sets apart as worth considering only what falls short on a limit or a need marked Top priority or Important", () => {
        const fit = fitCase(
            run,
            story([
                row("budget", { kind: "budget", importance: "constraint", tone: "missing", lines: [{ tone: "missing", text: "Over it." }] }),
                row("comfort", { importance: "niceToHave", tone: "missing", lines: [{ tone: "missing", text: "No heated seats.", met: false }] }),
                row("help", { importance: "essential", tone: "missing", lines: [{ tone: "missing", text: "No blind spot warning.", met: false }] }),
            ]),
        );

        expect(fit.worth.map((item) => item.key)).toEqual(["budget", "help"]);
        expect(fit.shortfalls.map((item) => item.key)).toEqual(["comfort"]);
        /* A whole row it falls short on is drawn as the row. */
        expect(fit.worth[1]!.section?.key).toBe("help");
    });

    it("leaves what the mileage adds to the cost table", () => {
        const fit = fitCase(run, story([row("mileage", { kind: "budget", importance: "constraint", tone: "note", lines: [{ tone: "note", text: "About €80 of it is mileage." }] })]));

        expect([...fit.complete, ...fit.partial, ...fit.unclear, ...fit.shortfalls, ...fit.worth]).toEqual([]);
    });
});

describe("the winner's fit, on real cars", () => {
    const everyLine = (fit: ReturnType<typeof fitCase>) => [
        ...[...fit.complete, ...fit.partial, ...fit.unclear].flatMap((section) => section.lines.map((line) => line.text)),
        ...[...fit.shortfalls, ...fit.worth].flatMap((item) => [...(item.section?.lines ?? []), ...item.lines].map((line) => line.text)),
    ];

    it("says each thing once, and a gap on an Important need is worth considering, with the car that has it", () => {
        const { fit, run } = judged(withBudget(withBubbles(EMPTY_UNDERSTANDING, { help: ["traffic", "parking"], long: [], traffic: [], city: ["street"], comfort: ["warm"] }), 600, "Up to €600 a month."));
        const lines = everyLine(fit);

        expect(new Set(lines).size).toBe(lines.length);
        expect(fit.worth.map((item) => item.about)).toContain("City driving");

        const gap = fit.worth.find((item) => item.about === "City driving")!.lines[0]!;
        expect(gap.met).toBe(false);
        expect(gap.rival?.id).not.toBe(run.recommendation.winner.id);
        expect(fit.partial.find((section) => section.key.includes("city"))?.lines).not.toContainEqual(expect.objectContaining({ met: false }));
    });

    it("adds the engine's trade-offs only where they say something the rows don't, each with its car", () => {
        const { fit, run } = judged(withBudget(withBubbles(EMPTY_UNDERSTANDING, { kids: ["baby"], city: ["street"], environment: ["moderate"] }), 700, "Up to €700 a month."));
        const raised = fit.shortfalls.filter((item) => item.key.startsWith("tradeoff-"));

        expect(run.narrative.tradeoffs.length).toBeGreaterThan(0);
        expect(raised.map((item) => item.title)).toEqual(run.narrative.tradeoffs.filter((tradeoff) => tradeoff.kind === "cost" || tradeoff.kind === "measurementDeficit").map((tradeoff) => tradeoff.headline));
        expect(raised.every((item) => item.rival)).toBe(true);
        /* The budget's row already says where it stands against the limit. */
        expect(fit.complete.some((section) => section.key === "budget")).toBe(true);
        expect(raised.some((item) => /over your budget/.test(item.title ?? ""))).toBe(false);
    });
});
