import { describe, expect, it } from "vitest";

import {
  ALTERNATIVE_COUNT,
  alternativeOptions,
  buildReasoningContext,
  buildRecommendation,
  evaluateChallenger,
  migratePreferences,
  selectAlternatives,
} from "./index";
import { buildAdviceNarrative, reasonAboutChallenge } from "./narrative";
import type { CategoryId, FeatureId, FeatureSelection } from "./types";
import { LOAD_VOLUME } from "./narrative/facts";
import {
  CATEGORIES,
  CATEGORY_IDS,
  DEFAULT_CATEGORY_FEATURES,
  DEFAULT_PREFERENCES,
  DEFAULT_PRIORITIES,
  DEFAULT_PROFILES,
} from "./constants";
import { BASELINE } from "./test-garage";
import { makeCar, prefs } from "./test-fixtures";

const SAFETY_FIRST: CategoryId[] = ["safetyAssistance", "practicality"];

const features = (
  overrides: Partial<Record<CategoryId, FeatureSelection>> = {},
): Record<CategoryId, FeatureSelection> => ({
  ...DEFAULT_CATEGORY_FEATURES,
  ...overrides,
});

describe("affordability is gone from the priority system", () => {
  it("is no longer a category", () => {
    expect(CATEGORY_IDS).not.toContain("affordability");
  });

  it("is not in the default priority order", () => {
    expect(DEFAULT_PRIORITIES).not.toContain("affordability");
  });

  it("is not in any shipped profile", () => {
    for (const profile of DEFAULT_PROFILES) {
      expect(profile.priorities).not.toContain("affordability");
    }
  });

  it("leaves every profile with a usable number of priorities", () => {
    for (const profile of DEFAULT_PROFILES) {
      expect(profile.priorities.length).toBeGreaterThanOrEqual(3);
      expect(profile.priorities.length).toBeLessThanOrEqual(5);
    }
  });

  it("does not let price influence a score in either direction", () => {
    // Two identical cars at wildly different prices must score identically.
    const cheap = makeCar({ id: 1, customerMonthly: 200, trunk: 400 });
    const dear = makeCar({ id: 2, customerMonthly: 2000, trunk: 400 });

    const context = buildReasoningContext(
      [cheap, dear],
      SAFETY_FIRST,
      prefs({ monthlyBudget: 0 }),
    );

    const [first, second] = context.scores;
    expect(first?.total).toBe(second?.total);
  });
});

