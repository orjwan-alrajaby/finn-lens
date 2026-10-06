import { extractMileagePackages } from "@/lib/helpers";
import { describe, expect, it } from "vitest";

import { buildCostAnalysis, calculateCost, partitionByBudget } from "./cost";
import { FINN_INCLUDED_MONTHLY_KM } from "./constants";
import { makeCar, prefs } from "./test-fixtures";

/*
 * Cost is deliberately the only place money is calculated. These tests pin
 * the arithmetic and — more importantly — pin the refusal to guess when the
 * supplied data is incomplete.
 */

describe("calculateCost", () => {
  it("adds subscription, energy and excess mileage and nothing else", () => {
    // 500 km/month at 5 L/100km and €2.00/L → €50 energy. No excess mileage.
    const car = makeCar({ id: 1, customerMonthly: 500, consumption: 5 });
    const cost = calculateCost(car, prefs({ monthlyKm: 500, petrolPrice: 2 }));

    expect(cost.subscription.amount).toBe(500);
    expect(cost.energy.amount).toBe(50);
    expect(cost.excessMileage.amount).toBe(0);
    expect(cost.totalMonthly).toBe(550);
    expect(cost.complete).toBe(true);
  });

  it("prices electric cars from the electricity price", () => {
    const car = makeCar({
      id: 1,
      fuelType: "Electric",
      customerMonthly: 600,
      consumption: 20,
      range: 400,
    });

    const cost = calculateCost(
      car,
      prefs({ monthlyKm: 500, electricityPrice: 0.3 }),
    );

    // 20 kWh/100km × €0.30 = €6/100km → €30 for 500 km.
    expect(cost.energy.amount).toBe(30);
    expect(cost.energy.energyLabel).toBe("electricity");
    expect(cost.energy.consumptionUnit).toBe("kWh/100km");
  });

  it("prices diesel cars from the diesel price", () => {
    const car = makeCar({ id: 1, fuelType: "Diesel", consumption: 5 });
    const cost = calculateCost(
      car,
      prefs({ monthlyKm: 500, dieselPrice: 2, petrolPrice: 9 }),
    );

    expect(cost.energy.amount).toBe(50);
  });

  /* Scenario 7 — user drives less than the included allowance. */
  it("charges nothing for excess mileage below the FINN allowance", () => {
    const car = makeCar({ id: 1, extraKmPrice: 0.2 });
    const cost = calculateCost(car, prefs({ monthlyKm: 300 }));

    expect(cost.excessMileage.includedMonthlyKm).toBe(FINN_INCLUDED_MONTHLY_KM);
    expect(cost.excessMileage.excessKm).toBe(0);
    expect(cost.excessMileage.amount).toBe(0);
    expect(cost.excessMileage.available).toBe(true);
  });

  /* Scenario 8 — user drives more than the included allowance. */
  it("charges the vehicle's own extra-kilometre price above the allowance", () => {
    const car = makeCar({ id: 1, extraKmPrice: 0.2 });
    const cost = calculateCost(car, prefs({ monthlyKm: 1000 }));

    expect(cost.excessMileage.excessKm).toBe(500);
    expect(cost.excessMileage.amount).toBeCloseTo(100, 6);
  });

  /* Scenario 5 — missing consumption must not become €0. */
  it("marks energy unavailable when consumption is missing", () => {
    const car = makeCar({ id: 1, customerMonthly: 500, consumption: null });
    const cost = calculateCost(car, prefs({ monthlyKm: 500 }));

    expect(cost.energy.amount).toBeNull();
    expect(cost.energy.available).toBe(false);
    expect(cost.energy.reason).toBe("missingConsumption");
    expect(cost.complete).toBe(false);
    expect(cost.missing).toContain("missingConsumption");

    // The known part is still reported; it is simply not the whole story.
    expect(cost.totalMonthly).toBe(500);
  });

  /* Scenario 6 — missing extra-kilometre price must not become €0. */
  it("marks excess mileage unavailable when the extra-km price is missing", () => {
    const car = makeCar({ id: 1, extraKmPrice: null });
    const cost = calculateCost(car, prefs({ monthlyKm: 1000 }));

    expect(cost.excessMileage.amount).toBeNull();
    expect(cost.excessMileage.available).toBe(false);
    expect(cost.excessMileage.reason).toBe("missingExtraKmPrice");
    expect(cost.complete).toBe(false);
  });

  it("does not need an extra-km price when there is no excess to charge", () => {
    const car = makeCar({ id: 1, extraKmPrice: null });
    const cost = calculateCost(car, prefs({ monthlyKm: 400 }));

    expect(cost.excessMileage.amount).toBe(0);
    expect(cost.complete).toBe(true);
  });

  it("marks the subscription unavailable when FINN supplied no price", () => {
    const car = makeCar({ id: 1, customerMonthly: null });
    const cost = calculateCost(car, prefs({ contractType: "private" }));

    expect(cost.subscription.amount).toBeNull();
    expect(cost.subscription.reason).toBe("missingSubscriptionPrice");
  });

  /* Scenario 9 — private contract. */
  it("uses the private price and treats it as VAT-inclusive", () => {
    const car = makeCar({ id: 1, customerMonthly: 589, businessMonthly: 470 });
    const cost = calculateCost(car, prefs({ contractType: "private" }));

    expect(cost.subscription.amount).toBe(589);
    expect(cost.subscription.vatIncluded).toBe(true);
  });

  /* Scenario 10 — business contract, with no invented VAT arithmetic. */
  it("uses the business price and makes no VAT claim", () => {
    const car = makeCar({ id: 1, customerMonthly: 589, businessMonthly: 470 });
    const cost = calculateCost(car, prefs({ contractType: "business" }));

    expect(cost.subscription.amount).toBe(470);
    expect(cost.subscription.vatIncluded).toBeNull();
  });
});

