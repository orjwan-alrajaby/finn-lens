import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CATEGORY_FEATURES,
  DEFAULT_DEFAULT_PROFILE_ID,
  DEFAULT_PROFILES,
  MAX_FEATURES_PER_CATEGORY,
  PROFILES,
  profileEmphasis,
} from "./constants";
import type { CategoryId } from "./types";

/**
 * Settings migration.
 *
 * Merging two categories into one and turning profiles into fixed
 * configuration are both changes that land on people who already have data
 * stored. None of it may be silently dropped, and nothing may come back in a
 * shape the current build can't render.
 */

/* A minimal stand-in for the extension storage API. */
let stored: Record<string, unknown> = {};

vi.stubGlobal("browser", {
  storage: {
    local: {
      get: async (keys: string[]) =>
        Object.fromEntries(
          keys
            .filter((key) => key in stored)
            .map((key) => [key, stored[key]]),
        ),
      set: async (values: Record<string, unknown>) => {
        stored = { ...stored, ...values };
      },
    },
  },
});

const {
  applyProfile,
  hasSavedLensSettings,
  isCustomisedFrom,
  loadLensSettings,
  saveLensSettings,
} = await import("./index");

beforeEach(() => {
  stored = {};
});

/* -------------------------------------------------------------------------- */
/* The category merge                                                         */
/* -------------------------------------------------------------------------- */

