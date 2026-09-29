import { describe, expect, it } from "vitest";

import { buildRecommendation, evaluateChallenger } from "./index";
import { challengeRows, reasonAboutChallenge } from "./narrative/challenge";
import { buildAdviceNarrative } from "./narrative";
import { classifyMonthlyCostGap, classifyScoreGap } from "./narrative/magnitude";
import { coverage, inSentence, phraseLabel } from "./narrative/phrase";
import { DEFAULT_CATEGORY_FEATURES, FEATURES, SIGNALS } from "./constants";
import { makeCar, prefs } from "./test-fixtures";
import type { AdviceNarrative } from "./narrative";
import type { CategoryId, FeatureSelection } from "./types";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const wellEquipped = makeCar({
  id: 1,
  name: "Ford Puma",
  customerMonthly: 299,
  consumption: 5.4,
  trunk: 456,
  co2: 124,
  features: [
    "hasEmergencyBrakingAssist",
    "hasAdaptiveCruiseControl",
    "hasLaneKeepingAssist",
    "hasParkingAssistant",
    "hasTrafficSignRecognition",
    "hasCruiseControl",
    "hasBlindSpotAssist",
    "hasEmergencyCallSystem",
    "hasIsofix",
    "hasSplitFoldingRearSeats",
    "hasHeatedSeats",
    "hasAirConditioning",
  ],
});

const bigBoot = makeCar({
  id: 2,
  name: "Hyundai i30",
  customerMonthly: 279,
  consumption: 5.9,
  trunk: 1650,
  co2: 133,
  features: [
    "hasEmergencyBrakingAssist",
    "hasLaneKeepingAssist",
    "hasBlindSpotAssist",
    "hasEmergencyCallSystem",
    "hasIsofix",
    "hasSplitFoldingRearSeats",
    "hasRoofRails",
    "hasAirConditioning",
  ],
});

const cheapAndClean = makeCar({
  id: 3,
  name: "MG 3",
  customerMonthly: 219,
  consumption: 4.4,
  trunk: 293,
  co2: 100,
  features: [
    "hasEmergencyBrakingAssist",
    "hasLaneKeepingAssist",
    "hasIsofix",
    "hasSplitFoldingRearSeats",
    "hasAirConditioning",
  ],
});

const cars = [wellEquipped, bigBoot, cheapAndClean];

const preferences = prefs({ monthlyKm: 1000, monthlyBudget: 600 });

function adviceFor(
  priorities: CategoryId[],
  vehicles = cars,
  overrides: Partial<Record<CategoryId, FeatureSelection>> = {},
): AdviceNarrative {
  const result = buildRecommendation(
    vehicles,
    priorities,
    preferences,
    { ...DEFAULT_CATEGORY_FEATURES, ...overrides },
  )!;

  return buildAdviceNarrative(
    result.evaluation,
    result.context,
    result.alternatives,
  );
}

