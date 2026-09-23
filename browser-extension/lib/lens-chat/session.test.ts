import { beforeEach, describe, expect, it } from "vitest";

import { copyFeatures, type Answers } from "@/entrypoints/compare/store";
import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";

import { SCENARIOS } from "./scenarios.fixture";
import {
    clearSession,
    deleteSearch,
    loadSavedSearches,
    loadSession,
    nameFor,
    saveSearch,
    saveSession,
    type LensSession,
} from "./session";
import { EMPTY_UNDERSTANDING, missingEssentials, readUnderstanding, toAnswers, withBudget } from "./understanding";

/*
 * The bridge between the conversation and the rest of Lens.
 *
 * A reader who explains their winter and their €500 limit to the chat should
 * not meet a recommendation page still running settings they set months ago.
 * These hold the carry-over to what it promises: recent, complete enough to
 * re-run, and never the reader's saved settings.
 */

const base = (): Answers => ({
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
});

const understanding = () => readUnderstanding(SCENARIOS[0]!.reading, EMPTY_UNDERSTANDING, undefined, "2026-09");

const sessionAt = (at: string): LensSession => {
    const u = understanding();
    const translation = toAnswers(base(), u);

    return {
        at,
        scope: "page",
        headline: "Comparing 24 cars on this page",
        summary: u.tension,
        focus: translation.profile.focus,
        rules: translation.profile.rules,
        understanding: u,
        answers: translation.answers,
        carIds: [1, 2, 3],
        winnerId: 1,
    };
};

/* The same in-memory storage the other storage tests use. */
let storage: Record<string, unknown>;

beforeEach(() => {
    storage = {};

    Object.assign(globalThis, {
        browser: {
            storage: {
                local: {
                    get: async (keys: string | string[]) => {
                        const list = typeof keys === "string" ? [keys] : keys;

                        return Object.fromEntries(list.filter((key) => key in storage).map((key) => [key, storage[key]]));
                    },
                    set: async (values: Record<string, unknown>) => {
                        Object.assign(storage, values);
                    },
                    remove: async (keys: string | string[]) => {
                        for (const key of typeof keys === "string" ? [keys] : keys) delete storage[key];
                    },
                },
            },
        },
    });
});

describe("carrying a conversation over", () => {
    it("keeps everything the recommendation page needs to re-run it", async () => {
        await saveSession(sessionAt(new Date().toISOString()));
        const carried = (await loadSession())!;

        expect(carried.answers.priorities[0]).toBe("cityParking");
        expect(carried.answers.preferences.monthlyBudget).toBe(450);
        expect(carried.focus.length).toBeGreaterThan(0);
        /* Enough of the conversation to carry on from, not just its result. */
        expect(carried.understanding.needs.length).toBeGreaterThan(0);
    });

    it("forgets a conversation old enough to be about something else", async () => {
        await saveSession(sessionAt(new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()));

        expect(await loadSession()).toBeNull();
    });

    it("is dismissable, and gone for good once dismissed", async () => {
        await saveSession(sessionAt(new Date().toISOString()));
        await clearSession();

        expect(await loadSession()).toBeNull();
    });

    it("names itself after what the reader was looking for", () => {
        expect(nameFor(sessionAt(new Date().toISOString()))).toMatch(/Parking without the stress/);
    });
});

describe("searches the reader keeps", () => {
    const search = (id: string, name: string) => ({
        ...sessionAt(new Date().toISOString()),
        id,
        name,
        note: "Two young children, winter, €450",
    });

    it("keeps the newest first, and replaces rather than duplicates", async () => {
        await saveSearch(search("a", "Winter with the kids"));
        await saveSearch(search("b", "City parking"));
        await saveSearch(search("a", "Winter with the kids, again"));

        const kept = await loadSavedSearches();

        expect(kept.map((item) => item.id)).toEqual(["a", "b"]);
        expect(kept[0]?.name).toBe("Winter with the kids, again");
    });

    it("keeps the context that makes one recognisable later", async () => {
        await saveSearch(search("a", "Winter with the kids"));
        const [kept] = await loadSavedSearches();

        expect(kept?.note).toContain("Two young children");
        expect(kept?.answers.preferences.monthlyBudget).toBe(450);
    });

    it("deletes one without touching the others", async () => {
        await saveSearch(search("a", "One"));
        await saveSearch(search("b", "Two"));

        expect((await deleteSearch("a")).map((item) => item.id)).toEqual(["b"]);
    });
});

describe("what Lens asks for itself", () => {
    it("knows when a budget or a period is missing", () => {
        const u = readUnderstanding({ ...SCENARIOS[0]!.reading, budget: null }, EMPTY_UNDERSTANDING, undefined, "2026-09");

        expect(missingEssentials(u)).toEqual({ budget: true, period: true });
        expect(missingEssentials(understanding())).toEqual({ budget: false, period: true });
    });

    it("takes a budget the reader taps, without a model turn", () => {
        const u = withBudget(EMPTY_UNDERSTANDING, 500, "you said up to €500 a month");

        expect(u.budget).toMatchObject({ kind: "hardMax", monthly: 500 });
        expect(toAnswers(base(), u).answers.preferences.monthlyBudget).toBe(500);
        expect(missingEssentials(u).budget).toBe(false);
    });

    it("takes no limit as an answer too", () => {
        expect(withBudget(understanding(), null, "no limit").budget).toBeNull();
    });
});

describe("a key pasted with something after it", () => {
    it("takes the key and leaves the note behind", async () => {
        const { loadLensAiSettings, saveLensAiSettings } = await import("@/lib/lens-ai/settings");

        await saveLensAiSettings({ enabled: true, apiKey: "AQ.abc123def456 # the misc account", simulated: false });

        expect((await loadLensAiSettings()).apiKey).toBe("AQ.abc123def456");
    });
});