describe("the safety merge reaches existing users without breaking them", () => {
  it("rewrites a stored priority order onto the merged category", async () => {
    stored.finnLensPriorities = [
      "safety",
      "practicality",
      "driverAssistance",
      "comfort",
    ];

    const settings = await loadLensSettings();

    expect(settings.priorities).toEqual([
      "safetyAssistance",
      "practicality",
      "comfort",
    ]);
  });

  /*
   * Someone who ranked safety #1 and driver assistance #4 cared most about
   * the first position, so that is the one the merged priority keeps.
   */
  it("collapses the duplicate a merge creates to the higher position", async () => {
    stored.finnLensPriorities = [
      "safety",
      "practicality",
      "comfort",
      "driverAssistance",
    ];

    const settings = await loadLensSettings();

    expect(settings.priorities[0]).toBe("safetyAssistance");
    expect(
      settings.priorities.filter((id) => id === "safetyAssistance"),
    ).toHaveLength(1);
  });

  it("still drops the retired affordability priority", async () => {
    stored.finnLensPriorities = ["affordability", "safety", "practicality"];

    const settings = await loadLensSettings();

    expect(settings.priorities).not.toContain("affordability");
    expect(settings.priorities).toContain("safetyAssistance");
  });

  it("moves every stored raise to its item's home, whichever list it came from", async () => {
    stored.finnLensCategoryFeatures = {
      safety: [
        { key: "hasEmergencyBrakingAssist", tier: "essential" },
        { key: "hasBlindSpotAssist", tier: "essential" },
      ],
      driverAssistance: [
        { key: "hasAdaptiveCruiseControl", tier: "good" },
        { key: "hasOneEightyDegreesReversingCamera", tier: "good" },
      ],
    };

    const settings = await loadLensSettings();

    /* Emergency braking is Safety's standard kit: raisable, so its raise is kept. */
    expect(settings.categoryFeatures.safetyAssistance).toEqual([
      { key: "hasEmergencyBrakingAssist", importance: "high", source: "user" },
      { key: "hasBlindSpotAssist", importance: "high", source: "user" },
    ]);

    expect(settings.categoryFeatures.longDistance).toEqual([
      { key: "hasAdaptiveCruiseControl", importance: "medium", source: "user" },
    ]);

    expect(settings.categoryFeatures.cityParking).toEqual([
      { key: "hasOneEightyDegreesReversingCamera", importance: "medium", source: "user" },
    ]);
  });

  /* A raise on something the model no longer counts has nowhere to count, and is dropped. */
  it("drops raises on items no longer scored, and keeps those on standard equipment", async () => {
    stored.finnLensCategoryFeatures = {
      comfort: [
        { key: "hasLeatherSeats", importance: "medium" },
        { key: "hasAmbientInteriorLightning", importance: "low" },
      ],
      safetyAssistance: [{ key: "hasEmergencyBrakingAssist", importance: "high" }],
    };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.comfort).toEqual([]);
    expect(settings.categoryFeatures.safetyAssistance).toEqual([
      { key: "hasEmergencyBrakingAssist", importance: "high", source: "user" },
    ]);
  });

  it("folds Family Friendly into Practicality, in the order and the raises", async () => {
    stored.finnLensPriorities = ["familyFriendly", "practicality", "comfort"];
    stored.finnLensCategoryFeatures = {
      familyFriendly: [
        { key: "hasIsofix", importance: "high" },
        { key: "hasElectricTailgate", importance: "medium" },
        { key: "hasOneEightyDegreesReversingCamera", importance: "high" },
      ],
    };

    const settings = await loadLensSettings();

    expect(settings.priorities).toEqual(["practicality", "comfort"]);
    /* ISOFIX is Practicality's standard equipment: raisable, so its raise is kept. */
    expect(settings.categoryFeatures.practicality).toEqual([
      { key: "hasIsofix", importance: "high", source: "user" },
      { key: "hasElectricTailgate", importance: "medium", source: "user" },
    ]);
    expect(settings.categoryFeatures.cityParking).toEqual([
      { key: "hasOneEightyDegreesReversingCamera", importance: "high", source: "user" },
    ]);
  });

  /* A raise stays with its item even when that priority isn't ranked. */
  it("keeps a raise whose new home isn't in the reader's order", async () => {
    stored.finnLensPriorities = ["safety", "comfort", "practicality"];
    stored.finnLensCategoryFeatures = {
      safety: [{ key: "hasThreeSixtyDegreesCamera", importance: "low" }],
    };

    const settings = await loadLensSettings();

    expect(settings.priorities).not.toContain("cityParking");
    expect(settings.categoryFeatures.cityParking).toEqual([
      { key: "hasThreeSixtyDegreesCamera", importance: "low", source: "user" },
    ]);
  });

  /* The same item raised in two old lists arrives once, and loud. */
  it("collapses a duplicate raise, keeping the stronger level", async () => {
    stored.finnLensCategoryFeatures = {
      comfort: [{ key: "hasHeatedSeats", importance: "low" }],
      climateSuitability: [{ key: "hasHeatedSeats", importance: "high" }],
      longDistance: [{ key: "hasHeatedSeats", importance: "medium" }],
    };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.climateSuitability).toEqual([
      { key: "hasHeatedSeats", importance: "high", source: "user" },
    ]);

    const homes = Object.values(settings.categoryFeatures).filter((picks) =>
      picks.some((p) => p.key === "hasHeatedSeats"),
    );

    expect(homes).toHaveLength(1);
  });

  /*
   * Old tiers map onto importance by intent. "Essential" becomes high rather
   * than something stronger on purpose — it was never a hard requirement.
   */
  it("carries the old tiers over as importance", async () => {
    stored.finnLensCategoryFeatures = {
      practicality: [
        { key: "hasSplitFoldingRearSeats", tier: "essential" },
        { key: "hasElectricTailgate", tier: "good" },
        { key: "hasRoofRails", tier: "luxury" },
      ],
    };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.practicality).toEqual([
      { key: "hasSplitFoldingRearSeats", importance: "high", source: "user" },
      { key: "hasElectricTailgate", importance: "medium", source: "user" },
      { key: "hasRoofRails", importance: "low", source: "user" },
    ]);
  });

  /* The selection-only build stored bare ids and no importance at all. */
  it("reads a flat id list as the reader's raises at the middle level", async () => {
    stored.finnLensCategoryFeatures = {
      practicality: ["hasSplitFoldingRearSeats", "hasRoofRails"],
    };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.practicality).toEqual([
      { key: "hasSplitFoldingRearSeats", importance: "medium", source: "user" },
      { key: "hasRoofRails", importance: "medium", source: "user" },
    ]);
  });

  it("keeps who raised an item when it was stored", async () => {
    stored.finnLensCategoryFeatures = {
      practicality: [{ key: "hasRoofRails", importance: "low", source: "profile" }],
    };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.practicality).toEqual([
      { key: "hasRoofRails", importance: "low", source: "profile" },
    ]);
  });

  it("caps a merged list that overflows the maximum", async () => {
    stored.finnLensCategoryFeatures = {
      familyFriendly: ["hasSplitFoldingRearSeats", "hasElectricTailgate"],
      practicality: ["rearDoors", "hasTowbar", "hasRoofRails", "seatsSixPlus"],
    };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.practicality).toHaveLength(MAX_FEATURES_PER_CATEGORY);
  });
});

