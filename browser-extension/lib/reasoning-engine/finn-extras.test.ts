import { describe, expect, it } from "vitest";

import type { PinnedFinnCar } from "@/lib/types";
import type { CategoryId } from "./types";

import { CATEGORIES, PROFILES, profileEmphasis } from "./constants";
import { CHARGE_FACTOR_ANCHORS, WIDTH_ANCHORS, chargeFactor, piecewise, signalUtility } from "./evidence";
import { buildRecommendation, migratePreferences } from "./index";
import { buildAdviceNarrative } from "./narrative";
import { scoreVehicle } from "./scoring";
import { makeCar, prefs } from "./test-fixtures";
import { garageCar } from "./test-garage";
import { fleet } from "./test-data/fleet";

/*
 * The evidence read from FINN's data beyond the equipment list the model
 * started with: width, seat count, towing rating, gearbox, drive type, a heat
 * pump, DC charging time, and the automatics-only rule.
 */

const ROAD_TRIP = [...PROFILES.roadtrip.priorities];
const COMMUTER = [...PROFILES.commuter.priorities];

const sum = (car: PinnedFinnCar, priorities: CategoryId[]) => {
  const score = scoreVehicle(car, priorities, prefs(), profileEmphasis("roadtrip"));
  return { score, total: score.contributions.reduce((acc, line) => acc + line.points, 0) };
};

describe("readings from FINN's structured fields", () => {
  it("reads the gearbox and drive type from the car, even without an equipment list", () => {
    const manual = makeCar({ id: 1, transmission: "Manual", features: [], featuresSupplied: false });

    expect(signalUtility("hasAutomaticTransmission", manual)).toBe(0);
    expect(signalUtility("hasAutomaticTransmission", makeCar({ id: 2 }))).toBe(1);
    expect(signalUtility("hasAllWheelDrive", manual)).toBe(0);
    expect(signalUtility("hasAllWheelDrive", { ...manual, driveType: "Unknown" })).toBeNull();
  });

  it("counts five seats, and a towing rating from 1,500 kg", () => {
    expect(signalUtility("seatsFivePlus", makeCar({ id: 1, seats: "4" }))).toBe(0);
    expect(signalUtility("seatsFivePlus", makeCar({ id: 1, seats: "7" }))).toBe(1);
    expect(signalUtility("towingCapacity1500", makeCar({ id: 1, towingCapacityKg: 1500 }))).toBe(1);
    expect(signalUtility("towingCapacity1500", makeCar({ id: 1, towingCapacityKg: 1300 }))).toBe(0);
    expect(signalUtility("towingCapacity1500", makeCar({ id: 1 }))).toBeNull();
  });

  it("reads width on a fixed scale, narrower earning more", () => {
    let previous = -Infinity;

    for (let width = 2100; width >= 1700; width -= 25) {
      const utility = signalUtility("compactWidth", makeCar({ id: 1, width }))!;
      expect(utility).toBeGreaterThanOrEqual(previous);
      previous = utility;
    }

    expect(piecewise(WIDTH_ANCHORS, 1750)).toBe(1);
    expect(piecewise(WIDTH_ANCHORS, 2050)).toBe(0);
  });

  it("reads wireless CarPlay as unknown on a car pinned before Lens read it", () => {
    const old = makeCar({ id: 1, features: ["hasHeatedSeats"], featuresSupplied: true });
    delete (old.features as Record<string, boolean>).hasWirelessAppleCarPlaySlashAndroidAuto;

    expect(signalUtility("hasWirelessAppleCarPlaySlashAndroidAuto", old)).toBeNull();
    expect(signalUtility("hasWirelessAppleCarPlaySlashAndroidAuto", makeCar({ id: 1, featuresSupplied: true }))).toBe(0);
  });
});

describe("a heat pump counts for electric cars only", () => {
  const climate = (car: PinnedFinnCar) =>
    scoreVehicle(car, ["climateSuitability", "comfort", "safetyAssistance"], prefs(), profileEmphasis("balanced"))
      .details.climateSuitability!;

  it("leaves it out of a petrol car's Climate score entirely", () => {
    const petrol = garageCar({ id: 1 });

    expect(climate(petrol).items.some((item) => item.key === "hasHeatPump")).toBe(false);
    expect(climate(garageCar({ id: 1, extra: ["hasHeatPump"] })).exactScore).toBe(climate(petrol).exactScore);
  });

  it("rewards an electric car that has one", () => {
    const ev = { id: 1, fuelType: "Electric" as const, consumption: 16, co2: 0, range: 500 };

    expect(climate(garageCar({ ...ev, extra: ["hasHeatPump"] })).exactScore).toBeGreaterThan(
      climate(garageCar(ev)).exactScore,
    );
  });
});