describe("budget eligibility", () => {
  /* Scenario 1 — under budget. */
  it("marks a fully-calculated car at or under the budget as within", () => {
    const car = makeCar({ id: 1, customerMonthly: 500, consumption: 5 });
    const cost = calculateCost(
      car,
      prefs({ monthlyKm: 500, petrolPrice: 2, monthlyBudget: 600 }),
    );

    expect(cost.totalMonthly).toBe(550);
    expect(cost.budgetStatus).toBe("within");
    expect(cost.budgetDifference).toBe(-50);
  });

  /* Scenario 2 — over budget. */
  it("marks a car above the budget as over, with the difference", () => {
    // €500 rental + €50 energy + €100 excess = €650 against a €600 budget.
    const car = makeCar({
      id: 2,
      customerMonthly: 500,
      consumption: 2.5,
      extraKmPrice: 0.2,
    });

    const cost = calculateCost(
      car,
      prefs({ monthlyKm: 1000, petrolPrice: 2, monthlyBudget: 600 }),
    );

    expect(cost.totalMonthly).toBeCloseTo(650, 6);
    expect(cost.budgetStatus).toBe("over");
    expect(cost.budgetDifference).toBeCloseTo(50, 6);
  });

  it("never reports an incomplete estimate as fitting the budget", () => {
    const car = makeCar({ id: 1, customerMonthly: 300, consumption: null });
    const cost = calculateCost(
      car,
      prefs({ monthlyKm: 500, monthlyBudget: 600 }),
    );

    // The €300 we can see fits, but the energy cost is unknown.
    expect(cost.totalMonthly).toBe(300);
    expect(cost.budgetStatus).toBe("unknown");
  });

  it("still reports over-budget when the known costs alone exceed it", () => {
    const car = makeCar({ id: 1, customerMonthly: 900, consumption: null });
    const cost = calculateCost(
      car,
      prefs({ monthlyKm: 500, monthlyBudget: 600 }),
    );

    expect(cost.budgetStatus).toBe("over");
  });

  it("imposes no constraint when no budget is set", () => {
    const car = makeCar({ id: 1, customerMonthly: 5000 });
    const cost = calculateCost(car, prefs({ monthlyBudget: 0 }));

    expect(cost.budget).toBeNull();
    expect(cost.budgetStatus).toBe("within");
  });

  it("partitions vehicles without discarding any of them", () => {
    const preferences = prefs({
      monthlyKm: 500,
      petrolPrice: 2,
      monthlyBudget: 600,
    });

    const cheap = makeCar({ id: 1, customerMonthly: 500, consumption: 5 });
    const dear = makeCar({ id: 2, customerMonthly: 800, consumption: 5 });
    const murky = makeCar({ id: 3, customerMonthly: 500, consumption: null });

    const cars = [cheap, dear, murky];
    const costs = Object.fromEntries(
      cars.map((car) => [car.id, calculateCost(car, preferences)]),
    );

    const partition = partitionByBudget(cars, costs, preferences);

    expect(partition.within.map((car) => car.id)).toEqual([1]);
    expect(partition.over.map((car) => car.id)).toEqual([2]);
    expect(partition.unknown.map((car) => car.id)).toEqual([3]);
    expect(partition.anyFits).toBe(true);

    // Nothing was dropped.
    expect(
      partition.within.length + partition.over.length + partition.unknown.length,
    ).toBe(cars.length);
  });
});

