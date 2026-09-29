import { describe, expect, it } from "vitest";

import { buildFitAnalysis, classifyFit, describeFit, hasEquipmentData } from "./fit";
import { buildRecommendation } from "./index";
import { AVAILABLE_CATEGORY_FEATURES, CATEGORY_IDS } from "./constants";
import { makeCar, prefs } from "./test-fixtures";
import { BASELINE } from "./test-garage";
import { LOAD_VOLUME } from "./narrative/facts";
import type { CategoryId, FeatureSelection } from "./types";

/**
 * The single-car analysis shown on finn.com.
 *
 * What these tests are really protecting is a boundary: the engine is
 * comparative almost everywhere, and this path evaluates a car with nothing to
 * compare it to. Every assertion below is either "the arithmetic is still the
 * engine's" or "it does not invent a car that isn't there".
 */

const SAFETY = AVAILABLE_CATEGORY_FEATURES.safetyAssistance;
const PRACTICALITY = AVAILABLE_CATEGORY_FEATURES.practicality;

const picks = (
  entries: Partial<Record<CategoryId, FeatureSelection>>,
): Record<CategoryId, FeatureSelection> =>
  entries as Record<CategoryId, FeatureSelection>;

describe("classifyFit", () => {
  it("bands the engine's score without producing one of its own", () => {
    expect(classifyFit(90).level).toBe("strong");
    expect(classifyFit(65).level).toBe("strong");
    expect(classifyFit(64).level).toBe("good");
    expect(classifyFit(45).level).toBe("good");
    expect(classifyFit(44).level).toBe("partial");
    expect(classifyFit(25).level).toBe("partial");
    expect(classifyFit(24).level).toBe("limited");
    expect(classifyFit(0).level).toBe("limited");
  });

  it("says it doesn't know rather than guessing, with no evidence", () => {
    expect(classifyFit(0, false).level).toBe("unknown");
    expect(classifyFit(90, false).level).toBe("unknown");
  });

  it("never labels a car, only the fit", () => {
    for (const score of [0, 30, 50, 80, 100]) {
      expect(classifyFit(score).label).toMatch(/match|Not enough data/);
    }
  });
});

/**
 * The difference between a fact and a gap.
 *
 * "This car doesn't have adaptive cruise control" and "we don't know what
 * this car has" arrive from FINN looking identical once `extractFeatures` has
 * turned both into a map of falses. Telling them apart is what stops the
 * product inventing an absence — and, in the other direction, what stops it
 * shrugging at a bare car it has been given every fact about.
 */
describe("hasEquipmentData", () => {
  it("is true as soon as anything is known", () => {
    expect(
      hasEquipmentData(makeCar({ id: 1, features: ["hasIsofix"] })),
    ).toBe(true);
  });

  /* FINN's answer is taken as sent: a list of noes is data, not a gap. */
  it("is true for a list that says no to everything", () => {
    expect(
      hasEquipmentData(
        makeCar({ id: 1, features: [], featuresSupplied: true }),
      ),
    ).toBe(true);
  });

  it("is false when FINN supplied no equipment list", () => {
    expect(
      hasEquipmentData(
        makeCar({ id: 1, features: [], featuresSupplied: false }),
      ),
    ).toBe(false);
  });

  /* The recorded answer wins over anything inferred from the map. */
  it("believes the flag over the features", () => {
    expect(
      hasEquipmentData(
        makeCar({
          id: 1,
          features: ["hasIsofix"],
          featuresSupplied: false,
        }),
      ),
    ).toBe(false);
  });

  /*
   * Cars pinned before the flag existed have no recorded answer. What's stored
   * is what FINN sent, so a features record counts as a list, and only a
   * missing or empty one doesn't.
   */
  describe("cars stored before the flag existed", () => {
    const legacy = (features: string[]) => {
      const car = makeCar({ id: 1, features: features as never });

      delete (car as { featuresSupplied?: boolean }).featuresSupplied;

      return car;
    };

    it("reads an all-false record as data", () => {
      const allFalse = legacy([]);
      (allFalse as { features: object }).features = { hasIsofix: false, hasHeatedSeats: false };

      expect(hasEquipmentData(allFalse)).toBe(true);
    });

    it("reads a missing or empty record as no data", () => {
      const empty = legacy([]);
      (empty as { features: object }).features = {};

      expect(hasEquipmentData(empty)).toBe(false);
    });
  });
});

