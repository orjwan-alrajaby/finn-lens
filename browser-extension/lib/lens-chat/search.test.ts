import { describe, expect, it } from "vitest";

import { copyFeatures, type Answers } from "@/entrypoints/compare/store";
import { readFinnSearch, vocabularyFrom } from "@/lib/finn-search";
import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import type { PinnedFinnCar } from "@/lib/types";

import { guideSteps } from "./guide";
import { runLens } from "./run";
import { heardFromSearch, searchSentence, searchStart, searchTerm, withSearch } from "./search";
import { EMPTY_UNDERSTANDING, readUnderstanding, ruledOut, toAnswers, toWire, waiveEssential, type Understanding } from "./understanding";

/**
 * What a reader's finn.com filters mean to Lens: answers it doesn't ask for
 * again, never louder than what the reader says in the chat, and gone when
 * the filter is.
 */

const vocabulary = vocabularyFrom({ brands: [{ id: "MG" }, { id: "BMW" }], models: ["iX1"] });
const TODAY = new Date("2026-09-23T10:00:00Z");

const read = (href: string) => readFinnSearch(href, vocabulary, TODAY);

/* Electric SUVs with a towbar and a parking aid, €770–950, the 1,500 km package, six months, early-booking offers. */
const SUV_SEARCH = read(
    "https://www.finn.com/de-DE/subscribe/suv_elektro_6-monate_earlybooking?features=hitch,automatic_parking&max_price=950&mileage_package=1500&min_price=770",
)!;

const CABRIO_SEARCH = read(
    "https://www.finn.com/de-DE/subscribe/mg/cabriolet_automatik_elektro_14-days?doors=2&features=automatic_parking&mileage_package=500&seats=2",
)!;

const base: Answers = {
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
};

const labels = (u: Understanding) => u.needs.filter((need) => need.status === "active").map((need) => need.label);

describe("what the filters tell Lens", () => {
    const u = withSearch(EMPTY_UNDERSTANDING, SUV_SEARCH, TODAY);

    it("makes a need of every filter Lens can check on a car", () => {
        expect(labels(u)).toEqual(expect.arrayContaining(["Towbar", "Parking assistant", "Electric", "An SUV"]));
    });

    it("raises a priority only for equipment a reader could raise themselves", () => {
        const towbar = u.needs.find((need) => need.label === "Towbar")!;
        const parking = u.needs.find((need) => need.label === "Parking assistant")!;

        /* A towbar is Practicality's to raise; a parking aid on 98% of FINN's cars is expected, and scores nothing. */
        expect(towbar.priorities).toEqual(["practicality"]);
        expect(parking.priorities).toEqual([]);
    });

    it("takes the top of the price range as a budget to aim for, not a wall", () => {
        expect(u.budget).toMatchObject({ kind: "target", monthly: 950 });
    });

    it("takes the mileage package as how far they drive", () => {
        expect(u.monthlyKm?.value).toBe(1500);
    });

    it("knows the contract length but not when it starts, and doesn't guess", () => {
        expect(u.rental).toBeNull();
        expect(searchTerm(SUV_SEARCH)).toBe(6);
        expect(searchSentence(u, SUV_SEARCH)).toMatch(/6-month contract/);
    });

    it("notes what it can't rank on, and says it only noted it", () => {
        const { noted } = heardFromSearch(u);

        expect(noted).toEqual(expect.arrayContaining(["Browsing early-booking offers", "From €770 a month"]));
    });

    it("dates the period when the filters say when too", () => {
        /* "Within 14 days" plus a six-month term: October to March. */
        const dated = read("https://www.finn.com/de-DE/subscribe/6-monate_14-days")!;
        const withDates = withSearch(EMPTY_UNDERSTANDING, dated, TODAY);

        expect(withDates.rental).toMatchObject({ from: "2026-10", to: "2027-03", startDay: 7 });
    });

    it("takes the availability filter as when the car is needed, and doesn't ask it again", () => {
        /* "Within 14 days" with no contract length: the start is known, the end isn't. */
        const cabrio = withSearch(EMPTY_UNDERSTANDING, CABRIO_SEARCH, TODAY);

        expect(searchStart(CABRIO_SEARCH, TODAY)).toMatchObject({ month: "2026-10", day: 7, chip: "By 7 October" });
        /* Half a period isn't a period Lens can price on: it asks for the end alone. */
        expect(cabrio.rental).toBeNull();
        expect(heardFromSearch(cabrio, CABRIO_SEARCH).used).toContain("By 7 October");
        expect(heardFromSearch(cabrio, CABRIO_SEARCH).noted.join(" ")).not.toMatch(/Available/);
        expect(searchSentence(cabrio, CABRIO_SEARCH)).toMatch(/needed by 7 October/);
    });

    it("reads 'from November' as a month with no day", () => {
        const november = read("https://www.finn.com/de-DE/subscribe/suv?available_from=2026-11")!;

        expect(searchStart(november, TODAY)).toMatchObject({ month: "2026-11", day: null, chip: "From November 2026" });
    });

    it("keeps two-door, two-seat and colour as context, never as needs", () => {
        const cabrio = withSearch(EMPTY_UNDERSTANDING, CABRIO_SEARCH, TODAY);

        expect(labels(cabrio)).not.toContain("Doors for the back seats");
        expect(heardFromSearch(cabrio).noted).toEqual(expect.arrayContaining(["2 seats", "2 doors"]));
    });
});

