import type { PinnedFinnCar } from "@/lib/types";
import type { CategoryId, FeatureId } from "./types";

import { CATEGORIES } from "./constants";
import { makeCar, type CarOverrides } from "./test-fixtures";

/**
 * The test garage: a fixed set of cars, each built to stand for one situation
 * the scoring model has to handle, so tests can talk about "the compact safe
 * car" rather than about a list of equipment keys.
 *
 * Every car starts from the equipment nearly every FINN car carries — the
 * standard equipment — so a difference between two garage cars is always a difference
 * the model actually scores.
 */

/** Every standard item in the model. */
export const BASELINE: FeatureId[] = (
  Object.values(CATEGORIES) as { expected?: readonly FeatureId[] }[]
).flatMap((category) => [...(category.expected ?? [])]);

/** A car with FINN's baseline plus the given equipment. */
export function garageCar(
  overrides: CarOverrides & { extra?: FeatureId[] },
): PinnedFinnCar {
  const { extra = [], features, ...rest } = overrides;

  return makeCar({
    featuresSupplied: true,
    driverAssistanceLevel: 1,
    ...rest,
    features: features ?? [...BASELINE, ...extra],
  });
}

const safety: FeatureId[] = [
  "hasBlindSpotAssist",
  "hasRearCrosswalkWarning",
  "hasMatrixLedHeadlights",
];

const comforts: FeatureId[] = [
  "hasHeatedSeats",
  "hasRainSlashLightSensors",
  "hasHeatedSteeringWheel",
  "hasCorneringLights",
  "hasSeatCooling",
  "hasFogLights",
  "hasAuxiliaryHeater",
  "hasHeadlightCleaningSystem",
  "hasWirelessChargingStation",
  "hasKeylessEntryAndStart",
  "hasPremiumSoundSystem",
  "hasThreeZoneAutomaticClimateControls",
  "hasElectricFrontSeatAdjustment",
];

const cameras: FeatureId[] = [
  "hasOneEightyDegreesReversingCamera",
  "hasThreeSixtyDegreesCamera",
];

export const GARAGE = {
  /** Every safety item, little else, compact. */
  safeCompact: () =>
    garageCar({
      id: 101,
      name: "Safe Compact",
      length: 4100,
      extra: [...safety, "hasOneEightyDegreesReversingCamera", "hasSplitFoldingRearSeats"],
    }),

  /** Loaded with comfort and climate kit, no safety extras, long. */
  comfyCruiser: () =>
    garageCar({
      id: 102,
      name: "Comfy Cruiser",
      length: 4900,
      driverAssistanceLevel: 2,
      extra: [...comforts, ...cameras, "hasLumbarSupport", "hasHeadUpDisplay", "hasSplitFoldingRearSeats", "hasElectricTailgate"],
    }),

  /** A three-door city car with no cameras. */
  cityHatch: () =>
    garageCar({
      id: 103,
      name: "City Hatch",
      length: 3900,
      doors: "3",
      extra: ["hasHeatedSeats"],
    }),

  /** A large seven-seat SUV with a towbar. */
  familySuv: () =>
    garageCar({
      id: 104,
      name: "Family SUV",
      length: 5000,
      seats: "7",
      extra: [...cameras, "hasBlindSpotAssist", "hasSplitFoldingRearSeats", "hasElectricTailgate", "hasTowbar", "hasRoofRails"],
    }),

  /** Long-range electric car. */
  longRangeEv: () =>
    garageCar({
      id: 105,
      name: "Long Range EV",
      fuelType: "Electric",
      consumption: 16,
      co2: 0,
      range: 560,
      dcChargeMinutes: 28,
      driverAssistanceLevel: 2,
      extra: ["hasBlindSpotAssist", "hasLumbarSupport", "hasHeatedSeats"],
    }),

  /** Short-range electric car. */
  shortRangeEv: () =>
    garageCar({
      id: 106,
      name: "Short Range EV",
      fuelType: "Electric",
      consumption: 15,
      co2: 0,
      range: 310,
      length: 4050,
      driverAssistanceLevel: 2,
      extra: ["hasBlindSpotAssist", "hasLumbarSupport", "hasHeatedSeats"],
    }),

  /** Plug-in hybrid with a class-B official figure. */
  plugIn: () =>
    garageCar({
      id: 107,
      name: "Plug-in",
      fuelType: "Plug-in Hybrid",
      consumption: 1.2,
      co2: 28,
      driverAssistanceLevel: 2,
      extra: ["hasBlindSpotAssist", "hasLumbarSupport", "hasHeatedSeats"],
    }),

  /** A thirsty class-F petrol car. */
  thirstyPetrol: () =>
    garageCar({
      id: 108,
      name: "Thirsty Petrol",
      consumption: 7.4,
      co2: 168,
      extra: ["hasBlindSpotAssist", "hasLumbarSupport", "hasHeatedSeats"],
    }),

  /** FINN sent no usable equipment list. */
  noEquipmentList: () =>
    makeCar({
      id: 109,
      name: "No Equipment List",
      fuelType: "Electric",
      consumption: 16,
      co2: 0,
      range: 500,
      features: [],
      featuresSupplied: false,
      driverAssistanceLevel: null,
    }),

  /** A petrol car FINN published no CO₂ figure for. */
  noCo2: () =>
    garageCar({
      id: 110,
      name: "No CO2",
      co2: null as unknown as number,
      extra: ["hasBlindSpotAssist"],
    }),
} satisfies Record<string, () => PinnedFinnCar>;

export const garage = (): PinnedFinnCar[] =>
  Object.values(GARAGE).map((build) => build());

/** Every category the model has, for property tests that sweep them all. */
export const ALL_CATEGORIES = Object.keys(CATEGORIES) as CategoryId[];
