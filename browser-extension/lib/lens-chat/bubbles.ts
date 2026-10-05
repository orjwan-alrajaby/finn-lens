import type { NeedImportance } from "@/lib/lens-ai/contract";
import type { CategoryId, FeatureImportance } from "@/lib/reasoning-engine/types";
import type { FinnCar } from "@/lib/types";

import { coverage, EVIDENCE, type EvidenceId } from "./evidence";
import { explain } from "./guide";
import { ruledOut, type BubbleState, type Need, type Understanding } from "./understanding";

/**
 * The reader's life, as bubbles they tap — and what Lens makes of each.
 *
 * A bubble is the start of what Lens understands, not a preset: it counts
 * only the two or three items most people with that life would agree with,
 * suggests the rest as "worth a look", and says what FINN's data can't tell
 * Lens about it. The reader sees all of it on the summary and corrects it
 * there. How much a bubble counts comes from something they said — a chip,
 * how often — or starts at "Matters", shown with one tap to change.
 *
 * Each bubble becomes one need (`bubble-kids`…), so everything past this
 * point — the engine's answers, the story, why not that one — is what a
 * tapped need always was. See docs/LIFE-BUBBLES-SPEC-v2.md.
 */

export type BubbleId =
    | "kids"
    | "six-seats"
    | "dog"
    | "city"
    | "help"
    | "long"
    | "traffic"
    | "weather"
    | "night"
    | "carry"
    | "comfort"
    | "environment"
    | "budget";

export interface BubbleChip {
    id: string;
    /** On the chip: "Snow & ice". */
    label: string;
    /** After the bubble, in a sentence: "snow and ice". */
    detail: string;
    counts?: EvidenceId[];
    checks?: EvidenceId[];
    worth?: EvidenceId[];
    /** Counted one step above the bubble: a garage makes width count more. */
    stronger?: EvidenceId[];
    /** How much the bubble counts, when this chip says so. */
    importance?: NeedImportance;
    /** A deal-breaker this suggests, by the rules question's own id. */
    suggests?: string;
}

export interface Bubble {
    id: BubbleId;
    /** On the bubble, in the reader's voice: "I have kids". */
    label: string;
    /** Said back: "You have kids". */
    you: string;
    /** The need's name, for sentences about it: "travelling with children". */
    need: string;
    /** In the reader's words, for the chat: "I have kids." */
    said: string;
    /** What tapping it means, under the bubble. */
    means: string;
    counts: EvidenceId[];
    checks: EvidenceId[];
    worth: EvidenceId[];
    /** Priorities judged on a figure, with no equipment: CO₂, consumption. */
    figures?: CategoryId[];
    /** How much it counts with nothing else said. */
    importance?: NeedImportance;
    chips?: {
        ask: string;
        /** "optional": none keeps the bubble's own items. "required": pick at least one. "any": only what's picked counts. */
        mode: "optional" | "required" | "any";
        multiple: boolean;
        max?: number;
        /** Chips that can't both be true. */
        exclusive?: string[][];
        /** The chips not picked suggest their own items: help with parking might mean help in traffic too. */
        suggestOthers?: boolean;
        options: BubbleChip[];
    };
    /** A separate "how often" question that sets how much it counts. */
    often?: OftenId;
    /** Asks how far they drive, with the limit. */
    distance?: boolean;
    suggests?: string;
    /** What matters for this life that FINN's data can't tell Lens. */
    cantCheck: string;
    /** Why each item is here, for this bubble. */
    why?: Partial<Record<EvidenceId, string>>;
    /** Said on the summary when an "any" bubble has nothing picked. */
    empty?: string;
}

/* -------------------------------------------------------------------------- */
/* The bubbles                                                                */
/* -------------------------------------------------------------------------- */

