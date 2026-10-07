import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { garageCar } from "@/lib/reasoning-engine/test-garage";
import type { WireUnderstanding } from "@/lib/lens-ai/contract";
import { copyFeatures, type Answers } from "@/lib/reasoning-engine/answers";

import { readEvidence } from "./evidence";
import { evidenceForNeeds, quotesAreFinns, tellFitStory } from "./fit-story";
import { alternativesWithinLimits, runLens } from "./run";
import {
    groundInWhatWasSaid,
    diffUnderstanding,
    EMPTY_UNDERSTANDING,
    type Understanding,
    missingEssentials,
    readQuestion,
    readUnderstanding,
    toAnswers,
    waiveEssential,
    withBudget,
    withRental,
} from "./understanding";

/*
 * Lens listening: what a person said, kept as needs, constraints and context,
 * checked against what Lens can really use, and turned into the answers the
 * engine ranks with. No model runs here — these are the guarantees around one.
 */

const base = (): Answers => ({
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: "balanced",
});

const wire = (overrides: Partial<WireUnderstanding>): WireUnderstanding => ({
    budget: null,
    rental: null,
    monthlyKm: null,
    needs: [],
    context: [],
    capabilities: [],
    droppedPriorities: [],
    tension: "",
    notModelled: [],
    cleared: [],
    ...overrides,
});

const familyAndNerves = wire({
    budget: { kind: "hardMax", monthly: 500, said: "a total of 500 euros per month and I can't spend any more" },
    rental: { from: "2099-10", to: "2100-04", startDay: 8, said: "from the 8th of October until April" },
    needs: [
        {
            id: "kids-safe",
            label: "Keeping the kids safe",
            importance: "important",
            said: "you have two young children",
            priorities: ["practicality"],
            evidence: [
                { id: "hasIsofix", use: "could anchor their child seats" },
                { id: "rearDoors", use: "make getting them in and out easier" },
            ],
            notInData: null,
            status: "active",
        },
        {
            id: "kids-entertained",
            label: "Keeping the kids occupied",
            importance: "niceToHave",
            said: "you'd like something to keep them entertained",
            priorities: [],
            evidence: [
                { id: "hasBackUSBPorts", use: "could keep their tablets charged on long drives" },
                { id: "hasTeleporter", use: "nonsense" },
            ],
            notInData: "a built-in rear entertainment system",
            status: "active",
        },
        {
            id: "confidence",
            label: "Feeling safer on the road",
            importance: "important",
            said: "you're a pretty nervous driver",
            priorities: ["safetyAssistance"],
            evidence: [
                { id: "hasBlindSpotAssist", use: "could warn you about cars you can't see" },
                { id: "hasAdaptiveCruiseControl", use: "keeps your distance" },
            ],
            notInData: null,
            status: "active",
        },
    ],
    capabilities: [
        {
            label: "Keeping a safe following distance",
            said: "you're confident maintaining distance",
            lessRelevant: ["hasAdaptiveCruiseControl", "driverAssistLevel2"],
        },
    ],
});

