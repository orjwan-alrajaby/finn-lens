import { describe, expect, it } from "vitest";

import { CATEGORIES, DEFAULT_PREFERENCES, profileEmphasis } from "./reasoning-engine/constants";
import { buildFitAnalysis } from "./reasoning-engine/fit";
import { scoreVehicle } from "./reasoning-engine/scoring";
import { GARAGE, garageCar } from "./reasoning-engine/test-garage";
import type { PinnedFinnCar } from "./types";
import type {
  CategoryId,
  FeatureId,
  FeatureSelection,
} from "./reasoning-engine/types";

/**
 * Standard equipment is counted by its gaps.
 *
 * Having it earns nothing — it would earn the same for every car and only
 * squeeze the differences between them — and a gap FINN confirms costs what a
 * missing Standard item costs in that priority. The reader is shown each
 * item with this car's answer, and nothing about the arithmetic.
 */

const ORDER: CategoryId[] = ["safetyAssistance", "cityParking", "practicality", "longDistance", "comfort"];
const BALANCED = profileEmphasis("balanced");
const SAFETY_KIT: FeatureId[] = ["hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasMatrixLedHeadlights"];

const without = (car: PinnedFinnCar, ...keys: FeatureId[]): PinnedFinnCar => ({
  ...car,
  features: { ...car.features, ...Object.fromEntries(keys.map((key) => [key, false])) },
});

const safety = (car: PinnedFinnCar, emphasis: Record<CategoryId, FeatureSelection> = BALANCED) =>
  scoreVehicle(car, ORDER, DEFAULT_PREFERENCES, emphasis).details.safetyAssistance!;

const analysisOf = (car: PinnedFinnCar) =>
  buildFitAnalysis({ ...car, pinnedAt: "2026-01-01" }, ORDER, DEFAULT_PREFERENCES, BALANCED);

describe("scoring standard equipment", () => {
  it("earns nothing for listing it, so differences between cars aren't squeezed", () => {
    expect(safety(garageCar({ id: 1, extra: SAFETY_KIT })).exactScore).toBeCloseTo(100);
    expect(safety(garageCar({ id: 2 })).exactScore).toBeCloseTo(0);
  });

  it("costs a confirmed gap what a missing Standard item costs", () => {
    const car = garageCar({ id: 3, extra: SAFETY_KIT });

    /* Balanced: blind spot at 3, the other two at 1 — a Standard item is 1 of 5. */
    expect(safety(without(car, "hasTrafficSignRecognition")).exactScore).toBeCloseTo(80);
    expect(safety(without(car, "hasEmergencyBrakingAssist", "hasLaneKeepingAssist")).exactScore).toBeCloseTo(60);
  });

  it("treats every standard item alike, whatever else is known about it", () => {
    const car = garageCar({ id: 4, extra: SAFETY_KIT });
    const refurbished = { ...car, isRefurbished: true };

    for (const key of CATEGORIES.safetyAssistance.expected) {
      expect(safety(without(car, key)).exactScore, key).toBeCloseTo(80);
      expect(safety(without(refurbished, key)).exactScore, key).toBeCloseTo(80);
    }
  });

  it("costs more when the reader raised the missing item", () => {
    const car = without(garageCar({ id: 5, extra: SAFETY_KIT }), "hasEmergencyCallSystem");
    const raised = {
      ...BALANCED,
      safetyAssistance: [...BALANCED.safetyAssistance, { key: "hasEmergencyCallSystem" as const, importance: "high" as const }],
    };

    expect(safety(car, raised).exactScore).toBeLessThan(safety(car).exactScore);
  });

  it("never takes a priority below zero", () => {
    expect(safety(without(garageCar({ id: 6 }), "hasTrafficSignRecognition")).exactScore).toBe(0);
  });

  it("costs nothing when FINN sent no equipment list", () => {
    const detail = safety(GARAGE.noEquipmentList());

    expect(detail.expectedMissing).toEqual([]);
    for (const check of detail.standard) expect(check.state).toBe("unknown");
  });

  it("adds up: contributions still sum to the fit with gaps, and with a gap floored at zero", () => {
    const cars = [
      without(garageCar({ id: 7, extra: SAFETY_KIT }), "hasEmergencyCallSystem", "hasParkingSensors"),
      without(garageCar({ id: 8 }), "hasTrafficSignRecognition", "hasCruiseControl", "hasIsofix"),
    ];

    for (const car of cars) {
      const score = scoreVehicle(car, ORDER, DEFAULT_PREFERENCES, BALANCED);
      const sum = score.contributions.reduce((total, line) => total + line.points, 0);

      expect(sum).toBeCloseTo(score.fit, 6);
    }
  });
});

describe("showing standard equipment", () => {
  it("shows every standard item of every priority, listed when FINN lists it", () => {
    for (const priority of analysisOf(garageCar({ id: 9 })).priorities) {
      const expected = (CATEGORIES[priority.priority] as { expected?: FeatureId[] }).expected ?? [];

      expect(priority.standard.map((fact) => fact.key)).toEqual(expected);
      for (const fact of priority.standard) expect(fact.state).toBe("listed");
    }
  });
});