export const BUBBLES: Bubble[] = [
    {
        id: "kids",
        label: "I have kids",
        you: "You have kids",
        need: "Travelling with children",
        said: "I have kids.",
        means: "Children in the car. Whether they're in a child seat is asked next to it.",
        counts: ["rearDoors"],
        checks: ["hasIsofix"],
        worth: ["hasSplitFoldingRearSeats"],
        chips: {
            ask: "Does the youngest ride in a child seat?",
            mode: "optional",
            multiple: false,
            options: [
                {
                    id: "baby",
                    label: "A baby or toddler seat",
                    detail: "a baby or toddler seat",
                    importance: "essential",
                    worth: ["hasElectricTailgate"],
                },
                { id: "booster", label: "A booster seat", detail: "a booster seat" },
                { id: "older", label: "They're older", detail: "older kids", worth: ["hasThreeZoneAutomaticClimateControls", "hasBackUSBPorts"] },
            ],
        },
        cantCheck: "rear legroom, whether a particular child seat fits, or boot space (FINN's figure doesn't say whether the seats are up or folded)",
        why: {
            rearDoors: "so children get in and out without folding a front seat",
            hasElectricTailgate: "so you can open the boot while holding a child",
            hasThreeZoneAutomaticClimateControls: "so children in the back can set their own temperature",
            hasBackUSBPorts: "so devices in the back stay charged",
            hasSplitFoldingRearSeats: "so a pram or a big load fits beside a child seat",
        },
    },
    {
        id: "six-seats",
        label: "We need six seats or more",
        you: "You need six seats or more",
        need: "Six seats or more",
        said: "We need six seats or more.",
        means: "More than five people in the car, often enough that it matters.",
        counts: ["seatsSixPlus"],
        checks: [],
        worth: [],
        importance: "essential",
        suggests: "six-seats",
        cantCheck: "how usable the third row is for adults",
        why: { seatsSixPlus: "so everyone has a seat" },
    },
    {
        id: "dog",
        label: "I travel with a dog",
        you: "You travel with a dog",
        need: "Travelling with a dog",
        said: "I travel with a dog.",
        means: "A dog in the boot or on the back seat.",
        counts: ["hasSplitFoldingRearSeats"],
        checks: [],
        worth: ["hasElectricTailgate", "rearDoors"],
        cantCheck: "boot size and shape, or how high the boot lip is",
        why: {
            hasSplitFoldingRearSeats: "so a crate or a big dog fits",
            hasElectricTailgate: "so the boot opens while you hold the lead",
            rearDoors: "so a dog gets onto the back seat without climbing over the front",
        },
    },
    {
        id: "city",
        label: "I live in the city",
        you: "You live in the city",
        need: "City driving",
        said: "I live in the city.",
        means: "Narrow streets, tight spaces and stop-and-go traffic. Where you park can be added next to it.",
        counts: ["compactWidth", "compactLength"],
        checks: ["hasAutomaticTransmission", "hasParkingSensors", "hasEmergencyBrakingAssist"],
        worth: ["hasOneEightyDegreesReversingCamera", "hasThreeSixtyDegreesCamera", "hasBlindSpotAssist"],
        chips: {
            ask: "Where do you park most often?",
            mode: "optional",
            multiple: true,
            max: 2,
            options: [
                { id: "street", label: "On the street", detail: "you park on the street", counts: ["hasOneEightyDegreesReversingCamera"] },
                { id: "garage", label: "A garage at home", detail: "you park in a garage", stronger: ["compactWidth"], checks: ["hasElectricallyFoldingMirrors"] },
                { id: "multi-storey", label: "Multi-storey or underground", detail: "you park in multi-storeys", counts: ["hasThreeSixtyDegreesCamera"], checks: ["hasElectricallyFoldingMirrors"] },
                { id: "open", label: "Open car parks", detail: "you park in open car parks", counts: ["hasRearCrosswalkWarning"] },
                { id: "driveway", label: "A driveway", detail: "you park on a driveway" },
            ],
        },
        cantCheck: "the turning circle, or how well you can see out",
        why: {
            compactWidth: "so it fits narrow streets and bays",
            compactLength: "so it fits shorter spaces",
            hasOneEightyDegreesReversingCamera: "so you can see the kerb and the car behind when you park on the street",
            hasThreeSixtyDegreesCamera: "so you can see every pillar and wall in a tight car park",
            hasRearCrosswalkWarning: "for reversing out into passing traffic",
            hasBlindSpotAssist: "for changing lanes in busy traffic",
        },
    },
    {
        id: "help",
        label: "I want help driving & parking",
        you: "You want help driving and parking",
        need: "Help driving and parking",
        said: "I'd like help driving and parking.",
        means: "Systems that warn you, or watch where you can't. Which kind of help is picked next to it.",
        counts: [],
        checks: ["hasEmergencyBrakingAssist", "hasTrafficSignRecognition"],
        worth: ["hasMatrixLedHeadlights"],
        chips: {
            ask: "With what?",
            mode: "required",
            multiple: true,
            suggestOthers: true,
            options: [
                { id: "parking", label: "Parking", detail: "parking", counts: ["hasThreeSixtyDegreesCamera"], checks: ["hasParkingSensors"] },
                { id: "traffic", label: "Busy traffic & changing lanes", detail: "busy traffic", counts: ["hasBlindSpotAssist"], checks: ["hasLaneKeepingAssist"] },
                { id: "reversing", label: "Reversing out", detail: "reversing out", counts: ["hasRearCrosswalkWarning", "hasOneEightyDegreesReversingCamera"] },
            ],
        },
        cantCheck: "crash protection — FINN has no crash-test data",
        why: {
            hasThreeSixtyDegreesCamera: "so you can check every side before you move",
            hasBlindSpotAssist: "for the cars you can't see when changing lanes",
            hasRearCrosswalkWarning: "for reversing out between parked cars, where you can't see traffic coming",
            hasOneEightyDegreesReversingCamera: "so you aren't reversing on mirrors alone",
        },
    },
    {
        id: "long",
        label: "I drive long distances",
        you: "You drive long distances",
        need: "Long distances",
        said: "I drive long distances.",
        means: "Hours on the motorway. How often is asked next.",
        counts: ["driverAssistLevel2", "hasLumbarSupport"],
        checks: ["hasAdaptiveCruiseControl", "hasCruiseControl", "hasIntegratedNavigationSystem"],
        worth: ["hasHeadUpDisplay", "hasMatrixLedHeadlights", "hasRoofRails"],
        often: "long",
        distance: true,
        cantCheck: "seat comfort over hours, road noise, or how it rides",
        why: {
            driverAssistLevel2: "so the car keeps its lane and distance while you supervise",
            hasLumbarSupport: "for your back over hours",
            hasMatrixLedHeadlights: "for long drives after dark",
            hasRoofRails: "for a roof box on holidays",
        },
    },
    {
        id: "traffic",
        label: "I sit in traffic a lot",
        you: "You sit in traffic a lot",
        need: "Time in traffic",
        said: "I sit in traffic a lot.",
        means: "A commute or school run in stop-and-go traffic. How long it is is asked next.",
        counts: ["driverAssistLevel2"],
        checks: ["hasAutomaticTransmission", "hasAdaptiveCruiseControl"],
        worth: ["hasKeylessEntryAndStart", "hasWirelessAppleCarPlaySlashAndroidAuto", "hasWirelessChargingStation"],
        often: "traffic",
        distance: true,
        cantCheck: "how smooth the gearbox is in traffic",
        why: {
            driverAssistLevel2: "so the car keeps its speed, distance and lane together in stop-and-go traffic",
        },
    },
    {
        id: "weather",
        label: "The weather here is tough",
        you: "The weather where you live is tough",
        need: "Tough weather",
        said: "The weather here is tough.",
        means: "Winters, rain or heat that make the car harder to live with. What it's like is picked next to it.",
        counts: [],
        checks: ["hasAirConditioning"],
        worth: [],
        chips: {
            ask: "What's it like?",
            mode: "required",
            multiple: true,
            /* "Mostly dry" can't be snowy or rainy; snow and rain, or either and hot summers, are different months. */
            exclusive: [
                ["snow", "cold"],
                ["wet", "cold"],
            ],
            options: [
                {
                    id: "snow",
                    label: "Snow & ice",
                    detail: "snow and ice",
                    counts: ["hasHeatedSeats", "hasHeatedSteeringWheel"],
                    worth: ["hasAllWheelDrive", "hasAuxiliaryHeater", "hasHeatPump", "hasHeadlightCleaningSystem"],
                },
                { id: "wet", label: "Rain & fog", detail: "rain and fog", counts: ["hasRainSlashLightSensors", "hasFogLights"] },
                { id: "cold", label: "Cold but mostly dry", detail: "cold, mostly dry winters", counts: ["hasHeatedSeats"] },
                { id: "hot", label: "Hot summers", detail: "hot summers", counts: ["hasSeatCooling"], worth: ["hasThreeZoneAutomaticClimateControls"] },
            ],
        },
        cantCheck: "how the car handles on snow, or which tyres it will come on",
        why: {
            hasHeatedSeats: "to warm you on a cold start, before the cabin is",
            hasHeatedSteeringWheel: "so the wheel is warm to hold on a frozen morning",
            hasSeatCooling: "so your back doesn't stick to the seat in the heat",
            hasAllWheelDrive: "for grip pulling away and climbing on snow and ice — it doesn't shorten braking",
            hasAuxiliaryHeater: "so the car is warm and the windows clear before you set off",
            hasHeatPump: "so an electric car keeps more of its range in the cold",
            hasHeadlightCleaningSystem: "because road salt dims headlights",
            hasRainSlashLightSensors: "so the wipers and headlights come on by themselves in rain and gloom",
            hasFogLights: "so the road edge stays lit when fog closes in",
        },
    },
    {
        id: "night",
        label: "I drive at night a lot",
        you: "You drive at night a lot",
        need: "Driving at night",
        said: "I drive at night a lot.",
        means: "Dark roads, often enough that the lights matter.",
        counts: ["hasMatrixLedHeadlights", "hasCorneringLights"],
        checks: [],
        worth: ["hasHeadlightCleaningSystem", "hasRainSlashLightSensors", "hasFogLights"],
        cantCheck: "how bright the headlights are, beyond their type",
        why: {
            hasMatrixLedHeadlights: "so full beam stays on without dazzling anyone",
            hasCorneringLights: "so you can see into the bend",
        },
    },
    {
        id: "carry",
        label: "I carry a lot",
        you: "You carry a lot",
        need: "Carrying a lot",
        said: "I carry a lot.",
        means: "Loads that need room, a roof or a hitch. What you carry is picked next to it.",
        counts: [],
        checks: [],
        worth: [],
        chips: {
            ask: "What do you carry?",
            mode: "required",
            multiple: true,
            options: [
                /* A week's shopping and a sofa ask different things of a car. */
                { id: "shopping", label: "Shopping & everyday bags", detail: "shopping and bags", counts: ["hasElectricTailgate"] },
                { id: "bulky", label: "Bulky things: furniture, a pram, sports kit", detail: "bulky things", counts: ["hasSplitFoldingRearSeats"], worth: ["hasElectricTailgate"] },
                { id: "bikes", label: "Bikes, skis or a roof box", detail: "bikes, skis or a roof box", counts: ["hasRoofRails"], worth: ["hasTowbar"] },
                { id: "trailer", label: "A trailer or caravan", detail: "a trailer or caravan", counts: ["hasTowbar", "towingCapacity1500"], suggests: "must-tow" },
            ],
        },
        cantCheck: "boot space — FINN's figure doesn't say whether the seats are up or folded",
        why: {
            hasElectricTailgate: "so the boot opens when your hands are full",
            hasSplitFoldingRearSeats: "so long or bulky things fit with part of the back seat down",
            hasRoofRails: "for a roof box, a bike carrier or a ski rack",
            hasTowbar: "for the trailer or caravan — and a bike rack can go on it",
            towingCapacity1500: "enough to pull most small caravans",
        },
    },
    {
        id: "comfort",
        label: "Comfort matters to me",
        you: "Comfort matters to you",
        need: "Comfort",
        said: "Comfort matters to me.",
        means: "The comforts you'd use every day. Pick which ones next to it — every one FINN lists that I can check.",
        counts: [],
        checks: ["hasAppleCarPlaySlashAndroidAuto"],
        worth: [],
        chips: {
            ask: "Which comforts?",
            mode: "any",
            multiple: true,
            options: [
                /* Each named as FINN lists it, with what it does where the name doesn't say. */
                { id: "warm", label: "Heated seats", detail: "heated seats", counts: ["hasHeatedSeats"] },
                { id: "wheel", label: "Heated steering wheel", detail: "a heated steering wheel", counts: ["hasHeatedSteeringWheel"] },
                { id: "cooled", label: "Ventilated seats", detail: "ventilated seats", counts: ["hasSeatCooling"] },
                { id: "preheat", label: "Pre-heating, so it's warm before you get in", detail: "pre-heating", counts: ["hasAuxiliaryHeater"] },
                { id: "keyless", label: "Keyless entry & start", detail: "keyless entry", counts: ["hasKeylessEntryAndStart"] },
                { id: "phone", label: "Wireless Apple CarPlay / Android Auto", detail: "wireless CarPlay", counts: ["hasWirelessAppleCarPlaySlashAndroidAuto"] },
                { id: "charging", label: "Wireless phone charging", detail: "wireless charging", counts: ["hasWirelessChargingStation"] },
                { id: "climate", label: "Separate temperature for the back (3-zone climate)", detail: "3-zone climate", counts: ["hasThreeZoneAutomaticClimateControls"] },
                { id: "seats", label: "Electric front seats", detail: "electric seats", counts: ["hasElectricFrontSeatAdjustment"] },
                { id: "lumbar", label: "Lumbar support", detail: "lumbar support", counts: ["hasLumbarSupport"] },
                { id: "sound", label: "Premium sound system", detail: "premium sound", counts: ["hasPremiumSoundSystem"] },
                { id: "sunroof", label: "Sunroof or glass roof", detail: "a sunroof", counts: ["hasSunroof"] },
                { id: "usb", label: "USB ports in the back", detail: "rear USB ports", counts: ["hasBackUSBPorts"] },
                { id: "hud", label: "Head-up display", detail: "a head-up display", counts: ["hasHeadUpDisplay"] },
            ],
        },
        cantCheck: "how comfortable the seats are or how quiet the cabin is — and I don't weigh leather seats or ambient lighting, which FINN lists but says nothing useful about",
        empty: "Tell me which, and I'll count them.",
    },
    {
        id: "environment",
        label: "I care about the environment",
        you: "You care about the environment",
        need: "CO₂ emissions",
        said: "I care about the environment.",
        means: "Each car's own CO₂ figure, on the EU's A to G scale. How big a part it plays is picked next to it.",
        counts: [],
        checks: [],
        worth: [],
        figures: ["environmental"],
        chips: {
            ask: "How big a part should CO₂ play in my pick?",
            mode: "optional",
            multiple: false,
            options: [
                { id: "decides", label: "A big part", detail: "a big part of the pick", importance: "essential" },
                { id: "matters", label: "As much as my other needs", detail: "as much as your other needs", importance: "important" },
                { id: "bonus", label: "A small part", detail: "a small part of the pick", importance: "niceToHave" },
            ],
        },
        suggests: "low-co2",
        cantCheck: "emissions over the car's whole life. A plug-in hybrid's figure also assumes it's charged regularly",
    },
    {
        id: "budget",
        label: "I'm on a budget",
        you: "You're on a budget",
        need: "Using little fuel or electricity",
        said: "I'm on a budget.",
        means: "Your monthly limit is asked next, and a car that uses little fuel or electricity for its kind counts, since that's part of what it costs.",
        counts: [],
        checks: [],
        worth: [],
        figures: ["efficiency"],
        distance: true,
        chips: {
            ask: "How firm is your limit?",
            mode: "optional",
            multiple: false,
            options: [
                /* A hard limit sets cars over it aside; some give lets cars up to about 15% over count as within it. */
                { id: "hard", label: "A hard limit: nothing over it", detail: "a hard limit" },
                { id: "soft", label: "Some give: a little over is fine", detail: "a little over is fine" },
            ],
        },
        /* With no chip, "Nothing over my limit" is offered with the deal-breakers. */
        suggests: "firm-budget",
        cantCheck: "",
    },
];