/* -------------------------------------------------------------------------- */
/* Feature lists                                                              */
/* -------------------------------------------------------------------------- */

describe("stored feature lists are brought up to the current rules", () => {
  it("drops items the model doesn't know", async () => {
    stored.finnLensCategoryFeatures = {
      practicality: [
        { key: "hasSplitFoldingRearSeats", tier: "essential" },
        { key: "hasSomethingRemoved", tier: "good" },
      ],
    };

    const settings = await loadLensSettings();
    const keys = settings.categoryFeatures.practicality.map((p) => p.key);

    expect(keys).toContain("hasSplitFoldingRearSeats");
    expect(keys).not.toContain("hasSomethingRemoved");
  });

  it("respects a cleared selection instead of refilling it", async () => {
    stored.finnLensCategoryFeatures = { practicality: [] };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.practicality).toEqual([]);
  });

  /*
   * A fresh install is configured, not blank. What makes that honest is that
   * the raises are marked as the profile's, and `hasSavedLensSettings` still
   * reads the install as unanswered.
   */
  it("opens a fresh install on the default profile, and says so", async () => {
    const settings = await loadLensSettings();

    expect(settings.categoryFeatures).toEqual(DEFAULT_CATEGORY_FEATURES);
    expect(settings.basedOn).toBe(DEFAULT_DEFAULT_PROFILE_ID);
    expect(await hasSavedLensSettings()).toBe(false);
  });

  it("starts a fresh install on a chosen default profile's emphasis too", async () => {
    stored.finnLensDefaultProfileId = "nervous";

    const settings = await loadLensSettings();

    expect(settings.basedOn).toBe("nervous");
    expect(settings.categoryFeatures).toEqual(profileEmphasis("nervous"));
  });

  it("leaves untouched categories on the starting emphasis", async () => {
    stored.finnLensCategoryFeatures = {
      practicality: [{ key: "hasRoofRails", tier: "good" }],
    };

    const settings = await loadLensSettings();

    expect(settings.categoryFeatures.cityParking).toEqual(DEFAULT_CATEGORY_FEATURES.cityParking);
  });

  it("reads an order saved before provenance existed as built by hand", async () => {
    stored.finnLensPriorities = ["comfort", "practicality", "safetyAssistance"];

    expect((await loadLensSettings()).basedOn).toBeNull();
  });

  it("keeps the profile a reader's settings were copied from", async () => {
    stored.finnLensPriorities = [...PROFILES.eco.priorities];
    stored.finnLensBasedOn = "eco";

    expect((await loadLensSettings()).basedOn).toBe("eco");
  });
});

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

describe("profiles are configuration, and reconcile to the shipped set", () => {
  it("rebuilds a profile edited by an older build", async () => {
    stored.finnLensProfiles = [
      {
        id: "family",
        label: "My Renamed Profile",
        icon: "🚗",
        forWhom: "whatever",
        assumes: "whatever",
        priorities: ["comfort"],
        enabled: true,
      },
    ];

    const settings = await loadLensSettings();
    const family = settings.profiles.find((p) => p.id === "family")!;

    expect(family.label).toBe(PROFILES.family.label);
    expect(family.priorities).toEqual([...PROFILES.family.priorities]);
  });

  it("brings back profiles an older build deleted", async () => {
    stored.finnLensProfiles = [
      { ...DEFAULT_PROFILES[0], enabled: true },
    ];

    const settings = await loadLensSettings();

    expect(settings.profiles).toHaveLength(DEFAULT_PROFILES.length);
  });

  /* Enabled state is the one thing the user owns, so it survives. */
  it("keeps which profiles the user switched off", async () => {
    stored.finnLensProfiles = DEFAULT_PROFILES.map((profile) => ({
      ...profile,
      enabled: profile.id !== "eco",
    }));

    const settings = await loadLensSettings();

    expect(
      settings.profiles.find((p) => p.id === "eco")?.enabled,
    ).toBe(false);
    expect(
      settings.profiles.find((p) => p.id === "family")?.enabled,
    ).toBe(true);
  });

  it("never comes back with every profile switched off", async () => {
    stored.finnLensProfiles = DEFAULT_PROFILES.map((profile) => ({
      ...profile,
      enabled: false,
    }));

    const settings = await loadLensSettings();

    expect(settings.profiles.some((profile) => profile.enabled)).toBe(true);
  });

  it("falls back to the shipped default when the stored one is unknown", async () => {
    stored.finnLensDefaultProfileId = "a-profile-that-never-existed";

    const settings = await loadLensSettings();

    expect(settings.defaultProfileId).toBe(DEFAULT_DEFAULT_PROFILE_ID);
  });

  it("keeps a valid stored default", async () => {
    stored.finnLensDefaultProfileId = "eco";

    expect((await loadLensSettings()).defaultProfileId).toBe("eco");
  });
});

