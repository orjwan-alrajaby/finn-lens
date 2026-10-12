import { describe, expect, it } from "vitest";

import {
  AVAILABLE_CATEGORY_FEATURES,
  CATEGORIES,
  CATEGORY_IDS,
  DEFAULT_CATEGORY_FEATURES,
  DEFAULT_DEFAULT_PROFILE_ID,
  DEFAULT_PRIORITIES,
  FEATURE_IMPORTANCE,
  FEATURES,
  IMPORTANCE_LEVELS,
  MAX_FEATURES_PER_CATEGORY,
  MAX_PRIORITIES,
  MIN_PRIORITIES,
  PROFILES,
  SIGNALS,
  profileEmphasis,
  type ProfileId,
} from "./constants";

import { DEFAULT_PREFERENCES } from "./constants";
import { homeOf } from "./evidence";
import { buildReasoningContext, evaluateVehicle, getCategory } from "./index";
import { makeCar } from "./test-fixtures";
import type { CategoryId, FeatureId, SignalId } from "./types";

const def = (id: CategoryId) =>
  CATEGORIES[id] as {
    features: readonly SignalId[];
    niche?: readonly SignalId[];
    alsoCounts?: readonly SignalId[];
    expected?: readonly FeatureId[];
    numericOnly: boolean;
  };

/* -------------------------------------------------------------------------- */
/* The priorities                                                             */
/* -------------------------------------------------------------------------- */

