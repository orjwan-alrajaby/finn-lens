import { describe, expect, it } from "vitest";

import type { PinnedFinnCar } from "@/lib/types";
import type { CategoryId, FeatureId, FeatureSelection, SignalId } from "./types";

import {
  CATEGORIES,
  CATEGORY_IDS,
  DEFAULT_CATEGORY_FEATURES,
  PROFILES,
  profileEmphasis,
  type ProfileId,
} from "./constants";
import {
  BOOT_ANCHORS,
  LENGTH_ANCHORS,
  countedItems,
  homeOf,
  piecewise,
  tripFactor,
} from "./evidence";
import { phevScore, positionForCo2 } from "./environmental";
import { STRONG_FROM } from "./bands";
import { buildRecommendation } from "./index";
import { buildFitAnalysis } from "./fit";
import { categoryDetail, priorityWeights, scoreVehicle } from "./scoring";
import { makeCar, prefs } from "./test-fixtures";
import { BASELINE, GARAGE, garage, garageCar } from "./test-garage";

/*
 * The invariants the scoring model must hold before anyone trusts it. Each
 * block is one requirement from the model specification, in its order.
 */

const BALANCED = [...PROFILES.balanced.priorities];
const ROAD_TRIP = [...PROFILES.roadtrip.priorities];

const selection = (
  entries: Partial<Record<CategoryId, FeatureSelection>>,
): Record<CategoryId, FeatureSelection> => ({
  ...Object.fromEntries(CATEGORY_IDS.map((id) => [id, []])),
  ...entries,
}) as Record<CategoryId, FeatureSelection>;

const fitOf = (
  car: PinnedFinnCar,
  priorities: CategoryId[] = BALANCED,
  features = DEFAULT_CATEGORY_FEATURES,
) => scoreVehicle(car, priorities, prefs(), features);

/* -------------------------------------------------------------------------- */
/* 1. Single car = Compare                                                    */
/* -------------------------------------------------------------------------- */

