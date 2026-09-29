import { describe, expect, it } from "vitest";

import { configurationDetail, perMonth } from "./car-labels";
import { advertisedMonthlyPrice, calculateCost } from "./reasoning-engine";
import { makeCar, prefs } from "./reasoning-engine/test-fixtures";

/**
 * FINN advertises a private and a business price for every car. Whichever
 * one the reader chose is the one the bill is built on, so it has to be the
 * one every label quotes too — a private price printed above a business
 * total is two answers to one question.
 */
describe("the price a configuration is labelled with", () => {
  const car = makeCar({ id: 1, customerMonthly: 520, businessMonthly: 430 });

  it("is the private price, unmarked, for a private reader", () => {
    expect(configurationDetail(car)).toContain("from €520/mo");
    expect(configurationDetail(car)).not.toContain("business");
  });

  it("is the business price, marked as such, for a business reader", () => {
    const line = configurationDetail(car, { contractType: "business" });

    expect(line).toContain("from €430/mo · business");
    expect(line).not.toContain("520");
  });

  it("is the same price the cost engine bills", () => {
    for (const contractType of ["private", "business"] as const) {
      expect(advertisedMonthlyPrice(car, contractType)).toBe(
        calculateCost(car, prefs({ contractType })).subscription.amount,
      );
    }
  });

  it("is left out rather than quoted as €0 when FINN published none", () => {
    const unpriced = makeCar({ id: 2, businessMonthly: null });

    expect(advertisedMonthlyPrice(unpriced, "business")).toBeNull();
    expect(configurationDetail(unpriced, { contractType: "business" })).not.toContain("€");
  });

  it("only names the contract when it isn't FINN's default", () => {
    expect(perMonth("private")).toBe("/mo");
    expect(perMonth("business")).toBe("/mo · business");
  });
});
