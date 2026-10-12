import { describe, expect, it } from "vitest";

import { buildRecommendation } from "@/lib/reasoning-engine";
import { buildAdviceNarrative } from "@/lib/reasoning-engine/narrative";
import { prefs } from "@/lib/reasoning-engine/test-fixtures";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import type { PinnedFinnCar } from "@/lib/types";

import { buildLensFacts } from "./context";

/** The facts the model is handed about one car, as Lens would build them. */
const factsFor = (car: PinnedFinnCar) => {
    const rec = buildRecommendation([car], ["longDistance", "comfort"], prefs())!;
    const facts = buildLensFacts(rec, buildAdviceNarrative(rec.evaluation, rec.context));

    return (facts.cars as { electricRangeKm: number | null }[])[0]!;
};

describe("the facts handed to the model", () => {
    const electric = fleet().find((car) => car.fuelType === "Electric")!;

    it("gives an electric car's range, which FINN sends as text", () => {
        expect(factsFor(electric).electricRangeKm).toBeGreaterThan(0);
    });

    it("gives the range of a car pinned before Lens read it as a number", () => {
        const pinned = { ...electric, electric: { ...electric.electric!, range: "571" as unknown as number } };

        expect(factsFor(pinned).electricRangeKm).toBe(571);
    });
});
