import { describe, expect, it } from "vitest";

import { EU_ELECTRICITY_SOURCE, euElectricityFor } from "./eu-electricity";
import type { PinnedFinnCar } from "@/lib/types";

import { fleet } from "./test-data/fleet";

const plugIn = (model: string, co2: number, engine?: RegExp) =>
    fleet().find((car) => car.fuelType === "Plug-in Hybrid" && car.model === model && car.co2.value === co2 && (!engine || engine.test(car.engine)))!;

/** A plug-in as FINN listed it before it left the fleet: its make, names and official figures. */
const listedAs = (brand: string, model: string, engine: string, co2: number, fuel: number): PinnedFinnCar => {
    const car = fleet().find((item) => item.fuelType === "Plug-in Hybrid")!;
    return { ...car, brand, model, engine, co2: { ...car.co2, value: co2 }, consumption: { ...car.consumption, combined: fuel } };
};

describe("a plug-in hybrid's official electricity figure, from the EU's registration data", () => {
    it("matches on make, model, CO₂ and fuel figure, and gives the EU's figure", () => {
        expect(euElectricityFor(plugIn("Tucson", 62))).toMatchObject({ kWhPer100Km: 10.8, range: null });
        expect(euElectricityFor(plugIn("X5", 74))).toMatchObject({ kWhPer100Km: 20.5, range: null });
    });

    it("tells cars apart by what names them, not by generic words", () => {
        /* "xDrive" alone once paired a 330e with an X1. */
        expect(euElectricityFor(listedAs("BMW", "3er Limousine", "330e xDrive", 55, 2.4))).toBeNull();
        /* An E 300 de isn't a C 300 de; a GLA 250 e isn't a B or CLA 250 e. */
        expect(euElectricityFor(plugIn("E-Klasse", 39))?.matchedAs).toEqual(["E300DE"]);
        expect(euElectricityFor(listedAs("Mercedes-Benz", "GLA", "250 e mit EQ Hybrid Technologie", 66, 2.9))?.matchedAs).toEqual(["GLA250E"]);
    });

    it("uses the highest where FINN's figures fit versions that differ, and gives none for no match", () => {
        const glc = euElectricityFor(plugIn("GLC", 45))!;
        expect(glc.range).not.toBeNull();
        expect(glc.kWhPer100Km).toBe(glc.range![1]);

        expect(euElectricityFor(plugIn("CX-60", 86))).toBeNull();
        expect(euElectricityFor(fleet().find((car) => car.fuelType === "Petrol")!)).toBeNull();
    });

    it("records where the table came from", () => {
        expect(EU_ELECTRICITY_SOURCE).toMatchObject({
            url: "https://www.eea.europa.eu/data-and-maps/data/co2-cars-emission-18",
            regulation: "Regulation (EU) 2019/631",
            field: "Electric energy consumption (EC_AC,weighted), Wh/km",
        });
        expect(EU_ELECTRICITY_SOURCE.release).toMatch(/^co2cars_2025P/);
    });
});