describe("a car FINN lists only baseline equipment for", () => {
  const bare = makeCar({
    id: 1,
    features: ["hasEmergencyBrakingAssist", "hasAirConditioning"],
    featuresSupplied: true,
  });

  it("gets a real verdict rather than a shrug", () => {
    const analysis = buildFitAnalysis(bare, ["safetyAssistance"], prefs());

    expect(analysis.equipmentKnown).toBe(true);
    expect(analysis.overall.level).not.toBe("unknown");
  });

  /* Said as an absence, because that is what FINN reported. */
  it("reports its features as missing rather than unknown", () => {
    const analysis = buildFitAnalysis(bare, ["safetyAssistance"], prefs());

    const states = new Set(
      analysis.priorities[0]?.alsoCounted.map((item) => item.state),
    );

    expect(states.has("absent")).toBe(true);
    expect(states.has("unknown")).toBe(false);
  });

  /* And it is genuinely worse than a car that has some of them. */
  it("scores below a car that has some of the same catalogue", () => {
    const equipped = makeCar({ id: 2, features: SAFETY.slice(0, 2) });

    const bareAnalysis = buildFitAnalysis(bare, ["safetyAssistance"], prefs());

    const equippedAnalysis = buildFitAnalysis(
      equipped,
      ["safetyAssistance"],
      prefs(),
    );

    expect(bareAnalysis.priorities[0]?.covered).toBe(0);
    expect(equippedAnalysis.priorities[0]?.covered).toBeGreaterThan(0);
  });
});