export const BUBBLE_IDS = BUBBLES.map((bubble) => bubble.id);

export type BubbleGroupId = "people" | "driving" | "copes" | "matters";

/**
 * The bubbles in sections, asked one at a time: who's in the car, how you
 * drive, what the car has to cope with, and what else matters. Each is a
 * short screen of its own rather than thirteen bubbles at once.
 */
export const BUBBLE_GROUPS: { id: BubbleGroupId; ask: string; why: string; none: string; placeholder: string; bubbles: BubbleId[] }[] = [
    {
        id: "people",
        ask: "First, who rides with you?",
        why: "Children, a big family and a dog each need different things from a car. The “i” on each says what I'd check.",
        none: "Just me",
        placeholder: "e.g. “two teenagers and a big dog”",
        bubbles: ["kids", "six-seats", "dog"],
    },
    {
        id: "driving",
        ask: "Where and how do you drive?",
        why: "Tap what's a regular part of your driving. City streets, traffic, long drives and dark roads each call for different help.",
        none: "Nothing in particular",
        placeholder: "e.g. “home late after night shifts”",
        bubbles: ["city", "traffic", "long", "night"],
    },
    {
        id: "copes",
        ask: "What does the car have to cope with?",
        why: "The weather and what you carry each need their own equipment.",
        none: "Nothing out of the ordinary",
        placeholder: "e.g. “a double buggy”",
        bubbles: ["weather", "carry"],
    },
    {
        id: "matters",
        ask: "What else matters to you?",
        why: "Each adds what I check — or, for CO₂ and a budget, a figure each car is judged on.",
        none: "Nothing else",
        placeholder: "e.g. “something safe and efficient”",
        bubbles: ["help", "comfort", "environment", "budget"],
    },
];