describe("buildRecommendation", () => {
  const preferences = prefs({
    monthlyKm: 500,
    petrolPrice: 2,
    monthlyBudget: 600,
  });

  /* Scenario 3 — the cheapest car is not automatically the winner. */
  it("lets a pricier in-budget car win on the user's top priority", () => {
    // Both fit the €600 budget; B is dearer but far stronger on safety.
    const cheapWeakSafety = makeCar({
      id: 1,
      name: "Alpha One",
      customerMonthly: 400,
      consumption: 5,
      trunk: 520,
      features: ["hasEmergencyBrakingAssist", "hasLaneKeepingAssist"],
    });

    const dearStrongSafety = makeCar({
      id: 2,
      name: "Beta Two",
      customerMonthly: 540,
      consumption: 5,
      trunk: 390,
      features: [
        "hasEmergencyBrakingAssist",
        "hasLaneKeepingAssist",
        "hasBlindSpotAssist",
        "hasEmergencyCallSystem",
        "hasTirePressureMonitoringSystem",
        "hasTrafficSignRecognition",
      ],
    });

    const result = buildRecommendation(
      [cheapWeakSafety, dearStrongSafety],
      SAFETY_FIRST,
      preferences,
      features(),
    );

    expect(result).not.toBeNull();
    expect(result?.winner.id).toBe(2);
    expect(result?.isFallback).toBe(false);

    // And the win is backed by concrete numbers, not a vague assertion.
    const safety = result?.evaluation.priorities.find(
      (item) => item.priority === "safetyAssistance",
    );

    expect(safety?.rank).toBe(1);

    /*
     * The winner is explained on its own merits rather than against a
     * runner-up, so the evidence is what the user asked for and got.
     */
    expect(safety?.matched).toContain("hasBlindSpotAssist");
    expect(safety?.isLeader).toBe(true);

    /* And the car it's ahead of is only introduced deliberately. */
    const challenger = evaluateChallenger(cheapWeakSafety, result!);

    expect(
      challenger.comparison?.biggestConcession?.versus?.onlyOtherHas,
    ).toContain("hasBlindSpotAssist");
  });

  it("does not let an over-budget car beat an in-budget one", () => {
    // The over-budget car is stronger on every priority, and still loses.
    const affordable = makeCar({
      id: 1,
      customerMonthly: 400,
      consumption: 5,
      features: ["hasEmergencyBrakingAssist"],
    });

    const unaffordable = makeCar({
      id: 2,
      customerMonthly: 900,
      consumption: 5,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
        "hasEmergencyCallSystem",
      ],
    });

    const result = buildRecommendation(
      [affordable, unaffordable],
      SAFETY_FIRST,
      preferences,
      features(),
    );

    expect(result?.winner.id).toBe(1);

    // The stronger car scores higher — it simply isn't eligible to win.
    const scores = result?.scores ?? [];
    const strongerTotal = scores.find((s) => s.vehicleId === 2)?.total ?? 0;
    const winnerTotal = scores.find((s) => s.vehicleId === 1)?.total ?? 0;
    expect(strongerTotal).toBeGreaterThan(winnerTotal);
  });

  /* Over-budget cars must stay inspectable, never hidden. */
  it("keeps over-budget cars in the ranking", () => {
    const affordable = makeCar({ id: 1, customerMonthly: 400, consumption: 5 });
    const unaffordable = makeCar({ id: 2, customerMonthly: 900, consumption: 5 });

    const result = buildRecommendation(
      [affordable, unaffordable],
      SAFETY_FIRST,
      preferences,
      features(),
    );

    expect(result?.ranked.map((car) => car.id).sort()).toEqual([1, 2]);
    expect(result?.budget.over.map((car) => car.id)).toEqual([2]);
    expect(result?.context.costs[2]?.budgetStatus).toBe("over");
  });

  /* Scenario 4 — nothing fits the budget. */
  it("falls back to the strongest priority match and marks it over budget", () => {
    const weaker = makeCar({
      id: 1,
      customerMonthly: 800,
      consumption: 5,
      features: ["hasEmergencyBrakingAssist"],
    });

    const stronger = makeCar({
      id: 2,
      customerMonthly: 900,
      consumption: 5,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
        "hasEmergencyCallSystem",
      ],
    });

    const result = buildRecommendation(
      [weaker, stronger],
      SAFETY_FIRST,
      preferences,
      features(),
    );

    // A recommendation is still produced, rather than nothing at all.
    expect(result).not.toBeNull();
    expect(result?.winner.id).toBe(2);

    // But it is unambiguously flagged as not fitting the budget.
    expect(result?.isFallback).toBe(true);
    expect(result?.fallbackReason).toBe("allOverBudget");
    expect(result?.budget.anyFits).toBe(false);

    const cost = result?.context.costs[2];
    expect(cost?.budgetStatus).toBe("over");
    expect(cost?.budgetDifference).toBeGreaterThan(0);

    // €900 + €50 energy = €950 against a €600 budget.
    expect(cost?.totalMonthly).toBeCloseTo(950, 6);
    expect(cost?.budgetDifference).toBeCloseTo(350, 6);
  });

  /*
   * The shipped defaults must not decide anything on the reader's behalf.
   *
   * Lens used to ship a €300 budget as a placeholder. Because the budget is
   * the product's one hard constraint and FINN subscriptions routinely cost
   * more than that, a reader who had never opened the driving settings had
   * their first recommendation overridden — and the page then reported the
   * €300 back to them as their own budget. This is the regression.
   */
  it("recommends normally on the defaults a fresh install ships with", () => {
    const cheaper = makeCar({
      id: 1,
      customerMonthly: 520,
      consumption: 5,
      features: ["hasEmergencyBrakingAssist"],
    });

    const stronger = makeCar({
      id: 2,
      customerMonthly: 890,
      consumption: 5,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
        "hasEmergencyCallSystem",
      ],
    });

    const result = buildRecommendation(
      [cheaper, stronger],
      SAFETY_FIRST,
      { ...DEFAULT_PREFERENCES },
      features(),
    );

    /* The better match wins on its merits, at any price. */
    expect(result?.winner.id).toBe(2);
    expect(result?.isFallback).toBe(false);
    expect(result?.fallbackReason).toBeNull();
    expect(result?.budgetChangedTheAnswer).toBe(false);

    /* And no limit is claimed anywhere downstream. */
    expect(result?.budget.budget).toBeNull();
    expect(result?.budget.over).toHaveLength(0);
    expect(result?.context.costs[2]?.budgetDifference).toBeNull();
    expect(result?.evaluation.cost.budgetSentence).toBeNull();
  });

  it("still applies the budget once the reader actually sets one", () => {
    const affordable = makeCar({ id: 1, customerMonthly: 300, consumption: 5 });
    const dear = makeCar({
      id: 2,
      customerMonthly: 900,
      consumption: 5,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
      ],
    });

    const result = buildRecommendation(
      [affordable, dear],
      SAFETY_FIRST,
      { ...DEFAULT_PREFERENCES, monthlyBudget: 500, monthlyKm: 500 },
      features(),
    );

    expect(result?.winner.id).toBe(1);
    expect(result?.topScorer.id).toBe(2);
    expect(result?.budgetChangedTheAnswer).toBe(true);
  });

  it("distinguishes 'none fit' from 'we can't confirm any fit'", () => {
    const murkyA = makeCar({ id: 1, customerMonthly: 400, consumption: null });
    const murkyB = makeCar({ id: 2, customerMonthly: 420, consumption: null });

    const result = buildRecommendation(
      [murkyA, murkyB],
      SAFETY_FIRST,
      preferences,
      features(),
    );

    expect(result?.isFallback).toBe(true);
    expect(result?.fallbackReason).toBe("costUnconfirmed");
  });

  it("prefers a confirmed-affordable car over one with unknown cost", () => {
    const confirmed = makeCar({
      id: 1,
      customerMonthly: 400,
      consumption: 5,
      features: ["hasEmergencyBrakingAssist"],
    });

    // Stronger on safety, but its running cost can't be estimated at all.
    const murky = makeCar({
      id: 2,
      customerMonthly: 400,
      consumption: null,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
        "hasEmergencyCallSystem",
      ],
    });

    const result = buildRecommendation(
      [confirmed, murky],
      SAFETY_FIRST,
      preferences,
      features(),
    );

    expect(result?.winner.id).toBe(1);
    expect(result?.isFallback).toBe(false);
  });

  /*
   * A budget-driven win is the easiest place for the engine to look
   * arbitrary, so the explanation has to name the constraint.
   */
  it("explains when a higher-scoring car was ruled out by the budget", () => {
    const affordable = makeCar({
      id: 1,
      name: "Alpha One",
      customerMonthly: 400,
      consumption: 5,
      features: ["hasEmergencyBrakingAssist"],
    });

    const stronger = makeCar({
      id: 2,
      name: "Beta Two",
      customerMonthly: 900,
      consumption: 5,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
        "hasEmergencyCallSystem",
      ],
    });

    const result = buildRecommendation(
      [affordable, stronger],
      SAFETY_FIRST,
      preferences,
      features(),
    )!;

    expect(result.winner.id).toBe(1);

    // The winner is not the top scorer, and the engine says so outright.
    expect(result.evaluation.rank).toBeGreaterThan(1);
    expect(result.topScorer.id).toBe(2);
    expect(result.budgetChangedTheAnswer).toBe(true);

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    // The headline never claims it simply scored highest.
    expect(narrative.verdict.headline).toContain("fits your");
    expect(narrative.verdict.headline).not.toContain("Beta Two");

    // And the budget note names the car, the amount and the budget — once.
    const note = narrative.verdict.budgetNote!;
    expect(note).toContain("scores higher");
    expect(note).toContain("€950");
    expect(note).toContain("€600");
  });

  /* Saying it four ways is what this pass exists to stop. */
  it("explains the budget override in exactly one place", () => {
    const affordable = makeCar({
      id: 1,
      name: "Alpha One",
      customerMonthly: 400,
      consumption: 5,
      features: ["hasEmergencyBrakingAssist"],
    });

    const stronger = makeCar({
      id: 2,
      name: "Beta Two",
      customerMonthly: 900,
      consumption: 5,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
        "hasEmergencyCallSystem",
      ],
    });

    const result = buildRecommendation(
      [affordable, stronger],
      SAFETY_FIRST,
      preferences,
      features(),
    )!;

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    const mentions = [
      narrative.verdict.headline,
      ...narrative.verdict.reasons,
      ...narrative.priorities.flatMap((item) => item.sentences),
    ].filter((line) => /scores higher/i.test(line));

    expect(mentions).toHaveLength(0);
    expect(narrative.verdict.budgetNote).toMatch(/scores higher/i);
  });

  it("says 'strongest match' only when the winner really is the top scorer", () => {
    const best = makeCar({
      id: 1,
      customerMonthly: 400,
      consumption: 5,
      features: ["hasEmergencyBrakingAssist", "hasBlindSpotAssist"],
    });

    const worse = makeCar({ id: 2, customerMonthly: 400, consumption: 5 });

    const result = buildRecommendation(
      [best, worse],
      SAFETY_FIRST,
      preferences,
      features(),
    )!;

    expect(result.evaluation.rank).toBe(1);
    expect(result.budgetChangedTheAnswer).toBe(false);

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    expect(narrative.verdict.headline).toContain("strongest match");
    expect(narrative.verdict.budgetNote).toBeNull();
  });

  it("returns null only when there is nothing to compare", () => {
    expect(buildRecommendation([], SAFETY_FIRST, preferences)).toBeNull();
  });
});

