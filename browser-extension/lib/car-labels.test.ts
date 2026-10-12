import { describe, expect, it } from "vitest";
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

  it("is the same price the cost engine bills", () => {
    for (const contractType of ["private", "business"] as const) {
      expect(advertisedMonthlyPrice(car, contractType)).toBe(
        calculateCost(car, prefs({ contractType })).subscription.amount,
      );
    }
  });
});
