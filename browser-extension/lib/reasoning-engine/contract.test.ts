import { describe, expect, it } from "vitest";

import type { ContractTerm, FinnApiConfig, PinnedFinnCar } from "@/lib/types";
import { extractAvailability, extractContract, extractPricing } from "@/lib/helpers";

import { buildAdviceNarrative, buildRecommendation } from "./index";
import { calculateCost, buildCostAnalysis } from "./cost";
import { fitContract, monthsInclusive, nearestPeriod } from "./contract";
import { makeCar, prefs } from "./test-fixtures";
import type { CategoryId } from "./types";

/*
 * Renting for a period: FINN's fixed terms, the no-down-payment price, and
 * delivery in the start month — as a hard eligibility rule beside the budget.
 */

const term = (months: number, overrides: Partial<ContractTerm> = {}): ContractTerm => ({
    months,
    privateMonthly: 600 - months * 5,
    businessMonthly: 500 - months * 5,
    deliveryFrom: "2026-09-25",
    deliveryTo: "2026-12-31",
    deviationWeeks: 1,
    ...overrides,
});

const withTerms = (car: PinnedFinnCar, terms: ContractTerm[], defaultMonths: number | null = null): PinnedFinnCar => ({
    ...car,
    contract: { terms, defaultMonths },
});

/** October 2026 to May 2027: eight months. */
const OCT_TO_MAY = prefs({ rentalFrom: "2026-10", rentalTo: "2027-05" });

describe("reading FINN's terms", () => {
    /* Shaped like FINN's real response for an MG3: see finn_raw_data. */
    const raw = {
        available_terms: [12, 18, 24],
        default_term: 24,
        default_downpayment_term: 12,
        price: {
            b2c_6: 449, b2b_6: 378,
            b2c_12: 324, b2b_12: 273,
            b2c_18: 309, b2b_18: 260,
            b2c_24: 296.5, b2b_24: 250,
            available_price_list: { b2c_12: 324 },
        },
        downpayment_prices: {
            msrp: 20140,
            available_price_list: { b2c_12: 199, b2b_12: 168 },
            extra_km_price: 0.25,
        },
        availability_by_term: {
            "12": { available_from: "2026-09-25T00:00:00.000Z", available_to: "2026-10-25T00:00:00.000Z", deviation_in_weeks: 2 },
            "24": { available_from: "2026-09-25T00:00:00.000Z", available_to: "2026-12-31T00:00:00.000Z", deviation_in_weeks: 2 },
        },
    } as unknown as FinnApiConfig;

    it("keeps only the terms on offer, at the price with nothing upfront", () => {
        const offer = extractContract(raw);

        expect(offer.terms.map((item) => item.months)).toEqual([12, 18, 24]);
        expect(offer.terms[0]).toEqual({
            months: 12,
            privateMonthly: 324,
            businessMonthly: 273,
            deliveryFrom: "2026-09-25",
            deliveryTo: "2026-10-25",
            deviationWeeks: 2,
        });
        expect(offer.terms[1]?.deliveryFrom).toBeNull();
        expect(offer.defaultMonths).toBe(24);
    });

    it("quotes FINN's default term without the down payment", () => {
        const pricing = extractPricing(raw);

        /* Not the €199 that assumes €1,500 paid upfront. */
        expect(pricing.customerMonthly.price).toBe(296.5);
        expect(pricing.businessMonthly.price).toBe(250);
    });

    it("gives the delivery window of the term it prices, not the down-payment default", () => {
        const availability = extractAvailability(raw);

        expect(availability.termInMonths).toBe(24);
        expect(availability.to).toBe("2026-12-31T00:00:00.000Z");
    });

    /* FINN's Mercedes CLA electric, 41675, on an early-booking offer. */
    it("quotes an early-booking discount, not the price before it", () => {
        const offer = extractContract({
            available_terms: [12],
            default_term: 12,
            price: {
                b2b_12: 777, b2c_12: 924,
                available_price_list: { b2b_12: 769, b2c_12: 914, b2c_12_old: 924 },
            },
            availability_by_term: {},
        } as unknown as FinnApiConfig);

        expect(offer.terms[0]).toMatchObject({ privateMonthly: 914, businessMonthly: 769 });
    });
});

