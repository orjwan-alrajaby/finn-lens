import { beforeEach, describe, expect, it } from "vitest";

import { getLoadedCars, mergeLoadedCars } from "./cache";
import { makeCar } from "@/lib/reasoning-engine/test-fixtures";
import type { FinnCar } from "@/lib/types";

/**
 * The browsing cache, and the one thing it must never do.
 *
 * Every one of these covers real behaviour rather than the shape of the
 * implementation: a reader who pins a car, browses to another page and comes
 * back must still find their car in hand, because the panel and the card
 * badges refuse to speak about a car they can't read.
 *
 * The regression is `preserves cars written before this page loaded`. Storage
 * used to be written from a copy the content script kept in memory, reset on
 * every page load — so the first `/api/cars` response after any navigation
 * replaced the entire cache with that one page's cars.
 */

let storage: Record<string, unknown>;

const cars = (...list: FinnCar[]): Record<number, FinnCar> =>
  Object.fromEntries(list.map((car) => [car.id, car]));

beforeEach(() => {
  storage = {};

  Object.assign(globalThis, {
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
      },
    },
  });
});

const cached = () =>
  storage.loadedCarsFromFinnApi as { cars: Record<number, FinnCar>; total: number };

describe("mergeLoadedCars", () => {
  it("preserves cars written before this page loaded", async () => {
    await mergeLoadedCars(cars(makeCar({ id: 1 }), makeCar({ id: 2 })));
    await mergeLoadedCars(cars(makeCar({ id: 3 })));

    expect(Object.keys(await getLoadedCars()).sort()).toEqual(["1", "2", "3"]);
  });

  it("holds one entry per car however many times it is merged", async () => {
    await mergeLoadedCars(cars(makeCar({ id: 7, name: "First read" })));
    await mergeLoadedCars(cars(makeCar({ id: 7, name: "Second read" })));

    const loaded = await getLoadedCars();

    expect(Object.keys(loaded)).toEqual(["7"]);
    expect(loaded[7]?.name).toBe("Second read");
    expect(cached().total).toBe(1);
  });

  it("counts the cars it actually holds", async () => {
    await mergeLoadedCars(cars(makeCar({ id: 1 }), makeCar({ id: 2 })));
    await mergeLoadedCars(cars(makeCar({ id: 2 }), makeCar({ id: 3 })));

    expect(cached().total).toBe(3);
  });

  it("starts from nothing when no cache has ever been written", async () => {
    await mergeLoadedCars(cars(makeCar({ id: 5 })));

    expect(Object.keys(await getLoadedCars())).toEqual(["5"]);
  });

  it("keeps every car when two responses land at once", async () => {
    await Promise.all([
      mergeLoadedCars(cars(makeCar({ id: 1 }))),
      mergeLoadedCars(cars(makeCar({ id: 2 }))),
      mergeLoadedCars(cars(makeCar({ id: 3 }))),
    ]);

    expect(Object.keys(await getLoadedCars()).sort()).toEqual(["1", "2", "3"]);
  });

  it("leaves the cache alone when there is nothing to add", async () => {
    await mergeLoadedCars(cars(makeCar({ id: 1 })));
    await mergeLoadedCars({});

    expect(Object.keys(await getLoadedCars())).toEqual(["1"]);
  });
});

describe("getLoadedCars", () => {
  it("reads an empty cache as empty rather than throwing", async () => {
    expect(await getLoadedCars()).toEqual({});
  });

  it.each([
    ["a record with no cars field", { total: 3 }],
    ["a cars field that isn't a map", { cars: [], total: 0 }],
    ["a string where a record belongs", "loadedCarsFromFinnApi"],
    ["null", null],
  ])("survives %s in storage", async (_label, value) => {
    storage.loadedCarsFromFinnApi = value;

    expect(await getLoadedCars()).toEqual({});
  });

  it("recovers from malformed storage by rebuilding on the next merge", async () => {
    storage.loadedCarsFromFinnApi = { cars: "nonsense" };

    await mergeLoadedCars(cars(makeCar({ id: 9 })));

    expect(Object.keys(await getLoadedCars())).toEqual(["9"]);
  });
});
