import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { assessEnvironment } from "@/lib/reasoning-engine/environmental";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { EnvironmentalResult, UsageResult } from "./EnvironmentalResult";

/*
 * The drawer's CO₂ and fuel-use readings, rendered as a reader gets them:
 * the answer in words, the car against the benchmark, and — for a car whose
 * figure can't be read fairly — why not, instead of a verdict.
 */

const cars = fleet();
const first = (fuel: string) => cars.find((car) => car.fuelType === fuel && car.consumption?.combined)!;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the CO₂ reading", () => {
    it("says the answer, the figure, its class and the benchmark for a petrol car", () => {
        const car = first("Petrol");
        const co2 = assessEnvironment(car)!.co2!;
        const html = text(renderToStaticMarkup(createElement(EnvironmentalResult, { assessment: assessEnvironment(car), band: { level: "partial", label: "Partial match" } })));

        expect(html).toContain(`This car produces ${co2.gPerKm} g of CO₂ for every kilometre you drive.`);
        expect(html).toContain(`Class ${co2.className}`);
        expect(html).toContain("136 g/km");
        expect(html).toMatch(/(Below|Above|About the same as) the FINN Lens comparison point/);
        expect(html).toContain("partial match on CO₂");
    });

    it("says an electric car puts out nothing while driving", () => {
        const html = text(renderToStaticMarkup(createElement(EnvironmentalResult, { assessment: assessEnvironment(first("Electric")), band: { level: "strong", label: "Strong match" } })));

        expect(html).toContain("No CO₂ while driving");
    });

    it("warns about a plug-in hybrid's figure, and draws no bar under it", () => {
        const html = renderToStaticMarkup(createElement(EnvironmentalResult, { assessment: assessEnvironment(first("Plug-in Hybrid")), band: { level: "good", label: "Good match" } }));

        expect(text(html)).toContain("About plug-in hybrids");
        expect(text(html)).toContain("if you charge it often");
        expect(html).not.toContain("the FINN Lens comparison point</p>");
    });
});

describe("how much it uses", () => {
    it("reads a car against the benchmark for what it runs on", () => {
        for (const fuel of ["Petrol", "Electric"]) {
            const html = text(renderToStaticMarkup(createElement(UsageResult, { car: first(fuel) })));

            expect(html, fuel).toContain("This car consumes");
            expect(html, fuel).toContain("FINN Lens benchmark");
            expect(html, fuel).toContain(fuel === "Electric" ? "kWh" : "L/100");
        }
    });

    it("says why a plug-in hybrid can't be judged, instead of a verdict", () => {
        const html = text(renderToStaticMarkup(createElement(UsageResult, { car: first("Plug-in Hybrid") })));

        expect(html).toContain("Can't be graded fairly");
        expect(html).not.toContain("This car consumes");
    });
});
