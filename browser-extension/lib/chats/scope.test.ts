import { describe, expect, it } from "vitest";

import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { addedToJudgement, theHeadline } from "./scope";

/*
 * "Add them to the judgement" adds: the cars judged on another page stay in,
 * and so do their chips.
 */

const cars = fleet().sort((a, b) => a.id - b.id);

describe("adding this page's cars to a judgement", () => {
    it("keeps the cars judged before, after this page's own", () => {
        const before = cars.slice(0, 10);
        const here = cars.slice(5, 20);
        const { cars: added, headline } = addedToJudgement(before, here, "15 cars on this page");

        expect(added.map((car) => car.id)).toEqual([...here, ...cars.slice(0, 5)].map((car) => car.id));
        expect(headline).toBe("20 cars: 15 from this page and 5 judged before");
    });

    it("is this page alone when everything judged before is on it", () => {
        const here = cars.slice(0, 20);

        expect(addedToJudgement(cars.slice(0, 10), here, "20 cars on this page")).toEqual({ cars: here, headline: "20 cars on this page" });
    });
});

describe("a headline in a sentence", () => {
    it("says “the car”, not “the 1 car”, and the count otherwise", () => {
        expect(theHeadline("1 car on this page")).toBe("the car on this page");
        expect(theHeadline("1 car matching your filters")).toBe("the car matching your filters");
        expect(theHeadline("24 cars matching your filters")).toBe("the 24 cars matching your filters");
        expect(theHeadline("12 cars on this page")).toBe("the 12 cars on this page");
    });
});