describe("the eight priorities", () => {
  it("are the ones the model defines, with Family Friendly folded into Practicality", () => {
    expect(CATEGORY_IDS).toEqual([
      "safetyAssistance",
      "cityParking",
      "practicality",
      "longDistance",
      "climateSuitability",
      "environmental",
      "efficiency",
      "comfort",
    ]);
    expect(CATEGORY_IDS).not.toContain("familyFriendly");
  });

  it("scores safety on the assistance that varies, and counts gaps in its standard kit", () => {
    expect(def("safetyAssistance").features).toEqual([
      "hasBlindSpotAssist",
      "hasRearCrosswalkWarning",
      "hasMatrixLedHeadlights",
    ]);

    expect(def("safetyAssistance").expected).toEqual([
      "hasEmergencyBrakingAssist",
      "hasLaneKeepingAssist",
      "hasTrafficSignRecognition",
      "hasEmergencyCallSystem",
      "hasTirePressureMonitoringSystem",
    ]);
  });

  it("keeps boot volume out of Practicality while its data isn't trustworthy", () => {
    expect(def("practicality").features).not.toContain("bootVolume");
  });

  it("marks towing, roof rails, six seats, a spare wheel and all-wheel drive as counted only once raised", () => {
    expect(def("practicality").niche).toEqual(["hasTowbar", "towingCapacity1500", "hasRoofRails", "seatsSixPlus"]);
    expect(def("longDistance").niche).toEqual(["hasSpareWheel"]);
    expect(def("climateSuitability").niche).toEqual(["hasAllWheelDrive"]);

    for (const id of CATEGORY_IDS) {
      for (const key of def(id).niche ?? []) expect(def(id).features).toContain(key);
    }
  });

  it("gives Long Distance the electric range limit and no other priority one", () => {
    for (const id of CATEGORY_IDS) {
      expect((CATEGORIES[id] as { limit?: string }).limit).toBe(
        id === "longDistance" ? "evRange" : undefined,
      );
    }
  });

  it("only names evidence that exists", () => {
    for (const id of CATEGORY_IDS) {
      for (const key of [...def(id).features, ...(def(id).alsoCounts ?? [])]) {
        expect(SIGNALS[key]).toBeDefined();
      }
      for (const key of def(id).expected ?? []) {
        expect(FEATURES[key]).toBeDefined();
      }
    }
  });

  it("never lists an item twice within one priority", () => {
    for (const id of CATEGORY_IDS) {
      const keys = AVAILABLE_CATEGORY_FEATURES[id];
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  /*
   * Two priorities read a measured figure — length, and electric range — and
   * say so in `measured`. Add a figure to the engine without the copy and
   * this fails, and so does the reverse.
   */
  it("names the measured figure of every priority that reads one", () => {
    const cars = [
      makeCar({ id: 1, fuelType: "Electric", co2: 0, consumption: 16, range: 450, features: ["hasHeatedSeats"] }),
    ];

    const context = buildReasoningContext(cars, CATEGORY_IDS.slice(0, 5), DEFAULT_PREFERENCES);
    const all = buildReasoningContext(cars, CATEGORY_IDS.slice(2, 7), DEFAULT_PREFERENCES);

    const scoredOnAFigure = [
      ...evaluateVehicle(cars[0] as never, context).priorities,
      ...evaluateVehicle(cars[0] as never, all).priorities,
    ]
      .filter((item) => item.numeric != null && !CATEGORIES[item.priority].numericOnly)
      .map((item) => item.priority);

    const distinct = [...new Set(scoredOnAFigure)].sort();

    expect(distinct).toEqual(["cityParking", "longDistance"]);

    for (const id of CATEGORY_IDS) {
      const measured = getCategory(id)?.measured;

      expect(Boolean(measured)).toBe(distinct.includes(id));
      if (measured) expect(measured.length).toBeGreaterThan(30);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Raising                                                                    */
/* -------------------------------------------------------------------------- */

describe("raising items", () => {
  it("starts a fresh install on the default profile's emphasis, marked as the profile's", () => {
    expect(DEFAULT_CATEGORY_FEATURES).toEqual(profileEmphasis(DEFAULT_DEFAULT_PROFILE_ID));

    for (const id of CATEGORY_IDS) {
      for (const pick of DEFAULT_CATEGORY_FEATURES[id]) {
        expect(pick.source).toBe("profile");
      }
    }
  });

  it("only raises items in their home, within the cap, at a real level", () => {
    for (const profile of Object.keys(PROFILES) as ProfileId[]) {
      const emphasis = profileEmphasis(profile);

      for (const id of CATEGORY_IDS) {
        const picks = emphasis[id];

        expect(picks.length).toBeLessThanOrEqual(MAX_FEATURES_PER_CATEGORY);
        expect(new Set(picks.map((pick) => pick.key)).size).toBe(picks.length);

        for (const pick of picks) {
          expect(homeOf(pick.key)).toBe(id);
          expect(IMPORTANCE_LEVELS).toContain(pick.importance);
        }
      }
    }
  });

  it("only raises priorities the profile actually ranks", () => {
    for (const profile of Object.keys(PROFILES) as ProfileId[]) {
      const emphasis = profileEmphasis(profile);
      const ranked = PROFILES[profile].priorities as CategoryId[];

      for (const id of CATEGORY_IDS) {
        if (!ranked.includes(id)) expect(emphasis[id]).toEqual([]);
      }
    }
  });

  /* Three levels, and none of them reads as a hard requirement. */
  it("describes importance as preference, never as a requirement", () => {
    expect(Object.keys(FEATURE_IMPORTANCE)).toEqual(["high", "medium", "low"]);

    for (const level of IMPORTANCE_LEVELS) {
      const meta = FEATURE_IMPORTANCE[level];

      expect(meta.label).not.toMatch(/essential|required|must/i);
      expect(meta.hint.length).toBeGreaterThan(0);
    }

    expect([FEATURE_IMPORTANCE.low.weight, FEATURE_IMPORTANCE.medium.weight, FEATURE_IMPORTANCE.high.weight]).toEqual([2, 3, 4]);
  });
});

/* -------------------------------------------------------------------------- */
/* Explanations                                                               */
/* -------------------------------------------------------------------------- */

describe("no reader should have to look evidence up elsewhere", () => {
  const offered = new Set<SignalId>(
    CATEGORY_IDS.flatMap((id) => [
      ...def(id).features,
      ...(def(id).alsoCounts ?? []),
      ...(def(id).expected ?? []),
    ]),
  );

  it("explains every item it names, specifically", () => {
    for (const key of offered) {
      const { explanation } = SIGNALS[key];

      expect(explanation.length).toBeGreaterThan(30);
      expect(explanation).toMatch(/[.!]$/);
    }
  });

  it("never answers with filler", () => {
    const FILLER = [
      "useful everyday",
      "a general package",
      "designed to support",
      "improve your experience",
      "for added convenience",
      "and much more",
      "state of the art",
      "premium feel",
    ];

    for (const key of offered) {
      const explanation = SIGNALS[key].explanation.toLowerCase();
      for (const phrase of FILLER) expect(explanation).not.toContain(phrase);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

describe("profiles", () => {
  it("carry three to five priorities", () => {
    for (const profile of Object.values(PROFILES)) {
      expect(profile.priorities.length).toBeGreaterThanOrEqual(MIN_PRIORITIES);
      expect(profile.priorities.length).toBeLessThanOrEqual(MAX_PRIORITIES);
    }
  });

  /* A profile promising one dominant concern puts it at half the result. */
  it("give each single-concern profile exactly three priorities, led by its concern", () => {
    expect(PROFILES.nervous.priorities).toEqual(["safetyAssistance", "cityParking", "climateSuitability"]);
    expect(PROFILES.eco.priorities).toEqual(["environmental", "safetyAssistance", "practicality"]);
  });

  it("match the model's final orders", () => {
    expect(PROFILES.family.priorities).toEqual(["practicality", "safetyAssistance", "cityParking", "comfort"]);
    expect(PROFILES.commuter.priorities).toEqual(["cityParking", "comfort", "safetyAssistance", "environmental"]);
    expect(PROFILES.roadtrip.priorities).toEqual(["longDistance", "comfort", "safetyAssistance", "practicality", "climateSuitability"]);
    expect(PROFILES.balanced.priorities).toEqual(["safetyAssistance", "practicality", "comfort", "cityParking", "environmental"]);
  });

  it("never repeat a priority within one profile", () => {
    for (const profile of Object.values(PROFILES)) {
      expect(new Set(profile.priorities).size).toBe(profile.priorities.length);
    }
  });

  it("only reference priorities that exist", () => {
    for (const profile of Object.values(PROFILES)) {
      for (const priority of profile.priorities) expect(CATEGORY_IDS).toContain(priority);
    }
  });

  it("makes the default profile the one the user actually starts on", () => {
    expect(PROFILES[DEFAULT_DEFAULT_PROFILE_ID]).toBeDefined();
    expect(DEFAULT_PRIORITIES).toEqual([...PROFILES[DEFAULT_DEFAULT_PROFILE_ID].priorities]);
  });

  it("say who each one is for, what it assumes and what it doesn't promise", () => {
    for (const profile of Object.values(PROFILES)) {
      expect(profile.forWhom.length).toBeGreaterThan(30);
      expect(profile.assumes.length).toBeGreaterThan(30);
      expect(profile.doesNotGuarantee.length).toBeGreaterThan(30);
    }
  });
});