describe("alternatives and the hot seat", () => {
  const preferences = prefs({ monthlyBudget: 0, monthlyKm: 500 });

  /*
   * Five cars ranked C, A, E, B, D with C recommended. Their safety equipment
   * is chosen to force exactly that order under the default emphasis: blind
   * spot warning ×3, rear cross-traffic alert and matrix LED ×1 — 100, 80,
   * 60, 40 and 0.
   */
  const buildFive = () => {
    const safety: Array<[number, string, FeatureId[]]> = [
      [3, "Car C", ["hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasMatrixLedHeadlights"]],
      [1, "Car A", ["hasBlindSpotAssist", "hasRearCrosswalkWarning"]],
      [5, "Car E", ["hasBlindSpotAssist"]],
      [2, "Car B", ["hasRearCrosswalkWarning", "hasMatrixLedHeadlights"]],
      [4, "Car D", []],
    ];

    return safety.map(([id, name, equipment]) =>
      makeCar({
        id,
        name,
        customerMonthly: 400,
        consumption: 5,
        trunk: 400,
        /* Safety's standard kit on every car, so only the varying kit decides. */
        features: [...CATEGORIES.safetyAssistance.expected, ...equipment],
        featuresSupplied: true,
      }),
    );
  };

  const context = () =>
    buildReasoningContext(
      buildFive(),
      ["safetyAssistance"],
      preferences,
      features(),
    );

  it("ranks the fixture set C, A, E, B, D", () => {
    expect(context().ranked.map((car) => car.name)).toEqual([
      "Car C",
      "Car A",
      "Car E",
      "Car B",
      "Car D",
    ]);
  });

  it("offers the four closest cars to the winner, and never the winner itself", () => {
    const result = buildRecommendation(
      buildFive(),
      ["safetyAssistance"],
      preferences,
      features(),
    )!;

    expect(result.winner.name).toBe("Car C");
    expect(result.alternatives).toHaveLength(ALTERNATIVE_COUNT);
    expect(result.alternatives.map((car) => car.name)).toEqual([
      "Car A",
      "Car E",
      "Car B",
      "Car D",
    ]);

    expect(
      result.alternatives.some((car) => car.id === result.winner.id),
    ).toBe(false);
  });

  /*
   * The point of the alternatives set: a distant car that happens to top one
   * category is not a realistic thing to be offered instead.
   */
  /* Every car carries the standard kit, so no confirmed gap decides it. */
  it("picks alternatives by overall closeness, not by winning one category", () => {
    const winner = makeCar({
      id: 1,
      name: "Winner Car",
      features: [
        ...BASELINE,
        "hasBlindSpotAssist",
        "hasRearCrosswalkWarning",
        "hasMatrixLedHeadlights",
        "hasSplitFoldingRearSeats",
      ],
    });

    const close = Array.from({ length: 4 }, (_, index) =>
      makeCar({
        id: index + 2,
        name: `Close ${index + 1}`,
        features: [...BASELINE, "hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasSplitFoldingRearSeats"],
      }),
    );

    /* Tops practicality, and is hopeless at everything else. */
    const practicalSpecialist = makeCar({
      id: 99,
      name: "Practical Specialist",
      features: [...BASELINE, "hasSplitFoldingRearSeats", "hasElectricTailgate"],
    });

    const result = buildRecommendation(
      [winner, ...close, practicalSpecialist],
      ["safetyAssistance", "practicality", "comfort"],
      preferences,
      features(),
    )!;

    expect(result.winner.id).toBe(1);
    expect(
      result.alternatives.some((car) => car.name === "Practical Specialist"),
    ).toBe(false);
  });

  it("bounds the set instead of exposing the whole catalogue", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      makeCar({
        id: index + 1,
        name: `Car ${index + 1}`,
        customerMonthly: 400,
        consumption: 5,
        length: 4000 + index * 50,
        features: ["hasEmergencyBrakingAssist"],
        featuresSupplied: true,
      }),
    );

    const result = buildRecommendation(
      many,
      ["cityParking", "safetyAssistance", "comfort"],
      preferences,
      features(),
    )!;

    expect(result.alternatives).toHaveLength(ALTERNATIVE_COUNT);
    expect(result.ranked).toHaveLength(12);
  });

  it("expresses every alternative relative to the recommendation", () => {
    const result = buildRecommendation(
      buildFive(),
      ["safetyAssistance"],
      prefs({ monthlyKm: 500, monthlyBudget: 600 }),
      features(),
    )!;

    const options = alternativeOptions(
      result.context,
      result.alternatives,
      result.winner,
      result.winner.id,
    );

    expect(options).toHaveLength(ALTERNATIVE_COUNT);

    for (const option of options) {
      expect(option.vehicle.id).not.toBe(result.winner.id);
      /* Behind the winner, because the winner is the top scorer here. */
      expect(option.differenceToWinner).toBeLessThanOrEqual(0);
      expect(option.isSelected).toBe(false);
    }
  });

  it("gives each alternative a concrete reason to look at it", () => {
    const winner = makeCar({
      id: 1,
      name: "Winner Car",
      length: 4800,
      /* With FINN's standard equipment, so neither car sits on the zero floor. */
      features: [...BASELINE, "hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasMatrixLedHeadlights"],
    });

    const shortCar = makeCar({
      id: 2,
      name: "Short Car",
      length: 3900,
      features: [...BASELINE, "hasBlindSpotAssist"],
    });

    const result = buildRecommendation(
      [winner, shortCar],
      ["safetyAssistance", "cityParking", "comfort"],
      preferences,
      features(),
    )!;

    const [option] = alternativeOptions(
      result.context,
      result.alternatives,
      result.winner,
      result.winner.id,
    );

    /*
     * Something the reader can act on — a named feature or a figure — never
     * "scores well on practicality".
     */
    expect(option?.hook).toBeTruthy();
    expect(option?.hook).not.toMatch(/\/100/);
    expect(option?.hook).toMatch(/Adds |: /);
  });

  /* Selecting another car must not move the recommendation. */
  it("does not change the recommendation when another car is examined", () => {
    const result = buildRecommendation(
      buildFive(),
      ["safetyAssistance"],
      preferences,
      features(),
    )!;

    const before = result.winner.id;
    const challenger = result.alternatives[0]!;

    const hotSeat = evaluateChallenger(challenger, result);

    expect(hotSeat.vehicle.id).toBe(challenger.id);
    expect(hotSeat.isRecommendation).toBe(false);
    expect(result.winner.id).toBe(before);
  });

  /* A challenger is always weighed against the winner, in that direction. */
  it("compares a challenger against the recommendation and nothing else", () => {
    const result = buildRecommendation(
      buildFive(),
      ["safetyAssistance"],
      preferences,
      features(),
    )!;

    const challenger = result.alternatives[1]!;
    const evaluation = evaluateChallenger(challenger, result);

    expect(evaluation.comparison?.subject.vehicleId).toBe(challenger.id);
    expect(evaluation.comparison?.other.vehicleId).toBe(result.winner.id);
    expect(evaluation.cost.vehicleId).toBe(challenger.id);
  });

  /* The winner is explained on its own merits, not against a runner-up. */
  it("gives the recommendation no head-to-head of its own", () => {
    const result = buildRecommendation(
      buildFive(),
      ["safetyAssistance"],
      preferences,
      features(),
    )!;

    expect(result.evaluation.comparison).toBeNull();

    for (const priority of result.evaluation.priorities) {
      expect(priority.versus).toBeNull();
    }
  });

  it("evaluates an over-budget car the user selects, without hiding the cost", () => {
    const affordable = makeCar({ id: 1, customerMonthly: 400, consumption: 5 });
    const expensive = makeCar({ id: 2, customerMonthly: 900, consumption: 5 });

    const result = buildRecommendation(
      [affordable, expensive],
      SAFETY_FIRST,
      prefs({ monthlyKm: 500, petrolPrice: 2, monthlyBudget: 600 }),
      features(),
    )!;

    const evaluation = evaluateChallenger(expensive, result);

    expect(evaluation.cost.breakdown.budgetStatus).toBe("over");
    expect(evaluation.cost.budgetSentence).toContain("over budget");

    const reasoning = reasonAboutChallenge(evaluation, result.context)!;
    expect(reasoning.budget).toContain("over the");
    expect(reasoning.verdict).toContain("budget");
  });

  it("judges the challenger against exactly the same settings", () => {
    const preferencesUsed = prefs({ monthlyKm: 777, monthlyBudget: 1234 });

    const result = buildRecommendation(
      buildFive(),
      ["safetyAssistance"],
      preferencesUsed,
      features(),
    )!;

    const evaluation = evaluateChallenger(result.alternatives[1]!, result);

    expect(result.context.preferences).toBe(preferencesUsed);
    expect(evaluation.cost.breakdown.monthlyKm).toBe(777);
    expect(evaluation.cost.breakdown.budget).toBe(1234);
    expect(evaluation.priorities.map((item) => item.priority)).toEqual(
      result.evaluation.priorities.map((item) => item.priority),
    );
  });

  it("keeps selectAlternatives usable on its own", () => {
    const ctx = context();
    const winner = ctx.ranked[0]!;

    expect(
      selectAlternatives(ctx, winner.id, 2).map((car) => car.name),
    ).toEqual(["Car A", "Car E"]);
  });
});

