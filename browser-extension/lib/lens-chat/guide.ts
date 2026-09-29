import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { formatEUR } from "@/lib/reasoning-engine";
import type { CategoryId } from "@/lib/reasoning-engine/types";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import type { FinnCar } from "@/lib/types";

import { coverage, EVIDENCE, withoutLabel, type EvidenceId } from "./evidence";
import type { LensRun } from "./run";
import { budgetCeiling, type Need, type Understanding } from "./understanding";

/**
 * The conversation Lens can hold on its own.
 *
 * Lens AI reads what a person types. Without it, Lens still has everything
 * else: the priorities it ranks on, the evidence it can read on a car, and
 * the cars on the page. What it can't do is understand a sentence — so here
 * it asks instead, in its own words, and the reader taps. The answers build
 * the same `Understanding` the model's replies build, so everything past that
 * point is identical: the same translation into the engine's answers, the
 * same ranking, the same story about why the match fits, the same "why not
 * that one?".
 *
 * Two rules hold this to what Lens really knows:
 *
 * - **Every choice names real evidence.** A need cites signals FINN publishes
 *   and Lens scores; a rule cites a fact Lens can read. Nothing here invents
 *   a property of a car.
 * - **Nothing is offered that can't change the answer.** A choice whose
 *   evidence no car on the page lists is dropped, and a rule is only offered
 *   where it would both keep some cars and set some aside. Asking about
 *   equipment every car has, or none has, wastes the one thing the reader is
 *   spending: their patience.
 */

/* -------------------------------------------------------------------------- */
/* What a piece of evidence is for                                            */
/* -------------------------------------------------------------------------- */

/**
 * What each piece of equipment does for the person, in a clause that finishes
 * the sentence Lens says about the car: "ISOFIX child seat anchors — somewhere
 * to anchor a child seat."
 *
 * This is the one thing the model writes that Lens otherwise has no words for.
 * FINN's own explanation says what the equipment is; this says why it was
 * raised. Written once here, so no two conversations describe the same need
 * differently.
 */
const USE: Partial<Record<EvidenceId, string>> = {
    hasIsofix: "somewhere to anchor a child seat",
    rearDoors: "doors of their own for the back seats",
    seatsFivePlus: "a seat for everyone when they're all in",
    seatsSixPlus: "room for six or more",
    hasSplitFoldingRearSeats: "a bench that folds down when the load is bigger than the boot",
    hasElectricTailgate: "a boot that opens with your hands full",
    hasBackUSBPorts: "charging within reach of the back seats",
    hasRoofRails: "somewhere to mount a box or a rack",
    hasTowbar: "something to tow with",
    towingCapacity1500: "a towing rating that covers a trailer or a small caravan",
    compactLength: "a shorter car to place in a tight space",
    compactWidth: "a narrower car for tight lanes and multi-storey bays",
    hasThreeSixtyDegreesCamera: "a view all the way round while you park",
    hasOneEightyDegreesReversingCamera: "a view of what's behind you",
    hasParkingSensors: "a warning before you reach anything",
    /*
     * Not "the car steering itself in": this is FINN's own "Parkassistent"
     * flag, which is on 98% of its cars and is exactly what FINN's
     * "Einparkhilfe" filter selects — a parking aid, not necessarily one that
     * takes the wheel.
     */
    hasParkingAssistant: "help getting into a space",
    hasElectricallyFoldingMirrors: "mirrors out of the way on a narrow street",
    hasAutomaticTransmission: "no clutch to work in stop-start traffic",
    driverAssistLevel2: "the car holding its lane and its distance on the motorway",
    hasAdaptiveCruiseControl: "your distance kept without working the pedals",
    hasCruiseControl: "a steady speed held over a long stretch",
    hasLumbarSupport: "support for your back over hours at a time",
    hasHeadUpDisplay: "your speed where you're already looking",
    hasMatrixLedHeadlights: "full beam that shapes itself around oncoming traffic",
    hasBlindSpotAssist: "a warning when something is alongside you",
    hasRearCrosswalkWarning: "a warning when you reverse out into traffic",
    hasLaneKeepingAssist: "a nudge back when you drift",
    hasEmergencyBrakingAssist: "braking for you if something appears in front",
    hasTrafficSignRecognition: "the limit shown as you pass the sign",
    hasHeatedSeats: "warmth on a frozen morning",
    hasHeatedSteeringWheel: "a wheel you can hold before your gloves come off",
    hasRainSlashLightSensors: "wipers and lights that come on by themselves",
    hasFogLights: "the edge of the road in fog",
    hasCorneringLights: "light into the bend on an unlit lane",
    hasHeadlightCleaningSystem: "headlights kept clear of road salt and spray",
    hasAllWheelDrive: "grip pulling away on snow",
    hasAuxiliaryHeater: "a car that's warm before you get into it",
    hasHeatPump: "heating that doesn't eat the range in winter",
    hasSeatCooling: "cooling on the seat itself in August",
    hasElectricFrontSeatAdjustment: "a seat set once and remembered",
    hasKeylessEntryAndStart: "getting in without digging for a key",
    hasWirelessChargingStation: "a phone charged without a cable",
    hasWirelessAppleCarPlaySlashAndroidAuto: "your phone on the screen without plugging it in",
    hasAppleCarPlaySlashAndroidAuto: "your own maps and music on the car's screen",
    hasThreeZoneAutomaticClimateControls: "everyone setting their own temperature",
    hasPremiumSoundSystem: "sound worth listening to on a long drive",
    hasSunroof: "light and air overhead",
    hasSpareWheel: "something you can fit at the roadside",
    electricCar: "an electric car",
    winterReadyTyres: "tyres for winter already fitted",
};

