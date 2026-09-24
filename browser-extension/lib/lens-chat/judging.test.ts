import { beforeEach, describe, expect, it } from "vitest";

import { copyFeatures, useCompareStore, type Answers } from "@/entrypoints/compare/store";
import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { currentJudging, judgeBy, judgingLabel, setAsideByChat } from "./judging";
import { clearSession, saveSession, type LensSession } from "./session";
import { EMPTY_UNDERSTANDING } from "./understanding";

/**
 * One rule for every surface outside the chat: judge by the chat while it has
 * a result, by the saved settings otherwise, say which, and never turn one
 * into the other behind the reader's back.
 */

let storage: Record<string, unknown>;

beforeEach(() => {
    storage = {};

    Object.assign(globalThis, {
        browser: {
            storage: {
                local: {
                    get: async (keys: string | string[] | null) => {
                        const list = keys == null ? Object.keys(storage) : typeof keys === "string" ? [keys] : keys;

                        return Object.fromEntries(list.filter((key) => key in storage).map((key) => [key, storage[key]]));
                    },
                    set: async (values: Record<string, unknown>) => {
                        Object.assign(storage, values);
                    },
                    remove: async (keys: string | string[]) => {
                        for (const key of typeof keys === "string" ? [keys] : keys) delete storage[key];
                    },
                },
                onChanged: { addListener: () => {}, removeListener: () => {} },
            },
        },
    });
});

const chatAnswers = (): Answers => ({
    priorities: ["cityParking", "practicality", "safetyAssistance"],
    preferences: { ...DEFAULT_PREFERENCES, monthlyBudget: 600 },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
});

const session = (overrides: Partial<LensSession> = {}): LensSession => ({
    at: new Date().toISOString(),
    scope: "page",
    headline: "Comparing 70 cars matching your filters",
    summary: "Kids in the back",
    focus: [{ label: "Kids in the back", importance: "important" }],
    rules: [],
    understanding: EMPTY_UNDERSTANDING,
    answers: chatAnswers(),
    carIds: [1, 2, 3],
    winnerId: 1,
    basis: "chat",
    ...overrides,
});

describe("whose answers judge", () => {
    it("is the saved settings when there is no conversation", async () => {
        const judging = await currentJudging();

        expect(judging.by).toBe("settings");
        expect(judgingLabel(judging).switchTo).toBeNull();
    });

    it("is the chat while it has a result, and says so", async () => {
        await saveSession(session());
        const judging = await currentJudging();

        expect(judging.by).toBe("chat");
        expect(judging.answers.priorities[0]).toBe("cityParking");
        expect(judgingLabel(judging).long).toMatch(/your chat with Lens: Kids in the back/);
        expect(judgingLabel(judging).switchTo).toBe("Use my settings instead");
    });

    it("says when the chat's search was only the settings and filters", async () => {
        await saveSession(session({ basis: "settings" }));

        expect(judgingLabel(await currentJudging()).long).toMatch(/your saved settings plus the filters/);
    });

    it("switches to the settings on the reader's say, and back with the chat's next result", async () => {
        await saveSession(session());
        await judgeBy("settings");

        const switched = await currentJudging();
        expect(switched.by).toBe("settings");
        expect(judgingLabel(switched).switchTo).toBe("Use my chat instead");

        await saveSession(session());
        expect((await currentJudging()).by).toBe("chat");
    });

    it("goes back to the settings when the conversation starts over", async () => {
        await saveSession(session());
        await clearSession();

        expect((await currentJudging()).by).toBe("settings");
    });
});

describe("a car the chat's own rules set aside", () => {
    it("is marked as set aside, not graded as if the rule weren't there", async () => {
        const cars = fleet();
        const suv = cars.find((car) => /suv/i.test(String(car.vehicleType ?? "")))!;
        const notSuv = cars.find((car) => !/suv/i.test(String(car.vehicleType ?? "")))!;

        await saveSession(session({ rules: [{ id: "suvBody", mode: "without", label: "Not an SUV", said: "no SUV" }] }));
        const judging = await currentJudging();

        expect(setAsideByChat(judging, suv)).toBe(true);
        expect(setAsideByChat(judging, notSuv)).toBe(false);
    });
});

describe("adjusting on the recommendation page", () => {
    it("never writes a search's answers into the reader's saved settings", () => {
        useCompareStore.getState().setAnswersFrom({ kind: "search", name: "your chat: Kids in the back" });
        useCompareStore.getState().applyAnswers(chatAnswers(), "drawer");

        expect(storage.finnLensPriorities).toBeUndefined();
    });

    it("still keeps the order when the page is running the reader's own settings", async () => {
        useCompareStore.getState().setAnswersFrom({ kind: "settings" });
        useCompareStore.getState().applyAnswers({ ...chatAnswers(), priorities: [...DEFAULT_PRIORITIES].reverse() }, "drawer");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(storage.finnLensPriorities).toBeDefined();
    });
});