describe("buildFitAnalysis", () => {
  const priorities: CategoryId[] = ["safetyAssistance", "practicality"];

  it("judges the car on the reader's priorities, in their order", () => {
    const car = makeCar({ id: 1, features: SAFETY.slice(0, 8) });

    const analysis = buildFitAnalysis(car, priorities, prefs());

    expect(analysis.priorities.map((item) => item.priority)).toEqual(priorities);
    expect(analysis.priorities[0]?.rank).toBe(1);
    expect(analysis.priorities[0]?.weightPercent).toBeGreaterThan(
      analysis.priorities[1]?.weightPercent ?? 0,
    );
  });

  it("scores the evidence the car actually carries", () => {
    const car = makeCar({ id: 1, features: SAFETY.slice(0, 2) });

    const analysis = buildFitAnalysis(car, priorities, prefs());
    const safety = analysis.priorities[0];

    expect(safety?.covered).toBe(2);
    expect(safety?.catalogueSize).toBe(SAFETY.length);
  });

  it("never claims a standing against cars that aren't there", () => {
    const car = makeCar({ id: 1, features: SAFETY.slice(0, 8) });

    const analysis = buildFitAnalysis(car, priorities, prefs());
    const prose = analysis.priorities.flatMap((item) => item.sentences).join(" ");

    expect(prose).not.toMatch(/alternative/i);
    expect(prose).not.toMatch(/none of the close/i);
    expect(prose).not.toMatch(/against/i);
  });

  it("reports FINN's load volume, labelled as FINN's and never scored", () => {
    const car = makeCar({ id: 1, trunk: 520, features: PRACTICALITY as never });

    const analysis = buildFitAnalysis(car, ["practicality"], prefs());
    const boot = analysis.priorities[0]?.measurements.find(
      (fact) => fact.label === LOAD_VOLUME,
    );

    expect(boot?.value).toBe(520);
    expect(boot?.scored).toBe(false);
    expect(boot?.rival).toBeNull();
  });

  /* Range limits Long Distance for an electric car, so it is a scored figure. */
  it("reports an electric car's range under long distance", () => {
    const car = makeCar({
      id: 1,
      fuelType: "Electric",
      range: 450,
      consumption: 16,
      co2: 0,
      features: ["hasLumbarSupport"],
    });

    const analysis = buildFitAnalysis(car, ["longDistance"], prefs());
    const range = analysis.priorities[0]?.measurements.find(
      (fact) => fact.label === "Electric range",
    );

    expect(range?.value).toBe(450);
    expect(range?.scored).toBe(true);
  });

  it("splits the reader's own picks into what the car has and hasn't", () => {
    const [first, second, third] = SAFETY as [string, string, string];

    const car = makeCar({ id: 1, features: [first, second] as never });

    const analysis = buildFitAnalysis(
      car,
      ["safetyAssistance"],
      prefs(),
      picks({
        safetyAssistance: [
          { key: first as never, importance: "high" },
          { key: second as never, importance: "medium" },
          { key: third as never, importance: "high" },
        ],
      }),
    );

    const picked = analysis.priorities[0]?.picked ?? [];

    expect(
      picked.filter((item) => item.state === "present").map((item) => item.key),
    ).toEqual([first, second]);

    expect(
      picked.filter((item) => item.state === "absent").map((item) => item.key),
    ).toEqual([third]);

    expect(picked.some((item) => item.state === "unknown")).toBe(false);
  });

  it("surfaces a missing pick as a tradeoff and never as a disqualification", () => {
    const [first, second] = SAFETY as [string, string];

    const car = makeCar({ id: 1, features: [first] as never });

    const analysis = buildFitAnalysis(
      car,
      ["safetyAssistance"],
      prefs(),
      picks({
        safetyAssistance: [
          { key: first as never, importance: "high" },
          { key: second as never, importance: "high" },
        ],
      }),
    );

    const missing = analysis.tradeoffs.find(
      (item) => item.kind === "missingSelected",
    );

    expect(missing).toBeDefined();
    expect(missing?.rival).toBeNull();
    expect(missing?.sentences.join(" ")).toContain("FINN doesn't list");
    expect(analysis.overall.level).not.toBe("unknown");
  });

  it("names the budget as a tradeoff when the car is over it", () => {
    const car = makeCar({ id: 1, customerMonthly: 900, features: SAFETY });

    const analysis = buildFitAnalysis(
      car,
      ["safetyAssistance"],
      prefs({ monthlyBudget: 400 }),
    );

    expect(
      analysis.tradeoffs.some((item) => item.kind === "budget"),
    ).toBe(true);
  });

  it("costs the car on the reader's own driving assumptions", () => {
    const car = makeCar({
      id: 1,
      customerMonthly: 500,
      consumption: 6,
      features: SAFETY,
    });

    const analysis = buildFitAnalysis(
      car,
      ["safetyAssistance"],
      prefs({ monthlyKm: 1000, petrolPrice: 2 }),
    );

    /* 1,000 km at 6 L/100 km and €2/L is €120 of fuel on top of the €500. */
    expect(analysis.cost.breakdown.energy.amount).toBeCloseTo(120, 5);
    expect(analysis.cost.breakdown.subscription.amount).toBe(500);
    expect(analysis.costReasoning.rival).toBeNull();
    expect(analysis.costReasoning.cheapest).toBeNull();
  });

  it("keeps what FINN charges apart from what Lens estimates", () => {
    const car = makeCar({ id: 1, features: SAFETY });

    const analysis = buildFitAnalysis(car, ["safetyAssistance"], prefs());

    const subscription = analysis.cost.lines.find(
      (line) => line.id === "subscription",
    );

    expect(subscription?.source).toBe("finn");
    expect(
      analysis.cost.lines.find((line) => line.id === "energy")?.source,
    ).toBe("estimate");
  });

  it("reads unknown, not missing, when FINN supplied no equipment list", () => {
    const car = makeCar({ id: 1, features: [] });

    const analysis = buildFitAnalysis(
      car,
      ["safetyAssistance"],
      prefs(),
      picks({
        safetyAssistance: [{ key: SAFETY[0] as never, importance: "high" }],
      }),
    );

    expect(analysis.equipmentKnown).toBe(false);
    expect(analysis.overall.level).toBe("unknown");
    expect(analysis.priorities[0]?.band.level).toBe("unknown");
    expect(analysis.priorities[0]?.picked).toHaveLength(1);
    expect(analysis.priorities[0]?.picked[0]?.state).toBe("unknown");
    expect(analysis.strengths).toEqual([]);
  });

  it("still costs a car whose equipment is unknown", () => {
    const car = makeCar({ id: 1, customerMonthly: 450, features: [] });

    const analysis = buildFitAnalysis(car, ["safetyAssistance"], prefs());

    expect(analysis.cost.breakdown.subscription.amount).toBe(450);
  });

  it("gives reasons drawn from priorities the car actually serves", () => {
    const car = makeCar({ id: 1, features: [...SAFETY, ...BASELINE] });

    const analysis = buildFitAnalysis(car, ["safetyAssistance"], prefs());

    expect(analysis.strengths.length).toBeGreaterThan(0);
    expect(analysis.strengths[0]).toMatch(/safety & driver assistance/i);
  });

  it("offers no reasons rather than consolation when nothing fits", () => {
    const car = makeCar({ id: 1, features: ["hasSpareWheel"] });

    const analysis = buildFitAnalysis(car, ["safetyAssistance"], prefs());

    expect(analysis.overall.level).toBe("limited");
    expect(analysis.strengths).toEqual([]);
  });

  it("produces the same category scores as the comparison engine does", () => {
    /*
     * The guarantee worth having: for the half of the score that doesn't need
     * a population — equipment — one car alone is judged exactly as it is
     * inside a full comparison.
     *
     * Asserted on the coverage counts rather than on the score, because the
     * score is the *weighted* share once anything is picked out, and Lens now
     * ships picks. Coverage is the same measurement on both sides whatever
     * the weighting, which is what makes this a test of the two engines
     * agreeing rather than a restatement of one formula.
     */
    const subject = makeCar({ id: 1, features: SAFETY.slice(0, 9) });
    const other = makeCar({ id: 2, features: SAFETY.slice(0, 3) });

    const alone = buildFitAnalysis(subject, ["safetyAssistance"], prefs());

    const compared = buildRecommendation(
      [subject, other],
      ["safetyAssistance"],
      prefs(),
    );

    const here = alone.priorities[0];
    const there = compared?.evaluation.priorities[0];

    expect(compared?.winner.id).toBe(subject.id);
    expect(here?.covered).toBe(there?.matched.length);
    expect(here?.catalogueSize).toBe(
      (there?.matched.length ?? 0) + (there?.missing.length ?? 0),
    );
    expect(there?.coverageScore).toBe(
      here && Math.round((here.covered / here.catalogueSize) * 100),
    );
  });

  /*
   * And with nothing picked out, the weighted score collapses back onto plain
   * coverage — which is what makes "picked nothing" a coherent answer rather
   * than a different scoring model.
   */
  it("scores on plain coverage when nothing is picked out", () => {
    /* Safety's standard kit listed, so no confirmed gap takes anything off. */
    const subject = makeCar({ id: 1, features: [...SAFETY.slice(0, 9), ...BASELINE] });
    const other = makeCar({ id: 2, features: [...SAFETY.slice(0, 3), ...BASELINE] });

    const nothingPicked = Object.fromEntries(
      CATEGORY_IDS.map((id) => [id, []]),
    ) as Record<CategoryId, never[]>;

    const alone = buildFitAnalysis(
      subject,
      ["safetyAssistance"],
      prefs(),
      nothingPicked,
    );

    const compared = buildRecommendation(
      [subject, other],
      ["safetyAssistance"],
      prefs(),
      nothingPicked,
    );

    expect(compared?.score.byCategory.safetyAssistance).toBe(
      alone.priorities[0] &&
        Math.round(
          (alone.priorities[0].covered / alone.priorities[0].catalogueSize) * 100,
        ),
    );
  });
});

