import { describe, expect, it } from "vitest";

import { buildVocabulary } from "./vocabulary";
import type { ConverseRequest, WireUnderstanding } from "./contract";
import { createMockAdapter } from "./mock";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import { evidenceCatalogue } from "@/lib/lens-chat/evidence";
import { EMPTY_UNDERSTANDING, toWire } from "@/lib/lens-chat/understanding";

/*
 * The stand-in for Gemini, held to the shapes the chat relies on. Everything
 * it returns is read by the same code that reads the real model, so these
 * check both halves: that the mock says what it should, and that Lens's
 * guards still catch it when it says what it shouldn't.
 */

const all = fleet().sort((a, b) => a.id - b.id);
const cars = Array.from({ length: 48 }, (_, index) => all[Math.floor((index * all.length) / 48)]!);
const mock = createMockAdapter();

const request = (message: string, overrides: Partial<ConverseRequest> = {}): ConverseRequest => ({
    message,
    vocabulary: buildVocabulary(),
    understanding: toWire(EMPTY_UNDERSTANDING) as WireUnderstanding,
    openQuestion: null,
    answered: [],
    evidence: evidenceCatalogue(cars),
    facts: null,
    history: [],
    today: "2026-09-22",
    ...overrides,
});

const turn = async (message: string, overrides: Partial<ConverseRequest> = {}) => (await mock.converse(request(message, overrides))).result;

describe("the simulated Lens AI", () => {
    it("reads a target with a stretch the reader named", async () => {
        const result = await turn("Around 650 euros a month is okay but I'd rather be closer to 550.");

        expect(result.understanding?.budget).toMatchObject({ kind: "target", monthly: 550, stretchTo: 650 });
    });

    it("reads a hard maximum with a stretch on top", async () => {
        const result = await turn("I can pay 400 euros a month, and maybe 425 if that's genuinely the difference.");

        expect(result.understanding?.budget).toMatchObject({ kind: "hardMax", monthly: 400, stretchTo: 425 });
    });

    it("keeps 'don't need' apart from 'don't want'", async () => {
        const result = await turn("Safety is obviously important too but I don't need the car to drive for me.");

        expect(result.understanding?.capabilities[0]?.lessRelevant).toContain("driverAssistLevel2");
        expect(result.understanding?.needs.flatMap((need) => need.evidence).some((entry) => entry.unwanted)).toBe(false);
    });

    it("turns a hypothetical budget into a what-if", async () => {
        const first = await turn("I can't spend more than 500 euros a month.");
        const result = await turn("What if I could spend 100 euros more?", { understanding: first.understanding! });

        expect(result.kind).toBe("whatIf");
        expect(result.understanding?.budget?.monthly).toBe(600);
    });

    it("points at the pinned cars when asked to", async () => {
        const result = await turn("Compare my pinned cars", {
            scope: { current: "page", available: [{ kind: "page", description: "", count: 48 }, { kind: "pinned", description: "", count: 3 }] },
        });

        expect(result.scope).toBe("pinned");
    });
});
