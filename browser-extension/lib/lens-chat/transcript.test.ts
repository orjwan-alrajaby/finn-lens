import { beforeEach, describe, expect, it } from "vitest";

import { loadTranscript, saveTranscript, TRANSCRIPT_KEY, type SavedTranscript } from "./transcript";
import { EMPTY_UNDERSTANDING } from "./understanding";

/**
 * The conversation, kept: everything that was said comes back, and only what
 * can honestly be kept is.
 */

let storage: Record<string, unknown>;

beforeEach(() => {
    storage = {};

    (globalThis as { browser?: unknown }).browser = {
        storage: {
            local: {
                get: async (keys: string | string[]) => {
                    const list = typeof keys === "string" ? [keys] : keys;
                    return Object.fromEntries(list.filter((key) => key in storage).map((key) => [key, storage[key]]));
                },
                set: async (values: Record<string, unknown>) => {
                    Object.assign(storage, values);
                },
            },
        },
    };
});

type Line = { id: number; kind: string; text: string };

const transcript = (overrides: Partial<SavedTranscript<Line>> = {}): SavedTranscript<Line> => ({
    version: 1,
    savedAt: "2026-09-23T21:00:00.000Z",
    rev: 1,
    by: "frame-a",
    entries: [
        { id: 1, kind: "user", text: "I have two kids" },
        { id: 2, kind: "lens", text: "Room for the kids, then." },
        { id: 3, kind: "action", text: "You pinned the Ford Puma." },
    ],
    understanding: EMPTY_UNDERSTANDING,
    applied: null,
    lastRun: { scope: "page", headline: "Comparing 76 cars matching your filters", carIds: [41553, 30369] },
    openQuestion: null,
    answered: [],
    history: [],
    guide: [],
    askingAgain: false,
    pendingAnswer: null,
    carriedOver: true,
    ...overrides,
});

describe("keeping the conversation", () => {
    it("brings back every message and action as it was", async () => {
        await saveTranscript(transcript());

        const kept = await loadTranscript<Line>();

        expect(kept?.entries.map((entry) => entry.text)).toEqual(["I have two kids", "Room for the kids, then.", "You pinned the Ford Puma."]);
        expect(kept?.lastRun?.carIds).toEqual([41553, 30369]);
        expect(kept?.rev).toBe(1);
    });

    it("keeps the model's recent turns only — the transcript itself is kept whole", async () => {
        const history = Array.from({ length: 100 }, (_, index) => ({ role: "reader" as const, text: `turn ${index}` }));
        const entries = Array.from({ length: 500 }, (_, index) => ({ id: index + 1, kind: "user", text: `message ${index}` }));

        await saveTranscript(transcript({ history, entries }));

        const kept = await loadTranscript<Line>();

        expect(kept?.entries).toHaveLength(500);
        expect(kept?.history).toHaveLength(40);
        expect(kept?.history.at(-1)?.text).toBe("turn 99");
    });

    it("has nothing to bring back before anything was kept, or from a shape it doesn't know", async () => {
        expect(await loadTranscript<Line>()).toBeNull();

        storage[TRANSCRIPT_KEY] = { version: 2, entries: [] };
        expect(await loadTranscript<Line>()).toBeNull();
    });
});