/** What a piece of equipment is for, in the words above, or nothing. */
export const purposeOf = (id: EvidenceId): string => USE[id] ?? "";

/* -------------------------------------------------------------------------- */
/* The steps                                                                  */
/* -------------------------------------------------------------------------- */

export type GuideStepId = "life" | "rules" | "distance";

/** One thing the reader can tap, and what it means to Lens. */
export interface GuideChoice {
    id: string;
    /** On the chip. */
    label: string;
    /** Recorded in the conversation as the reader's own words. */
    said: string;
    /** A need this stands for: what the car has to do, and what Lens looks at. */
    need?: {
        label: string;
        importance: NeedImportance;
        priorities: CategoryId[];
        evidence: EvidenceId[];
    };
    /** A car Lens should keep or set aside outright. */
    rule?: { id: EvidenceId; mode: "must" | "without"; label: string };
    /** Kilometres a month, for FINN's mileage charge. */
    monthlyKm?: number;
}

export interface GuideStep {
    id: GuideStepId;
    /** Lens's own question. */
    ask: string;
    /** What the answer is for, where that isn't obvious from the question. */
    hint?: string;
    /** Several answers at once, or one. */
    multiple: boolean;
    choices: GuideChoice[];
    /** The answer for someone none of it applies to. */
    none: string;
}