export const groupOf = (id: BubbleId): BubbleGroupId => BUBBLE_GROUPS.find((group) => group.bubbles.includes(id))!.id;

export const bubbleById = (id: string): Bubble | undefined => BUBBLES.find((bubble) => bubble.id === id);

/* -------------------------------------------------------------------------- */
/* How often                                                                  */
/* -------------------------------------------------------------------------- */

export type OftenId = "long" | "traffic";

export const OFTEN: Record<OftenId, { ask: string; why: string; choices: { id: string; label: string; said: string; importance: NeedImportance }[] }> = {
    long: {
        ask: "How often do you drive long distances?",
        why: "It decides how much long-distance comfort counts: every week is a must have, a few times a year a nice to have.",
        choices: [
            { id: "daily", label: "Every day", said: "Every day.", importance: "essential" },
            { id: "weekly", label: "Every week", said: "Every week, or most weekends.", importance: "essential" },
            { id: "monthly", label: "About once a month", said: "About once a month.", importance: "important" },
            { id: "rarely", label: "A few times a year", said: "A few times a year.", importance: "niceToHave" },
        ],
    },
    traffic: {
        ask: "How long is your drive, one way?",
        why: "It decides how much help in traffic counts: the longer the drive, the more it matters.",
        choices: [
            { id: "short", label: "Under 20 minutes", said: "Under 20 minutes.", importance: "niceToHave" },
            { id: "medium", label: "20–45 minutes", said: "20 to 45 minutes.", importance: "important" },
            { id: "long", label: "Over 45 minutes", said: "Over 45 minutes.", importance: "essential" },
        ],
    },
};