describe("comparative reasoning", () => {
  const preferences = prefs({ monthlyBudget: 0, monthlyKm: 500 });

  const setup = () => {
    const carC = makeCar({
      id: 3,
      name: "Car C",
      trunk: 390,
      features: [
        "hasEmergencyBrakingAssist",
        "hasBlindSpotAssist",
        "hasLaneKeepingAssist",
        "hasEmergencyCallSystem",
        "hasTirePressureMonitoringSystem",
        "hasTrafficSignRecognition",
      ],
    });

    const carA = makeCar({
      id: 1,
      name: "Car A",
      trunk: 520,
      features: [
        "hasEmergencyBrakingAssist",
        "hasLaneKeepingAssist",
        "hasSplitFoldingRearSeats",
        "hasTowbar",
        "hasRoofRails",
        "hasElectricTailgate",
      ],
    });

    return buildRecommendation(
      [carC, carA],
      ["safetyAssistance", "practicality"],
      preferences,
      features({
        safetyAssistance: [
          { key: "hasEmergencyBrakingAssist", importance: "high" },
          { key: "hasBlindSpotAssist", importance: "high" },
          { key: "hasLaneKeepingAssist", importance: "medium" },
          { key: "hasEmergencyCallSystem", importance: "medium" },
        ],
      }),
    )!;
  };

  it("exposes explicit weights for the priority ordering", () => {
    const result = setup();

    expect(result.context.weights).toEqual([
      { priority: "safetyAssistance", rank: 1, weight: 2 / 3, weightPercent: 67 },
      { priority: "practicality", rank: 2, weight: 1 / 3, weightPercent: 33 },
    ]);
  });

  it("names the equipment behind a category gap rather than the points", () => {
    const result = setup();

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    const safety = narrative.priorities.find(
      (item) => item.priority === "safetyAssistance",
    )!;

    const prose = safety.sentences.join(" ");

    /* Every feature the user picked out is named, present or missing. */
    const named = [
      ...safety.features.picked.present,
      ...safety.features.picked.missing,
    ];

    expect(named.length).toBeGreaterThan(0);

    for (const fact of named) {
      expect(prose.toLowerCase()).toContain(fact.label.toLowerCase());
    }

    /* The score recital the old copy leant on is gone. */
    expect(prose).not.toContain("/100");
    expect(prose).not.toContain(`${safety.weightPercent}%`);
    expect(prose).not.toMatch(/\bscores?\b/i);
  });

  it("surfaces where the losing car is actually better, with the numbers", () => {
    const result = setup();

    const challenger = evaluateChallenger(result.alternatives[0]!, result);

    /* Where the challenger genuinely beats the recommendation. */
    const advantage = challenger.comparison!.decidingAdvantage!;

    expect(advantage.versus!.difference).toBeGreaterThan(0);

    /* The equipment behind the gap is carried through. */
    expect(
      advantage.versus!.onlySubjectHas.length +
        (advantage.numeric ? 1 : 0),
    ).toBeGreaterThan(0);

    /* And the summary names it rather than reciting the points. */
    const summary = challenger.comparison!.summary;

    expect(summary).toContain(advantage.label.toLowerCase());
    expect(summary).not.toMatch(/\bworth about\b/);
    expect(summary).not.toMatch(/\d+\/100/);
  });

  /*
   * FINN's boot figure is still reported, unprompted — and labelled as FINN's
   * listing, never scored, because it doesn't say whether the seats are folded.
   */
  it("quotes FINN's load volume without scoring it", () => {
    const result = setup();

    const narrative = buildAdviceNarrative(result.evaluation, result.context, result.alternatives);
    const practicality = narrative.priorities.find((item) => item.priority === "practicality")!;
    const load = practicality.measurements.find((fact) => fact.label === LOAD_VOLUME);

    expect(result.evaluation.priorities.find((item) => item.priority === "practicality")?.numeric).toBeNull();
    expect(load?.scored).toBe(false);
    expect([390, 520]).toContain(load?.value);
  });

  it("never says a car won because 'your other priorities matter more'", () => {
    const result = setup();

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    const prose = [
      narrative.verdict.headline,
      ...narrative.verdict.reasons,
      ...narrative.priorities.flatMap((item) => item.sentences),
      ...narrative.tradeoffs.flatMap((item) => item.sentences),
    ].join(" ");

    expect(prose).not.toMatch(/other priorities matter more/i);
    expect(prose).not.toMatch(/overall fit/i);
    expect(prose).not.toMatch(/aligns with your needs/i);
    expect(prose).not.toMatch(/optimal choice/i);
  });

  it("keeps matched and missing features available per category", () => {
    const result = setup();
    const safety = result.evaluation.priorities.find(
      (item) => item.priority === "safetyAssistance",
    )!;

    expect(safety.matchedLabels.length).toBeGreaterThan(0);
    expect(safety.leader).not.toBeNull();
    expect(safety.runnerUp).not.toBeNull();

    /* Leading and trailing are both expressible, and stay consistent. */
    expect(safety.isLeader).toBe(safety.gapToLeader === 0);
  });

  it("weights sum to the overall score", () => {
    const result = setup();

    const recomputed = result.evaluation.priorities.reduce(
      (sum, item) => sum + item.weightedContribution,
      0,
    );

    /* Each priority's share is built from its rounded score, so allow the rounding. */
    expect(Math.abs(recomputed - result.evaluation.score.total)).toBeLessThanOrEqual(1);
  });
});

