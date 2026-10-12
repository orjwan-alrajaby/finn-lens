import { describe, expect, it } from "vitest";

import { copyFeatures, type Answers } from "@/lib/reasoning-engine/answers";
import { CATEGORIES, CATEGORY_IDS, DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import type { PinnedFinnCar } from "@/lib/types";

import { EVIDENCE } from "./evidence";
import { applyChoices, guideSteps, saidFor } from "./guide";
import { runLens } from "./run";
import { tellFitStory } from "./fit-story";
import { assessEnvironment } from "@/lib/reasoning-engine/environmental";
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
            /* A passenger count, or a driveway, stays even when it checks nothing: it's still the reader's answer. */
            if (!choice.need) {
                expect(["passengers", "people", "parking"], choice.id).toContain(choice.group);
                continue;
            }

            const evidence = choice.need.evidence;

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
        const need = u.needs.find((item) => item.label === "Travelling with children");

        expect(need).toBeDefined();
        expect(need!.priorities).toContain("practicality");
        expect(need!.evidence.map((entry) => entry.id)).toContain("hasIsofix");
        /* Every piece of evidence says what it is for, in Lens's own words. */
        expect(need!.evidence.every((entry) => entry.use.length > 0)).toBe(true);
    });

    it("names exactly the priorities that score a need's equipment", () => {
        for (const choice of guideSteps([]).find((step) => step.id === "life")!.choices.filter((item) => item.need)) {
            const need = choice.need!;
            const homes = new Set(need.evidence.map((id) => EVIDENCE[id].scoredIn).filter(Boolean));

            /* Every priority it names holds some of its equipment — CO₂ and consumption, figures, hold none by design. */
            for (const priority of need.priorities) {
                if (!CATEGORIES[priority].numericOnly) expect(homes, `${choice.id} names ${priority}`).toContain(priority);
            }
            /* And everything a reader can raise sits under a priority it names. */
            for (const id of need.evidence.filter((item) => EVIDENCE[item].raisable)) {
                expect(need.priorities, `${choice.id}: ${id}`).toContain(EVIDENCE[id].scoredIn);
            }
        }
    });

    it("keeps what the reader said, so the conversation can show it back", () => {
        const u = answer(EMPTY_UNDERSTANDING, "life", ["city"]);

        expect(u.needs[0]!.said).toMatch(/city/i);
        expect(saidFor(step("life"), ["city", "kids"])).toMatch(/city.*children|children.*city/is);
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

describe("emissions, which are a figure rather than equipment", () => {
    const u = answer(EMPTY_UNDERSTANDING, "life", ["co2-matters", "motorway"]);
    const translation = toAnswers(base, u);
    const run = runLens(cars, translation.answers, "page", "Comparing 24 cars on this page", ruledOut(u))!;
    const story = tellFitStory(run, u, translation.lessRelevant, null);
    const section = story.sections.find((item) => item.key === "life-co2-matters")!;
    const co2 = assessEnvironment(run.recommendation.winner)!.co2!;

    it("says the car's CO₂, instead of claiming it couldn't judge it", () => {
        expect(section.lines[0]!.text).toContain(co2.display);
        expect(section.lines.map((line) => line.text).join(" ")).not.toMatch(/nothing on this car it can check/);
    });

    it("heads the card and the reading with the engine's verdict, not the reader's wish", () => {
        /* A class D car is "Around-average emissions" on both, never "Low emissions". */
        expect(section.short).toBe(co2.label);
        expect(section.title).toBe(co2.label);
    });

    it("judges on the CO₂ label the ranking scores, not on the cars around it", () => {
        const expected = co2.level === "none" || co2.level === "low" ? "good" : co2.level === "high" ? "missing" : "note";

        expect(section.tone).toBe(expected);
        expect(section.lines.some((line) => /A–G CO₂ label German law uses for new cars \(Pkw-EnVKV\)/.test(line.text))).toBe(true);
    });
});

describe("efficiency, which is a figure too", () => {
    const u = answer(EMPTY_UNDERSTANDING, "life", ["efficiency-matters", "motorway"]);
    const translation = toAnswers(base, u, undefined, { fill: false, onlyAsked: true });
    const run = runLens(cars, translation.answers, "page", "Comparing 24 cars on this page", ruledOut(u))!;
    const story = tellFitStory(run, u, translation.lessRelevant, null);
    const section = story.sections.find((item) => item.key === "life-efficiency-matters")!;

    it("says how much the car uses against others of its kind, instead of claiming it couldn't judge it", () => {
        const text = section.lines.map((line) => line.text).join(" ");

        expect(translation.answers.priorities).toContain("efficiency");
        expect(text).toMatch(/This car consumes|plug-in hybrid|doesn't publish a consumption figure/);
        expect(text).not.toMatch(/nothing on this car it can check/);
    });
});