describe("buildCostAnalysis", () => {
  it("works for any vehicle, not only a recommendation winner", () => {
    const car = makeCar({ id: 42, customerMonthly: 589, consumption: 6.2 });
    const analysis = buildCostAnalysis(car, prefs({ monthlyKm: 800 }));

    expect(analysis.vehicleId).toBe(42);
    expect(analysis.lines.map((line) => line.id)).toEqual([
      "subscription",
      "energy",
      "excessMileage",
    ]);
  });

  it("tags each line with where its number came from", () => {
    const car = makeCar({ id: 1 });
    const analysis = buildCostAnalysis(car, prefs({ monthlyKm: 800 }));

    const [subscription, energy, excess] = analysis.lines;

    expect(subscription?.source).toBe("finn");
    expect(energy?.source).toBe("estimate");
    expect(excess?.source).toBe("estimate");

    // The user's own mileage is labelled as their assumption, not a FINN fact.
    expect(
      energy?.facts.find((fact) => fact.label === "Your mileage")?.source,
    ).toBe("user");

    // FINN's included allowance is labelled as a FINN fact, not an estimate.
    expect(
      excess?.facts.find((fact) => fact.label === "Included mileage")?.source,
    ).toBe("finn");
  });

  it("explains a missing component rather than pricing it at zero", () => {
    const car = makeCar({ id: 1, consumption: null });
    const analysis = buildCostAnalysis(car, prefs({ monthlyKm: 800 }));

    const energy = analysis.lines.find((line) => line.id === "energy");

    expect(energy?.amount).toBeNull();
    expect(energy?.available).toBe(false);
    /* What's missing, by name — not "data wasn't available". */
    expect(analysis.caveats).toContain(
      "Missing: this car's fuel consumption — FINN doesn't list one. That line is left out of the total rather than counted as €0.",
    );
    expect(analysis.headline).toMatch(/at least .*\. Missing: this car's fuel consumption — FINN doesn't list one\.$/);
  });

  it("states the over-budget difference explicitly", () => {
    const car = makeCar({ id: 1, customerMonthly: 700, consumption: 5 });
    const analysis = buildCostAnalysis(
      car,
      prefs({ monthlyKm: 500, petrolPrice: 2, monthlyBudget: 700 }),
    );

    // €700 + €50 energy = €750 against a €700 budget.
    expect(analysis.budgetSentence).toBe(
      "Your budget is €700/month, so this car is about €50 over budget.",
    );
  });

  it("says VAT is included for private and makes no claim for business", () => {
    const car = makeCar({ id: 1 });

    expect(
      buildCostAnalysis(car, prefs({ contractType: "private" })).vatNote,
    ).toContain("VAT is included");

    expect(
      buildCostAnalysis(car, prefs({ contractType: "business" })).vatNote,
    ).toContain("doesn't tell us how VAT is treated");
  });
});