const LIFE: GuideChoice[] = [
    {
        id: "kids",
        label: "Kids in the back",
        said: "I have kids in the back.",
        need: {
            label: "Kids in the back",
            importance: "important",
            priorities: ["practicality", "safetyAssistance"],
            evidence: ["hasIsofix", "rearDoors", "seatsFivePlus", "hasSplitFoldingRearSeats", "hasBackUSBPorts"],
        },
    },
    {
        id: "carrying",
        label: "Carrying a lot",
        said: "I carry a lot in the car.",
        need: {
            label: "Carrying a lot",
            importance: "important",
            priorities: ["practicality"],
            evidence: ["hasSplitFoldingRearSeats", "hasElectricTailgate", "hasRoofRails", "seatsFivePlus"],
        },
    },
    {
        id: "city",
        label: "City driving and parking",
        said: "It's mostly city driving, and parking is the hard part.",
        need: {
            label: "City driving and parking",
            importance: "important",
            priorities: ["cityParking"],
            evidence: ["compactLength", "compactWidth", "hasOneEightyDegreesReversingCamera", "hasParkingSensors", "hasElectricallyFoldingMirrors"],
        },
    },
    {
        id: "motorway",
        label: "Long motorway drives",
        said: "I do long motorway drives.",
        need: {
            label: "Long motorway drives",
            importance: "important",
            priorities: ["longDistance"],
            evidence: ["driverAssistLevel2", "hasAdaptiveCruiseControl", "hasLumbarSupport", "hasHeadUpDisplay"],
        },
    },
    {
        id: "nervous",
        label: "I'm a nervous driver",
        said: "I'm a nervous driver.",
        need: {
            label: "Feeling safe behind the wheel",
            importance: "important",
            priorities: ["safetyAssistance", "cityParking"],
            evidence: ["hasBlindSpotAssist", "hasRearCrosswalkWarning", "hasThreeSixtyDegreesCamera", "hasParkingSensors", "hasLaneKeepingAssist"],
        },
    },
    {
        id: "winter",
        label: "Cold winters, bad weather",
        said: "The winters here are cold and the weather is often bad.",
        need: {
            label: "Cold mornings and bad weather",
            importance: "important",
            priorities: ["climateSuitability"],
            evidence: ["hasHeatedSeats", "hasHeatedSteeringWheel", "hasRainSlashLightSensors", "hasFogLights", "hasCorneringLights"],
        },
    },
    {
        id: "towing",
        label: "Towing or a roof box",
        said: "I tow, or I carry things on the roof.",
        need: {
            label: "Towing and roof loads",
            importance: "important",
            priorities: ["practicality"],
            evidence: ["hasTowbar", "towingCapacity1500", "hasRoofRails"],
        },
    },
    {
        id: "comfort",
        label: "Comfortable day to day",
        said: "I want it to be pleasant to sit in day to day.",
        need: {
            label: "Pleasant on an ordinary day",
            importance: "important",
            priorities: ["comfort"],
            evidence: ["hasElectricFrontSeatAdjustment", "hasKeylessEntryAndStart", "hasWirelessChargingStation", "hasThreeZoneAutomaticClimateControls"],
        },
    },
    {
        id: "emissions",
        label: "Low emissions matter",
        said: "Emissions matter to me.",
        /*
         * No evidence: Environmental Impact is scored from the car's own CO₂
         * figure, and there is no equipment to point at. A need with an empty
         * evidence list still moves the priority, which is the whole of what
         * Lens can honestly do here.
         */
        /* The reader's wish, not a verdict: "Low emissions" in the focus strip read as a claim about the car. */
        need: { label: "Emissions matter", importance: "important", priorities: ["environmental"], evidence: [] },
    },
];

/**
 * Rules, not preferences: what Lens should keep or set aside outright.
 *
 * Each is an essential need carrying one piece of evidence, which is what
 * `ruledOut` reads to narrow the set before anything is scored. They are asked
 * separately from the step above because the answer does something different —
 * it removes cars rather than moving points.
 */
const RULES: GuideChoice[] = [
    { id: "electric-only", label: "Electric only", said: "It has to be electric.", rule: { id: "electricCar", mode: "must", label: "Electric" } },
    { id: "not-electric", label: "Not electric", said: "I don't want an electric car.", rule: { id: "electricCar", mode: "without", label: "Not electric" } },
    { id: "automatic", label: "Automatic only", said: "It has to be an automatic.", rule: { id: "hasAutomaticTransmission", mode: "must", label: "Automatic gearbox" } },
    { id: "no-suv", label: "No SUV", said: "I don't want an SUV.", rule: { id: "suvBody", mode: "without", label: "Not an SUV" } },
    { id: "must-tow", label: "It must tow", said: "It has to be able to tow.", rule: { id: "hasTowbar", mode: "must", label: "Towbar" } },
    { id: "six-seats", label: "Six seats or more", said: "I need six seats or more.", rule: { id: "seatsSixPlus", mode: "must", label: "Six or more seats" } },
    { id: "awd", label: "All-wheel drive", said: "It has to have all-wheel drive.", rule: { id: "hasAllWheelDrive", mode: "must", label: "All-wheel drive" } },
];