describe("slow DC charging limits Long Distance for an electric car", () => {
  const ev = (dcChargeMinutes: number | null) =>
    garageCar({
      id: 1,
      fuelType: "Electric",
      consumption: 16,
      co2: 0,
      range: 560,
      driverAssistanceLevel: 2,
      dcChargeMinutes,
      extra: ["hasLumbarSupport", "hasHeadUpDisplay"],
    });

  const longDistance = (car: PinnedFinnCar) => sum(car, ROAD_TRIP).score.details.longDistance!;

  it("costs nothing up to 30 minutes, and more the slower it gets", () => {
    expect(chargeFactor(CHARGE_FACTOR_ANCHORS[0]![0])).toBe(1);
    expect(longDistance(ev(20)).exactScore).toBe(longDistance(ev(30)).exactScore);
    expect(longDistance(ev(40)).exactScore).toBeLessThan(longDistance(ev(30)).exactScore);
    expect(longDistance(ev(52)).exactScore).toBeLessThan(longDistance(ev(40)).exactScore);
  });

  it("doesn't limit or unassess a car FINN lists no charging time for", () => {
    const unknown = longDistance(ev(null));

    expect(unknown.assessed).toBe(true);
    expect(unknown.chargeFactor).toBeNull();
    expect(unknown.exactScore).toBe(longDistance(ev(30)).exactScore);
  });

  it("names what it took away, so the working still adds up to the fit", () => {
    const shortAndSlow = garageCar({
      id: 2,
      fuelType: "Electric",
      consumption: 16,
      co2: 0,
      range: 320,
      driverAssistanceLevel: 2,
      dcChargeMinutes: 50,
      extra: ["hasLumbarSupport"],
    });

    for (const car of [ev(50), shortAndSlow]) {
      const { score, total } = sum(car, ROAD_TRIP);
      const lines = score.contributions.map((line) => line.kind);

      expect(lines).toContain("charging");
      expect(total).toBeCloseTo(score.fit, 8);
    }

    expect(sum(shortAndSlow, ROAD_TRIP).score.contributions.map((line) => line.kind)).toContain("range");
  });

  it("says why in the explanation", () => {
    const recommendation = buildRecommendation([ev(50)], ROAD_TRIP, prefs(), profileEmphasis("roadtrip"))!;
    const text = JSON.stringify(buildAdviceNarrative(recommendation.evaluation, recommendation.context));

    expect(text).toMatch(/50-minute charge from 10 to 80% limits this priority/);
  });
});

describe("an automatic gearbox is expected in City & Parking", () => {
  it("costs a manual car there, and nowhere else", () => {
    const automatic = garageCar({ id: 1 });
    const manual = garageCar({ id: 1, transmission: "Manual" });

    const a = scoreVehicle(automatic, COMMUTER, prefs(), profileEmphasis("commuter"));
    const m = scoreVehicle(manual, COMMUTER, prefs(), profileEmphasis("commuter"));

    expect(m.details.cityParking!.exactScore).toBeLessThan(a.details.cityParking!.exactScore);
    for (const priority of COMMUTER.filter((id) => id !== "cityParking")) {
      expect(m.details[priority]!.exactScore).toBe(a.details[priority]!.exactScore);
    }

    expect(m.details.cityParking!.expectedMissing).toContain("hasAutomaticTransmission");
  });

  it("is on nearly every FINN car, and manuals are the exception", () => {
    const cars = fleet();
    const automatics = cars.filter((car) => car.transmission === "Automatic").length;

    expect(CATEGORIES.cityParking.expected).toContain("hasAutomaticTransmission");
    expect(automatics / cars.length).toBeGreaterThan(0.9);
  });
});

describe("the automatics-only rule", () => {
  const strongManual = () =>
    garageCar({
      id: 1,
      name: "Strong Manual",
      transmission: "Manual",
      extra: ["hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasMatrixLedHeadlights"],
    });
  const plainAutomatic = () => garageCar({ id: 2, name: "Plain Automatic" });
  const priorities: CategoryId[] = ["safetyAssistance", "comfort", "practicality"];

  it("changes nothing when it's off", () => {
    const result = buildRecommendation([strongManual(), plainAutomatic()], priorities, prefs())!;

    expect(result.winner.name).toBe("Strong Manual");
    expect(result.gearboxFallback).toBeNull();
    expect(result.context.gearbox.required).toBe(false);
  });

  it("recommends an automatic over a better-scoring manual, without moving any score", () => {
    const off = buildRecommendation([strongManual(), plainAutomatic()], priorities, prefs())!;
    const on = buildRecommendation([strongManual(), plainAutomatic()], priorities, prefs({ automaticOnly: true }))!;

    expect(on.winner.name).toBe("Plain Automatic");
    expect(on.topScorer.name).toBe("Strong Manual");
    expect(on.gearboxFallback).toBeNull();
    expect(on.scores.map((score) => score.fit)).toEqual(off.scores.map((score) => score.fit));
  });

  it("still recommends a manual, flagged, when nothing pinned is an automatic", () => {
    const result = buildRecommendation(
      [strongManual(), garageCar({ id: 3, name: "Other Manual", transmission: "Manual" })],
      priorities,
      prefs({ automaticOnly: true }),
    )!;

    expect(result.winner.name).toBe("Strong Manual");
    expect(result.gearboxFallback).toBe("noneFit");
  });

  it("is kept by the settings migration, and off for anyone who never set it", () => {
    expect(migratePreferences({ monthlyKm: 800, automaticOnly: true }).automaticOnly).toBe(true);
    expect(migratePreferences({ monthlyKm: 800 }).automaticOnly).toBe(false);
  });
});

describe("FINN's tyre setup", () => {
  const climateText = (tyres: PinnedFinnCar["tyres"]) => {
    const car = { ...garageCar({ id: 1, extra: ["hasHeatedSeats"] }), tyres };
    const recommendation = buildRecommendation([car], ["climateSuitability", "comfort", "safetyAssistance"], prefs())!;

    return { car, text: JSON.stringify(buildAdviceNarrative(recommendation.evaluation, recommendation.context)) };
  };

  it("is quoted under Climate Suitability and never scored", () => {
    const allSeason = climateText("allSeason");
    const twoSets = climateText("summerAndWinter");

    expect(allSeason.text).toMatch(/FINN fits it with all-season tyres, which Lens shows but doesn't score/);
    expect(twoSets.text).toMatch(/a summer and a winter set of tyres/);

    const fit = (car: PinnedFinnCar) => scoreVehicle(car, ["climateSuitability", "comfort", "safetyAssistance"], prefs()).fit;
    expect(fit(allSeason.car)).toBe(fit(twoSets.car));
  });
});