/* -------------------------------------------------------------------------- */
/* What a bubble means, as it stands                                          */
/* -------------------------------------------------------------------------- */

export const EMPTY_BUBBLE: BubbleState = { chips: [], often: null, removed: [], added: [], importance: null };

const RANK: Record<NeedImportance, number> = { essential: 3, important: 2, niceToHave: 1 };
/** One step above what the bubble's importance raises to. */
const STRONGER: Record<NeedImportance, FeatureImportance> = { essential: "high", important: "high", niceToHave: "medium" };

const unique = <T,>(items: T[]): T[] => [...new Set(items)];

/** The chips picked, as the bubble defines them. A required set with none picked reads as all of them. */
function pickedChips(bubble: Bubble, state: BubbleState): BubbleChip[] {
    const options = bubble.chips?.options ?? [];
    const picked = options.filter((option) => state.chips.includes(option.id));

    return !picked.length && bubble.chips?.mode === "required" ? options : picked;
}

/** How much a bubble counts: the reader's own say, else what a chip or how often said, else "Matters". */
export function importanceOf(bubble: Bubble, state: BubbleState): NeedImportance {
    if (state.importance) return state.importance;

    const said = [
        ...pickedChips(bubble, state).map((chip) => chip.importance),
        bubble.often ? OFTEN[bubble.often].choices.find((choice) => choice.id === state.often)?.importance : undefined,
    ].filter((item): item is NeedImportance => item != null);

    if (said.length) return said.sort((a, b) => RANK[b] - RANK[a])[0]!;

    return bubble.importance ?? "important";
}