describe("fitContract", () => {
    const car = makeCar({ id: 1 });

    it("counts both months of the period", () => {
        expect(monthsInclusive("2026-10", "2027-05")).toBe(8);
    });

    it("takes the shortest term that covers the period, and says how much longer it runs", () => {
        const fit = fitContract(withTerms(car, [term(6), term(12), term(24)]), OCT_TO_MAY);

        expect(fit.status).toBe("fits");
        expect(fit.term?.months).toBe(12);
        expect(fit.extraMonths).toBe(4);
    });

    it("doesn't fit when no term is long enough", () => {
        const fit = fitContract(withTerms(car, [term(6)]), OCT_TO_MAY);

        expect(fit.status).toBe("doesNotFit");
        expect(fit.problems).toContain("noTermCovers");
        expect(fit.term?.months).toBe(6);
    });

    it("doesn't fit when the car can't arrive in the start month", () => {
        const fit = fitContract(
            withTerms(car, [term(12, { deliveryFrom: "2026-11-02", deliveryTo: "2026-12-02" })]),
            OCT_TO_MAY,
        );

        expect(fit.status).toBe("doesNotFit");
        expect(fit.problems).toEqual(["deliveredTooLate"]);
    });

    it("can't confirm a start after FINN's current delivery window", () => {
        const fit = fitContract(
            withTerms(car, [term(12, { deliveryTo: "2026-09-30" })]),
            OCT_TO_MAY,
        );

        expect(fit.status).toBe("unknown");
        expect(fit.problems).toEqual(["notBookableYet"]);
    });

    it("reads each term's own delivery window", () => {
        /* Twelve months delivers only until late September; 24 until December. */
        const fit = fitContract(
            withTerms(car, [
                term(12, { deliveryTo: "2026-09-28" }),
                term(24),
            ]),
            prefs({ rentalFrom: "2026-10", rentalTo: "2028-09" }),
        );

        expect(fit.term?.months).toBe(24);
        expect(fit.status).toBe("fits");
    });

    it("is unknown for a car stored without terms, and not set without a period", () => {
        expect(fitContract(car, OCT_TO_MAY).status).toBe("unknown");
        expect(fitContract(car, prefs()).status).toBe("notSet");
    });
});

describe("costing a period", () => {
    it("prices the subscription on the fitted term and says what it commits to", () => {
        const car = withTerms(makeCar({ id: 1, customerMonthly: 999 }), [
            term(6, { privateMonthly: 700 }),
            term(12, { privateMonthly: 450 }),
        ]);

        const cost = calculateCost(car, OCT_TO_MAY);
        expect(cost.subscription.amount).toBe(450);

        const analysis = buildCostAnalysis(car, OCT_TO_MAY, cost);
        expect(analysis.caveats.join(" ")).toMatch(/12 months.*September 2027.*4 months past/);
    });

    it("keeps a stored car's own price when it has no terms", () => {
        expect(calculateCost(makeCar({ id: 1, customerMonthly: 480 }), OCT_TO_MAY).subscription.amount).toBe(480);
    });
});