/* -------------------------------------------------------------------------- */
/* Default profile means selected                                             */
/* -------------------------------------------------------------------------- */

describe("the default profile is the one you actually start on", () => {
  it("starts a fresh install on the default profile's order", async () => {
    const settings = await loadLensSettings();

    expect(settings.priorities).toEqual([
      ...PROFILES[DEFAULT_DEFAULT_PROFILE_ID].priorities,
    ]);
  });

  it("uses the user's chosen default rather than the shipped one", async () => {
    stored.finnLensDefaultProfileId = "roadtrip";

    const settings = await loadLensSettings();

    expect(settings.priorities).toEqual([...PROFILES.roadtrip.priorities]);
  });

  /* A profile that is switched off can't be what you're started on. */
  it("skips a disabled default rather than starting you on it", async () => {
    stored.finnLensDefaultProfileId = "roadtrip";
    stored.finnLensProfiles = DEFAULT_PROFILES.map((profile) => ({
      ...profile,
      enabled: profile.id !== "roadtrip",
    }));

    const settings = await loadLensSettings();

    expect(settings.priorities).not.toEqual([
      ...PROFILES.roadtrip.priorities,
    ]);
    expect(settings.priorities.length).toBeGreaterThan(0);
  });

  /*
   * A profile is a starting point, not something that reasserts itself. Once
   * the user has an order of their own it survives everything else.
   */
  it("never overrides an order the user set themselves", async () => {
    stored.finnLensDefaultProfileId = "eco";
    stored.finnLensPriorities = ["comfort", "practicality"];

    const settings = await loadLensSettings();

    expect(settings.priorities).toEqual(["comfort", "practicality"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Applying a profile                                                         */
/* -------------------------------------------------------------------------- */

describe("applying a profile", () => {
  it("replaces the order and the emphasis, marked as the profile's", () => {
    const applied = applyProfile("family");

    expect(applied.priorities).toEqual([...PROFILES.family.priorities]);
    expect(applied.categoryFeatures).toEqual(profileEmphasis("family"));
    expect(applied.basedOn).toBe("family");

    for (const picks of Object.values(applied.categoryFeatures)) {
      for (const pick of picks) expect(pick.source).toBe("profile");
    }
  });

  it("isn't customised straight after it is applied", () => {
    const applied = applyProfile("nervous");

    expect(isCustomisedFrom(applied, "nervous")).toBe(false);
  });

  it("is customised once the order moves", () => {
    const applied = applyProfile("nervous");
    const [first, second, ...rest] = applied.priorities as [CategoryId, CategoryId, ...CategoryId[]];

    expect(
      isCustomisedFrom(
        { ...applied, priorities: [second, first, ...rest] },
        "nervous",
      ),
    ).toBe(true);
  });

  it("is customised once a raise changes, but not when only who set it does", () => {
    const applied = applyProfile("nervous");
    const safety = applied.categoryFeatures.safetyAssistance;

    const regraded = {
      ...applied,
      categoryFeatures: {
        ...applied.categoryFeatures,
        safetyAssistance: safety.map((pick, index) =>
          index === 0 ? { ...pick, importance: "low" as const } : pick,
        ),
      },
    };

    const reclaimed = {
      ...applied,
      categoryFeatures: {
        ...applied.categoryFeatures,
        safetyAssistance: safety.map((pick) => ({ ...pick, source: "user" as const })),
      },
    };

    expect(isCustomisedFrom(regraded, "nervous")).toBe(true);
    expect(isCustomisedFrom(reclaimed, "nervous")).toBe(false);
  });

  it("counts settings with no profile behind them as the reader's own", () => {
    expect(isCustomisedFrom(applyProfile("eco"), null)).toBe(true);
  });

  it("survives a save and a reload, basis included", async () => {
    await saveLensSettings(applyProfile("roadtrip"));

    const settings = await loadLensSettings();

    expect(settings.basedOn).toBe("roadtrip");
    expect(isCustomisedFrom(settings, settings.basedOn)).toBe(false);
  });
});
