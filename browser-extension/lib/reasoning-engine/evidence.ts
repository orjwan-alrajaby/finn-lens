import type { FinnCar } from "@/lib/types";
import type { CategoryId, FeatureId, SignalId } from "./types";

import { CATEGORIES, CATEGORY_IDS, DERIVED_SIGNALS, FEATURES } from "./constants";

/**
 * What FINN's data says about one piece of evidence on one car.
 *
 * Every reading is intrinsic: it depends on the car and nothing else, so no
 * other pinned car can move it. Each returns a value from 0 to 1, or `null`
 * when FINN's data doesn't answer — and `null` is never read as 0.
 */

/* -------------------------------------------------------------------------- */
/* Gates and thresholds                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Boot volume stays out of every score until FINN's figure is unambiguous.
 *
 * FINN's single `Kofferraumvolumen` entry holds the seats-up volume for some
 * cars and the seats-folded volume for others, without saying which: 68 of
 * 136 models report only folded-looking figures, and a MINI 3-door lists
 * 725 L. Scored as it stands it would call a MINI's boot bigger than a Skoda
 * Superb's. The curve below is ready; flip this only once a seats-up source
 * is verified.
 */
export const BOOT_SCORING_ENABLED = false;

/**
 * Expected equipment is on at least this share of FINN's cars. It decides
 * only whether having an item earns credit — a confirmed gap always costs —
 * and is re-checked against the fleet snapshot on every calibration run.
 */
export const BASELINE_PREVALENCE = 0.9;

/** A priority is assessed when at least this share of its counted weight is known. */
export const ASSESSED_SHARE = 0.5;

/* -------------------------------------------------------------------------- */
/* Curves                                                                     */
/* -------------------------------------------------------------------------- */

export type Anchors = readonly (readonly [number, number])[];

/** Straight lines between anchors, flat beyond the first and last. */
export function piecewise(anchors: Anchors, value: number): number {
  const first = anchors[0] as readonly [number, number];
  const last = anchors[anchors.length - 1] as readonly [number, number];

  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];

  for (let index = 1; index < anchors.length; index += 1) {
    const [x1, y1] = anchors[index - 1] as readonly [number, number];
    const [x2, y2] = anchors[index] as readonly [number, number];

    if (value <= x2) return y1 + ((y2 - y1) * (value - x1)) / (x2 - x1);
  }

  return last[1];
}

/**
 * Compact length, in millimetres. Flat at 4.0 m and shorter, so a tiny car
 * isn't rewarded for being ever tinier; nothing past 5.2 m.
 */
export const LENGTH_ANCHORS: Anchors = [
  [4000, 1],
  [4300, 0.8],
  [4600, 0.55],
  [4900, 0.3],
  [5200, 0],
];

/**
 * Narrow width, in millimetres. FINN's cars run from 1.60 m to 2.24 m, most
 * between 1.82 m and 1.90 m; flat at 1.75 m and narrower, nothing past 2.05 m.
 */
export const WIDTH_ANCHORS: Anchors = [
  [1750, 1],
  [1850, 0.7],
  [1950, 0.35],
  [2050, 0],
];

/** The braked towing rating that counts as able to pull a small caravan, in kg. */
export const TOWING_THRESHOLD_KG = 1500;

/** Boot volume with the seats up, in litres. Capped: beyond 650 L changes little. */
export const BOOT_ANCHORS: Anchors = [
  [150, 0],
  [250, 0.25],
  [350, 0.5],
  [450, 0.75],
  [550, 0.9],
  [650, 1],
];

/**
 * How much an electric car's range limits Long Distance, in WLTP km.
 *
 * Flat from 480 km: past that, what separates electric cars on a long drive is
 * charging speed, which `CHARGE_FACTOR_ANCHORS` reads. Nothing can raise a car
 * above 1.
 */
export const TRIP_FACTOR_ANCHORS: Anchors = [
  [300, 0.55],
  [350, 0.7],
  [400, 0.85],
  [480, 1],
];

export const tripFactor = (rangeKm: number): number =>
  piecewise(TRIP_FACTOR_ANCHORS, rangeKm);

/**
 * How much an electric car's DC charging time, 10 to 80%, limits Long
 * Distance, in minutes.
 *
 * Flat to 30 minutes, where most of FINN's electric cars sit (median 26):
 * a stop that fits a coffee costs nothing. Gentler than range, because a slow
 * charge makes a stop longer where a short range makes one more of them.
 * FINN's slowest lists 52 minutes.
 */