/** Whether how much it counts came from something the reader said, rather than the default. */
export const importanceSaid = (bubble: Bubble, state: BubbleState): boolean =>
    state.importance != null ||
    pickedChips(bubble, state).some((chip) => chip.importance) ||
    (bubble.often != null && state.often != null) ||
    bubble.importance != null;

export interface BubbleItems {
    /** Weighed, at the bubble's level unless `stronger`. */
    counts: EvidenceId[];
    /** One step stronger than the bubble's level. */
    stronger: EvidenceId[];
    /** Standard equipment, checked and never rewarded. */
    checks: EvidenceId[];
    /** Suggested, counted only if the reader adds them. */
    worth: EvidenceId[];
    /** Taken out by the reader. */
    removed: EvidenceId[];
}

/** What a bubble counts, checks and suggests, with the reader's corrections. */
export function itemsOf(bubble: Bubble, state: BubbleState): BubbleItems {
    const chips = pickedChips(bubble, state);
    const options = bubble.chips?.options ?? [];
    const proposed = unique([...bubble.counts, ...chips.flatMap((chip) => chip.counts ?? [])]);
    const counts = unique([...proposed.filter((id) => !state.removed.includes(id)), ...state.added]);
    /*
     * Suggestions: the bubble's and its chips', the other chips' own items
     * where picking one says the others might matter too ("help" with parking
     * suggests the traffic chip's blind spot warning), every comfort until
     * one is picked, and anything the reader took out — so it can go back.
     */
    const others =
        bubble.chips?.suggestOthers || (bubble.chips?.mode === "any" && !chips.length)
            ? options.filter((option) => !chips.includes(option)).flatMap((option) => option.counts ?? [])
            : [];
    const worth = unique([...bubble.worth, ...chips.flatMap((chip) => chip.worth ?? []), ...others, ...proposed.filter((id) => state.removed.includes(id))]).filter(
        (id) => !counts.includes(id),
    );

    return {
        counts,
        stronger: unique(chips.flatMap((chip) => chip.stronger ?? [])).filter((id) => counts.includes(id)),
        checks: unique([...bubble.checks, ...chips.flatMap((chip) => chip.checks ?? [])]).filter((id) => !counts.includes(id)),
        worth,
        removed: state.removed,
    };
}

