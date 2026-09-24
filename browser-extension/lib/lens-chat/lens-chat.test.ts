import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES } from "@/lib/reasoning-engine/constants";
import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import type { PageContext } from "@/lib/lens-chat/messages";
import { copyFeatures, type Answers } from "@/entrypoints/compare/store";
import { buildScopes, conversationScope, defaultScope } from "@/entrypoints/lens-chat/scopes";

import { compareRows, runLens, summariseMatch } from "./run";

/*
 * Ask Lens on finn.com: what it compares, and what it says about the result.
 * Everything here is read off the real engine; no model is involved.
 */

const answers = (overrides: Partial<Answers> = {}): Answers => ({
    priorities: ["safetyAssistance", "practicality", "comfort"],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
    ...overrides,
});

const page = (overrides: Partial<PageContext> = {}): PageContext => ({
    kind: "listing",
    url: "https://www.finn.com/de-DE/subscribe",
    pageCarIds: [101, 102, 103, 999],
    currentCarId: null,
    currentFromUrl: false,
    carUrls: { 101: "https://www.finn.com/de-DE/models/safe/compact" },
    search: null,
    searchCars: null,
    ...overrides,
});

const loaded = () => ({
    101: GARAGE.safeCompact(),
    102: GARAGE.comfyCruiser(),
    103: GARAGE.cityHatch(),
    104: GARAGE.familySuv(),
});

describe("scopes", () => {
    it("compares only the page's cars Lens has data for, and says how many it doesn't", () => {
        const scopes = buildScopes(page(), { pinned: {}, loaded: loaded() });

        expect(scopes.page.cars.map((car) => car.id)).toEqual([101, 102, 103]);
        expect(scopes.page.missing).toBe(1);
        expect(scopes.page.headline).toBe("Comparing 3 cars on this page");
        expect(scopes.page.description).toMatch(/1 more on the page haven't reached Lens yet.*not every car FINN offers/);
        expect(scopes.page.cars[0]?.url).toBe("https://www.finn.com/de-DE/models/safe/compact");
        expect(scopes.page.cars[0]?.pinnedAt).toBe("");
    });

    it("keeps pinned cars as their own set, untouched by the page", () => {
        const pinned = { 104: { ...GARAGE.familySuv(), pinnedAt: "2026-09-01T00:00:00Z" } };
        const scopes = buildScopes(page(), { pinned, loaded: loaded() });

        expect(scopes.pinned.cars.map((car) => car.id)).toEqual([104]);
        expect(scopes.page.cars.map((car) => car.id)).not.toContain(104);
    });

    it("starts on this car on a details page, and on the page elsewhere", () => {
        const details = page({ kind: "details", currentCarId: 102, currentFromUrl: true });
        const onDetails = buildScopes(details, { pinned: {}, loaded: loaded() });

        expect(onDetails.thisCar.cars.map((car) => car.id)).toEqual([102]);
        expect(defaultScope(details, onDetails)).toBe("thisCar");

        const onListing = buildScopes(page(), { pinned: {}, loaded: loaded() });
        expect(defaultScope(page(), onListing)).toBe("page");
    });

    it("tells the model what each set holds", () => {
        const scopes = buildScopes(page(), { pinned: {}, loaded: loaded() });

        expect(conversationScope("page", scopes).available.map((item) => [item.kind, item.count])).toEqual([
            ["page", 3],
            ["pinned", 0],
            ["thisCar", 0],
        ]);
    });
});

describe("reading a run", () => {
    const cars = () => buildScopes(page(), { pinned: {}, loaded: loaded() }).page.cars;

    it("summarises the engine's winner with its own reason, trade-off and alternatives", () => {
        const run = runLens(cars(), answers(), "page", "Comparing 3 cars on this page")!;
        const match = summariseMatch(run);

        expect(match.car.id).toBe(run.recommendation.winner.id);
        expect(match.eyebrow).toBe("Your Lens match");
        expect(match.reason).toBe(run.narrative.verdict.reasons[0]);
        expect(match.alternatives.map((alt) => alt.id)).toEqual(
            run.recommendation.alternatives.slice(0, 3).map((car) => car.id),
        );
        expect(match.candidateCount).toBe(3);
    });

    it("puts the match first in a comparison, whatever its raw rank", () => {
        const budget = answers({ preferences: { ...DEFAULT_PREFERENCES, monthlyBudget: 1 } });
        const run = runLens(cars(), budget, "page", "")!;
        const rows = compareRows(run);

        expect(rows[0]?.id).toBe(run.recommendation.winner.id);
        expect(rows[0]?.isMatch).toBe(true);
        expect(rows).toHaveLength(3);
    });

    it("reads one car on its own as a fit, not a win", () => {
        const [only] = cars();
        const match = summariseMatch(runLens([only!], answers(), "thisCar", "")!);

        expect(match.singleCar).toBe(true);
        expect(match.eyebrow).toBe("How this car fits you");
        expect(match.alternatives).toEqual([]);
    });

    it("has nothing to run on an empty set", () => {
        expect(runLens([], answers(), "pinned", "")).toBeNull();
    });
});