describe("reading an understanding", () => {
    it("keeps only evidence Lens can check, and counts a need where its evidence is scored", () => {
        const u = readUnderstanding(familyAndNerves, EMPTY_UNDERSTANDING, undefined, "2026-09");
        const kids = u.needs.find((need) => need.id === "kids-entertained")!;

        expect(kids.evidence.map((item) => item.id)).toEqual(["hasBackUSBPorts"]);
        /* Made less relevant by what they're confident with, so it serves no need. */
        expect(u.needs.find((need) => need.id === "confidence")?.evidence.map((item) => item.id)).toEqual(["hasBlindSpotAssist"]);
        expect(kids.notInData).toBe("a built-in rear entertainment system");

        /* Blind spot warning is scored under Safety & Driver Assistance. */
        expect(u.needs.find((need) => need.id === "confidence")?.priorities).toContain("safetyAssistance");
        expect(u.rental).toEqual({ firm: true, flexMonths: 0, from: "2099-10", to: "2100-04", startDay: 8, said: "from the 8th of October until April" });
        expect(u.budget?.kind).toBe("hardMax");
    });

    it("carries what earlier turns established when a reply leaves it out", () => {
        const first = readUnderstanding(familyAndNerves, EMPTY_UNDERSTANDING, undefined, "2026-09");
        const second = readUnderstanding(
            wire({
                needs: [{ ...familyAndNerves.needs[1]!, importance: "important", evidence: [{ id: "hasBackUSBPorts", use: "could keep them busy on long drives" }] }],
            }),
            first,
            undefined,
            "2026-09",
        );

        expect(second.needs.map((need) => need.id).sort()).toEqual(["confidence", "kids-entertained", "kids-safe"]);
        expect(second.needs.find((need) => need.id === "kids-entertained")?.importance).toBe("important");
        expect(second.budget?.monthly).toBe(500);
        expect(second.rental?.from).toBe("2099-10");

        expect(readUnderstanding(wire({ cleared: ["budget"] }), second).budget).toBeNull();
    });

    it("marks what they want apart from what they don't care about", () => {
        const u = readUnderstanding(
            wire({
                notModelled: [
                    { said: "a fast car", stance: "doesntCare", explanation: "Lens doesn't consider speed." },
                    { said: "feels luxurious", stance: "wants", explanation: "Lens has no measure of luxury." },
                ],
            }),
            EMPTY_UNDERSTANDING,
        );

        expect(u.notModelled.map((item) => [item.said, item.stance])).toEqual([
            ["a fast car", "doesntCare"],
            ["feels luxurious", "wants"],
        ]);
    });

    it("refuses constraints that don't make sense", () => {
        const u = readUnderstanding(
            wire({
                budget: { kind: "hardMax", monthly: -50, said: "" },
                rental: { from: "April", to: "May", startDay: null, said: "" },
            }),
            EMPTY_UNDERSTANDING,
        );

        expect(u.budget).toBeNull();
        expect(u.rental).toBeNull();
    });

    it("never asks a question that was already answered", () => {
        const answered = [{ question: "How old are your children?", answer: "1 and 4" }];

        expect(readQuestion({ ask: "How old are your children?", why: "", options: [] }, answered)).toBeNull();
        expect(readQuestion({ ask: "What part of driving makes you most nervous?", why: "", options: ["Parking"] }, answered)?.options).toEqual(["Parking"]);
    });

    it("doesn't ask what no answer could change: evidence every car here has", () => {
        const cars = [
            garageCar({ id: 1, extra: ["hasIsofix"] }),
            garageCar({ id: 2, extra: ["hasIsofix", "hasBlindSpotAssist"] }),
            garageCar({ id: 3, extra: ["hasIsofix"] }),
        ];
        const ages = { ask: "How old is your child?", why: "", options: [], affects: ["hasIsofix"] };
        const nerves = { ask: "What makes you nervous?", why: "", options: [], affects: ["hasIsofix", "hasBlindSpotAssist"] };

        expect(readQuestion(ages, [], cars)).toBeNull();
        expect(readQuestion(nerves, [], cars)?.ask).toBe("What makes you nervous?");
        expect(readQuestion({ ...ages, affects: [] }, [], cars)?.ask).toBe("How old is your child?");
    });
});

describe("turning an understanding into Lens's answers", () => {
    it("ranks what the person needs, not what the saved profile ranked", () => {
        const u = readUnderstanding(familyAndNerves, EMPTY_UNDERSTANDING, undefined, "2026-09");
        const { answers, order, lessRelevant } = toAnswers(base(), u);

        expect(answers.priorities.slice(0, 2).sort()).toEqual(["practicality", "safetyAssistance"]);
        /* Comfort too: the rear USB ports that keep the kids' tablets charged count there. */
        expect(order.filter((item) => !item.filler).map((item) => item.id).sort()).toEqual(["comfort", "practicality", "safetyAssistance"]);
        expect(answers.preferences.monthlyBudget).toBe(500);
        expect(answers.preferences).toMatchObject({ rentalFrom: "2099-10", rentalTo: "2100-04" });
        expect(answers.features.safetyAssistance.map((item) => item.key)).toEqual(["hasBlindSpotAssist"]);
        expect(lessRelevant).toContain("hasAdaptiveCruiseControl");
    });

    it("doesn't keep Comfort just because the default profile had it", () => {
        const u = readUnderstanding(
            wire({
                budget: { kind: "hardMax", monthly: 500, said: "under €500" },
                needs: [
                    {
                        id: "safety",
                        label: "Good safety features",
                        importance: "essential",
                        said: "you only care about good safety features",
                        priorities: ["safetyAssistance"],
                        evidence: [{ id: "hasBlindSpotAssist", use: "could warn you" }],
                        notInData: null,
                        status: "active",
                    },
                ],
                droppedPriorities: ["comfort"],
            }),
            EMPTY_UNDERSTANDING,
        );

        const { answers, order } = toAnswers(base(), u);

        expect(answers.priorities[0]).toBe("safetyAssistance");
        expect(answers.priorities).not.toContain("comfort");
        expect(answers.priorities).toHaveLength(3);
        expect(order.filter((item) => item.filler)).toHaveLength(2);
    });

    it("keeps an explicitly rejected priority out even when too much else was dropped", () => {
        const u = readUnderstanding(
            wire({
                needs: [
                    {
                        id: "safety",
                        label: "Good safety features",
                        importance: "essential",
                        said: "you only care about safety",
                        priorities: ["safetyAssistance"],
                        evidence: [],
                        notInData: null,
                        status: "active",
                    },
                ],
                droppedPriorities: ["efficiency", "comfort", "cityParking", "practicality", "longDistance", "climateSuitability", "environmental"],
            }),
            EMPTY_UNDERSTANDING,
        );

        expect(toAnswers(base(), u).answers.priorities).toEqual(["safetyAssistance", "environmental", "climateSuitability"]);
    });

    /* "Around €500" is a line with headroom; "€500 and no more" is the line itself. */
    it("holds a hard maximum exactly, and a target with a little headroom", () => {
        const target = readUnderstanding(wire({ budget: { kind: "target", monthly: 500, said: "around 500" } }), EMPTY_UNDERSTANDING);
        const hard = readUnderstanding(wire({ budget: { kind: "hardMax", monthly: 500, said: "no more than 500" } }), EMPTY_UNDERSTANDING);

        expect(toAnswers(base(), target).answers.preferences.monthlyBudget).toBe(575);
        expect(toAnswers(base(), hard).answers.preferences.monthlyBudget).toBe(500);
    });

    it("describes a what-if as the change it makes", () => {
        const before = readUnderstanding(familyAndNerves, EMPTY_UNDERSTANDING, undefined, "2026-09");
        const after = readUnderstanding(wire({ budget: { kind: "hardMax", monthly: 600, said: "€100 more" } }), before, undefined, "2026-09");

        expect(diffUnderstanding(before, after)).toEqual([
            { label: "Budget", from: "€500/month maximum", to: "€600/month maximum" },
        ]);
    });
});