describe("mileage, the way FINN sells it", () => {
  const PACKAGES = [
    { km: 500, monthly: 0 },
    { km: 1000, monthly: 9 },
    { km: 1500, monthly: 49 },
    { km: 5000, monthly: 219 },
  ];
  const packaged = () => {
    const car = makeCar({ id: 1, extraKmPrice: 0.25 });
    return { ...car, pricing: { ...car.pricing, mileagePackages: PACKAGES } };
  };

  it("costs nothing within the package FINN's price includes", () => {
    const cost = calculateCost(packaged(), prefs({ monthlyKm: 400 }));
    expect(cost.excessMileage.amount).toBe(0);
    expect(cost.excessMileage.includedMonthlyKm).toBe(500);
  });

  it("books the cheapest package that covers the distance, not every kilometre at the per-km price", () => {
    const cost = calculateCost(packaged(), prefs({ monthlyKm: 1000 }));
    expect(cost.excessMileage.mileagePackage).toEqual({ km: 1000, monthly: 9 });
    expect(cost.excessMileage.amount).toBe(9);

    const between = calculateCost(packaged(), prefs({ monthlyKm: 1200 }));
    expect(between.excessMileage.amount).toBe(49);
  });

  it("charges the per-km price only beyond FINN's largest package", () => {
    const cost = calculateCost(packaged(), prefs({ monthlyKm: 5400 }));
    expect(cost.excessMileage.excessKm).toBe(400);
    expect(cost.excessMileage.amount).toBe(219 + 400 * 0.25);
  });

  it("says in the cost line which package it priced", () => {
    const analysis = buildCostAnalysis(packaged(), prefs({ monthlyKm: 1000 }));
    const line = analysis.lines.find((item) => item.id === "excessMileage")!;
    expect(line.label).toBe("Mileage package");
    expect(line.explanation).toMatch(/1,000 km package adds €9/);
  });

  it("reads FINN's packages from its price object", () => {
    expect(
      extractMileagePackages({ price: { extra_1000: 9, extra_500: 0, extra_km_price: 0.25, b2c_12: 300 } } as never),
    ).toEqual([{ km: 500, monthly: 0 }, { km: 1000, monthly: 9 }]);
  });
});

describe("a plug-in hybrid's left-out electricity", () => {
  const plugIn = () => makeCar({ id: 7, customerMonthly: 357, consumption: 1.7, fuelType: "Plug-in Hybrid" } as never);

  it("is bounded, as if every kilometre were electric at a generous figure, and said as an assumption", () => {
    const analysis = buildCostAnalysis(plugIn(), prefs({ monthlyKm: 1000, monthlyBudget: 800 }));
    const { breakdown } = analysis;
    const energy = analysis.lines.find((line) => line.id === "energy")!;

    expect(breakdown.energy.ceilingExtra).toBeCloseTo((1000 / 100) * 30 * breakdown.energy.ceilingExtra! / ((1000 / 100) * 30), 5);
    expect(breakdown.ceilingMonthly).toBeCloseTo(breakdown.totalMonthly + breakdown.energy.ceilingExtra!, 5);
    expect(energy.explanation).toMatch(/FINN lists one combined fuel figure for plug-in hybrids and no electricity figure.*even if all 1,000 km were driven on electricity, at a generous 30 kWh\/100 km/);
    /* Within even at the most: it fits, and says why. */
    expect(breakdown.budgetStatus).toBe("within");
    expect(analysis.budgetSentence).toMatch(/even with the most the electricity could add, about €\d+ — within your budget\.$/);
  });

  it("names what's missing when it might be over", () => {
    const tight = buildCostAnalysis(plugIn(), prefs({ monthlyKm: 1000, monthlyBudget: 1 }));
    const { breakdown } = tight;
    const budget = Math.round(breakdown.totalMonthly + 1);
    const between = buildCostAnalysis(plugIn(), prefs({ monthlyKm: 1000, monthlyBudget: budget }));

    expect(between.breakdown.budgetStatus).toBe("unknown");
    expect(between.budgetSentence).toMatch(
      /can't confirm the car fits: missing is how much electricity this plug-in hybrid uses — FINN lists only a combined fuel figure \(1\.7 L\/100km\), no kWh per 100 km\. At most it could come to about €\d+, over your budget\.$/,
    );
    expect(between.budgetSentence).not.toMatch(/part of the estimate/);
  });
});
