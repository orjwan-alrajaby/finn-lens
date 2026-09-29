import { describe, expect, it } from "vitest";

import {
  extractDcChargeMinutes,
  extractDriverAssistanceLevel,
  extractFeatures,
  extractTowingCapacityKg,
  extractTyres,
  extractUnansweredFeatures,
} from "./helpers";
import type { FinnApiConfig } from "./types";
import { fleet } from "./reasoning-engine/test-data/fleet";

const config = (list: Record<string, unknown>, extra: object = {}): FinnApiConfig =>
  ({ closed_features_list: list, has_hitch: "false", ...extra } as unknown as FinnApiConfig);

describe("reading FINN's equipment entries", () => {
  it("counts keyless entry and start however FINN lists it", () => {
    expect(extractFeatures(config({ "Keyless Entry & Start": true })).hasKeylessEntryAndStart).toBe(true);
    expect(
      extractFeatures(config({ "Keyless Entry": true, "Keyless Start": true })).hasKeylessEntryAndStart,
    ).toBe(true);
    expect(extractFeatures(config({ "Keyless Entry": true })).hasKeylessEntryAndStart).toBe(false);
  });

  it("reads only a literal yes as having a feature", () => {
    expect(extractFeatures(config({ Sitzheizung: "Ja" })).hasHeatedSeats).toBe(false);
    expect(extractFeatures(config({ Sitzheizung: true })).hasHeatedSeats).toBe(true);
  });

  it("reads the driver assistance level, and nothing else, as a level", () => {
    expect(extractDriverAssistanceLevel(config({ Fahrerassistenz: "Level 2" }))).toBe(2);
    expect(extractDriverAssistanceLevel(config({ Fahrerassistenz: "Level 1" }))).toBe(1);
    expect(extractDriverAssistanceLevel(config({ Fahrerassistenz: "Level 3" }))).toBeNull();
    expect(extractDriverAssistanceLevel(config({}))).toBeNull();
  });

  it("reads FINN's \"Ja (Kabellos)\" as wireless CarPlay, and false as none", () => {
    const key = "Apple CarPlay / Android Auto (Wireless)";

    expect(extractFeatures(config({ [key]: "Ja (Kabellos)" })).hasWirelessAppleCarPlaySlashAndroidAuto).toBe(true);
    expect(extractFeatures(config({ [key]: false })).hasWirelessAppleCarPlaySlashAndroidAuto).toBe(false);
    expect(extractUnansweredFeatures(config({ Sitzheizung: true }))).toContain("hasWirelessAppleCarPlaySlashAndroidAuto");
  });

  it("reads the gearbox and drive type from FINN's structured fields", () => {
    const automatic = extractFeatures(config({}, { gearshift: "Automatik", config_drive: "Allrad" }));
    const manual = extractFeatures(config({}, { gearshift: "Manuell", config_drive: "Frontantrieb" }));

    expect([automatic.hasAutomaticTransmission, automatic.hasAllWheelDrive]).toEqual([true, true]);
    expect([manual.hasAutomaticTransmission, manual.hasAllWheelDrive]).toEqual([false, false]);
    expect(extractUnansweredFeatures(config({ Sitzheizung: true }))).toEqual(
      expect.arrayContaining(["hasAutomaticTransmission", "hasAllWheelDrive"]),
    );
  });

  it("reads the towing rating in kilograms", () => {
    expect(extractTowingCapacityKg(config({ Anhängerlast: "1800 kg" }))).toBe(1800);
    expect(extractTowingCapacityKg(config({ Anhängerlast: "1.300 kg" }))).toBe(1300);
    expect(extractTowingCapacityKg(config({}))).toBeNull();
  });

  it("reads the tyre setup, and nothing else, as one", () => {
    expect(extractTyres(config({}, { tires: "all_season" }))).toBe("allSeason");
    expect(extractTyres(config({}, { tires: "summer_winter" }))).toBe("summerAndWinter");
    expect(extractTyres(config({}, { tires: "winter" }))).toBeNull();
    expect(extractTyres(config({}))).toBeNull();
  });

  it("reads DC charging time in minutes", () => {
    expect(extractDcChargeMinutes(config({ "Ladezeit DC (10–80%)": "26 Min." }))).toBe(26);
    expect(extractDcChargeMinutes(config({ "Ladezeit DC (10–80%)": "0 Min." }))).toBeNull();
    expect(extractDcChargeMinutes(config({}))).toBeNull();
  });
});

/*
 * The snapshot is FINN's own inventory, so these pin the mapper to what the
 * scoring model's Phase 0 review measured on it. A new snapshot that moves
 * them is a reason to re-read that review, not to loosen the numbers.
 */
describe("the mapper over FINN's inventory snapshot", () => {
  const cars = fleet();

  it("maps every car in the snapshot", () => {
    expect(cars.length).toBeGreaterThan(500);
  });

  /* FINN sends a list for every car in the snapshot, and each list is taken as sent. */
  it("reads every car's equipment list as supplied, including all-false ones", () => {
    expect(cars.every((car) => car.featuresSupplied)).toBe(true);
    /* The gearbox and drive type are stated fields, not entries in the list. */
    const listed = (car: (typeof cars)[number]) =>
      Object.entries(car.features)
        .filter(([key]) => key !== "hasAutomaticTransmission" && key !== "hasAllWheelDrive")
        .map(([, value]) => value);

    expect(cars.some((car) => !listed(car).some(Boolean))).toBe(true);
  });

  it("gives every car a length", () => {
    expect(cars.every((car) => car.dimensions.length > 3000)).toBe(true);
  });

  it("gives every electric car a range, and no other car one", () => {
    for (const car of cars) {
      if (car.fuelType === "Electric") {
        expect(Number(car.electric?.range)).toBeGreaterThan(0);
      } else {
        expect(car.electric).toBeNull();
      }
    }
  });

  it("reads a driver assistance level for most cars, and unknown for the rest", () => {
    const levels = cars.map((car) => car.driverAssistanceLevel);

    expect(levels.filter((level) => level === 2).length).toBeGreaterThan(cars.length / 2);
    expect(levels.filter((level) => level == null).length).toBeLessThan(cars.length * 0.15);
  });

  it("reads charging time only for electric cars", () => {
    for (const car of cars) {
      if (car.fuelType !== "Electric") expect(car.dcChargeMinutes).toBeNull();
    }
    expect(cars.filter((car) => car.dcChargeMinutes != null).length).toBeGreaterThan(0);
  });

  it("recognises every powertrain FINN sends", () => {
    expect(cars.every((car) => car.fuelType)).toBe(true);
    expect(cars.some((car) => car.fuelType === "Plug-in Hybrid")).toBe(true);
  });
});
