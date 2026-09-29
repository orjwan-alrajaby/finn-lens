import { beforeEach, describe, expect, it } from "vitest";

import { hasSavedLensSettings } from "./index";

/**
 * Whether Lens has anything of the reader's to reason with.
 *
 * This is the gate the in-page analysis opens on: with nothing saved it offers
 * to set Lens up rather than presenting the product's defaults as the reader's
 * own answers. What it must agree with is the settings page — every key it
 * looks at is one that page can now write.
 */
let storage: Record<string, unknown>;

beforeEach(() => {
  storage = {};

  Object.assign(globalThis, {
    browser: {
      storage: {
        local: {
          get: async (keys: string[]) =>
            Object.fromEntries(
              keys.filter((key) => key in storage).map((key) => [key, storage[key]]),
            ),
        },
      },
    },
  });
});

describe("hasSavedLensSettings", () => {
  it("is false for a reader who has never configured anything", async () => {
    expect(await hasSavedLensSettings()).toBe(false);
  });

  it("is true once a priority order has been saved", async () => {
    /* What the settings page writes when the order is edited there. */
    storage.finnLensPriorities = ["safetyAssistance", "practicality", "comfort"];

    expect(await hasSavedLensSettings()).toBe(true);
  });

  it("is true once driving assumptions have been saved", async () => {
    storage.finnLensPreferences = { monthlyBudget: 600 };

    expect(await hasSavedLensSettings()).toBe(true);
  });

  it("is true once a feature has been raised inside a priority", async () => {
    storage.finnLensCategoryFeatures = {
      safetyAssistance: [{ key: "hasBlindSpotAssist", importance: "high" }],
    };

    expect(await hasSavedLensSettings()).toBe(true);
  });

  it("isn't fooled by an empty order or empty picks", async () => {
    storage.finnLensPriorities = [];
    storage.finnLensCategoryFeatures = { safetyAssistance: [], comfort: [] };

    expect(await hasSavedLensSettings()).toBe(false);
  });

  it("ignores keys that don't change what an analysis says", async () => {
    /* Enabling a profile changes which questions get asked, not the answers. */
    storage.finnLensDefaultProfileId = "familyFirst";
    storage.finnLensProfiles = [];

    expect(await hasSavedLensSettings()).toBe(false);
  });
});