describe("preference migration", () => {
  it("converts a stored annual mileage into a monthly one", () => {
    const migrated = migratePreferences({ annualKm: 12_000 });

    expect(migrated.monthlyKm).toBe(1_000);
    expect(migrated).not.toHaveProperty("annualKm");
  });

  it("keeps an existing monthly mileage in preference to the annual one", () => {
    expect(
      migratePreferences({ annualKm: 12_000, monthlyKm: 800 }).monthlyKm,
    ).toBe(800);
  });

  it("defaults contract type to private", () => {
    expect(migratePreferences({ annualKm: 6_000 }).contractType).toBe("private");
    expect(migratePreferences({ contractType: "business" }).contractType).toBe(
      "business",
    );
  });

  it("preserves the prices and budget an existing user already set", () => {
    const migrated = migratePreferences({
      annualKm: 9_600,
      monthlyBudget: 750,
      petrolPrice: 1.92,
      dieselPrice: 1.81,
      electricityPrice: 0.41,
    });

    expect(migrated).toEqual({
      automaticOnly: false,
      monthlyKm: 800,
      monthlyBudget: 750,
      petrolPrice: 1.92,
      dieselPrice: 1.81,
      electricityPrice: 0.41,
      contractType: "private",
      rentalFrom: null,
      rentalTo: null,
    });
  });

  it("falls back to defaults for absent or unusable values", () => {
    const migrated = migratePreferences({
      petrolPrice: Number.NaN,
      monthlyBudget: -50,
    });

    expect(migrated.petrolPrice).toBeGreaterThan(0);
    expect(migrated.monthlyBudget).toBe(DEFAULT_PREFERENCES.monthlyBudget);
    expect(migrated.monthlyKm).toBe(1_000);
  });
});
