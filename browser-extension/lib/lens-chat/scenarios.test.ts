import { describe, expect, it } from "vitest";

import { copyFeatures, type Answers } from "@/lib/reasoning-engine/answers";
import {
    DEFAULT_CATEGORY_FEATURES,
    DEFAULT_PREFERENCES,
    DEFAULT_PRIORITIES,
} from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import type { PinnedFinnCar } from "@/lib/types";

import { evidenceMet, measuredDisplay, readEvidence } from "./evidence";
import { tellFitStory, type FitStory } from "./fit-story";
import { letGo, withDeals } from "./deals";
import { allowedByRules, runLens } from "./run";
import { SCENARIOS, type Scenario } from "./scenarios.fixture";
import { EMPTY_UNDERSTANDING, readUnderstanding, ruledOut, toAnswers, type Translation, type Understanding } from "./understanding";

/*
 * Ten people, through everything that runs without a model.
 *
 * The fixtures are what a good reading of each message looks like; these are
 * the promises Lens makes about what happens to it — that nothing the person
 * said is quietly dropped between the model and the engine, that a limit is a
 * limit, that a need is answered with evidence rather than with a score, and
 * that what FINN doesn't publish is said out loud.
 */

const base = (): Answers => ({
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
});

const cars: PinnedFinnCar[] = fleet().slice(0, 24);

interface Read {
    understanding: Understanding;
    translation: Translation;
    story: FitStory;
    winner: PinnedFinnCar;
    monthly: number;
}

function read(scenario: Scenario, previous = EMPTY_UNDERSTANDING): Read {
    const understanding = readUnderstanding(scenario.reading, previous, undefined, "2026-09");
    const translation = toAnswers(base(), understanding);
    const run = runLens(cars, translation.answers, "page", "Comparing 24 cars on this page")!;

    return {
        understanding,
        translation,
        story: tellFitStory(run, understanding, translation.lessRelevant, null),
        winner: run.recommendation.winner,
        monthly: run.recommendation.context.costs[run.recommendation.winner.id]!.totalMonthly,
    };
}

const scenario = (id: string): Scenario => SCENARIOS.find((item) => item.id === id)!;
const lines = (story: FitStory): string => story.sections.flatMap((section) => section.lines.map((line) => line.text)).join(" ");
const sectionFor = (story: FitStory, needId: string) => story.sections.find((section) => section.key === needId);

describe("every scenario, end to end", () => {
    for (const item of SCENARIOS) {
        describe(item.id, () => {
            const { understanding, translation, story } = read(item);

            it("keeps every piece of evidence the reading asked for", () => {
                const asked = item.reading.needs.flatMap((need) => need.evidence.map((entry) => entry.id));
                const kept = understanding.needs.flatMap((need) => need.evidence.map((entry) => entry.id));
                const capability = understanding.capabilities.flatMap((cap) => cap.lessRelevant);

                for (const id of asked) {
                    /* Evidence a capability made less relevant is meant to go; nothing else is. */
                    if (!capability.includes(id as never)) expect(kept).toContain(id);
                }
            });

            it("gives every need either evidence or a plain statement that FINN doesn't publish it", () => {
                for (const need of understanding.needs) {
                    expect(need.evidence.length > 0 || need.notInData).toBeTruthy();
                }
            });

            it("answers each need with what this car has, not with a score", () => {
                for (const need of understanding.needs.filter((item) => item.status === "active")) {
                    const section = sectionFor(story, need.id);

                    expect(section, need.id).toBeDefined();
                    expect(section!.lines.length).toBeGreaterThan(0);
                }

                expect(lines(story)).not.toMatch(/scored|points|weighting/i);
            });

            it("ranks only priorities the reading asked for, beyond the fillers Lens needs", () => {
                const asked = new Set(understanding.needs.flatMap((need) => need.priorities));

                for (const entry of translation.order) {
                    if (!entry.filler) expect([...asked]).toContain(entry.id);
                }
            });
        });
    }
});

