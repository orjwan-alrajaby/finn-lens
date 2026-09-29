import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";

import { makeCar } from "@/lib/reasoning-engine/test-fixtures";
import type { FinnCar } from "@/lib/types";

import { resolveCar } from "./currentCar";

/**
 * Answering "which car is this?" for a button that is drawn before the answer
 * exists.
 *
 * The control on a card now appears the moment the card does, alongside the
 * pin button, while the car's data arrives separately — finn.com draws the
 * cards, and the interceptor's copy of FINN's own response reaches storage
 * afterwards. So a reader can very reasonably click a car we are about to
 * know about, and "we couldn't load this car" would be a lie told
 * milliseconds before it stopped being one.
 *
 * Hence a wait, and hence its two limits: it wakes on the write rather than
 * polling for it, and it gives up rather than spinning forever.
 *
 * And hence the third step. A car FINN genuinely never sent — a card drawn
 * from markup, a cache cleared underneath us, a page fetched before the
 * interceptor was installed — is asked for outright, the way the pin button
 * has always asked for it. Not asking was the bug: the reader could pin a car
 * that Lens then claimed not to know about.
 */

let storage: Record<string, unknown>;
let fetched: string[];
let apiResults: unknown[];
let listeners: ((
  changes: Record<string, unknown>,
  areaName: string,
) => void)[];

/** Writes the way `mergeLoadedCars` does — value, then the event. */
function land(...cars: FinnCar[]) {
  storage.loadedCarsFromFinnApi = {
    cars: Object.fromEntries(cars.map((car) => [car.id, car])),
    total: cars.length,
  };

  for (const listener of listeners) {
    listener({ loadedCarsFromFinnApi: {} }, "local");
  }
}

beforeEach(() => {
  storage = {};
  listeners = [];
  fetched = [];
  apiResults = [];

  /*
   * A listing page with one card on it, which is what the badge is attached
   * to and what `fetchCar` reads its API context from.
   */
  const { document } = parseHTML(
    `<!doctype html><html><body>
       <div data-testid="product-listing">
         <div data-testid="product-card" data-productid="byd-dolphin-36933-black">
           <h3><a href="/de-DE/models/byd/dolphin?selected_config=36933">BYD Dolphin</a></h3>
         </div>
       </div>
     </body></html>`,
  );

  Object.assign(globalThis, {
    document,
    fetch: async (url: string) => {
      fetched.push(url);

      return {
        ok: true,
        json: async () => ({ offset: 0, total_results: 0, results: apiResults }),
      };
    },
    window: { location: { href: "https://www.finn.com/de-DE/cars" } },
    browser: {
      storage: {
        local: {
          get: async (keys: string | string[]) =>
            Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys])
                .filter((key) => key in storage)
                .map((key) => [key, storage[key]]),
            ),
          set: async (values: Record<string, unknown>) => {
            Object.assign(storage, values);
          },
        },
        onChanged: {
          addListener: (fn: (typeof listeners)[number]) => {
            listeners.push(fn);
          },
          removeListener: (fn: (typeof listeners)[number]) => {
            listeners = listeners.filter((item) => item !== fn);
          },
        },
      },
    },
  });
});

/** One entry shaped the way FINN's `/api/cars` returns them. */
function apiCar(id: number) {
  return {
    uid: id,
    config_id: id,
    brand: { id: "byd", picture: { url: "" } },
    model: "Dolphin",
    model_year: "2025",
    engine: "Electric",
    equipment_line: null,
    trim_name: "Comfort",
    fuel: "Elektro",
    gearshift: "Automatik",
    config_drive: "Front",
    cartype: "Hatchback",
    power: 150,
    seats: "5",
    doors: "5",
    default_downpayment_term: 6,
    downpayment_prices: {
      msrp: 30000,
      available_price_list: { b2c_6: 449, b2b_6: 380 },
      extra_km_price: 0.2,
    },
    availability_by_term: {},
    consumption: 16.5,
    consumption_city: null,
    consumption_highway: null,
    co2emission: 0,
    co2_class: "A",
    ev_range: 380,
    battery_capacity: 58,
    trunk_capacity: 310,
    color: { id: "black", specific: "Black", color_hex: "#000" },
    picture: { url: "", type: "" },
    pictures: [],
    vehicle_size: { length_mm: 4000, width_mm: 1800, height_mm: 1500 },
    is_refurbished: false,
    has_hitch: "false",
  };
}