export const CHARGE_FACTOR_ANCHORS: Anchors = [
  [30, 1],
  [45, 0.85],
  [60, 0.7],
];

export const chargeFactor = (minutes: number): number =>
  piecewise(CHARGE_FACTOR_ANCHORS, minutes);

/* -------------------------------------------------------------------------- */
/* Readings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether FINN supplied an equipment list.
 *
 * FINN's data is taken as it's sent: a list that says no to everything is a
 * car with none of it, not missing data. Only an absent or empty list is
 * unknown — `featuresSupplied` on mapped cars, and for cars stored before
 * that field existed, whether a features record is there at all.
 */
export function equipmentKnown(car: FinnCar): boolean {
  if (car.featuresSupplied !== undefined) return car.featuresSupplied;

  return Object.keys(car.features ?? {}).length > 0;
}

/** "5" → 5. Null for zero, blanks and anything that isn't a whole count. */
export function parseCount(value: unknown): number | null {
  const count = Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(count) && count > 0 ? count : null;
}

/** An electric car's published WLTP range, or null for anything else. */
export function evRangeKm(car: FinnCar): number | null {
  if (car.fuelType !== "Electric") return null;

  const range = Number(car.electric?.range);

  return Number.isFinite(range) && range > 0 ? range : null;
}

/** An electric car's DC charging time, 10 to 80%, in minutes, or null. */
export function dcChargeMinutes(car: FinnCar): number | null {
  if (car.fuelType !== "Electric") return null;

  const minutes = Number(car.dcChargeMinutes);

  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/** The width FINN measured, in millimetres, or null. */
export function widthMm(car: FinnCar): number | null {
  const width = Number(car.dimensions?.width);

  return Number.isFinite(width) && width > 0 ? width : null;
}

/** The length FINN measured, in millimetres, or null. */
export function lengthMm(car: FinnCar): number | null {
  const length = Number(car.dimensions?.length);

  return Number.isFinite(length) && length > 0 ? length : null;
}

/** Seats-up boot volume, in litres — only ever read once boot scoring is on. */
export function bootLitres(car: FinnCar): number | null {
  const litres = Number.parseFloat(String(car.capacity?.trunk ?? ""));

  return Number.isFinite(litres) && litres > 0 ? litres : null;
}

const MEASURES = new Set<SignalId>(["compactLength", "compactWidth", "bootVolume"]);

/** True for yes-or-no evidence; false for a measured figure on a curve. */
export const isBinarySignal = (key: SignalId): boolean => !MEASURES.has(key);

/** True for a signal read from FINN's structured fields rather than its list. */
export const isDerivedSignal = (key: SignalId): boolean => key in DERIVED_SIGNALS;

/** Equipment entries Lens reads from a structured field FINN always states. */
const STRUCTURED_FEATURES = new Set<SignalId>(["hasAutomaticTransmission", "hasAllWheelDrive"]);

/**
 * True for evidence that is a stated fact about the car rather than an entry
 * in FINN's equipment list: a structured field says a car has a manual
 * gearbox, where a list only doesn't mention something. Readable without the
 * equipment list.
 */
export const isStatedFact = (key: SignalId): boolean =>
  isDerivedSignal(key) || STRUCTURED_FEATURES.has(key);

/**
 * Whether a signal means anything for this car at all. A heat pump is what an
 * electric car heats its cabin with; a combustion engine heats it for free, so
 * lacking one says nothing about a petrol car and it isn't counted there.
 */
export function appliesTo(key: SignalId, car: FinnCar): boolean {
  if (key === "hasHeatPump") return car.fuelType === "Electric";

  return true;
}

export function signalUtility(key: SignalId, car: FinnCar): number | null {
  switch (key) {
    case "rearDoors": {
      const doors = parseCount(car.doors);
      return doors == null ? null : doors >= 4 ? 1 : 0;
    }

    case "seatsFivePlus": {
      const seats = parseCount(car.capacity?.seats);
      return seats == null ? null : seats >= 5 ? 1 : 0;
    }

    case "towingCapacity1500": {
      const kg = Number(car.towingCapacityKg);
      return Number.isFinite(kg) && kg > 0 ? (kg >= TOWING_THRESHOLD_KG ? 1 : 0) : null;
    }

    case "compactWidth": {
      const width = widthMm(car);
      return width == null ? null : piecewise(WIDTH_ANCHORS, width);
    }

    /*
     * Read from the structured field every mapped car carries, so a car pinned
     * before these were equipment entries still answers — and a car FINN sent
     * no equipment list for still has a gearbox.
     */
    case "hasAutomaticTransmission": {
      const transmission = car.transmission as string | undefined;
      return transmission === "Automatic" ? 1 : transmission === "Manual" ? 0 : null;
    }

    case "hasAllWheelDrive": {
      if (!car.driveType || car.driveType === "Unknown") return null;
      return car.driveType === "All-Wheel Drive" ? 1 : 0;
    }

    case "seatsSixPlus": {
      const seats = parseCount(car.capacity?.seats);
      return seats == null ? null : seats >= 6 ? 1 : 0;
    }

    case "driverAssistLevel2": {
      const level = car.driverAssistanceLevel;
      return level == null ? null : level === 2 ? 1 : 0;
    }

    case "compactLength": {
      const length = lengthMm(car);
      return length == null ? null : piecewise(LENGTH_ANCHORS, length);
    }

    case "bootVolume": {
      const litres = bootLitres(car);
      return litres == null ? null : piecewise(BOOT_ANCHORS, litres);
    }

    default:
      if (!(key in FEATURES)) return null;
      if (!equipmentKnown(car)) return null;
      /* An entry FINN left empty is unknown; one it answered false is a no. */
      if (car.unansweredFeatures?.includes(key)) return null;
      /* Read by Lens since after some cars were pinned: absent there is unknown. */
      if (LATER_FEATURES.has(key) && !(key in (car.features ?? {}))) return null;

      return car.features?.[key] ? 1 : 0;
  }
}

/** Equipment entries Lens started reading after cars were already being pinned. */
const LATER_FEATURES = new Set<SignalId>(["hasWirelessAppleCarPlaySlashAndroidAuto"]);

/** A yes-or-no signal FINN's data says the car has. */
export const hasSignal = (car: FinnCar, key: SignalId): boolean =>
  signalUtility(key, car) === 1;

/* -------------------------------------------------------------------------- */
/* Where evidence lives                                                       */
/* -------------------------------------------------------------------------- */

/** The priority whose home a signal is — the only place it can be raised. */
export function homeOf(key: SignalId): CategoryId | null {
  return (
    CATEGORY_IDS.find((id) => {
      const def = CATEGORIES[id] as {
        features: readonly SignalId[];
        expected?: readonly SignalId[];
      };

      return def.features.includes(key) || Boolean(def.expected?.includes(key));
    }) ?? null
  );
}

export interface CountedItem {
  key: SignalId;
  /**
   * `home` earns credit when present; `alsoCounts` is home elsewhere and
   * counted here at standard; `expected` earns nothing when present and costs
   * when FINN confirms it's missing. `home` and `expected` can be raised.
   */
  role: "home" | "alsoCounts" | "expected";
  niche: boolean;
}

/**
 * Everything a priority counts: its home evidence, evidence counted here from
 * another home, then its expected equipment. Boot volume is left out while
 * its gate is closed.
 */
export function countedItems(category: CategoryId): CountedItem[] {
  const def = CATEGORIES[category] as {
    features: readonly SignalId[];
    niche?: readonly SignalId[];
    alsoCounts?: readonly SignalId[];
    expected?: readonly SignalId[];
  };

  const niche = new Set(def.niche ?? []);

  const home = def.features
    .filter((key) => BOOT_SCORING_ENABLED || key !== "bootVolume")
    .map((key) => ({ key, role: "home" as const, niche: niche.has(key) }));

  const also = (def.alsoCounts ?? []).map((key) => ({
    key,
    role: "alsoCounts" as const,
    niche: false,
  }));

  const expected = (def.expected ?? []).map((key) => ({
    key,
    role: "expected" as const,
    niche: false,
  }));

  return [...home, ...also, ...expected];
}

/** True when a signal counts only once raised in this priority. */
export function isNicheIn(category: CategoryId, key: SignalId): boolean {
  const niche = (CATEGORIES[category] as { niche?: readonly SignalId[] }).niche;

  return Boolean(niche?.includes(key));
}
