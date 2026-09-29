import { describe, expect, it } from "vitest";

import type { PinnedFinnCar } from "@/lib/types";
import type { CategoryId, FeatureId } from "./types";

import { CATEGORIES, CATEGORY_IDS, PROFILES, profileEmphasis } from "./constants";
import {
  BASELINE_PREVALENCE,
  countedItems,
  equipmentKnown,
  isDerivedSignal,
} from "./evidence";
import { bandForScore, PARTIAL_FROM } from "./bands";
import { buildRecommendation } from "./index";
import { scoreVehicle } from "./scoring";
import { prefs } from "./test-fixtures";
import { fleet, monthlyPrice } from "./test-data/fleet";

/*
 * The model checked against FINN's own inventory snapshot.
 *
 * These are calibration tests: they hold the model to what the Phase 0 review
 * measured on real cars. When a refreshed snapshot moves one, the threshold
 * or list it guards needs re-deciding — not the test loosening.
 */

const cars = fleet();
const listed = cars.filter(equipmentKnown);

const prevalence = (key: FeatureId): number =>
  listed.filter((car) => car.features[key]).length / listed.length;

const expectedOf = (id: CategoryId): FeatureId[] =>
  (CATEGORIES[id] as { expected?: FeatureId[] }).expected ?? [];

describe("standard equipment on FINN's inventory", () => {
  /*
   * The share decides only whether having an item earns credit: a confirmed
   * gap in expected equipment always costs.
   */
  it("keeps expected equipment on at least 90% of cars", () => {
    expect(CATEGORY_IDS.flatMap(expectedOf).length).toBeGreaterThan(0);

    for (const id of CATEGORY_IDS) {
      for (const key of expectedOf(id)) {
        /* eCall: listed on 79%; standard because the law requires it on most models. */
        if (key === "hasEmergencyCallSystem") continue;

        expect(prevalence(key), key).toBeGreaterThanOrEqual(BASELINE_PREVALENCE);
      }
    }
  });

  it("leaves every scored equipment item below the baseline threshold", () => {
    for (const id of CATEGORY_IDS) {
      for (const { key, role } of countedItems(id)) {
        if (isDerivedSignal(key) || role === "expected") continue;

        expect(prevalence(key as FeatureId), key).toBeLessThan(BASELINE_PREVALENCE);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Profile semantics                                                          */
/* -------------------------------------------------------------------------- */

/** A small deterministic generator, so the sets are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * Four-car sets priced within €75/month of each other — cars a reader could
 * plausibly be choosing between.
 */
function comparableSets(count: number, seed: number): PinnedFinnCar[][] {
  const random = seeded(seed);
  const priced = cars.filter((car) => monthlyPrice(car) > 0);
  const sets: PinnedFinnCar[][] = [];

  while (sets.length < count) {
    const anchor = priced[Math.floor(random() * priced.length)] as PinnedFinnCar;
    const near = priced.filter((car) => Math.abs(monthlyPrice(car) - monthlyPrice(anchor)) <= 75);

    if (near.length < 4) continue;

    const set = new Set<PinnedFinnCar>();
    while (set.size < 4) set.add(near[Math.floor(random() * near.length)] as PinnedFinnCar);

    sets.push([...set]);
  }

  return sets;
}

/**
 * How often a profile recommends a car that's materially poor on its one
 * dominant concern while a comparably priced car that's strong on it exists.
 */
function failureRate(
  profile: "nervous" | "eco",
  concern: CategoryId,
  poor: number,
  strong: number,
): number {
  const priorities = [...PROFILES[profile].priorities];
  const emphasis = profileEmphasis(profile);
  const sets = comparableSets(1500, profile === "nervous" ? 7 : 11);

  let failures = 0;

  for (const set of sets) {
    const recommendation = buildRecommendation(set, priorities, prefs(), emphasis);
    if (!recommendation || recommendation.evidenceFallback) continue;

    const concernOf = (car: PinnedFinnCar) =>
      recommendation.scores.find((score) => score.vehicleId === car.id)?.details[concern];

    const winner = concernOf(recommendation.winner);
    if (!winner?.assessed || winner.exactScore > poor) continue;

    const better = set.some((car) => {
      const detail = concernOf(car);
      return (
        car.id !== recommendation.winner.id &&
        detail?.assessed &&
        detail.exactScore >= strong &&
        monthlyPrice(car) <= monthlyPrice(recommendation.winner) + 50
      );
    });

    if (better) failures += 1;
  }

  return failures / sets.length;
}

describe("profiles keep their promise on FINN's inventory", () => {
  it("Nervous Driver rarely recommends a car poor on safety over a comparable strong one", () => {
    expect(failureRate("nervous", "safetyAssistance", 40, 80)).toBeLessThanOrEqual(0.01);
  });

  it("Eco-Conscious rarely recommends a class-D-or-worse car over a comparable clean one", () => {
    expect(failureRate("eco", "environmental", 35, 65)).toBeLessThanOrEqual(0.01);
  });
});

describe("City & Parking doesn't punish a small car for lacking cameras", () => {
  /*
   * With City's standard equipment listed. A gap FINN confirms in that — a
   * small car without parking sensors — counts against it, as it should.
   */
  it("never rates a car of 4.0 m or less without cameras below Partial, under any profile", () => {
    const small = cars.filter(
      (car) =>
        equipmentKnown(car) &&
        car.dimensions.length <= 4000 &&
        !car.features.hasOneEightyDegreesReversingCamera &&
        !car.features.hasThreeSixtyDegreesCamera &&
        expectedOf("cityParking").every((key) => car.features[key]),
    );

    const profiles = (Object.keys(PROFILES) as (keyof typeof PROFILES)[]).filter((id) =>
      (PROFILES[id].priorities as CategoryId[]).includes("cityParking"),
    );

    expect(small.length).toBeGreaterThan(0);

    for (const profile of profiles) {
      for (const car of small) {
        const detail = scoreVehicle(car, [...PROFILES[profile].priorities], prefs(), profileEmphasis(profile))
          .details.cityParking!;

        expect(detail.exactScore, `${car.name} under ${profile}`).toBeGreaterThanOrEqual(PARTIAL_FROM);
        expect(bandForScore(detail.exactScore)).not.toBe("limited");
      }
    }
  });
});