describe("resolveCar", () => {
  it("answers straight away from what is already in hand", async () => {
    land(makeCar({ id: 36933 }));

    expect((await resolveCar(36933))?.id).toBe(36933);
  });

  /* Without a wait asked for, nothing is waited for. */
  it("says no immediately when it is not allowed to wait", async () => {
    expect(await resolveCar(36933)).toBeNull();
  });

  it("waits for a car that is still on its way", async () => {
    const pending = resolveCar(36933, { waitMs: 1000 });

    /* The interceptor's response reaches storage a moment later. */
    land(makeCar({ id: 36933 }));

    expect((await pending)?.id).toBe(36933);
  });

  it("ignores a write that brings some other car", async () => {
    const pending = resolveCar(36933, { waitMs: 120 });

    land(makeCar({ id: 34889 }));

    expect(await pending).toBeNull();
  });

  it("gives up rather than spinning on a car FINN never sends", async () => {
    expect(await resolveCar(36933, { waitMs: 40 })).toBeNull();
  });

  /*
   * The bug this exists to fix. A card can be on the page for a car the
   * interceptor never saw, and the panel used to say "we couldn't load this
   * car" while the pin button beside it would have fetched the same car
   * happily.
   */
  it("asks FINN for a car it was never sent", async () => {
    apiResults = [apiCar(36933)];

    const car = await resolveCar(36933, { fetchIfMissing: true });

    expect(car?.id).toBe(36933);
    expect(fetched).toHaveLength(1);
  });

  it("keeps what it fetched, so nobody asks twice", async () => {
    apiResults = [apiCar(36933)];

    await resolveCar(36933, { fetchIfMissing: true });

    /* Written to the same cache the interceptor fills. */
    const cached = (
      storage.loadedCarsFromFinnApi as { cars: Record<number, FinnCar> }
    ).cars;

    expect(cached[36933]?.id).toBe(36933);

    const again = await resolveCar(36933);

    expect(again?.id).toBe(36933);
    expect(fetched).toHaveLength(1);
  });

  /* Storage first: a car we already hold is never worth a request. */
  it("does not ask for a car it already has", async () => {
    land(makeCar({ id: 36933 }));

    await resolveCar(36933, { fetchIfMissing: true });

    expect(fetched).toEqual([]);
  });

  it("does not ask for one that arrives while it waits", async () => {
    const pending = resolveCar(36933, {
      waitMs: 1000,
      fetchIfMissing: true,
    });

    land(makeCar({ id: 36933 }));

    expect((await pending)?.id).toBe(36933);
    expect(fetched).toEqual([]);
  });

  /* Not asking is still the default — badge passes must never trigger this. */
  it("asks for nothing unless it is told to", async () => {
    apiResults = [apiCar(36933)];

    expect(await resolveCar(36933, { waitMs: 20 })).toBeNull();
    expect(fetched).toEqual([]);
  });

  it("says no rather than throwing when FINN answers with nothing", async () => {
    apiResults = [];

    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(await resolveCar(36933, { fetchIfMissing: true })).toBeNull();

    error.mockRestore();
  });

  /* The listener lives on somebody else's event bus; it has to come off. */
  it("unsubscribes whether it found the car or not", async () => {
    await resolveCar(36933, { waitMs: 30 });

    expect(listeners).toHaveLength(0);

    const pending = resolveCar(36933, { waitMs: 1000 });

    land(makeCar({ id: 36933 }));
    await pending;

    expect(listeners).toHaveLength(0);
  });
});
