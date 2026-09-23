import { describe, expect, it } from "vitest";

import { copyFeatures, type Answers } from "@/entrypoints/compare/store";
import { CATEGORY_IDS, DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import type { PinnedFinnCar } from "@/lib/types";

import { coverage } from "./evidence";
import { needChips } from "./plain";
import { applyChoices, guideSteps, offersFor, saidFor, whatIfs } from "./guide";
import { runLens } from "./run";
import { EMPTY_UNDERSTANDING, ruledOut, toAnswers, type Understanding } from "./understanding";

/**
 * Lens Chat: the conversation with no model behind it.
 *
 * What matters here is not the wording but the two promises the guide makes —
 * it only asks what could change the answer on these cars, and every answer
 * lands in the same understanding a typed message would have built.
 */

const cars: PinnedFinnCar[] = fleet()
    .sort((a, b) => a.id - b.id)
    .slice(0, 24);

const base: Answers = {
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
};

const step = (id: "life" | "rules" | "distance", within = cars) => {
    const found = guideSteps(within).find((item) => item.id === id);

    if (!found) throw new Error(`no ${id} step for these cars`);

    return found;
};

const answer = (u: Understanding, id: "life" | "rules" | "distance", chosen: string[]) =>
    applyChoices(u, step(id), chosen);

describe("what Lens asks about a page of cars", () => {
    it("asks what the car has to do, and how far they drive", () => {
        const ids = guideSteps(cars).map((item) => item.id);

        expect(ids).toContain("life");
        expect(ids).toContain("distance");
    });

    it("only offers choices it can check on these cars", () => {
        for (const choice of step("life").choices) {
            const evidence = choice.need!.evidence;

            /* Either equipment some car here lists, or a priority scored from a figure. */
            expect(evidence.length > 0 || choice.need!.priorities.length > 0).toBe(true);
        }
    });

    it("leaves out a rule that would empty the comparison, or change nothing", () => {
        const electricOnly = cars.filter((car) => /electric/i.test(String(car.fuelType ?? "")));
        const offered = (within: PinnedFinnCar[]) =>
            guideSteps(within)
                .find((item) => item.id === "rules")
                ?.choices.map((choice) => choice.id) ?? [];

        /* Over a page of electric cars, "electric only" keeps every car: nothing to decide. */
        expect(offered(electricOnly)).not.toContain("electric-only");
        expect(offered(electricOnly)).not.toContain("not-electric");
    });

    it("drops a priority the reader switched off in Settings", () => {
        const withoutComfort = CATEGORY_IDS.filter((id) => id !== "comfort");
        const ids = guideSteps(cars, withoutComfort)
            .find((item) => item.id === "life")!
            .choices.map((choice) => choice.id);

        expect(ids).not.toContain("comfort");
    });
});

describe("what the taps mean", () => {
    it("turns a choice into a need with the evidence behind it", () => {
        const u = answer(EMPTY_UNDERSTANDING, "life", ["kids"]);
        const need = u.needs.find((item) => item.label === "Kids in the back");

        expect(need).toBeDefined();
        expect(need!.priorities).toContain("practicality");
        expect(need!.evidence.map((entry) => entry.id)).toContain("hasIsofix");
        /* Every piece of evidence says what it is for, in Lens's own words. */
        expect(need!.evidence.every((entry) => entry.use.length > 0)).toBe(true);
    });

    it("keeps what the reader said, so the conversation can show it back", () => {
        const u = answer(EMPTY_UNDERSTANDING, "life", ["city"]);

        expect(u.needs[0]!.said).toMatch(/city/i);
        expect(saidFor(step("life"), ["city", "kids"])).toMatch(/city.*kids|kids.*city/is);
    });

    it("makes a rule an essential need, which is what narrows the set", () => {
        const rules = step("rules");
        const first = rules.choices[0]!;
        const u = applyChoices(EMPTY_UNDERSTANDING, rules, [first.id]);
        const rule = ruledOut(u);

        expect(rule).toHaveLength(1);
        expect(rule[0]!.id).toBe(first.rule!.id);
        expect(rule[0]!.mode).toBe(first.rule!.mode);
    });

    it("replaces its own answers and leaves the rest of the understanding alone", () => {
        const first = answer(EMPTY_UNDERSTANDING, "life", ["kids", "city"]);
        const withDistance = answer(first, "distance", ["km-1500"]);
        const second = answer(withDistance, "life", ["motorway"]);

        expect(second.needs.map((need) => need.label)).toEqual(["Long motorway drives"]);
        expect(second.monthlyKm?.value).toBe(1500);
    });

    it("treats tapping nothing as an answer, not as silence", () => {
        const chosen = answer(EMPTY_UNDERSTANDING, "distance", ["km-1000"]);
        const cleared = answer(chosen, "distance", []);

        expect(cleared.monthlyKm).toBeNull();
        expect(saidFor(step("distance"), [])).toBe(step("distance").none);
    });

    it("reaches the engine as ordinary priorities, with no model involved", () => {
        const u = answer(answer(EMPTY_UNDERSTANDING, "life", ["city", "nervous"]), "distance", ["km-1000"]);
        const translation = toAnswers(base, u);

        expect(translation.answers.priorities).toContain("cityParking");

        const run = runLens(cars, translation.answers, "page", "Comparing 24 cars on this page", ruledOut(u));

        expect(run?.recommendation.winner).toBeDefined();
    });
});

describe("what else is worth asking about these cars", () => {
    it("offers equipment the reader's own priority scores, where the cars differ on it", () => {
        const u = answer(EMPTY_UNDERSTANDING, "life", ["nervous"]);
        const offers = offersFor(u, cars);

        expect(offers.length).toBeGreaterThan(0);

        for (const offer of offers) {
            const counts = coverage(cars, offer.id);

            /* Something to find, and not something nearly every car here has. */
            expect(counts.listed).toBeGreaterThan(0);
            expect(counts.listed / counts.total).toBeLessThanOrEqual(0.85);
            expect(offer.why.length).toBeGreaterThan(0);
            /* Never something already cited by the need it belongs to. */
            expect(u.needs.flatMap((need) => need.evidence.map((entry) => entry.id))).not.toContain(offer.id);
        }
    });

    it("never offers something the reader has already turned down", () => {
        const u = answer(EMPTY_UNDERSTANDING, "life", ["nervous"]);
        const first = offersFor(u, cars);

        if (!first.length) return;

        const declined = { ...u, declined: [first[0]!.id] };

        expect(offersFor(declined, cars).map((offer) => offer.id)).not.toContain(first[0]!.id);
    });
});

describe("what if", () => {
    it("proposes the budget the next car up would need", () => {
        const u: Understanding = {
            ...answer(EMPTY_UNDERSTANDING, "life", ["city"]),
            budget: { kind: "hardMax", monthly: 300, stretchTo: null, said: "you said up to €300 a month" },
        };
        const translation = toAnswers(base, u);
        const run = runLens(cars, translation.answers, "page", "Comparing 24 cars on this page", ruledOut(u));
        const proposals = whatIfs(run!, u);

        expect(proposals.length).toBeGreaterThan(0);
        expect(proposals[0]!.after.budget!.monthly).toBeGreaterThan(300);
        expect(proposals[0]!.label).toMatch(/What if I allowed/);
    });

    it("offers to drop a rule that set cars aside, and nothing where none did", () => {
        const rules = step("rules");
        const first = rules.choices[0]!;
        const u = applyChoices(answer(EMPTY_UNDERSTANDING, "life", ["city"]), rules, [first.id]);
        const translation = toAnswers(base, u);
        const run = runLens(cars, translation.answers, "page", "Comparing 24 cars on this page", ruledOut(u));

        expect(whatIfs(run!, u).some((item) => item.label.includes("dropped"))).toBe(true);

        const plain = answer(EMPTY_UNDERSTANDING, "life", ["city"]);
        const plainRun = runLens(cars, toAnswers(base, plain).answers, "page", "Comparing 24 cars", ruledOut(plain));

        expect(whatIfs(plainRun!, plain)).toEqual([]);
    });
});

describe("what Lens never offers", () => {
    it("leaves niche equipment to the reader to raise", () => {
        /* A towbar is under Practicality, and "kids in the back" is not a plan to tow. */
        const u = answer(EMPTY_UNDERSTANDING, "life", ["kids", "carrying"]);

        expect(offersFor(u, cars, 8).map((offer) => offer.id)).not.toContain("hasTowbar");
    });

    it("says a rule once, not once as a rule and again as a need", () => {
        const rules = step("rules");
        const noSuv = rules.choices.find((choice) => choice.id === "no-suv")!;
        const u = applyChoices(answer(EMPTY_UNDERSTANDING, "life", ["city"]), rules, [noSuv.id]);
        const chips = needChips(u);

        expect(chips.filter((chip) => /SUV/i.test(chip))).toHaveLength(1);
    });
});