/** The deal-breakers a bubble's answers point to, by the rules question's ids. */
export const suggestedRules = (bubble: Bubble, state: BubbleState): string[] =>
    unique([bubble.suggests, ...pickedChips(bubble, state).map((chip) => chip.suggests)].filter((id): id is string => Boolean(id)));

/** "You have kids · a baby or toddler seat". */
export function bubbleHeading(bubble: Bubble, state: BubbleState): string {
    const details = (bubble.chips?.options ?? []).filter((option) => state.chips.includes(option.id)).map((option) => option.detail);

    return details.length ? `${bubble.you} · ${details.join(", ")}` : bubble.you;
}

/** The need a bubble stands for: null when it counts nothing yet (comforts with none picked). */
export function needOf(bubble: Bubble, state: BubbleState): Need | null {
    const items = itemsOf(bubble, state);
    const importance = importanceOf(bubble, state);

    if (!items.counts.length && !bubble.figures?.length) return null;

    return {
        id: `bubble-${bubble.id}`,
        label: bubble.need,
        importance,
        said: bubble.said,
        priorities: unique([...(bubble.figures ?? []), ...items.counts.map((id) => EVIDENCE[id]?.scoredIn).filter((id): id is CategoryId => id != null)]),
        evidence: items.counts.map((id) => ({
            id,
            use: explain(id, bubble.why?.[id]),
            unwanted: false,
            mustHave: false,
            ...(items.stronger.includes(id) ? { level: STRONGER[importance] } : {}),
        })),
        checks: items.checks,
        notInData: bubble.cantCheck || null,
        status: "active",
    };
}

/** The bubbles tapped, in the order they're shown, each with its state. */
export function bubblesIn(u: Understanding): { bubble: Bubble; state: BubbleState }[] {
    return BUBBLES.filter((bubble) => u.bubbles?.[bubble.id]).map((bubble) => ({ bubble, state: u.bubbles![bubble.id]! }));
}

const isBubbleNeed = (id: string) => id.startsWith("bubble-");

/**
 * The bubbles' needs rebuilt from their state: everything else the reader
 * said stays as it was. A bubble whose every item a deal-breaker already
 * settles — six seats beside "six seats or more" — counts nothing a car
 * left could differ on, so it leaves no need: the rule says it once.
 */