describe("what the person said about money", () => {
    it("holds a hard maximum, and names the better car it ruled out", () => {
        const { story, monthly } = read(scenario("city-parent"));

        expect(monthly).toBeLessThanOrEqual(450);
        expect(story.eyebrow).toBe("Best match");
        expect(lines(story)).toMatch(/scores higher overall, but .* breaks your maximum/);
    });

    it("keeps a soft figure from becoming no figure at all", () => {
        const { translation, story } = read(scenario("commuter"));

        /* "Around €600, a bit more for a good reason" — a line, with headroom. */
        expect(translation.answers.preferences.monthlyBudget).toBe(690);
        expect(story.sections[0]?.title).toMatch(/€600/);
    });

    it("picks a small car for someone who wants one, rather than a big one they could stretch to", () => {
        const { monthly, story } = read(scenario("small-car-long-trips"));

        expect(monthly).toBeLessThanOrEqual(518);
        expect(sectionFor(story, "town")?.lines[0]?.text).toMatch(/m long/);
    });
});

describe("what people say they don't want", () => {
    it("keeps 'no massive SUV' as something Lens checks, not as a dropped remark", () => {
        const { understanding, translation, story } = read(scenario("no-big-suv"));
        const need = understanding.needs.find((item) => item.id === "not-big")!;

        expect(need.evidence.map((entry) => entry.id)).toEqual(["suvBody", "compactLength", "compactWidth"]);
        expect(translation.order[0]?.id).toBe("cityParking");
        expect(sectionFor(story, "not-big")?.lines.map((line) => line.text).join(" ")).toMatch(/m long/);
    });

    /* Both are kept, and the stance is what decides where they're shown. */
    it("keeps what they don't care about as theirs, not as a limitation", () => {
        const { understanding } = read(scenario("city-parent"));

        expect(understanding.notModelled.map((item) => [item.said, item.stance])).toEqual([
            ["a fast car", "doesntCare"],
            ["anything fancy", "doesntCare"],
        ]);
    });

    it("keeps what they do want and Lens can't check, as a gap", () => {
        const { understanding } = read(scenario("commuter"));
        const gaps = understanding.notModelled.filter((item) => item.stance === "wants");

        expect(gaps.map((item) => item.said)).toEqual(["sensitive to road noise"]);
    });
});

describe("what someone is already confident about", () => {
    it("leaves the gap-keeping assistance out and looks at what's beside them instead", () => {
        const { understanding, translation, story } = read(scenario("nervous-motorway"));
        const evidence = understanding.needs.flatMap((need) => need.evidence.map((entry) => entry.id));

        expect(evidence).not.toContain("hasAdaptiveCruiseControl");
        expect(evidence).not.toContain("driverAssistLevel2");
        expect(evidence).toContain("hasBlindSpotAssist");
        expect(translation.order[0]?.id).toBe("safetyAssistance");
        expect(sectionFor(story, "around-me")?.lines.map((line) => line.text).join(" ")).toMatch(/beside you|next lane/i);
    });
});