/**
 * The distance, because FINN charges for it.
 *
 * Every price on FINN includes the same monthly allowance and bills what you
 * drive beyond it. For someone doing 1,500 km a month that charge is a large
 * part of what each car really costs, so a budget answered without it is
 * answered against the wrong figures.
 */
const DISTANCE: GuideChoice[] = [
    { id: "km-500", label: "About 500 km", said: "I drive about 500 km a month.", monthlyKm: 500 },
    { id: "km-1000", label: "About 1,000 km", said: "I drive about 1,000 km a month.", monthlyKm: 1000 },
    { id: "km-1500", label: "About 1,500 km", said: "I drive about 1,500 km a month.", monthlyKm: 1500 },
    { id: "km-2500", label: "2,500 km or more", said: "I drive 2,500 km a month or more.", monthlyKm: 2500 },
];

/* -------------------------------------------------------------------------- */
/* What's worth asking about these cars                                       */
/* -------------------------------------------------------------------------- */

/** Evidence at least one car here lists — anything else can't be found or missed. */
const findable = (cars: FinnCar[], id: EvidenceId): boolean => coverage(cars, id).listed > 0;

/**
 * A rule worth offering: it keeps some cars and sets some aside.
 *
 * "Electric only" over a page of petrol cars empties the comparison, and over
 * a page of electric cars changes nothing. Either way the reader has answered
 * a question for no reason.
 */
function ruleSplits(cars: FinnCar[], choice: GuideChoice): boolean {
    if (!choice.rule) return false;

    const counts = coverage(cars, choice.rule.id);
    const kept = choice.rule.mode === "must" ? counts.listed : counts.notListed;
    const gone = choice.rule.mode === "must" ? counts.notListed + counts.unknown : counts.listed;

    return kept > 0 && gone > 0;
}

/**
 * The questions Lens would ask about these cars, in the order it asks them.
 *
 * Narrowed to the page: a choice keeps only the evidence some car here lists,
 * and is dropped when it has none left and no priority to move. What's left is
 * a conversation where every answer can change the result.
 */
export function guideSteps(
    cars: FinnCar[],
    enabled?: CategoryId[],
    /**
     * Steps already answered some other way — "how far do you drive" by a
     * mileage package the reader picked on finn.com. Asking again would be
     * asking them to repeat themselves.
     */
    skip: GuideStepId[] = [],
): GuideStep[] {
    const allowed = (priority: CategoryId) => !enabled?.length || enabled.includes(priority);

    const life = LIFE.map((choice) => {
        const need = choice.need!;
        const priorities = need.priorities.filter(allowed);
        const evidence = need.evidence.filter((id) => findable(cars, id));

        return { ...choice, need: { ...need, priorities, evidence } };
    }).filter((choice) => choice.need.priorities.length > 0 && (choice.need.evidence.length > 0 || CATEGORIES[choice.need.priorities[0]!].numericOnly));

    const rules = RULES.filter((choice) => ruleSplits(cars, choice));

    const steps: GuideStep[] = [
        {
            id: "life",
            ask: "What does the car have to do for you?",
            hint: "Tap everything that's true. Lens looks for what FINN lists on each car for each of them.",
            multiple: true,
            choices: life,
            none: "None of these",
        },
        ...(rules.length
            ? [
                  {
                      id: "rules" as const,
                      ask: "Anything that rules a car in or out?",
                      hint: "These set cars aside before Lens scores anything, so only pick what you'd refuse.",
                      multiple: true,
                      choices: rules,
                      none: "Nothing's off the table",
                  },
              ]
            : []),
        {
            id: "distance",
            ask: "How far do you drive in a month?",
            hint: "Every FINN price includes a mileage allowance and charges for what you drive beyond it, so this changes what each car costs.",
            multiple: false,
            choices: DISTANCE,
            none: "I'd rather not say",
        },
    ];

    return steps.filter((step) => !skip.includes(step.id));
}