describe("the reader's own words win", () => {
    it("never replaces a budget the reader gave in the chat", () => {
        const said: Understanding = {
            ...EMPTY_UNDERSTANDING,
            budget: { kind: "hardMax", monthly: 800, stretchTo: null, said: "you said €800 is the most" },
        };

        expect(withSearch(said, SUV_SEARCH, TODAY).budget).toMatchObject({ kind: "hardMax", monthly: 800 });
    });

    it("doesn't overrule 'no limit'", () => {
        const noLimit = waiveEssential(EMPTY_UNDERSTANDING, "budget");

        expect(withSearch(noLimit, SUV_SEARCH, TODAY).budget).toBeNull();
    });

    it("keeps the reader's own needs when the filters change", () => {
        const own: Understanding = {
            ...EMPTY_UNDERSTANDING,
            needs: [
                {
                    id: "kids",
                    label: "Kids in the back",
                    importance: "important",
                    said: "I have kids",
                    priorities: ["practicality"],
                    evidence: [{ id: "hasIsofix", use: "", unwanted: false, mustHave: false }],
                    notInData: null,
                    status: "active",
                },
            ],
        };

        const changed = withSearch(withSearch(own, SUV_SEARCH, TODAY), CABRIO_SEARCH, TODAY);

        expect(labels(changed)).toContain("Kids in the back");
        expect(labels(changed)).not.toContain("Towbar");
        expect(changed.monthlyKm?.value).toBe(500);
    });
});

describe("taking a filter off", () => {
    it("lets go of everything the filters said, and nothing else", () => {
        const cleared = withSearch(withSearch(EMPTY_UNDERSTANDING, SUV_SEARCH, TODAY), null, TODAY);

        expect(cleared.needs).toEqual([]);
        expect(cleared.budget).toBeNull();
        expect(cleared.monthlyKm).toBeNull();
        expect(cleared.context).toEqual([]);
    });

    it("still recognises filter needs after Lens AI has handed them back", () => {
        /* The model returns every need each turn, and its ids go through a slug on the way back in. */
        const seeded = withSearch(EMPTY_UNDERSTANDING, SUV_SEARCH, TODAY);
        const afterTurn = readUnderstanding(toWire(seeded), seeded);

        expect(labels(afterTurn)).toContain("Towbar");
        expect(labels(withSearch(afterTurn, null, TODAY))).not.toContain("Towbar");
    });
});

describe("what the chat does with them", () => {
    it("skips asking how far they drive when a mileage package said it", () => {
        const cars = fleet().slice(0, 24) as PinnedFinnCar[];

        expect(guideSteps(cars, undefined, ["distance"]).map((step) => step.id)).not.toContain("distance");
    });

    it("ranks with them like anything else the reader said", () => {
        const cars = fleet().slice(0, 48) as PinnedFinnCar[];
        const u = withSearch(EMPTY_UNDERSTANDING, SUV_SEARCH, TODAY);
        const translation = toAnswers(base, u);

        expect(translation.answers.priorities[0]).toBe("practicality");
        expect(translation.answers.preferences.monthlyKm).toBe(1500);
        expect(runLens(cars, translation.answers, "page", "Comparing 48 cars", ruledOut(u))?.recommendation.winner).toBeDefined();
        /* Nothing a filter says is a rule: no car is set aside for missing one. */
        expect(ruledOut(u)).toEqual([]);
    });
});