describe("the rental period as a hard rule", () => {
    const order: CategoryId[] = ["safetyAssistance", "comfort", "practicality"];

    /* Better on every priority, but only rents for six months. */
    const strongShort = withTerms(
        makeCar({
            id: 1,
            name: "Strong Short",
            features: ["hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasMatrixLedHeadlights", "hasKeylessEntryAndStart"],
        }),
        [term(6)],
    );

    const plainLong = withTerms(makeCar({ id: 2, name: "Plain Long" }), [term(6), term(12)]);

    it("doesn't let a car that can't cover the period beat one that can, and says why", () => {
        const result = buildRecommendation([strongShort, plainLong], order, OCT_TO_MAY)!;

        expect(result.topScorer.id).toBe(1);
        expect(result.winner.id).toBe(2);
        expect(result.rentalFallback).toBeNull();

        const narrative = buildAdviceNarrative(result.evaluation, result.context, result.alternatives);

        expect(narrative.verdict.budgetNote).toBe(
            "Strong Short scores higher overall, but it only offers terms up to 6 months, which doesn't cover October 2026 to May 2027 — so Plain Long is the strongest car here that fits October 2026 to May 2027.",
        );
    });

    it("recommends the best match anyway when nothing fits, and flags it", () => {
        const alsoShort = withTerms(makeCar({ id: 3, name: "Also Short" }), [term(6)]);
        const result = buildRecommendation([strongShort, alsoShort], order, OCT_TO_MAY)!;

        expect(result.winner.id).toBe(1);
        expect(result.rentalFallback).toBe("noneFit");
    });

    it("changes nothing when no period is set", () => {
        const result = buildRecommendation([strongShort, plainLong], order, prefs())!;

        expect(result.winner.id).toBe(1);
        expect(result.rentalFallback).toBeNull();
    });

    it("weighs the period before the budget", () => {
        const budget = prefs({ ...OCT_TO_MAY, monthlyBudget: 300, monthlyKm: 0 });
        const cheapShort = withTerms(makeCar({ id: 4, name: "Cheap Short" }), [term(6, { privateMonthly: 200 })]);
        const dearLong = withTerms(makeCar({ id: 5, name: "Dear Long" }), [term(12, { privateMonthly: 900 })]);

        expect(buildRecommendation([cheapShort, dearLong], order, budget)!.winner.id).toBe(5);
    });

    it("flags a winner over budget even when the only car within it can't be rented for the dates", () => {
        const budget = prefs({ ...OCT_TO_MAY, monthlyBudget: 300, monthlyKm: 0 });
        const cheapShort = withTerms(makeCar({ id: 4, name: "Cheap Short" }), [term(6, { privateMonthly: 200 })]);
        const dearLong = withTerms(makeCar({ id: 5, name: "Dear Long" }), [term(12, { privateMonthly: 900 })]);
        const result = buildRecommendation([cheapShort, dearLong], order, budget)!;

        expect(result.isFallback).toBe(true);
        expect(result.fallbackReason).toBe("allOverBudget");

        const narrative = buildAdviceNarrative(result.evaluation, result.context, result.alternatives);

        expect(narrative.verdict.headline).not.toMatch(/isn't already over|also fits/);
        /* Cheaper, but no one could take it on these dates: not the yardstick for what this one costs. */
        expect(narrative.tradeoffs.map((item) => item.headline).join(" ")).not.toContain("Cheap Short");
    });

    it("names both problems when the top scorer is over budget and can't cover the dates", () => {
        const budget = prefs({ ...OCT_TO_MAY, monthlyBudget: 700, monthlyKm: 0 });
        const dearShort = withTerms({ ...strongShort, id: 6, name: "Dear Short" }, [term(6, { privateMonthly: 1200 })]);
        const fairLong = withTerms(makeCar({ id: 7, name: "Fair Long" }), [term(12, { privateMonthly: 400 })]);
        const result = buildRecommendation([dearShort, fairLong], order, budget)!;
        const note = buildAdviceNarrative(result.evaluation, result.context, result.alternatives).verdict.budgetNote!;

        expect(result.winner.id).toBe(7);
        expect(note).toMatch(/over your €700 limit, and it only offers terms up to 6 months/);
        expect(note).toMatch(/Fair Long is the strongest car here that fits both\.$/);
    });
});

describe("the nearest dates a car here can be had for", () => {
    /* Delivered in November only, on 12- and 24-month terms. */
    const november = (id: number) => withTerms(makeCar({ id }), [12, 24].map((months) => term(months, { deliveryFrom: "2026-11-01", deliveryTo: "2026-11-30", deviationWeeks: 0 })));

    it("keeps the start and ends sooner when the period is longer than any term", () => {
        const cars = [november(1), november(2)];

        expect(nearestPeriod(cars, prefs({ rentalFrom: "2026-11", rentalTo: "2029-10" }))).toEqual({ from: "2026-11", to: "2028-10", months: 24, ids: [1, 2], startMoved: 0 });
    });

    it("moves as few months as it can: starting earlier and keeping the end beats moving the whole year", () => {
        expect(nearestPeriod([november(1)], prefs({ rentalFrom: "2027-01", rentalTo: "2027-12" }))).toMatchObject({ from: "2026-11", to: "2027-12", months: 14, startMoved: -2 });
    });

    it("says nothing without a period, or when no car's terms come within reach", () => {
        expect(nearestPeriod([november(1)], prefs({}))).toBeNull();
        expect(nearestPeriod([withTerms(makeCar({ id: 1 }), [])], prefs({ rentalFrom: "2026-11", rentalTo: "2027-10" }))).toBeNull();
    });
});
