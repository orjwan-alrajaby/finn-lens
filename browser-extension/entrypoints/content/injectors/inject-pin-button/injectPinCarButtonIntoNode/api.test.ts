import { describe, expect, it, vi } from "vitest";

import { loadCarByConfigId, loadCarPage, splitBrandAndModel } from "./api";

/**
 * A detail page gives the car's name twice — as a heading and as a URL — and
 * neither is enough on its own. These are the shapes that broke the old
 * first-word split, taken from real finn.com paths.
 */
describe("splitBrandAndModel", () => {
  const path = (brand: string, model: string) =>
    `/de-DE/models/${brand}/${model}`;

  it("splits a one-word brand", () => {
    expect(splitBrandAndModel("BYD Dolphin Surf", path("byd", "dolphin-surf")))
      .toEqual({ brand: "BYD", model: "Dolphin Surf" });
  });

  it("keeps a two-word brand together", () => {
    expect(splitBrandAndModel("Alfa Romeo Tonale", path("alfa-romeo", "tonale")))
      .toEqual({ brand: "Alfa Romeo", model: "Tonale" });
  });

  it("handles a brand hyphenated in the slug but not in the heading", () => {
    expect(
      splitBrandAndModel("Mercedes Benz A-Klasse", path("mercedes-benz", "a-klasse")),
    ).toEqual({ brand: "Mercedes Benz", model: "A-Klasse" });
  });

  it("handles a brand hyphenated in both", () => {
    expect(
      splitBrandAndModel("Mercedes-Benz A-Klasse", path("mercedes-benz", "a-klasse")),
    ).toEqual({ brand: "Mercedes-Benz", model: "A-Klasse" });
  });

  it("handles a numeric model", () => {
    expect(splitBrandAndModel("MG 4", path("mg", "4"))).toEqual({
      brand: "MG",
      model: "4",
    });
  });

  it("falls back to the first word when the path doesn't say", () => {
    expect(splitBrandAndModel("BYD Dolphin Surf", "/de-DE/subscribe/byd")).toEqual(
      { brand: "BYD", model: "Dolphin Surf" },
    );
  });

  it("doesn't swallow the whole heading when the slug matches all of it", () => {
    /* A brand and no model left over is not a split worth making. */
    expect(splitBrandAndModel("BYD", path("byd", "dolphin-surf"))).toEqual({
      brand: "BYD",
      model: "",
    });
  });
});

/**
 * The two calls Lens makes to hold the cars a page is showing. What matters
 * in the URL is what went wrong before: `group_by` returns one configuration
 * per model, and a card's id names a configuration — so a grouped call can't
 * answer for the cards on a listing.
 */
describe("asking FINN for the cars a page shows", () => {
    const asked = async (call: () => Promise<unknown>): Promise<URL> => {
        const calls: string[] = [];

        vi.stubGlobal("fetch", (input: string) => {
            calls.push(input);

            return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) } as Response);
        });
        vi.stubGlobal("document", { documentElement: { lang: "de-DE" } });

        await call();
        vi.unstubAllGlobals();

        return new URL(calls[0]!);
    };

    it("reads a page of configurations, ungrouped", async () => {
        const url = await asked(() => loadCarPage(200, 200));

        expect(url.searchParams.get("group_by")).toBeNull();
        expect(url.searchParams.get("offset")).toBe("200");
        expect(url.searchParams.get("limit")).toBe("200");
    });

    it("asks for one configuration by the id a card carries", async () => {
        const url = await asked(() => loadCarByConfigId(31951));

        expect(url.searchParams.get("config_id")).toBe("31951");
        expect(url.searchParams.get("group_by")).toBeNull();
    });
});