/** Every sentence the Advice would put in front of the reader. */
function allProse(narrative: AdviceNarrative): string {
  return [
    narrative.verdict.headline,
    ...narrative.verdict.reasons,
    ...(narrative.verdict.budgetNote ? [narrative.verdict.budgetNote] : []),
    ...(narrative.verdict.marginNote ? [narrative.verdict.marginNote] : []),
    ...narrative.priorities.flatMap((item) => item.sentences),
    ...narrative.tradeoffs.flatMap((item) => [item.headline, ...item.sentences]),
    ...narrative.cost.sentences,
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/* What you read is what you get                                              */
/* -------------------------------------------------------------------------- */

describe("the Advice never asks the reader to infer what it meant", () => {
  /**
   * Phrases that describe a conclusion without ever stating the evidence for
   * it. If one of these appears, the sentence around it is telling the reader
   * a car is good without telling them what it has.
   */
  const VAGUE = [
    "useful everyday equipment",
    "strong equipment advantage",
    "standout equipment",
    "good overall package",
    "well equipped",
    "well-equipped",
    "practical features",
    "strong performance",
    "better fit",
    "good value",
    "great choice",
    "perfect for",
    "aligns with your needs",
    "optimal choice",
    "overall fit",
    "other priorities matter more",
  ];

  const ORDERS: CategoryId[][] = [
    ["safetyAssistance", "cityParking", "practicality"],
    ["safetyAssistance", "longDistance", "comfort"],
    ["environmental", "safetyAssistance", "practicality"],
    ["practicality", "cityParking", "longDistance"],
    ["climateSuitability", "comfort", "safetyAssistance"],
  ];

  it.each(ORDERS)("stays concrete for %s-first", (...priorities) => {
    const prose = allProse(adviceFor(priorities as CategoryId[])).toLowerCase();

    for (const phrase of VAGUE) {
      expect(prose).not.toContain(phrase);
    }
  });

  it("explains priorities without reciting the internal score", () => {
    for (const priorities of ORDERS) {
      const narrative = adviceFor(priorities);

      for (const reasoning of narrative.priorities) {
        const prose = reasoning.sentences.join(" ");

        /* "/100km" is a consumption unit; "82/100" is the score recital. */
        expect(prose).not.toMatch(/\d\/100(?!km)/);
        expect(prose).not.toMatch(/\bscores?\b/i);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The same car, explained differently                                        */
/* -------------------------------------------------------------------------- */

describe("the reasoning follows the user's priorities, not a template", () => {
  it("explains the same car differently when the priorities change", () => {
    const safetyFirst = adviceFor(["safetyAssistance", "practicality"]);
    const practicalityFirst = adviceFor(["practicality", "safetyAssistance"]);

    /* Same comparison set, so the winner shouldn't have to change for the
       explanation to. */
    const safetyProse = allProse(safetyFirst);
    const practicalityProse = allProse(practicalityFirst);

    expect(safetyProse).not.toEqual(practicalityProse);

    /* Each leads with the evidence for the priority the user put first. */
    expect(safetyFirst.priorities[0]!.priority).toBe("safetyAssistance");
    expect(practicalityFirst.priorities[0]!.priority).toBe("practicality");
  });

  it("cites the measurements a practicality-led reader actually asked about", () => {
    const narrative = adviceFor(["practicality", "cityParking", "comfort"]);

    const practicality = narrative.priorities.find(
      (item) => item.priority === "practicality",
    )!;

    const prose = practicality.sentences.join(" ");

    /* FINN's boot figure, quoted as FINN's and never passed off as seats-up. */
    expect(prose).toContain("load volume");
    expect(prose).toMatch(/rear seats folded/);
    expect(prose).toMatch(/\d/);

    /* Seat count is reported as context, never as something that scored. */
    const seats = practicality.measurements.find((item) => item.label === "Seats");
    expect(seats?.scored).toBe(false);
  });

  it("cites CO₂ and the drivetrain for an environment-led reader", () => {
    const narrative = adviceFor(["environmental", "safetyAssistance"]);

    const environmental = narrative.priorities.find(
      (item) => item.priority === "environmental",
    )!;

    expect(environmental.sentences.join(" ")).toContain("CO₂");
    expect(environmental.traits.map((item) => item.label)).toContain("Drivetrain");
  });
});

/* -------------------------------------------------------------------------- */
/* Tradeoffs                                                                  */
/* -------------------------------------------------------------------------- */

describe("tradeoffs are filtered by what the user told us", () => {
  it("does not raise CO₂ with a reader who never ranked the environment", () => {
    const narrative = adviceFor(["safetyAssistance", "cityParking", "practicality"]);

    const prose = narrative.tradeoffs
      .flatMap((item) => [item.headline, ...item.sentences])
      .join(" ");

    expect(prose).not.toContain("CO₂");
    expect(prose).not.toMatch(/emission/i);
  });

  it("raises CO₂ evidence once the environment is ranked", () => {
    const narrative = adviceFor(["environmental", "safetyAssistance"]);

    const prose = [
      ...narrative.priorities.flatMap((item) => item.sentences),
      ...narrative.tradeoffs.flatMap((item) => item.sentences),
    ].join(" ");

    expect(prose).toContain("CO₂");
  });

  it("anchors every tradeoff to a ranked priority or to the budget", () => {
    for (const priorities of [
      ["safetyAssistance", "practicality"],
      ["safetyAssistance", "comfort"],
      ["environmental", "longDistance"],
    ] as CategoryId[][]) {
      const narrative = adviceFor(priorities);

      for (const tradeoff of narrative.tradeoffs) {
        const anchored =
          tradeoff.priority != null
            ? priorities.includes(tradeoff.priority)
            : tradeoff.kind === "cost" || tradeoff.kind === "budget";

        expect(anchored).toBe(true);
      }
    }
  });

  it("stays short enough to be usable", () => {
    for (const priorities of [
      ["safetyAssistance", "longDistance", "comfort", "practicality"],
      ["comfort", "climateSuitability", "longDistance"],
    ] as CategoryId[][]) {
      expect(adviceFor(priorities).tradeoffs.length).toBeLessThanOrEqual(4);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Missing picks                                                              */
/* -------------------------------------------------------------------------- */

describe("a feature the user picked out is surfaced, not used to disqualify", () => {
  /*
   * An electric car runs away with the environment priority — nothing burning
   * fuel comes close on an absolute emissions scale — and so wins for an
   * environment-led reader while lacking two of the safety features that
   * reader picked out.
   */
  const cleanButBasic = makeCar({
    id: 4,
    name: "BYD Dolphin",
    fuelType: "Electric",
    range: 400,
    consumption: 15.1,
    customerMonthly: 289,
    co2: 0,
    co2Class: "A",
    features: ["hasEmergencyBrakingAssist", "hasIsofix", "hasAirConditioning"],
  });

  const narrative = adviceFor(["environmental", "safetyAssistance"], [...cars, cleanButBasic], {
    safetyAssistance: [
      { key: "hasEmergencyBrakingAssist", importance: "high" },
      { key: "hasBlindSpotAssist", importance: "high" },
      { key: "hasEmergencyCallSystem", importance: "medium" },
    ],
  });

  it("still recommends a car that misses one", () => {
    const missing = narrative.priorities.flatMap(
      (item) => item.features.picked.missing,
    );

    expect(missing.length).toBeGreaterThan(0);
    expect(narrative.isRecommendation).toBe(true);
  });

  it("names the feature and says plainly that the car doesn't have it", () => {
    const gap = narrative.tradeoffs.find(
      (item) => item.kind === "missingSelected",
    )!;

    expect(gap).toBeDefined();
    /* Named in the reader's own terms, at the importance they gave it. */
    expect(gap.sentences.join(" ")).toMatch(/you raised .+under/i);
    expect(gap.sentences.join(" ")).toMatch(/doesn't\b/i);

    /* A pick is an interest, never a requirement — the copy must say so. */
    /* Framed as something to weigh, never as a rule the car broke. */
    expect(gap.sentences.join(" ")).toMatch(/worth weighing/i);
    expect(gap.sentences.join(" ")).not.toMatch(
      /essential|required|must|disqualif|unacceptable/i,
    );

    /* The car that does have it is named, so the gap is a choice. */
    expect(gap.rival).not.toBeNull();
    expect(gap.evidence.toLowerCase()).toContain("blind spot warning");
  });

  it("says why it still placed where it did, rather than hiding the gap", () => {
    const gap = narrative.tradeoffs.find(
      (item) => item.kind === "missingSelected",
    )!;

    expect(gap.sentences.join(" ")).toMatch(/real compromise/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Ties and missing data                                                      */
/* -------------------------------------------------------------------------- */

describe("the language matches the size of the difference", () => {
  it("distinguishes a tie, a small gap and a large one", () => {
    expect(classifyScoreGap(0)).toBe("tie");
    expect(classifyScoreGap(3)).toBe("negligible");
    expect(classifyScoreGap(20)).toBe("clear");
    expect(classifyScoreGap(60)).toBe("decisive");
  });

  it("calls a narrow lead narrow instead of decisive", () => {
    const near = makeCar({ id: 10, name: "Alpha One", co2: 100, trunk: 400 });
    const alsoNear = makeCar({ id: 11, name: "Beta Two", co2: 103, trunk: 400 });

    const narrative = adviceFor(["environmental"], [near, alsoNear]);

    const environmental = narrative.priorities[0]!;

    expect(environmental.standing).toBe("leads");
    expect(environmental.sentences.join(" ")).toMatch(/only just|level with/i);
  });

  /*
   * Picking no features is a preference, not a gap in the setup: "I want the
   * safest car, I just don't have opinions about which systems it has" is a
   * complete answer, and the category is judged on its whole catalogue.
   */
  it("judges a priority on the category when nothing was picked out", () => {
    const narrative = adviceFor(["comfort", "safetyAssistance"], cars, {
      comfort: [],
    });

    const comfort = narrative.priorities.find(
      (item) => item.priority === "comfort",
    )!;

    expect(comfort.features.basis).toBe("category");
    expect(comfort.standing).not.toBe("unsupported");
    expect(comfort.hasEvidence).toBe(true);

    /* And it says which yardstick it used, without implying a mistake. */
    const prose = comfort.sentences.join(" ");

    expect(prose).toMatch(/nothing is raised/i);
    expect(prose).toMatch(/counts the same/i);
    expect(prose).not.toMatch(/should|need to|missing from your/i);
  });

  /* An empty pick is never reported as a shortfall against the user. */
  it("raises no compromise for a category nobody picked features in", () => {
    const narrative = adviceFor(["comfort", "safetyAssistance"], cars, {
      comfort: [],
    });

    const fromComfort = narrative.tradeoffs.filter(
      (item) => item.priority === "comfort",
    );

    for (const tradeoff of fromComfort) {
      expect(tradeoff.kind).not.toBe("missingSelected");
    }
  });

  it("says so plainly when the data genuinely can't answer the question", () => {
    /*
     * Nothing to judge emissions on: no CO₂ figure, no class, no consumption
     * and a powertrain we don't recognise. Note that a figure of zero is not
     * this case — that is an electric car, and it is scored.
     */
    const dataless = {
      co2: Number.NaN,
      co2Class: "",
      consumption: null,
      fuelType: "Unknown" as never,
    };

    const blank = [
      makeCar({ id: 60, name: "Alpha One", ...dataless }),
      makeCar({ id: 61, name: "Beta Two", ...dataless }),
    ];

    const narrative = adviceFor(["environmental", "safetyAssistance"], blank);

    const environmental = narrative.priorities.find(
      (item) => item.priority === "environmental",
    )!;

    expect(environmental.standing).toBe("unsupported");
    expect(environmental.hasEvidence).toBe(false);
    expect(environmental.sentences.join(" ")).toContain(
      "Lens can't judge this car on environmental impact",
    );

    /* And it is not dressed up as a finding elsewhere. */
    expect(
      narrative.tradeoffs.some((item) => item.priority === "environmental"),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

describe("financial reasoning is specific", () => {
  const narrative = adviceFor(["safetyAssistance", "practicality"]);

  it("separates the subscription, the energy estimate and the total", () => {
    const prose = narrative.cost.sentences.join(" ");

    expect(prose).toMatch(/subscription/i);
    expect(prose).toMatch(/estimated energy/i);
    expect(prose).toMatch(/in total/i);
    expect(narrative.cost.subject.subscription).not.toBeNull();
  });

  it("states the mileage the estimate was built on", () => {
    expect(narrative.cost.monthlyKm).toBe(1000);
    expect(narrative.cost.sentences.join(" ")).toContain("1,000 km");
  });

  it("quantifies the gap to the cheapest alternative in euros", () => {
    const money = narrative.tradeoffs.find((item) => item.kind === "cost");

    if (money) {
      expect(money.headline).toMatch(/€\d/);
      expect(money.sentences.join(" ")).toMatch(/€\d+.*more than/);
    }
  });

  it("never reports an uncalculable component as €0", () => {
    const noPrice = makeCar({ id: 20, name: "Alpha One", consumption: null });
    const priced = makeCar({ id: 21, name: "Beta Two", consumption: 5 });

    const narrative = adviceFor(["safetyAssistance"], [noPrice, priced]);

    if (!narrative.cost.subject.complete) {
      expect(narrative.cost.unknowns.length).toBeGreaterThan(0);
      expect(narrative.cost.sentences.join(" ")).toContain(
        "rather than counting it as zero",
      );
    }
  });

  it("scales its language to the size of the monthly difference", () => {
    expect(classifyMonthlyCostGap(0.4, 300)).toBe("tie");
    expect(classifyMonthlyCostGap(6, 300)).toBe("negligible");
    expect(classifyMonthlyCostGap(55, 300)).toBe("clear");
    expect(classifyMonthlyCostGap(200, 300)).toBe("decisive");
  });
});

/* -------------------------------------------------------------------------- */
/* Ranking coherence                                                          */
/* -------------------------------------------------------------------------- */

describe("the ranking and the explanation agree", () => {
  it("acknowledges a near-tie instead of implying a clear win", () => {
    const first = makeCar({
      id: 30,
      name: "Alpha One",
      trunk: 400,
      features: ["hasEmergencyBrakingAssist", "hasBlindSpotAssist"],
    });

    const second = makeCar({
      id: 31,
      name: "Beta Two",
      trunk: 405,
      features: ["hasEmergencyBrakingAssist", "hasBlindSpotAssist"],
    });

    const narrative = adviceFor(["safetyAssistance", "practicality"], [first, second]);

    expect(narrative.verdict.margin).not.toBeNull();

    if (narrative.verdict.margin!.magnitude === "negligible" ||
        narrative.verdict.margin!.magnitude === "tie") {
      expect(narrative.verdict.marginNote).toMatch(/close|level|behind/i);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Feature explanations                                                       */
/* -------------------------------------------------------------------------- */

describe("feature terminology is explained in the product", () => {
  it("carries a plain-English explanation for every feature it can name", () => {
    const narrative = adviceFor([
      "safetyAssistance",
      "climateSuitability",
      "practicality",
    ]);

    const named = narrative.priorities.flatMap((item) => [
      ...item.features.coverage.present,
      ...item.features.coverage.missing,
    ]);

    expect(named.length).toBeGreaterThan(0);

    for (const fact of named) {
      expect(fact.explanation.length).toBeGreaterThan(20);
      expect(fact.label).toBe(SIGNALS[fact.key].label);
    }
  });

  it("covers the jargon a normal driver would have to look up", () => {
    const jargon = [
      "hasAdaptiveCruiseControl",
      "hasEmergencyBrakingAssist",
      "hasBlindSpotAssist",
      "hasLaneKeepingAssist",
      "hasParkingAssistant",
      "hasEmergencyCallSystem",
      "hasTrafficSignRecognition",
    ] as const;

    for (const key of jargon) {
      expect(FEATURES[key].explanation).toBeTruthy();
      expect(FEATURES[key].explanation.length).toBeGreaterThan(30);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Language primitives                                                        */
/* -------------------------------------------------------------------------- */

describe("language primitives", () => {
  it("counts coverage the way a person would say it", () => {
    expect(coverage(3, 3)).toBe("all three");
    expect(coverage(2, 2)).toBe("both");
    expect(coverage(2, 3)).toBe("two of the three");
    expect(coverage(0, 2)).toBe("neither");
    expect(coverage(0, 4)).toBe("none of the four");
  });

  it("lowercases labels without mangling acronyms or symbols", () => {
    expect(inSentence("Blind spot warning")).toBe("blind spot warning");
    expect(inSentence("ISOFIX child seat anchors")).toBe(
      "ISOFIX child seat anchors",
    );
    expect(inSentence("360° camera")).toBe("360° camera");
    expect(phraseLabel("Family Friendly")).toBe("family friendly");
    expect(phraseLabel("CO₂ Impact")).toBe("CO₂ impact");
  });

  /*
   * Names are never abbreviated. The prose used to drop the make — "Puma"
   * for a Ford Puma — and a reader comparing four cars had to reconcile two
   * spellings of each one.
   */
  it("names a car in full wherever it names it", () => {
    const result = buildRecommendation(
      [
        makeCar({
          id: 1,
          name: "Ford Puma",
          length: 4200,
          features: ["hasSplitFoldingRearSeats", "hasElectricTailgate", "hasOneEightyDegreesReversingCamera"],
        }),
        makeCar({ id: 2, name: "Hyundai i30", length: 4600, features: ["hasSplitFoldingRearSeats"] }),
      ],
      ["practicality", "cityParking", "comfort"],
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

    const challenger = result.alternatives[0]!;

    const reasoning = reasonAboutChallenge(
      evaluateChallenger(challenger, result),
      result.context,
    )!;

    for (const name of [reasoning.winnerName, reasoning.challengerName]) {
      expect([result.winner.name, challenger.name]).toContain(name);
    }

    const prose = [
      reasoning.verdict,
      ...reasoning.gains.map((line) => line.evidence),
      ...reasoning.losses.map((line) => line.evidence),
    ].join(" ");

    /* The model on its own never appears without the make in front of it. */
    let named = 0;

    for (const [make, model] of [
      ["Ford", "Puma"],
      ["Hyundai", "i30"],
    ]) {
      for (const match of prose.matchAll(new RegExp(model as string, "g"))) {
        expect(prose.slice(0, match.index)).toMatch(new RegExp(`${make} $`));
        named += 1;
      }
    }

    /* Otherwise the loop above proves nothing about prose naming no car. */
    expect(named).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The hot seat                                                               */
/* -------------------------------------------------------------------------- */

describe("a car in the hot seat is explained on its own terms", () => {
  it("never claims a car won when it didn't", () => {
    const result = buildRecommendation(
      cars,
      ["safetyAssistance", "practicality"],
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

    const challenger = result.alternatives[0]!;

    const narrative = buildAdviceNarrative(
      evaluateChallenger(challenger, result),
      result.context,
      [result.winner, ...result.alternatives],
    );

    expect(narrative.isRecommendation).toBe(false);

    /* Framed as a swap, never as a second winner. */
    expect(narrative.verdict.headline).toMatch(/would gain you over/i);
    expect(narrative.verdict.headline).not.toMatch(/comes out on top/i);
    expect(narrative.verdict.headline).not.toMatch(/strongest match/i);
  });
});

/* -------------------------------------------------------------------------- */
/* The recommendation stays the focus                                         */
/* -------------------------------------------------------------------------- */

describe("the recommendation is explained on its own merits", () => {
  const ORDER: CategoryId[] = [
    "safetyAssistance",
    "practicality",
    "cityParking",
    "climateSuitability",
    "comfort",
  ];

  /*
   * The failure this guards against: "Compass does safety better, Karoq does
   * practicality better, Puma does comfort better" — five comparisons under
   * five headings, which destroys the hierarchy of the recommendation.
   */
  it("never parades another car under a priority heading", () => {
    const result = buildRecommendation(
      cars,
      ORDER,
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    const others = result.context.vehicles.filter(
      (car) => car.id !== result.winner.id,
    );

    for (const reasoning of narrative.priorities) {
      const prose = reasoning.sentences.join(" ");

      for (const other of others) {
        expect(prose).not.toContain(other.name);
      }
    }
  });

  /* Where another car IS better belongs here — once, with the evidence. */
  it("moves that comparison into what you're giving up", () => {
    const result = buildRecommendation(
      cars,
      ORDER,
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    for (const tradeoff of narrative.tradeoffs) {
      /* Every compromise states the thing and why this reader cares. */
      expect(tradeoff.evidence.length).toBeGreaterThan(0);
      expect(tradeoff.relevance.length).toBeGreaterThan(0);

      /* And traces back to a ranked priority or the budget the user set. */
      const answersToSomething =
        tradeoff.priority != null ||
        tradeoff.kind === "budget" ||
        tradeoff.kind === "cost";

      expect(answersToSomething).toBe(true);
    }
  });

  it("orders compromises by the user's own ranking, not an internal severity", () => {
    const result = buildRecommendation(
      cars,
      ORDER,
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    const ranks = narrative.tradeoffs
      .map((tradeoff) => tradeoff.rank)
      .filter((rank): rank is number => rank != null);

    expect([...ranks]).toEqual([...ranks].sort((a, b) => a - b));
  });

  /*
   * Nothing sits above #1, so "it's stronger on the priorities you ranked
   * above this one" is simply false there — and a reader checking the page
   * against itself is exactly who notices.
   */
  it("never claims a strength above the user's first priority", () => {
    const result = buildRecommendation(
      cars,
      ORDER,
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    for (const tradeoff of narrative.tradeoffs) {
      if (tradeoff.rank !== 1) continue;

      expect(tradeoff.sentences.join(" ")).not.toMatch(
        /priorities you ranked above/i,
      );
    }
  });

  /*
   * The user didn't say the environment matters, so a car's emissions are a
   * fact about it and not a compromise they are making.
   */
  it("stays silent about a weakness the user never ranked", () => {
    const result = buildRecommendation(
      cars,
      ["safetyAssistance", "comfort"],
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

    const narrative = buildAdviceNarrative(
      result.evaluation,
      result.context,
      result.alternatives,
    );

    const prose = narrative.tradeoffs
      .flatMap((tradeoff) => tradeoff.sentences)
      .join(" ");

    expect(prose).not.toMatch(/co₂|emissions/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Challenging the recommendation                                             */
/* -------------------------------------------------------------------------- */

describe("a challenger is always weighed against the recommendation", () => {
  const setup = () =>
    buildRecommendation(
      cars,
      ["safetyAssistance", "practicality", "comfort"],
      preferences,
      DEFAULT_CATEGORY_FEATURES,
    )!;

  it("frames every line as gain-or-lose against the winner", () => {
    const result = setup();
    const challenger = result.alternatives[0]!;

    const reasoning = reasonAboutChallenge(
      evaluateChallenger(challenger, result),
      result.context,
    )!;

    expect(reasoning.winnerName).toBe(result.winner.name);
    expect(reasoning.challengerName).toBe(challenger.name);

    for (const line of [...reasoning.gains, ...reasoning.losses]) {
      /* Both cars are named, so the direction is never ambiguous. */
      expect(
        line.evidence.includes(reasoning.challengerName) ||
          line.evidence.includes(reasoning.winnerName),
      ).toBe(true);

      expect(line.relevance).toMatch(/you ranked/i);
    }
  });

  /*
   * The table's spine. Two lists ordered by impact cannot be read across;
   * one list ordered by rank can, and that ordering is the reader's own.
   */
  it("merges both sides into one list in the reader's priority order", () => {
    const result = setup();

    for (const challenger of result.alternatives) {
      const reasoning = reasonAboutChallenge(
        evaluateChallenger(challenger, result),
        result.context,
      )!;

      const rows = challengeRows(reasoning);

      expect(rows).toHaveLength(
        reasoning.gains.length + reasoning.losses.length,
      );

      const ranks = rows.map((row) => row.rank);

      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

      /* A priority lands on one side only, so no rank may repeat. */
      expect(new Set(ranks).size).toBe(ranks.length);
    }
  });

  it("says which car each row favours, and names it", () => {
    const result = setup();

    for (const challenger of result.alternatives) {
      const reasoning = reasonAboutChallenge(
        evaluateChallenger(challenger, result),
        result.context,
      )!;

      for (const line of reasoning.gains) {
        expect(line.favours).toBe("challenger");
        expect(line.favoursName).toBe(reasoning.challengerName);
      }

      for (const line of reasoning.losses) {
        expect(line.favours).toBe("winner");
        expect(line.favoursName).toBe(reasoning.winnerName);
      }
    }
  });

  /*
   * A table that runs #1, #2, #4 reads as a bug unless the missing rank is
   * accounted for. Every ranked priority is either a row or on this list.
   */
  it("accounts for every ranked priority, reported or not", () => {
    const result = setup();
    const order = ["safetyAssistance", "practicality", "comfort"];

    for (const challenger of result.alternatives) {
      const evaluation = evaluateChallenger(challenger, result);

      const reasoning = reasonAboutChallenge(evaluation, result.context)!;

      const covered = [
        ...challengeRows(reasoning).map((row) => row.priority),
        ...reasoning.unseparated.map((item) => item.priority),
      ];

      expect(new Set(covered).size).toBe(order.length);
      expect([...covered].sort()).toEqual([...order].sort());

      /* And it never lists a priority that already has a row. */
      for (const item of reasoning.unseparated) {
        expect(challengeRows(reasoning).map((row) => row.priority)).not.toContain(
          item.priority,
        );
      }
    }
  });

  /* A feature can sit in two categories; saying it twice is padding. */
  it("never makes the same point twice", () => {
    const result = setup();

    for (const challenger of result.alternatives) {
      const reasoning = reasonAboutChallenge(
        evaluateChallenger(challenger, result),
        result.context,
      )!;

      const claims = [...reasoning.gains, ...reasoning.losses].map(
        (line) => line.evidence,
      );

      expect(new Set(claims).size).toBe(claims.length);
    }
  });

  /* "Then why wasn't this one recommended?" is the reader's next question. */
  it("always answers why the recommendation still stands", () => {
    const result = setup();

    for (const challenger of result.alternatives) {
      const reasoning = reasonAboutChallenge(
        evaluateChallenger(challenger, result),
        result.context,
      )!;

      expect(reasoning.verdict.length).toBeGreaterThan(0);
      expect(reasoning.verdict).not.toMatch(/\d+\/100/);
    }
  });

  it("keeps the car names intact in its prose", () => {
    const result = setup();

    for (const challenger of result.alternatives) {
      const reasoning = reasonAboutChallenge(
        evaluateChallenger(challenger, result),
        result.context,
      )!;

      const prose = [
        reasoning.verdict,
        reasoning.cost ?? "",
        reasoning.budget ?? "",
      ].join(" ");

      /* A lowercased sentence turns "CX-60" into "cx-60". */
      expect(prose).not.toMatch(/\bcx-60\b/);
      expect(prose).not.toMatch(/\bcompass has\b/);
    }
  });
});