describe("a car scores the same alone as in a comparison", () => {
  it("gives identical fit, priority scores, assessment and contributions", () => {
    const cars = garage();
    const compared = buildRecommendation(cars, BALANCED, prefs())!;

    for (const car of cars) {
      const alone = buildFitAnalysis(car, BALANCED, prefs());
      const inSet = compared.scores.find((score) => score.vehicleId === car.id)!;
      const single = fitOf(car);

      expect(single.fit).toBeCloseTo(inSet.fit, 10);
      expect(single.judgeable).toBe(inSet.judgeable);
      expect(single.contributions).toEqual(inSet.contributions);

      for (const priority of BALANCED) {
        expect(single.details[priority]?.exactScore).toBe(inSet.details[priority]?.exactScore);
        expect(single.details[priority]?.assessed).toBe(inSet.details[priority]?.assessed);
      }

      expect(alone.priorities.map((item) => item.band.level)).toHaveLength(BALANCED.length);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Set independence                                                        */
/* -------------------------------------------------------------------------- */

describe("other pinned cars never move a car's score", () => {
  it("keeps every fit identical whatever else is pinned, in any order", () => {
    const cars = garage();
    const full = buildRecommendation(cars, BALANCED, prefs())!.scores;

    for (let drop = 0; drop < cars.length; drop += 1) {
      const subset = cars.filter((_, index) => index !== drop).reverse();
      const scores = buildRecommendation(subset, BALANCED, prefs())!.scores;

      for (const score of scores) {
        expect(score.fit).toBe(full.find((item) => item.vehicleId === score.vehicleId)!.fit);
      }
    }
  });

  it("never reverses two cars' order when a third is added", () => {
    const a = GARAGE.safeCompact();
    const b = GARAGE.comfyCruiser();

    const before = buildRecommendation([a, b], BALANCED, prefs())!.ranked.map((car) => car.id);

    for (const third of garage().filter((car) => car.id !== a.id && car.id !== b.id)) {
      const after = buildRecommendation([a, b, third], BALANCED, prefs())!
        .ranked.map((car) => car.id)
        .filter((id) => id === a.id || id === b.id);

      expect(after).toEqual(before);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Monotonicity                                                            */
/* -------------------------------------------------------------------------- */

describe("better evidence never lowers a fit", () => {
  const scored = CATEGORY_IDS.flatMap((category) =>
    countedItems(category).map((item) => item.key),
  ).filter((key): key is FeatureId => !["rearDoors", "seatsSixPlus", "driverAssistLevel2", "compactLength", "bootVolume"].includes(key));

  it("never lowers the fit when a car gains a scored item", () => {
    for (const priorities of [BALANCED, ROAD_TRIP, [...PROFILES.nervous.priorities]]) {
      for (const key of new Set(scored)) {
        const without = garageCar({ id: 1, extra: [] });
        const withIt = garageCar({ id: 1, extra: [key] });

        expect(fitOf(withIt, priorities).fit).toBeGreaterThanOrEqual(
          fitOf(without, priorities).fit,
        );
      }
    }
  });

  it("never lowers the fit for a shorter car", () => {
    let previous = -Infinity;

    for (let length = 5400; length >= 3500; length -= 50) {
      const fit = fitOf(garageCar({ id: 1, length })).fit;
      expect(fit).toBeGreaterThanOrEqual(previous);
      previous = fit;
    }
  });

  it("never lowers the fit for more electric range", () => {
    let previous = -Infinity;

    for (let range = 200; range <= 800; range += 10) {
      const fit = fitOf(
        garageCar({ id: 1, fuelType: "Electric", co2: 0, consumption: 16, range }),
        ROAD_TRIP,
      ).fit;
      expect(fit).toBeGreaterThanOrEqual(previous);
      previous = fit;
    }
  });

  it("never lowers the fit for less CO₂", () => {
    let previous = -Infinity;

    for (let co2 = 260; co2 >= 1; co2 -= 1) {
      const fit = fitOf(garageCar({ id: 1, co2 }), [...PROFILES.eco.priorities]).fit;
      expect(fit).toBeGreaterThanOrEqual(previous);
      previous = fit;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Missing vs known-negative                                               */
/* -------------------------------------------------------------------------- */

describe("unknown is never read as absent", () => {
  it("scores an unknown item no lower than the same item known to be absent", () => {
    const unknown = garageCar({ id: 1, driverAssistanceLevel: null, extra: ["hasLumbarSupport"] });
    const absent = garageCar({ id: 1, driverAssistanceLevel: 1, extra: ["hasLumbarSupport"] });

    const u = categoryDetail("longDistance", unknown, [unknown], prefs(), DEFAULT_CATEGORY_FEATURES);
    const a = categoryDetail("longDistance", absent, [absent], prefs(), DEFAULT_CATEGORY_FEATURES);

    expect(u.exactScore).toBeGreaterThanOrEqual(a.exactScore);
    expect(u.unknown).toContain("driverAssistLevel2");
    expect(a.missing).toContain("driverAssistLevel2");
  });

  it("leaves an unknown item out of the score rather than counting it as zero", () => {
    const car = garageCar({ id: 1, driverAssistanceLevel: null, extra: ["hasLumbarSupport", "hasHeadUpDisplay"] });
    const detail = categoryDetail("longDistance", car, [car], prefs(), selection({}));

    /* Lumbar, head-up display and matrix LED at standard: two of three known present. */
    expect(detail.exactScore).toBeCloseTo((100 * 2) / 3, 10);
  });

  /* FINN is the source of truth: an all-false list is a car with none of it. */
  it("reads an all-false equipment list as a car without that equipment", () => {
    const allFalse = makeCar({ id: 1, features: [], featuresSupplied: true });
    const detail = categoryDetail("safetyAssistance", allFalse, [allFalse], prefs());

    expect(detail.assessed).toBe(true);
    expect(detail.unknown).not.toContain("hasIsofix");
  });

  it("reads only a missing equipment list as unknown", () => {
    const noList = makeCar({ id: 1, features: [], featuresSupplied: false });
    const detail = categoryDetail("safetyAssistance", noList, [noList], prefs());

    expect(detail.assessed).toBe(false);
    expect(detail.unknown.length).toBeGreaterThan(0);
  });

  it("reads an entry FINN left empty as unknown, and one it answered false as absent", () => {
    const car = { ...makeCar({ id: 1, features: [], featuresSupplied: true }), unansweredFeatures: ["hasBlindSpotAssist"] };
    const detail = categoryDetail("safetyAssistance", car, [car], prefs());

    expect(detail.unknown).toContain("hasBlindSpotAssist");
    expect(detail.missing).not.toContain("hasBlindSpotAssist");
  });

  it("never scores a missing CO₂ figure as a neutral fifty", () => {
    const car = GARAGE.noCo2();
    const detail = categoryDetail("environmental", car, [car], prefs());

    expect(detail.assessed).toBe(false);
    expect(fitOf(car, [...PROFILES.balanced.priorities]).details.environmental?.assessed).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Missing-data recommendation protection                                  */
/* -------------------------------------------------------------------------- */

describe("a car Lens can't judge is never recommended over one it can", () => {
  it("passes over a car whose top two priorities aren't assessed", () => {
    const blind = GARAGE.noEquipmentList();
    const judged = GARAGE.thirstyPetrol();

    const recommendation = buildRecommendation([blind, judged], [...PROFILES.eco.priorities], prefs())!;

    expect(recommendation.scores.find((score) => score.vehicleId === blind.id)?.judgeable).toBe(false);
    expect(recommendation.winner.id).toBe(judged.id);
    expect(recommendation.evidenceFallback).toBe(false);
  });

  it("puts forward the best estimate, flagged, only when nothing can be judged", () => {
    const recommendation = buildRecommendation(
      [GARAGE.noEquipmentList()],
      [...PROFILES.eco.priorities],
      prefs(),
    )!;

    expect(recommendation.evidenceFallback).toBe(true);
  });

  it("withholds the overall band from a car it can't judge", () => {
    const analysis = buildFitAnalysis(GARAGE.noEquipmentList(), [...PROFILES.eco.priorities], prefs());

    expect(analysis.overall.level).toBe("unknown");
  });

  it("names the gap when filling it could reorder the winner and runner-up", () => {
    const unknownLevel = garageCar({
      id: 1,
      name: "Unknown Level",
      driverAssistanceLevel: null,
      extra: ["hasLumbarSupport", "hasHeadUpDisplay", "hasMatrixLedHeadlights"],
    });

    const knownLevel = garageCar({
      id: 2,
      name: "Known Level",
      driverAssistanceLevel: 2,
      extra: ["hasLumbarSupport", "hasHeadUpDisplay"],
    });

    const recommendation = buildRecommendation(
      [unknownLevel, knownLevel],
      ["longDistance", "safetyAssistance", "comfort"],
      prefs(),
      profileEmphasis("roadtrip"),
    )!;

    expect(recommendation.dependsOn.some((gap) => gap.kind === "item" && gap.key === "driverAssistLevel2")).toBe(true);
  });

  it("names nothing when no gap could change the answer", () => {
    const recommendation = buildRecommendation(
      [GARAGE.safeCompact(), GARAGE.cityHatch()],
      BALANCED,
      prefs(),
    )!;

    expect(recommendation.dependsOn).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Emphasis                                                                */
/* -------------------------------------------------------------------------- */

describe("raising an item", () => {
  const car = garageCar({ id: 1, extra: ["hasBlindSpotAssist"] });

  it("never lowers that item's share of its priority", () => {
    const levels = [null, "low", "medium", "high"] as const;
    let previous = -Infinity;

    for (const level of levels) {
      const features = selection({
        safetyAssistance: level ? [{ key: "hasBlindSpotAssist", importance: level }] : [],
      });

      const share = scoreVehicle(car, ["safetyAssistance", "comfort", "practicality"], prefs(), features)
        .contributions.find((line) => line.kind === "item" && line.key === "hasBlindSpotAssist")!.points;

      expect(share).toBeGreaterThanOrEqual(previous);
      previous = share;
    }
  });

  it("gives a niche item no effect until it is raised", () => {
    const withTowbar = garageCar({ id: 1, extra: ["hasTowbar"] });
    const without = garageCar({ id: 1, extra: [] });

    expect(fitOf(withTowbar, BALANCED, selection({})).fit).toBe(fitOf(without, BALANCED, selection({})).fit);

    const raised = selection({ practicality: [{ key: "hasTowbar", importance: "low" }] });
    expect(fitOf(withTowbar, BALANCED, raised).fit).toBeGreaterThan(fitOf(without, BALANCED, raised).fit);
  });

  it("ignores a raise on an item whose home is another priority", () => {
    const matrix = garageCar({ id: 1, extra: ["hasMatrixLedHeadlights"] });
    const raisedAway = selection({ longDistance: [{ key: "hasMatrixLedHeadlights", importance: "high" }] });

    const detail = categoryDetail("longDistance", matrix, [matrix], prefs(), raisedAway);

    expect(detail.items.find((item) => item.key === "hasMatrixLedHeadlights")?.weight).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Priority weights                                                        */
/* -------------------------------------------------------------------------- */

describe("priority weights", () => {
  it("are exactly rank-sum for three, four and five priorities", () => {
    const weights = (n: number) => priorityWeights(CATEGORY_IDS.slice(0, n)).map((item) => item.weight);

    expect(weights(3)).toEqual([3 / 6, 2 / 6, 1 / 6]);
    expect(weights(4)).toEqual([4 / 10, 3 / 10, 2 / 10, 1 / 10]);
    expect(weights(5)).toEqual([5 / 15, 4 / 15, 3 / 15, 2 / 15, 1 / 15]);
  });

  it("sum to one", () => {
    for (let n = 1; n <= 5; n += 1) {
      const total = priorityWeights(CATEGORY_IDS.slice(0, n)).reduce((sum, item) => sum + item.weight, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("never reduce a priority's weight when it moves up", () => {
    const order = CATEGORY_IDS.slice(0, 5);

    for (let from = 1; from < order.length; from += 1) {
      const moved = [...order];
      const [item] = moved.splice(from, 1);
      moved.splice(from - 1, 0, item as CategoryId);

      const before = priorityWeights(order).find((w) => w.priority === item)!.weight;
      const after = priorityWeights(moved).find((w) => w.priority === item)!.weight;

      expect(after).toBeGreaterThan(before);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Feature overlap                                                         */
/* -------------------------------------------------------------------------- */

describe("evidence has one home", () => {
  const defs = CATEGORY_IDS.map((id) => ({
    id,
    def: CATEGORIES[id] as {
      features: readonly SignalId[];
      alsoCounts?: readonly SignalId[];
      expected?: readonly FeatureId[];
    },
  }));

  it("gives every scored item exactly one home", () => {
    const homes = defs.flatMap(({ def }) => [...def.features]);
    expect(new Set(homes).size).toBe(homes.length);
  });

  it("counts an item in at most one second home", () => {
    const also = defs.flatMap(({ def }) => [...(def.alsoCounts ?? [])]);

    expect(new Set(also).size).toBe(also.length);
    for (const key of also) expect(homeOf(key)).not.toBeNull();
  });

  it("shares exactly one item across the whole model: matrix LED headlights", () => {
    const also = defs.flatMap(({ def }) => [...(def.alsoCounts ?? [])]);
    expect(also).toEqual(["hasMatrixLedHeadlights"]);
  });

  it("keeps every pair of priorities within the sharing cap", () => {
    for (const { id, def } of defs) {
      for (const key of def.alsoCounts ?? []) {
        const home = homeOf(key)!;
        const shared = countedItems(id).filter((item) => countedItems(home).some((other) => other.key === item.key));

        expect(shared.length).toBeLessThanOrEqual(1);
        expect(shared.length / countedItems(id).length).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("never lets standard equipment earn credit, and gives each standard item one home", () => {
    const scored = new Set(defs.flatMap(({ def }) => [...def.features, ...(def.alsoCounts ?? [])]));
    const standard = defs.flatMap(({ def }) => [...(def.expected ?? [])]);

    expect(standard.length).toBe(BASELINE.length);
    expect(new Set(standard).size).toBe(standard.length);
    for (const key of standard) expect(scored.has(key)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 9. Size neutrality                                                         */
/* -------------------------------------------------------------------------- */

describe("size counts in one place", () => {
  it("moves only City & Parking when the length changes", () => {
    const short = fitOf(garageCar({ id: 1, length: 3900 }));
    const long = fitOf(garageCar({ id: 1, length: 5100 }));

    for (const priority of BALANCED) {
      if (priority === "cityParking") {
        expect(short.details.cityParking!.exactScore).toBeGreaterThan(long.details.cityParking!.exactScore);
      } else {
        expect(short.details[priority]!.exactScore).toBe(long.details[priority]!.exactScore);
      }
    }
  });

  it("moves nothing when the boot figure changes while boot scoring is off", () => {
    const small = fitOf(garageCar({ id: 1, trunk: 200 }));
    const big = fitOf(garageCar({ id: 1, trunk: 700 }));

    expect(small.fit).toBe(big.fit);
    expect(countedItems("practicality").some((item) => item.key === "bootVolume")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 10–11. Curves                                                              */
/* -------------------------------------------------------------------------- */

const sweep = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step);

describe("the curves", () => {
  it("length: continuous, never rising, flat at 4.0 m and shorter", () => {
    const values = sweep(3000, 6000, 5).map((mm) => piecewise(LENGTH_ANCHORS, mm));

    values.forEach((value, index) => {
      if (index === 0) return;
      expect(value).toBeLessThanOrEqual(values[index - 1] as number);
      expect(Math.abs(value - (values[index - 1] as number))).toBeLessThan(0.01);
    });

    expect(piecewise(LENGTH_ANCHORS, 3500)).toBe(1);
    expect(piecewise(LENGTH_ANCHORS, 4000)).toBe(1);
  });

  it("boot: continuous, never falling, capped at 650 L", () => {
    const values = sweep(0, 1500, 5).map((litres) => piecewise(BOOT_ANCHORS, litres));

    values.forEach((value, index) => {
      if (index === 0) return;
      expect(value).toBeGreaterThanOrEqual(values[index - 1] as number);
      expect(Math.abs(value - (values[index - 1] as number))).toBeLessThan(0.02);
    });

    expect(piecewise(BOOT_ANCHORS, 650)).toBe(1);
    expect(piecewise(BOOT_ANCHORS, 1400)).toBe(1);
  });

  it("EV trip factor: at most 1, never falling, flat from 480 km", () => {
    let previous = -Infinity;

    for (const range of sweep(100, 900, 5)) {
      const factor = tripFactor(range);
      expect(factor).toBeLessThanOrEqual(1);
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }

    expect(tripFactor(480)).toBe(1);
    expect(tripFactor(790)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 12. Long Distance scenarios                                                */
/* -------------------------------------------------------------------------- */

describe("Long Distance on the road-trip emphasis", () => {
  const emphasis = profileEmphasis("roadtrip");

  /*
   * Road Tripper's Long Distance: level 2 assistance ×4, lumbar ×3, head-up
   * display ×2, matrix LED ×1. Level 2 + lumbar = 70; level 2 + matrix = 50;
   * all four = 100; level 2 alone = 40.
   */
  const longDistance = (
    overrides: Parameters<typeof garageCar>[0],
  ) => {
    const car = garageCar(overrides);
    return categoryDetail("longDistance", car, [car], prefs(), emphasis);
  };

  const seventy = { driverAssistanceLevel: 2 as const, extra: ["hasLumbarSupport"] as FeatureId[] };
  const ev = (range: number) => ({ fuelType: "Electric" as const, co2: 0, consumption: 16, range });

  it("A: a 290 km EV scores well below an identically equipped petrol car", () => {
    expect(longDistance({ id: 1, ...seventy }).exactScore).toBeCloseTo(70, 10);
    expect(longDistance({ id: 2, ...seventy, ...ev(290) }).exactScore).toBeCloseTo(38.5, 10);
  });

  it("B: a 400 km EV scores somewhat below it", () => {
    expect(longDistance({ id: 2, ...seventy, ...ev(400) }).exactScore).toBeCloseTo(59.5, 10);
  });

  it("C: a 550 km EV scores exactly the same, never more", () => {
    expect(longDistance({ id: 2, ...seventy, ...ev(550) }).exactScore).toBeCloseTo(70, 10);
  });

  it("D: a well-equipped 310 km EV loses to a 570 km EV with less kit", () => {
    const short = longDistance({ id: 1, ...seventy, ...ev(310) });
    const long = longDistance({ id: 2, driverAssistanceLevel: 2, extra: ["hasMatrixLedHeadlights"], ...ev(570) });

    expect(long.exactScore).toBeCloseTo(50, 10);
    expect(long.exactScore).toBeGreaterThan(short.exactScore);
  });

  it("D: an EV with every item can still beat a long-range one with almost none, and says why", () => {
    const loaded = garageCar({ id: 1, driverAssistanceLevel: 2, extra: ["hasLumbarSupport", "hasHeadUpDisplay", "hasMatrixLedHeadlights"], ...ev(290) });
    const bare = garageCar({ id: 2, driverAssistanceLevel: 2, ...ev(500) });

    const loadedScore = scoreVehicle(loaded, ROAD_TRIP, prefs(), emphasis);

    expect(loadedScore.details.longDistance!.exactScore).toBeGreaterThan(
      scoreVehicle(bare, ROAD_TRIP, prefs(), emphasis).details.longDistance!.exactScore,
    );
    expect(loadedScore.contributions.some((line) => line.kind === "range" && line.points < 0)).toBe(true);
  });

  it("E: petrol, diesel and plug-in hybrid with the same kit score the same", () => {
    const scores = (["Petrol", "Diesel", "Plug-in Hybrid"] as const).map(
      (fuelType) => longDistance({ id: 1, fuelType, consumption: fuelType === "Plug-in Hybrid" ? 1 : 6, ...seventy }).exactScore,
    );

    expect(new Set(scores).size).toBe(1);
  });

  it("F: an EV with no published range isn't assessed on Long Distance", () => {
    const detail = longDistance({ id: 1, ...seventy, fuelType: "Electric", co2: 0, consumption: 16, range: null });

    expect(detail.assessed).toBe(false);
  });

  it("never lets a long-range EV outscore a combustion car on range alone", () => {
    for (const range of sweep(300, 800, 10)) {
      expect(longDistance({ id: 1, ...seventy, ...ev(range) }).exactScore).toBeLessThanOrEqual(
        longDistance({ id: 2, ...seventy }).exactScore + 1e-9,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 13. Environmental and plug-in hybrids                                      */
/* -------------------------------------------------------------------------- */

describe("CO₂ and plug-in hybrids", () => {
  it("never scores a plug-in hybrid above a non-plug-in car with the same figure", () => {
    for (let g = 0; g <= 250; g += 1) {
      expect(phevScore(positionForCo2(g))).toBeLessThanOrEqual(positionForCo2(g));
    }
  });

  it("keeps plug-in hybrids in order, and below Strong", () => {
    let previous = Infinity;

    for (let g = 1; g <= 250; g += 1) {
      const score = phevScore(positionForCo2(g));
      expect(score).toBeLessThanOrEqual(previous);
      expect(score).toBeLessThan(STRONG_FROM);
      previous = score;
    }
  });

  it("is continuous except the deliberate step at zero", () => {
    for (let g = 1; g < 250; g += 1) {
      expect(Math.abs(positionForCo2(g + 1) - positionForCo2(g))).toBeLessThanOrEqual(1.1);
    }

    expect(positionForCo2(0)).toBe(100);
  });

  it("scores an EV with no published CO₂ at 100, and a petrol car with none as unassessed", () => {
    const ev = GARAGE.longRangeEv();
    ev.co2 = { ...ev.co2, value: null as unknown as number };

    expect(categoryDetail("environmental", ev, [ev], prefs()).exactScore).toBe(100);
    expect(categoryDetail("environmental", GARAGE.noCo2(), [], prefs()).assessed).toBe(false);
  });

  it("treats a plug-in hybrid like any car with a tank on Long Distance", () => {
    const plugIn = GARAGE.plugIn();
    expect(categoryDetail("longDistance", plugIn, [plugIn], prefs()).tripFactor).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 14. Budget separation                                                      */
/* -------------------------------------------------------------------------- */

describe("price never touches fit", () => {
  it("leaves fit and order unchanged when in-budget prices change", () => {
    const a = GARAGE.safeCompact();
    const b = GARAGE.comfyCruiser();
    const budget = prefs({ monthlyBudget: 5000 });

    const before = buildRecommendation([a, b], BALANCED, budget)!;

    const cheaper = { ...b, pricing: { ...b.pricing, customerMonthly: { price: 199, oldPrice: null } } };
    const after = buildRecommendation([a, cheaper], BALANCED, budget)!;

    expect(after.ranked.map((car) => car.id)).toEqual(before.ranked.map((car) => car.id));
    expect(after.scores.map((score) => score.fit)).toEqual(before.scores.map((score) => score.fit));
  });

  it("marks a plug-in hybrid's energy as a floor, so its cost can't confirm a fit", () => {
    const recommendation = buildRecommendation([GARAGE.plugIn()], BALANCED, prefs({ monthlyBudget: 5000 }))!;
    const cost = recommendation.context.costs[GARAGE.plugIn().id]!;

    expect(cost.energy.isFloor).toBe(true);
    expect(cost.budgetStatus).toBe("unknown");
  });
});

/* -------------------------------------------------------------------------- */
/* 16. Contributions                                                          */
/* -------------------------------------------------------------------------- */

describe("the working adds up", () => {
  it("sums contributions exactly to the fit, for every garage car and profile", () => {
    for (const id of Object.keys(PROFILES) as ProfileId[]) {
      for (const car of garage()) {
        const score = scoreVehicle(car, [...PROFILES[id].priorities], prefs(), profileEmphasis(id));
        const sum = score.contributions.reduce((total, line) => total + line.points, 0);

        expect(sum).toBeCloseTo(score.fit, 9);
      }
    }
  });
});