describe("what FINN does publish, and Lens used to guess at", () => {
    it("reads the body type FINN files rather than inferring it from length", () => {
        const { story, winner } = read(scenario("no-big-suv"));
        const section = sectionFor(story, "not-big")!;
        const bodyLine = section.lines.find((line) => /files it as/.test(line.text))!;

        expect(bodyLine.text).toMatch(/files it as (a|an) /);
        /*
         * Good when FINN doesn't file it as an SUV, which is what the reader
         * asked for; the miss when it does. Not wanting one is a need here,
         * not a deal-breaker, so a short SUV can still win on the rest.
         */
        expect(bodyLine.tone).toBe(/suv/i.test(winner.vehicleType) ? "missing" : "good");
        expect(bodyLine.text.includes("an SUV")).toBe(/suv/i.test(winner.vehicleType));
    });

    it("marks an SUV as the bad news for someone who didn't want one", () => {
        const suv = cars.find((car) => /suv/i.test(car.vehicleType))!;
        const notSuv = cars.find((car) => !/suv/i.test(car.vehicleType))!;

        expect(evidenceMet(suv, "suvBody")).toBe(false);
        expect(evidenceMet(notSuv, "suvBody")).toBe(true);
    });

    it("answers a winter need from FINN's tyre field, and says so when it's missing", () => {
        const car = cars[0]!;

        expect(readEvidence({ ...car, tyres: "allSeason" }, "winterReadyTyres")).toBe("listed");
        expect(measuredDisplay({ ...car, tyres: "summerAndWinter" }, "winterReadyTyres")).toMatch(/summer set and a winter set/);
        expect(readEvidence({ ...car, tyres: "winter" }, "winterReadyTyres")).toBe("listed");
        expect(measuredDisplay({ ...car, tyres: "winter" }, "winterReadyTyres")).toBe("winter tyres, in FINN's data");
        expect(readEvidence({ ...car, tyres: null }, "winterReadyTyres")).toBe("unknown");
    });
});