/* -------------------------------------------------------------------------- */
/* Into the understanding                                                     */
/* -------------------------------------------------------------------------- */

/** Needs this step owns, so answering it again replaces its own answers only. */
const ownedBy = (step: GuideStepId) => `${step}:`;

const needFor = (step: GuideStepId, choice: GuideChoice): Need | null => {
    const id = `${ownedBy(step)}${choice.id}`;

    if (choice.need) {
        return {
            id,
            label: choice.need.label,
            importance: choice.need.importance,
            said: choice.said,
            priorities: choice.need.priorities,
            evidence: choice.need.evidence.map((item) => ({
                id: item,
                use: USE[item] ?? "",
                unwanted: false,
                mustHave: false,
            })),
            notInData: null,
            status: "active",
        };
    }

    if (choice.rule) {
        return {
            id,
            label: choice.rule.mode === "without" ? withoutLabel(choice.rule.id) : EVIDENCE[choice.rule.id].label,
            /* `ruledOut` narrows the set on essential needs only. */
            importance: "essential",
            said: choice.said,
            priorities: [],
            evidence: [
                {
                    id: choice.rule.id,
                    use: USE[choice.rule.id] ?? "",
                    unwanted: choice.rule.mode === "without",
                    mustHave: choice.rule.mode === "must",
                },
            ],
            notInData: null,
            status: "active",
        };
    }

    return null;
};

/**
 * What the reader tapped, as something Lens understands.
 *
 * The step replaces its own answers and leaves everything else alone: someone
 * revisiting "what does the car have to do" is changing that answer, not
 * withdrawing their budget or their rules. Tapping nothing is an answer too —
 * it clears what that step had said.
 */
export function applyChoices(u: Understanding, step: GuideStep, chosen: string[]): Understanding {
    const picked = step.choices.filter((choice) => chosen.includes(choice.id));
    const mine = ownedBy(step.id);
    const kept = u.needs.filter((need) => !need.id.startsWith(mine));
    const added = picked.map((choice) => needFor(step.id, choice)).filter((need): need is Need => need != null);

    const distance = step.id === "distance" ? (picked.find((choice) => choice.monthlyKm != null) ?? null) : null;

    return {
        ...u,
        needs: [...kept, ...added],
        monthlyKm: step.id !== "distance" ? u.monthlyKm : distance ? { value: distance.monthlyKm!, said: distance.said } : null,
    };
}

/** What the reader said, for the conversation's own record. */
export function saidFor(step: GuideStep, chosen: string[]): string {
    const picked = step.choices.filter((choice) => chosen.includes(choice.id));

    if (!picked.length) return step.none;

    return picked.map((choice) => choice.said).join(" ");
}

/* -------------------------------------------------------------------------- */
/* What else is worth knowing about these cars                                */
/* -------------------------------------------------------------------------- */

/** Equipment this common tells the cars apart too weakly to be worth a question. */
const TOO_COMMON = 0.85;

export interface GuideOffer {
    id: EvidenceId;
    why: string;
    needId: string;
}

/**
 * Equipment Lens could count for a need the reader has already given, where
 * the cars here actually differ on it.
 *
 * The model does this by reading the person; Lens does it by reading the page.
 * Both end in the same offer — "some of these have a 360° camera; shall I
 * count it?" — and the same `withSuggestion` if the answer is yes. Only
 * equipment the reader's own priority scores, so a yes moves the result rather
 * than decorating it.
 */
