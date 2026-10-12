import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES } from "@/lib/reasoning-engine/constants";
import { GARAGE } from "@/lib/reasoning-engine/test-garage";
import type { PageContext } from "@/lib/lens-chat/messages";
import { copyFeatures, type Answers } from "@/lib/reasoning-engine/answers";

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

describe("reading a run", () => {
    /* The page's cars Lens holds data for, in page order: 999 never reached it. */
    const cars = () =>
        page().pageCarIds.flatMap((id) => {
            const car = loaded()[id as keyof ReturnType<typeof loaded>];
            return car ? [{ ...car, url: "", pinnedAt: "" }] : [];
        });

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