describe("describeFit", () => {
  it("frames the answer as fit, never as vehicle quality", () => {
    const car = makeCar({ id: 1, features: SAFETY });

    const line = describeFit(
      buildFitAnalysis(car, ["safetyAssistance", "practicality"], prefs()),
    );

    expect(line).toMatch(/you set/);
    expect(line).not.toMatch(/excellent|great car|best car/i);
  });

  it("says plainly when nothing is served", () => {
    const car = makeCar({ id: 1, features: ["hasSpareWheel"] });

    const line = describeFit(
      buildFitAnalysis(car, ["safetyAssistance"], prefs()),
    );

    expect(line).toMatch(/doesn't strongly serve/);
  });

  it("says the equipment list is missing rather than judging the car", () => {
    const car = makeCar({ id: 1, features: [] });

    const line = describeFit(
      buildFitAnalysis(car, ["safetyAssistance"], prefs()),
    );

    expect(line).toMatch(/hasn't supplied an equipment list/);
    expect(line).toMatch(/nothing to check your priorities against/);
  });

  /*
   * A priority judged on figures survives a missing equipment list, and the
   * page shows its full result. The headline used to say there was nothing to
   * check the reader's priorities against while that result sat below it.
   */
  it("names the priority still judged when the equipment list is missing", () => {
    const car = makeCar({ id: 1, features: [], co2: 120 });

    const line = describeFit(
      buildFitAnalysis(car, ["safetyAssistance", "environmental"], prefs()),
    );

    expect(line).toMatch(/hasn't supplied an equipment list/);
    expect(line).toMatch(/most of your priorities have nothing to check against/);
    expect(line).toMatch(/environmental impact is judged on the car's own figures/i);
  });
});

describe("what the car has, in the reader's terms and the category's", () => {
  /*
   * Climate's first eight items, of which the car has the first four. The
   * rest don't count for this petrol car: a heat pump means nothing without
   * an electric motor, and all-wheel drive counts only once raised.
   */
  const CLIMATE = AVAILABLE_CATEGORY_FEATURES.climateSuitability.slice(0, 8);
  const [first, , third] = CLIMATE as [string, string, string];

  const analysis = () =>
    buildFitAnalysis(
      makeCar({ id: 1, features: CLIMATE.slice(0, 4) as never }),
      ["climateSuitability"],
      prefs(),
      picks({
        climateSuitability: [
          { key: first as never, importance: "high" },
          { key: third as never, importance: "low" },
          { key: CLIMATE[7] as never, importance: "medium" },
        ],
      }),
    );

  it("keeps the reader's picks apart from the rest of the category", () => {
    const climate = analysis().priorities[0];

    const pickedKeys = climate?.picked.map((item) => item.key) ?? [];
    const restKeys = climate?.alsoCounted.map((item) => item.key) ?? [];

    /* A pick is listed once, under the reader's own heading. */
    for (const key of pickedKeys) expect(restKeys).not.toContain(key);

    expect(pickedKeys).toHaveLength(3);
    expect(pickedKeys.length + restKeys.length).toBe(CLIMATE.length);
  });

  it("says which of the category's features the car hasn't got", () => {
    const climate = analysis().priorities[0];

    const absent = climate?.alsoCounted.filter(
      (item) => item.state === "absent",
    );

    /* Four of eight present, two of those picked out. */
    expect(climate?.alsoCounted.filter((i) => i.state === "present")).toHaveLength(2);
    expect(absent?.length).toBe(CLIMATE.length - 4 - 1);
  });

  it("carries the level the reader gave each pick, present or absent", () => {
    const safety = analysis().priorities[0];

    const held = safety?.picked.find((item) => item.key === first);
    const wanted = safety?.picked.find((item) => item.key === CLIMATE[7]);

    expect(held?.state).toBe("present");
    expect(held?.importance).toBe("high");

    expect(wanted?.state).toBe("absent");
    expect(wanted?.importance).toBe("medium");
  });

  it("gives the rest of the category no invented importance", () => {
    for (const item of analysis().priorities[0]?.alsoCounted ?? []) {
      expect(item.importance).toBeNull();
    }
  });

  it("reads unknown for everything when FINN listed no equipment", () => {
    const blind = buildFitAnalysis(
      makeCar({ id: 2, features: [] }),
      ["safetyAssistance"],
      prefs(),
    );

    const safety = blind.priorities[0];

    for (const item of [...(safety?.picked ?? []), ...(safety?.alsoCounted ?? [])]) {
      expect(item.state).toBe("unknown");
    }
  });
});