export function syncBubbles(u: Understanding): Understanding {
    const settled = new Set(ruledOut(u).map((rule) => rule.id));
    const needs = bubblesIn(u)
        .map(({ bubble, state }) => needOf(bubble, state))
        .filter((need): need is Need => need != null && (need.evidence.some((entry) => !settled.has(entry.id)) || !need.evidence.length));

    /*
     * How firm the limit is, from the budget bubble: a hard limit sets cars
     * over it aside, some give lets cars up to about 15% over count as
     * within it (TARGET_HEADROOM) — the engine's own "target" budget.
     */
    const firmness = u.bubbles?.budget?.chips[0];
    const budget =
        u.budget && firmness
            ? { ...u.budget, kind: firmness === "soft" ? ("target" as const) : ("hardMax" as const), firm: firmness === "hard", stretchTo: firmness === "soft" ? null : u.budget.stretchTo }
            : u.budget;

    return { ...u, budget, needs: [...u.needs.filter((need) => !isBubbleNeed(need.id)), ...needs] };
}

/**
 * The bubbles the reader tapped, with their chips. A bubble tapped before
 * keeps what was said about it since — how often, what was taken out or
 * added — and one no longer tapped is gone.
 */
export function withBubbles(u: Understanding, picked: Partial<Record<BubbleId, string[]>>): Understanding {
    const bubbles = Object.fromEntries(
        BUBBLES.filter((bubble) => picked[bubble.id]).map((bubble) => {
            const before = u.bubbles?.[bubble.id] ?? EMPTY_BUBBLE;
            const options = new Set((bubble.chips?.options ?? []).map((option) => option.id));
            let chips = picked[bubble.id]!.filter((id) => options.has(id));

            if (bubble.chips && !bubble.chips.multiple) chips = chips.slice(0, 1);
            if (bubble.chips?.max) chips = chips.slice(0, bubble.chips.max);
            for (const set of bubble.chips?.exclusive ?? []) {
                const first = chips.find((id) => set.includes(id));
                chips = chips.filter((id) => !set.includes(id) || id === first);
            }

            return [bubble.id, { ...before, chips }];
        }),
    );

    return syncBubbles({ ...u, bubbles });
}

/** One bubble's state changed — how often, an item taken out or added, how much it counts. */
export function withBubbleState(u: Understanding, id: BubbleId, patch: Partial<BubbleState>): Understanding {
    const before = u.bubbles?.[id];
    if (!before) return u;

    return syncBubbles({ ...u, bubbles: { ...u.bubbles, [id]: { ...before, ...patch } } });
}

/**
 * How much a bubble counts, set by the reader. Where the bubble's chips are
 * themselves how much — "It could decide it" for the environment — the chip
 * moves with it, so the summary never says "it could decide it" beside
 * "Nice to have".
 */
export function withImportance(u: Understanding, id: BubbleId, importance: NeedImportance): Understanding {
    const bubble = bubbleById(id);
    const options = bubble?.chips?.options ?? [];
    const degrees = bubble?.chips && !bubble.chips.multiple && options.length > 0 && options.every((option) => option.importance);

    if (degrees) {
        const chip = options.find((option) => option.importance === importance);
        return withBubbleState(u, id, { chips: chip ? [chip.id] : [], importance: null });
    }

    return withBubbleState(u, id, { importance });
}

/** An item taken out of what a bubble counts. Out of what it was given, it goes back to being a suggestion. */
export function withoutItem(u: Understanding, id: BubbleId, item: EvidenceId): Understanding {
    const state = u.bubbles?.[id];
    if (!state) return u;

    return withBubbleState(u, id, { added: state.added.filter((other) => other !== item), removed: unique([...state.removed, item]) });
}

/** A suggestion added to what a bubble counts. */
export function withItem(u: Understanding, id: BubbleId, item: EvidenceId): Understanding {
    const state = u.bubbles?.[id];
    if (!state) return u;

    return withBubbleState(u, id, {
        removed: state.removed.filter((other) => other !== item),
        added: state.added.includes(item) ? state.added : [...state.added, item],
    });
}

/**
 * Suggestions worth showing for these cars: something they differ on. With
 * no cars in hand every one is shown, and the judgement narrows later.
 */
export function worthHere(ids: EvidenceId[], cars: FinnCar[]): EvidenceId[] {
    if (!cars.length) return ids;

    return ids.filter((id) => {
        const { listed, notListed, unknown } = coverage(cars, id);
        return listed > 0 && notListed + unknown > 0;
    });
}