describe("what FINN doesn't publish", () => {
    it("doesn't imply Lens checked room for a rear-facing seat, nor list what it can't check", () => {
        const { story } = read(scenario("rear-facing-parent"));
        const text = sectionFor(story, "seats-in")!.lines.map((line) => line.text).join(" ");

        expect(text).not.toMatch(/FINN doesn't publish/);
        expect(text).not.toMatch(/room (there is )?behind the front seats/);
    });

    it("quotes FINN's boot figure with the caveat its own field carries", () => {
        const { story } = read(scenario("winter-outdoors"));

        const boot = sectionFor(story, "muddy-kit")!.lines.map((line) => line.text).join(" ");

        expect(boot).toMatch(/L boot/);
        expect(boot).toMatch(/doesn't say whether that's with the rear seats up or folded/);
    });

    it("doesn't offer range as a fact about a car that isn't electric", () => {
        const { story } = read(scenario("commuter"));
        const range = sectionFor(story, "range")!.lines.map((line) => line.text).join(" ");

        expect(range).toMatch(/km of range|isn't electric/);
    });
});

describe("keeping context out of the ranking", () => {
    it("doesn't turn air conditioning into a winter priority", () => {
        const { translation } = read(scenario("knows-nothing"));

        expect(translation.order.map((entry) => entry.id)).not.toContain("climateSuitability");
    });

    it("keeps a town car and a motorway car as two different needs", () => {
        const { translation } = read(scenario("small-car-long-trips"));
        const ranked = translation.order.filter((entry) => !entry.filler).map((entry) => entry.id);

        expect(ranked).toEqual(["cityParking", "longDistance"]);
    });
});

describe("corrections, mid-conversation", () => {
    const correct = (id: string) => {
        const item = scenario(id);
        const first = read(item);
        const understanding = readUnderstanding(item.correction!.reading, first.understanding, undefined, "2026-09");

        return { first, understanding, translation: toAnswers(base(), understanding) };
    };

    it("tightens a budget when the person insists on it", () => {
        const { understanding, translation } = correct("rear-facing-parent");

        expect(understanding.budget).toMatchObject({ kind: "hardMax", monthly: 500 });
        expect(translation.answers.preferences.monthlyBudget).toBe(500);
        /* The needs from the first message are still there. */
        expect(understanding.needs.map((need) => need.id)).toContain("stroller");
    });

    it("re-ranks when something becomes more important, keeping what came before", () => {
        const { understanding, translation } = correct("city-parent");

        expect(translation.order[0]?.id).toBe("safetyAssistance");
        expect(understanding.needs.map((need) => need.id)).toEqual(
            expect.arrayContaining(["safety", "parking", "child-seat", "shopping"]),
        );
    });

    it("softens a need instead of forgetting it when the person changes their mind", () => {
        const { understanding, translation } = correct("no-big-suv");
        const stillSmall = understanding.needs.find((need) => need.id === "not-big")!;

        expect(stillSmall.importance).toBe("niceToHave");
        expect(stillSmall.status).toBe("active");
        expect(translation.order.map((entry) => entry.id)).toContain("longDistance");
    });

    it("carries a what-if budget without losing the needs behind it", () => {
        const { understanding } = correct("commuter");

        expect(understanding.budget).toMatchObject({ kind: "target", monthly: 650 });
        expect(understanding.needs.map((need) => need.id)).toEqual(expect.arrayContaining(["range", "comfort"]));
    });
});

describe("a need the model left unplaced", () => {
    it("still counts where its evidence is scored", () => {
        const understanding = readUnderstanding(
            {
                ...scenario("city-parent").reading,
                needs: [
                    {
                        id: "seats",
                        label: "Room for the child seat",
                        importance: "essential",
                        said: "your child is in a car seat",
                        priorities: [],
                        evidence: [{ id: "hasIsofix", use: "anchors the seat" }],
                        notInData: null,
                        status: "active",
                    },
                ],
            },
            EMPTY_UNDERSTANDING,
            undefined,
            "2026-09",
        );

        expect(understanding.needs[0]?.priorities).toEqual(["practicality"]);
        expect(toAnswers(base(), understanding).order[0]?.id).toBe("practicality");
    });
});

describe("what a use clause may claim", () => {
    it("drops a clause that puts a number on the evidence", () => {
        const understanding = readUnderstanding(
            {
                ...scenario("family-road-trip").reading,
                needs: [
                    {
                        id: "seats",
                        label: "Everyone in one car",
                        importance: "essential",
                        said: "there are five of you",
                        priorities: ["practicality"],
                        evidence: [
                            { id: "seatsFivePlus", use: "provides four seats so everyone travels together" },
                            { id: "rearDoors", use: "lets the children climb in themselves" },
                        ],
                        notInData: null,
                        status: "active",
                    },
                ],
            },
            EMPTY_UNDERSTANDING,
            undefined,
            "2026-09",
        );

        expect(understanding.needs[0]?.evidence).toEqual([
            { id: "seatsFivePlus", use: "", unwanted: false, mustHave: false },
            { id: "rearDoors", use: "lets the children climb in themselves", unwanted: false, mustHave: false },
        ]);
    });
});

describe("what someone rules out", () => {
    const noSuv = (importance: "essential" | "important") => ({
        ...scenario("no-big-suv").reading,
        needs: [
            {
                id: "not-big",
                label: "Nothing enormous",
                importance,
                said: "you don't want one of those enormous cars",
                priorities: ["cityParking"],
                evidence: [{ id: "suvBody", use: "keeps you out of the big cars you'd rather not drive", unwanted: true }],
                notInData: null,
                status: "active",
            },
        ],
    });

    it("sets the cars aside rather than scoring them lower", () => {
        const understanding = readUnderstanding(noSuv("essential"), EMPTY_UNDERSTANDING, undefined, "2026-09");
        const translation = toAnswers(base(), understanding);
        const out = ruledOut(understanding);
        const run = runLens(cars, translation.answers, "page", "page", out)!;

        expect(out.map((item) => item.id)).toEqual(["suvBody"]);
        expect(run.ruledOut?.setAside).toBeGreaterThan(0);
        expect(run.ruledOut?.nothingLeft).toBe(false);
        expect(readEvidence(run.recommendation.winner, "suvBody")).toBe("notListed");

        const story = tellFitStory(run, understanding, translation.lessRelevant, null);
        expect(story.sections.find((section) => section.key === "ruled-out")?.lines[0]?.text).toMatch(
            /You asked for no SUV, so Lens set aside \d+ of \d+ cars/,
        );
    });

    it("leaves a lean as a lean: only a must-have rules cars out", () => {
        const understanding = readUnderstanding(noSuv("important"), EMPTY_UNDERSTANDING, undefined, "2026-09");

        expect(ruledOut(understanding)).toEqual([]);
    });

    it("ranks everything when no car avoids it, and leaves letting it go to the reader", () => {
        const suvs = cars.filter((car) => /suv/i.test(car.vehicleType));
        const understanding = readUnderstanding(noSuv("essential"), EMPTY_UNDERSTANDING, undefined, "2026-09");
        const translation = toAnswers(base(), understanding);
        const run = runLens(suvs, translation.answers, "page", "page", ruledOut(understanding))!;
        const story = tellFitStory(run, understanding, translation.lessRelevant, null);

        expect(run.ruledOut?.nothingLeft).toBe(true);
        const section = story.sections.find((item) => item.key === "ruled-out")!;
        expect(section.title).toBe("No car here meets “mustn't be an SUV”");
        const compared = run.recommendation.context.vehicles.length;
        expect(section.lines.map((line) => line.text)).toEqual([
            compared === 1 ? "The one car compared doesn't." : `None of the ${compared} cars compared does.`,
            "You kept it, so this is the best fit for everything else you told me. To let it go, change your deal-breakers and I'll judge again.",
        ]);
    });
});

describe("a rule about the car itself", () => {
    const wantsElectric = {
        ...scenario("commuter").reading,
        budget: null,
        needs: [
            {
                id: "electric",
                label: "An electric car",
                importance: "essential",
                said: "you want to drive electric and can charge at home",
                priorities: ["environmental"],
                evidence: [{ id: "electricCar", use: "charges at home overnight", mustHave: true }],
                notInData: null,
                status: "active",
            },
        ],
    };

    it("ranks only the cars FINN lists that way", () => {
        const understanding = readUnderstanding(wantsElectric, EMPTY_UNDERSTANDING, undefined, "2026-09");
        const rules = ruledOut(understanding);
        const translation = toAnswers(base(), understanding);
        const run = runLens(cars, translation.answers, "page", "page", rules)!;

        expect(rules).toEqual([expect.objectContaining({ id: "electricCar", mode: "must" })]);
        expect(run.recommendation.winner.fuelType).toBe("Electric");
        expect(run.recommendation.context.vehicles.every((car) => car.fuelType === "Electric")).toBe(true);

        const story = tellFitStory(run, understanding, translation.lessRelevant, null);
        expect(story.sections.find((section) => section.key === "ruled-out")?.lines[0]?.text).toMatch(
            /You asked for an electric car, so Lens set aside \d+ of \d+ cars/,
        );
    });

    it("says no car here meets it, and ranks everything, when no car here is one", () => {
        const petrol = cars.filter((car) => car.fuelType !== "Electric");
        const understanding = readUnderstanding(wantsElectric, EMPTY_UNDERSTANDING, undefined, "2026-09");
        const run = runLens(petrol, toAnswers(base(), understanding).answers, "page", "page", ruledOut(understanding))!;

        expect(run.ruledOut?.nothingLeft).toBe(true);
        expect(tellFitStory(run, understanding, [], null).sections.find((s) => s.key === "ruled-out")?.title).toMatch(
            /^No car here meets “must be electric”$/,
        );
    });
});

describe("the catch, when the car has what they didn't want", () => {
    it("says the car has it rather than that FINN doesn't list it", () => {
        const selfDriving = cars.find((car) => readEvidence(car, "driverAssistLevel2") === "listed")!;
        const understanding = readUnderstanding(
            {
                ...scenario("no-big-suv").reading,
                budget: null,
                needs: [
                    {
                        id: "no-self-driving",
                        label: "Safety without self-driving",
                        importance: "important",
                        said: "you don't want the car to drive for you",
                        priorities: ["safetyAssistance"],
                        evidence: [{ id: "driverAssistLevel2", use: "", unwanted: true }],
                        notInData: null,
                        status: "active",
                    },
                ],
            },
            EMPTY_UNDERSTANDING,
            undefined,
            "2026-09",
        );
        const translation = toAnswers(base(), understanding);
        /* One car, so the line is about the car the test chose. */
        const run = runLens([selfDriving], translation.answers, "thisCar", "this car")!;
        const story = tellFitStory(run, understanding, translation.lessRelevant, null);
        const line = story.sections.find((section) => section.key === "no-self-driving")!.lines[0]!;

        /* Level 2 assists a driver who supervises; nothing in FINN's data says the car drives itself. */
        expect(line.text).toBe("FINN lists Level 2 driver assistance on this one, which you'd rather avoid.");
        expect(story.catch?.text ?? "").not.toMatch(/doesn't list level 2 driver assistance/i);
    });
});

describe("a budget with a stretch the reader named", () => {
    const withStretch = (stretchTo: number | null) => ({
        ...scenario("small-car-long-trips").reading,
        budget: { kind: "target" as const, monthly: 400, stretchTo, said: "€400, maybe €425 if it's really worth it" },
    });

    it("looks no further than the figure they gave", () => {
        const understanding = readUnderstanding(withStretch(425), EMPTY_UNDERSTANDING, undefined, "2026-09");

        expect(understanding.budget?.stretchTo).toBe(425);
        expect(toAnswers(base(), understanding).answers.preferences.monthlyBudget).toBe(425);
    });

    it("falls back to its own headroom only when they don't name one", () => {
        const understanding = readUnderstanding(withStretch(null), EMPTY_UNDERSTANDING, undefined, "2026-09");

        expect(toAnswers(base(), understanding).answers.preferences.monthlyBudget).toBe(460);
    });

    it("ignores a stretch that isn't a stretch", () => {
        expect(readUnderstanding(withStretch(300), EMPTY_UNDERSTANDING, undefined, "2026-09").budget?.stretchTo).toBeNull();
        expect(readUnderstanding(withStretch(4000), EMPTY_UNDERSTANDING, undefined, "2026-09").budget?.stretchTo).toBeNull();
    });

    it("says where the line came from", () => {
        const understanding = readUnderstanding(withStretch(425), EMPTY_UNDERSTANDING, undefined, "2026-09");
        const translation = toAnswers(base(), understanding);
        const run = runLens(cars, translation.answers, "page", "page")!;
        const story = tellFitStory(run, understanding, translation.lessRelevant, null);

        expect(story.sections[0]?.lines[0]?.text).toMatch(/You said you could stretch to €425, so Lens looked no further/);
    });
});

describe("no car with every deal-breaker", () => {
    const rules = (u: ReturnType<typeof withDeals>) => ruledOut(u);
    const page = () => cars.slice(0, 24);
    const asking = () => withDeals(EMPTY_UNDERSTANDING, ["electric", "automatic", "awd", "doors", "co2"], { electric: "mustNot", automatic: "must", awd: "must", doors: "must", co2: "must" });

    it("says what letting each go would open up, and puts the choice to the reader rather than calling it a failure", () => {
        const u = asking();
        const run = runLens(page(), toAnswers(base(), u).answers, "page", "page", rules(u))!;
        const section = tellFitStory(run, u, [], null).sections.find((item) => item.key === "ruled-out")!;
        const text = section.lines.map((line) => line.text).join(" ");

        expect(run.ruledOut?.nothingLeft).toBe(true);
        expect(section.title).toBe("No car here has all of your deal-breakers");
        expect(section.tone).toBe("note");
        expect(text).toMatch(/^Of the 24 cars compared, none meets all 5 at once: mustn't be electric, must have an automatic gearbox, must have all-wheel drive, must have rear doors and must have low CO₂ emissions\./);
        expect(text).toMatch(/You kept them all, so this is the best fit for everything else you told me\. To let one go, change your deal-breakers and I'll judge again\.$/);
        expect(text).not.toMatch(/ranked them all|nothing here matches/);
        for (const item of run.ruledOut!.withoutEach.filter((entry) => entry.fits > 0)) expect(text).toContain(`and ${item.fits} ${item.fits === 1 ? "car fits" : "cars fit"} everything else`);
    });

    it("counts, for each, the cars that meet every other one", () => {
        const u = asking();
        const all = rules(u);
        const run = runLens(page(), toAnswers(base(), u).answers, "page", "page", all)!;

        for (const item of run.ruledOut!.withoutEach) expect(item.fits).toBe(allowedByRules(page(), all.filter((rule) => rule.id !== item.id)).length);
    });

    it("turns one let go into a deal-sealer where Lens can weigh it, and simply drops one it can only rule on", () => {
        const u = letGo(asking(), ["hasAllWheelDrive", "electricCar"]);

        expect(rules(u).map((rule) => rule.id).sort()).toEqual(["hasAutomaticTransmission", "lowCo2", "rearDoors"]);
        expect(u.needs.find((need) => need.id === "sealer-awd")).toMatchObject({ importance: "essential", evidence: [{ id: "hasAllWheelDrive" }] });
        expect(u.needs.some((need) => need.id === "sealer-electric")).toBe(false);
    });
});

describe("a hard limit, and a cost FINN's data can't confirm", () => {
  it("sets aside a car that might be over it", () => {
    const unmatched = fleet().find((car) => car.fuelType === "Plug-in Hybrid" && car.model === "CX-60")!;
    const petrol = fleet().filter((car) => car.fuelType === "Petrol").slice(0, 12);
    const field = [unmatched, ...petrol];
    const understanding = { ...EMPTY_UNDERSTANDING, budget: { monthly: 0, kind: "hardMax" as const, firm: true, said: "", stretchTo: null } };
    const probe = runLens(field, toAnswers(base(), { ...understanding, budget: null }).answers, "page", "page")!;
    const costs = probe.recommendation.context.costs;
    const limit = Math.ceil(Math.max(costs[unmatched.id]!.totalMonthly, Math.min(...petrol.map((car) => costs[car.id]!.totalMonthly)))) + 1;
    const u = { ...understanding, budget: { ...understanding.budget, monthly: limit } };
    const run = runLens(field, toAnswers(base(), u).answers, "page", "page", [], true)!;

    expect(run.overLimit?.unconfirmed).toContain(unmatched.id);
    expect(run.recommendation.winner.id).not.toBe(unmatched.id);
  });
});

describe("the one caveat kept", () => {
    it("says boot space can't be checked for lots to carry, and nowhere else", async () => {
        const { withBubbles } = await import("./bubbles");
        const u = withBubbles(EMPTY_UNDERSTANDING, { carry: ["bulky"], kids: ["baby"] });
        const translation = toAnswers(base(), u);
        const run = runLens(cars, translation.answers, "page", "page")!;
        const story = tellFitStory(run, u, translation.lessRelevant, null);
        const said = story.sections.flatMap((section) => section.lines.map((line) => `${section.key}: ${line.text}`)).filter((line) => /FINN (doesn't publish|lists a boot size)/.test(line));

        expect(said).toHaveLength(1);
        /* With this car's own figure, as FINN lists it. */
        const winner = cars.find((car) => car.id === run.recommendation.winner.id)!;
        const litres = Number.parseFloat(String(winner.capacity.trunk)).toLocaleString("en-GB");
        expect(said[0]).toBe(`bubble-carry: FINN lists a boot size of ${litres} L for this vehicle, but not whether it's measured with the rear seats up or folded, so Lens doesn't compare boots on it.`);
    });

    it("says it as written where FINN lists no boot size", async () => {
        const { bubbleById } = await import("./bubbles");
        const carry = bubbleById("carry")!;
        const car = { ...cars[0]!, capacity: { ...cars[0]!.capacity, trunk: "" } };

        expect(carry.cantCheckFor?.(car)).toBeNull();
        expect(carry.cantCheck).toBe("FINN lists a boot size, but not whether it's measured with the rear seats up or folded, so Lens doesn't compare boots on it.");
    });
});