export function offersFor(u: Understanding, cars: FinnCar[], limit = 2): GuideOffer[] {
    if (!cars.length) return [];

    const active = u.needs.filter((need) => need.status === "active" && need.priorities.length);
    const taken = new Set(active.flatMap((need) => need.evidence.map((entry) => entry.id)));
    const offers: GuideOffer[] = [];

    for (const need of active) {
        for (const priority of need.priorities) {
            const category = CATEGORIES[priority] as { features: readonly string[]; niche?: readonly string[] };
            /*
             * Equipment the engine only counts for someone who asked for it.
             * A towbar sits under Practicality, so a parent who said "kids in
             * the back" was offered one — Lens deciding they might tow, which
             * is the guessing the model isn't allowed to do either.
             */
            const niche = new Set(category.niche ?? []);

            for (const id of category.features as EvidenceId[]) {
                if (offers.length >= limit) return offers;
                if (niche.has(id) || taken.has(id) || u.declined.includes(id) || !EVIDENCE[id]?.raisable) continue;

                const counts = coverage(cars, id);
                const share = counts.total ? counts.listed / counts.total : 0;

                if (counts.listed === 0 || share > TOO_COMMON) continue;

                taken.add(id);
                offers.push({
                    id,
                    why: USE[id] ?? need.label.toLowerCase(),
                    needId: need.id,
                });
            }
        }
    }

    return offers;
}

/* -------------------------------------------------------------------------- */
/* What if                                                                    */
/* -------------------------------------------------------------------------- */

export interface GuideWhatIf {
    /** On the chip the reader taps. */
    label: string;
    /** Lens's own line about what it would try. */
    reply: string;
    after: Understanding;
}

/**
 * The changes worth trying on a result, read off the result itself.
 *
 * Not speculation: each one is something this comparison actually turned on —
 * a budget that excluded the best match, a rule that set cars aside, a
 * mileage charge doing the work. The reader still has to accept the outcome,
 * exactly as with a what-if the model proposes.
 */
export function whatIfs(run: LensRun, u: Understanding): GuideWhatIf[] {
    const out: GuideWhatIf[] = [];
    const { recommendation } = run;

    /* A budget that kept the best match out: what would it take to let it in? */
    if (u.budget) {
        const ceiling = budgetCeiling(u.budget);
        const over = recommendation.context.vehicles
            .map((car) => recommendation.context.costs[car.id])
            .filter((cost) => cost?.complete && cost.totalMonthly > ceiling)
            .map((cost) => cost!.totalMonthly)
            .sort((a, b) => a - b);

        const nearest = over[0];

        if (nearest != null) {
            const monthly = Math.ceil(nearest / 10) * 10;

            out.push({
                label: `What if I allowed ${formatEUR(monthly)}?`,
                reply: `The next car up costs about ${formatEUR(nearest)} a month all in. Here's what happens if ${formatEUR(monthly)} is the limit instead.`,
                after: { ...u, budget: { ...u.budget, monthly, stretchTo: null, said: `you'd allow up to €${monthly} a month` } },
            });
        }
    }

    /* A rule that set cars aside: what was behind it? */
    if (run.ruledOut?.setAside) {
        for (const need of u.needs) {
            if (need.importance !== "essential" || need.status !== "active") continue;

            const rule = need.evidence.find((entry) => entry.unwanted || entry.mustHave);
            if (!rule) continue;

            out.push({
                label: `What if I dropped "${need.label}"?`,
                reply: `That rule set ${run.ruledOut.setAside} ${run.ruledOut.setAside === 1 ? "car" : "cars"} aside. Here's the comparison with all of them back in.`,
                after: { ...u, needs: u.needs.map((item) => (item.id === need.id ? { ...item, status: "dropped" as const } : item)) },
            });

            break;
        }
    }

    return out.slice(0, 2);
}