describe("explaining a match in the person's terms", () => {
    /* Two affordable cars, one with rear USB ports and no blind-spot warning. */
    const usbNoBlindSpot = garageCar({ id: 201, name: "Usb Hatch", customerMonthly: 420, extra: ["hasBackUSBPorts", "hasSplitFoldingRearSeats", "hasElectricTailgate"] });
    const blindSpotNoUsb = garageCar({ id: 202, name: "Watchful Estate", customerMonthly: 440, extra: ["hasBlindSpotAssist"] });
    const pricey = garageCar({
        id: 203,
        name: "Everything Suv",
        customerMonthly: 900,
        extra: ["hasBackUSBPorts", "hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasSplitFoldingRearSeats", "hasElectricTailgate"],
    });

    const cars = [usbNoBlindSpot, blindSpotNoUsb, pricey];
    const u = readUnderstanding({ ...familyAndNerves, rental: null }, EMPTY_UNDERSTANDING, undefined, "2026-09");
    const translation = toAnswers(base(), u);
    const run = runLens(
        cars,
        { ...translation.answers, preferences: { ...translation.answers.preferences, monthlyKm: 500 } },
        "page",
        "",
    )!;

    it("stays inside the hard maximum, and says why the top scorer isn't the answer", () => {
        const story = tellFitStory(run, u, translation.lessRelevant, null);
        const budget = story.sections.find((section) => section.kind === "budget")!;

        expect(run.recommendation.winner.id).not.toBe(203);
        expect(story.eyebrow).toBe("Best match");
        expect(budget.title).toBe("It stays within your €500 limit");
        expect(budget.lines.map((line) => line.text).join(" ")).toMatch(/Everything Suv scores higher overall.*breaks your maximum/);
    });

    it("connects needs to what FINN lists, and never assumes what it doesn't", () => {
        const story = tellFitStory(run, u, translation.lessRelevant, null);
        const winner = run.recommendation.winner;
        const kids = story.sections.find((section) => section.key === "kids-entertained")!;
        const lines = kids.lines.map((line) => line.text);

        expect(winner.id).toBe(201);
        expect(readEvidence(winner, "hasBackUSBPorts")).toBe("listed");
        expect(lines).toContain("Rear USB ports — could keep their tablets charged on long drives.");
        /* What it can't check isn't listed unasked — and isn't claimed either. */
        expect(lines.join(" ")).not.toMatch(/FINN doesn't publish|rear entertainment/);

        /* Adaptive cruise control was made less relevant by what the person is confident with. */
        const confidence = story.sections.find((section) => section.key === "confidence")!;
        expect(confidence.lines.map((line) => line.text).join(" ")).not.toMatch(/adaptive cruise/i);
    });

    it("names the catch, and a car within the limits that avoids it", () => {
        const story = tellFitStory(run, u, translation.lessRelevant, null);
        expect(readEvidence(run.recommendation.winner, "hasBlindSpotAssist")).toBe("notListed");
        expect(story.catch?.text).toBe("FINN doesn't list blind spot warning for this car — worth weighing for feeling safer on the road.");
        expect(story.catch?.alternative).toMatch(/^Watchful Estate has it, at about €\d+\/month — still within your maximum\.$/);
    });

    it("offers alternatives within the person's limits before ones that break them", () => {
        const alternatives = alternativesWithinLimits(run);

        expect(alternatives.map((car) => car.id)).toEqual([202, 203]);
        expect(alternatives[1]?.budget).toBe("over");
    });

    it("gives the model each car's evidence for the needs, and whether it's within limits", () => {
        const facts = evidenceForNeeds(run, u)!;
        const suv = facts.find((row) => row.car === "Everything Suv")!;

        expect(suv.withinYourConstraints).toBe(false);
        expect(suv.evidence["Rear USB ports"]).toBe("listed");
    });
});

describe("saying back only what the person said", () => {
    const told =
        "I have 2 young children. From the 8th of October until April. I have a total of 500 euros per month and I can't spend any more.";

    const understood = (): Understanding => ({
        ...EMPTY_UNDERSTANDING,
        budget: { kind: "hardMax", monthly: 500, stretchTo: null, said: "€500 and no more" },
        rental: { from: "2026-10", to: "2027-04", startDay: 8, said: "8 October until April" },
        context: [
            { label: "Two young children", said: "you have 2 young children" },
            { label: "Children aged 1 and 4", said: "they're 1 and 4" },
        ],
        needs: [
            {
                id: "kids",
                label: "Keeping children safe",
                importance: "essential",
                said: "your children are 1 and 4",
                priorities: ["safetyAssistance"],
                evidence: [],
                notInData: null,
                status: "active",
            },
        ],
    });

    it("drops a detail the model filled in, like children's ages nobody gave", () => {
        const { reply, understanding } = groundInWhatWasSaid(
            "Two young children and €500 as a firm ceiling. Since they're 1 and 4, I'll look at ISOFIX.",
            understood(),
            [told],
            new Date("2026-09-17"),
        );

        expect(reply).toBe("Two young children and €500 as a firm ceiling.");
        expect(understanding.context.map((item) => item.label)).toEqual(["Two young children"]);
        expect(understanding.needs[0]?.said).toBe("");
    });

    it("survives a turn that comes back with no reply at all", () => {
        const { reply, understanding } = groundInWhatWasSaid(undefined, understood(), [told], new Date("2026-09-17"));

        expect(reply).toBe("");
        expect(understanding.budget?.monthly).toBe(500);
    });

    it("keeps numbers that came from them, or from the limits Lens read out of what they said", () => {
        const reply = "From 8 October 2026 to April 2027, with €500 as your maximum. Since they're 1 and 4, ISOFIX matters.";
        const later = [told, "One is 1 and the other is 4."];

        expect(groundInWhatWasSaid(reply, understood(), later, new Date("2026-09-17")).reply).toBe(reply);
    });
});

describe("quoting FINN's own words", () => {
    const sources = [
        { car: "MG ZS", text: "safety ABS, Isofix, Überholsensor aktiv ohne Blinker" },
        { car: "Ford Puma", text: "Paket WINTER Beheizbare Windschutzscheibe, Lenkrad beheizt" },
    ];

    it("keeps a sentence whose German really is FINN's", () => {
        const reply = 'FINN writes "Beheizbare Windschutzscheibe" for this car, a heated windscreen.';

        expect(quotesAreFinns(reply, sources).reply).toBe(reply);
    });

    it("drops a sentence that invents the German it quotes", () => {
        const reply = 'It has a heated windscreen. FINN writes "Beheizbare Heckscheibe mit Sensor" for this one.';
        const checked = quotesAreFinns(reply, sources);

        expect(checked.reply).toBe("It has a heated windscreen.");
        expect(checked.dropped).toEqual(["Beheizbare Heckscheibe mit Sensor"]);
    });

    it("reads FINN's text through spelling and punctuation", () => {
        expect(quotesAreFinns('FINN lists "uberholsensor aktiv ohne blinker".', sources).dropped).toEqual([]);
    });

    it("won't let one car's words stand as evidence about another", () => {
        const reply = 'The MG ZS includes "Beheizbare Windschutzscheibe".';

        expect(quotesAreFinns(reply, sources).reply).toBe("");
        expect(quotesAreFinns(reply, sources).dropped).toEqual(["Beheizbare Windschutzscheibe"]);
    });
});

/*
 * Lens waits for an answer before it compares, so "no limit" and "no fixed
 * dates" have to count as answers. If they read as silence, the question comes
 * back every turn and the reader never reaches a recommendation.
 */
describe("the two things Lens asks for itself", () => {
    it("asks for both when neither was given", () => {
        expect(missingEssentials(EMPTY_UNDERSTANDING)).toEqual({ budget: true, period: true });
    });

    it("stops asking once a figure is given", () => {
        const u = withBudget(EMPTY_UNDERSTANDING, 600, "you said up to €600 a month");

        expect(missingEssentials(u).budget).toBe(false);
        expect(u.budget?.monthly).toBe(600);
    });

    it("treats no limit as an answer, not as silence", () => {
        const u = withBudget(EMPTY_UNDERSTANDING, null, "you said you have no limit in mind");

        expect(u.budget).toBeNull();
        expect(missingEssentials(u).budget).toBe(false);
    });

    it("treats no fixed dates as an answer too", () => {
        const u = waiveEssential(EMPTY_UNDERSTANDING, "rental");

        expect(u.rental).toBeNull();
        expect(missingEssentials(u).period).toBe(false);
    });

    /*
     * The bug this guards: reporting a half-filled period as "no dates" waived
     * the question, so it vanished the moment the reader filled in the first
     * field and they could never give the second.
     */
    it("leaves the question standing while only one date is filled in", () => {
        const u = withRental(EMPTY_UNDERSTANDING, "2027-03", null, "half a period");

        expect(u.rental).toBeNull();
        expect(missingEssentials(u).period).toBe(true);
    });

    it("keeps the day the reader asked for it", () => {
        const u = withRental(EMPTY_UNDERSTANDING, "2027-03", "2027-09", "from the 3rd of March", 3);

        expect(u.rental).toEqual({ firm: true, flexMonths: 0, from: "2027-03", to: "2027-09", startDay: 3, said: "from the 3rd of March" });
        expect(missingEssentials(u).period).toBe(false);
    });

    it("takes the dates as firm until the reader says otherwise, and keeps what they said when the dates change", () => {
        const first = withRental(EMPTY_UNDERSTANDING, "2027-03", "2027-09", "March to September");
        expect(first.rental).toMatchObject({ firm: true, flexMonths: 0 });

        const eased = { ...first, rental: { ...first.rental!, firm: true, flexMonths: 1 } };
        expect(withRental(eased, "2027-04", "2027-10", "April to October").rental).toMatchObject({ firm: true, flexMonths: 1 });

        const loose = { ...first, rental: { ...first.rental!, firm: false, flexMonths: 0 } };
        expect(withRental(loose, "2027-04", "2027-10", "April to October").rental).toMatchObject({ firm: false });
    });

    it("takes the dates after a waiver, and stops counting it waived", () => {
        const waived = waiveEssential(EMPTY_UNDERSTANDING, "rental");
        const dated = withRental(waived, "2027-03", "2027-09", "from March to September");

        expect(dated.waived).toEqual([]);
        expect(dated.rental?.from).toBe("2027-03");
    });

    it("asks again when they clear a figure they had given", () => {
        const given = withBudget(EMPTY_UNDERSTANDING, 600, "you said up to €600 a month");
        const cleared = readUnderstanding(wire({ cleared: ["budget"] }), given, undefined, "2026-09");

        expect(missingEssentials(cleared).budget).toBe(true);
    });

    it("keeps the waiver across a turn that says nothing about money", () => {
        const waived = withBudget(EMPTY_UNDERSTANDING, null, "you said you have no limit in mind");
        const later = readUnderstanding(wire({ tension: "Something else entirely." }), waived, undefined, "2026-09");

        expect(missingEssentials(later).budget).toBe(false);
    });

    it("drops the waiver when they name a figure after all", () => {
        const waived = withBudget(EMPTY_UNDERSTANDING, null, "you said you have no limit in mind");
        const later = readUnderstanding(
            wire({ budget: { kind: "hardMax", monthly: 500, said: "actually, no more than 500" } }),
            waived,
            undefined,
            "2026-09",
        );

        expect(later.waived).toEqual([]);
        expect(missingEssentials(later).budget).toBe(false);
    });

    it("reads a session stored before Lens kept waivers", () => {
        const old = { ...EMPTY_UNDERSTANDING, waived: undefined } as unknown as Understanding;

        expect(missingEssentials(old)).toEqual({ budget: true, period: true });
    });
});
