import type { NeedImportance } from "@/lib/lens-ai/contract";
import { SOURCES, type Source } from "@/lib/sources";
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
 * how often — or starts at "Important", shown with one tap to change.
 *
 * Each bubble becomes one need (`bubble-kids`…), so everything past this
 * point — the engine's answers, the story, why not that one — is what a
 * tapped need always was. See docs/LIFE-BUBBLES-SPEC-v2.md.
 */

export type BubbleId =
    | "kids"
    | "adults"
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
    /** On the chip, short: "Snow & ice". */
    label: string;
    /** Behind its "i": what it means, and what Lens checks for it. */
    description: string;
    /** Where anything in the description that isn't FINN's comes from. */
    sources?: Source[];
    /** After the bubble, in a sentence: "snow and ice". */
    detail: string;
    counts?: EvidenceId[];
    checks?: EvidenceId[];
    worth?: EvidenceId[];
    /** Counted one step above the bubble: a garage makes width count more. */
    stronger?: EvidenceId[];
    /** How much the bubble counts, when this chip says so. */
    importance?: NeedImportance;
    /**
     * A deal-breaker this suggests, by the rules question's own id. Null:
     * none — not even the bubble's own ("clean for its fuel type" is no
     * reason to suggest low CO₂).
     */
    suggests?: string | null;
    /** The figure this answer judges on, in place of the bubble's own: "clean for its fuel type" is consumption, not CO₂. */
    figures?: CategoryId[];
}

export interface Bubble {
    id: BubbleId;
    /** On the bubble, short, answering its section's question: "Kids". */
    label: string;
    /** Said back: "You have kids". */
    you: string;
    /** The need's name, for sentences about it: "travelling with children". */
    need: string;
    /** In the reader's words, for the chat: "I have kids." */
    said: string;
    /** What tapping it means, behind its "i". */
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
        label: "Kids",
        you: "You have kids",
        need: "Travelling with children",
        said: "I have kids.",
        means: "Children in the car, from babies to teenagers.",
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
                    label: "Baby or toddler seat",
                    description: "A rear-facing or toddler seat. It makes kids a top priority, and suggests an electric tailgate.",
                    detail: "a baby or toddler seat",
                    importance: "essential",
                    worth: ["hasElectricTailgate"],
                },
                { id: "booster", label: "Booster seat", detail: "a booster seat", description: "Older children on a booster seat or cushion." },
                { id: "older", label: "Older kids", detail: "older kids", description: "Children past child seats. I'll suggest 3-zone climate and rear USB ports.", worth: ["hasThreeZoneAutomaticClimateControls", "hasBackUSBPorts"] },
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
        id: "adults",
        label: "Adults",
        you: "Other adults ride with you",
        need: "Adult passengers",
        said: "Other adults ride with me.",
        means: "Other grown-ups riding with you — beside you, or in the back.",
        counts: [],
        checks: [],
        worth: [],
        chips: {
            ask: "Where do they usually sit?",
            mode: "required",
            multiple: true,
            options: [
                { id: "front", label: "Beside me", detail: "beside you", description: "One adult in the front asks nothing extra of the car." },
                {
                    id: "back",
                    label: "In the back",
                    detail: "in the back",
                    description: "I'll check rear doors, and suggest 3-zone climate and rear USB ports.",
                    counts: ["rearDoors"],
                    worth: ["hasThreeZoneAutomaticClimateControls", "hasBackUSBPorts"],
                },
            ],
        },
        cantCheck: "rear legroom or headroom",
        empty: "One adult beside you asks nothing extra of the car.",
        why: {
            rearDoors: "so adults get into the back without climbing past the front",
            hasThreeZoneAutomaticClimateControls: "so the back can set its own temperature",
            hasBackUSBPorts: "so phones in the back stay charged",
        },
    },
    {
        id: "dog",
        label: "A dog",
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
        label: "In the city",
        you: "You live in the city",
        need: "City driving",
        said: "I live in the city.",
        means: "Narrow streets, tight spaces and stop-and-go traffic.",
        counts: ["compactWidth", "compactLength"],
        checks: ["hasAutomaticTransmission", "hasParkingSensors", "hasEmergencyBrakingAssist"],
        worth: ["hasOneEightyDegreesReversingCamera", "hasThreeSixtyDegreesCamera", "hasBlindSpotAssist"],
        chips: {
            ask: "Where do you park most often?",
            mode: "optional",
            multiple: true,
            max: 2,
            options: [
                { id: "street", label: "On the street", detail: "you park on the street", description: "Kerbside, between other cars. I'll check a reversing camera.", counts: ["hasOneEightyDegreesReversingCamera"] },
                { id: "garage", label: "Home garage", detail: "you park in a garage", description: "A tight garage: width counts more, and I check folding mirrors.", stronger: ["compactWidth"], checks: ["hasElectricallyFoldingMirrors"] },
                { id: "multi-storey", label: "Multi-storey", detail: "you park in multi-storeys", description: "Multi-storey or underground car parks. I'll check a 360° camera and folding mirrors.", counts: ["hasThreeSixtyDegreesCamera"], checks: ["hasElectricallyFoldingMirrors"] },
                { id: "open", label: "Open car park", detail: "you park in open car parks", description: "Supermarket or office car parks, reversing out into traffic. I'll check rear cross-traffic alert.", counts: ["hasRearCrosswalkWarning"] },
                { id: "driveway", label: "Driveway", detail: "you park on a driveway", description: "Your own driveway. Nothing extra to check." },
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
        label: "Help driving & parking",
        you: "You want help driving and parking",
        need: "Help driving and parking",
        said: "I'd like help driving and parking.",
        means: "Systems that warn you, or watch where you can't.",
        counts: [],
        checks: ["hasEmergencyBrakingAssist", "hasTrafficSignRecognition"],
        worth: ["hasMatrixLedHeadlights"],
        chips: {
            ask: "With what?",
            mode: "required",
            multiple: true,
            suggestOthers: true,
            options: [
                { id: "parking", label: "Parking", detail: "parking", description: "I'll check a 360° camera and parking sensors.", counts: ["hasThreeSixtyDegreesCamera"], checks: ["hasParkingSensors"] },
                /*
                 * The kerbside gap: a shorter car needs a shorter one — FINN measures every car's
                 * length — and a 360° camera shows both ends. A parking assistant and sensors are
                 * on nearly every car here, so they're checked, not rewarded.
                 */
                {
                    id: "parallel",
                    label: "Parallel parking",
                    detail: "parallel parking",
                    description:
                        "I'll count a shorter car — it needs a shorter gap, from the length FINN lists — and a 360° camera, and check a parking assistant and parking sensors. FINN doesn't say which kinds of space a car's parking assistant can handle.",
                    counts: ["compactLength", "hasThreeSixtyDegreesCamera"],
                    checks: ["hasParkingAssistant", "hasParkingSensors"],
                },
                { id: "traffic", label: "Traffic & lane changes", detail: "busy traffic", description: "I'll check blind spot warning and lane keeping assist.", counts: ["hasBlindSpotAssist"], checks: ["hasLaneKeepingAssist"] },
                { id: "reversing", label: "Reversing out", detail: "reversing out", description: "I'll check rear cross-traffic alert and a reversing camera.", counts: ["hasRearCrosswalkWarning", "hasOneEightyDegreesReversingCamera"] },
            ],
        },
        cantCheck: "crash protection — FINN has no crash-test data",
        why: {
            hasThreeSixtyDegreesCamera: "so you can check every side before you move",
            compactLength: "a shorter car fits a shorter gap at the kerb",
            hasParkingAssistant: "a parking assistant, as FINN lists it — FINN doesn't say which spaces it handles",
            hasBlindSpotAssist: "for the cars you can't see when changing lanes",
            hasRearCrosswalkWarning: "for reversing out between parked cars, where you can't see traffic coming",
            hasOneEightyDegreesReversingCamera: "so you aren't reversing on mirrors alone",
        },
    },
    {
        id: "long",
        label: "Long distances",
        you: "You drive long distances",
        need: "Long distances",
        said: "I drive long distances.",
        means: "Hours on the motorway, or long trips.",
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
        label: "In traffic",
        you: "You sit in traffic a lot",
        need: "Time in traffic",
        said: "I sit in traffic a lot.",
        means: "A commute or school run in stop-and-go traffic.",
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
        label: "Tough weather",
        you: "The weather where you live is tough",
        need: "Tough weather",
        said: "The weather here is tough.",
        means: "Winters, rain or heat that make the car harder to live with.",
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
                    description:
                        "I'll check heated seats and a heated steering wheel, suggest pre-heating, and recommend all-wheel drive in the deal-breakers — the ADAC finds it gives more grip pulling away on snow, though no help braking.",
                    detail: "snow and ice",
                    sources: [SOURCES.adacAwd],
                    counts: ["hasHeatedSeats", "hasHeatedSteeringWheel"],
                    suggests: "awd",
                    worth: ["hasAllWheelDrive", "hasAuxiliaryHeater", "hasHeatPump", "hasHeadlightCleaningSystem"],
                },
                { id: "wet", label: "Rain & fog", detail: "rain and fog", description: "I'll check rain & light sensors and fog lights.", counts: ["hasRainSlashLightSensors", "hasFogLights"] },
                { id: "cold", label: "Cold & dry", detail: "cold, mostly dry winters", description: "Cold but mostly dry winters, so not with snow or rain. I'll check heated seats.", counts: ["hasHeatedSeats"] },
                { id: "hot", label: "Hot summers", detail: "hot summers", description: "I'll check ventilated seats, and suggest 3-zone climate.", counts: ["hasSeatCooling"], worth: ["hasThreeZoneAutomaticClimateControls"] },
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
        label: "At night",
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
        label: "Lots to carry",
        you: "You carry a lot",
        need: "Carrying a lot",
        said: "I carry a lot.",
        means: "Loads that need room, a roof or a hitch.",
        counts: [],
        checks: [],
        worth: [],
        chips: {
            ask: "What do you carry?",
            mode: "required",
            multiple: true,
            options: [
                /* A week's shopping and a sofa ask different things of a car. */
                { id: "shopping", label: "Shopping", detail: "shopping and bags", description: "The weekly shop and everyday bags. I'll check an electric tailgate, for when your hands are full.", counts: ["hasElectricTailgate"] },
                { id: "bulky", label: "Bulky things", detail: "bulky things", description: "Furniture, a pram, sports kit. I'll check split-folding rear seats.", counts: ["hasSplitFoldingRearSeats"], worth: ["hasElectricTailgate"] },
                { id: "bikes", label: "Bikes, skis, roof box", detail: "bikes, skis or a roof box", description: "Loads on the roof or a rack. I'll check roof rails, and suggest a towbar for a bike rack.", counts: ["hasRoofRails"], worth: ["hasTowbar"] },
                { id: "trailer", label: "Trailer or caravan", detail: "a trailer or caravan", description: "I'll check a towbar and a towing rating of 1,500 kg or more.", counts: ["hasTowbar", "towingCapacity1500"], suggests: "must-tow" },
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
        label: "Comfort",
        you: "Comfort matters to you",
        need: "Comfort",
        said: "Comfort matters to me.",
        means: "The comforts you'd use every day — every one FINN lists that I can check.",
        counts: [],
        checks: ["hasAppleCarPlaySlashAndroidAuto"],
        worth: [],
        chips: {
            ask: "Which comforts?",
            mode: "any",
            multiple: true,
            options: [
                /* Each named as FINN lists it, with what it does where the name doesn't say. */
                { id: "warm", label: "Heated seats", detail: "heated seats", description: "Seats that warm up — FINN doesn't say which ones.", counts: ["hasHeatedSeats"] },
                { id: "wheel", label: "Heated wheel", detail: "a heated steering wheel", description: "A heated steering wheel.", counts: ["hasHeatedSteeringWheel"] },
                { id: "cooled", label: "Ventilated seats", detail: "ventilated seats", description: "Seats that blow air through, for hot days.", counts: ["hasSeatCooling"] },
                { id: "preheat", label: "Pre-heating", detail: "pre-heating", description: "An auxiliary heater: the car is warm and the windows clear before you get in.", counts: ["hasAuxiliaryHeater"] },
                { id: "keyless", label: "Keyless entry & start", detail: "keyless entry", description: "Unlock and start the car with the key in your pocket.", counts: ["hasKeylessEntryAndStart"] },
                { id: "phone", label: "Wireless CarPlay / Android Auto", detail: "wireless CarPlay", description: "Your phone's maps and music on the car's screen, without a cable.", counts: ["hasWirelessAppleCarPlaySlashAndroidAuto"] },
                { id: "charging", label: "Wireless charging", detail: "wireless charging", description: "A pad that charges your phone without a cable.", counts: ["hasWirelessChargingStation"] },
                { id: "climate", label: "3-zone climate", detail: "3-zone climate", description: "Separate temperatures for the driver, the front passenger and the back.", counts: ["hasThreeZoneAutomaticClimateControls"] },
                { id: "seats", label: "Electric seats", detail: "electric seats", description: "Front seats adjusted with buttons — FINN doesn't say whether both or only the driver's.", counts: ["hasElectricFrontSeatAdjustment"] },
                { id: "lumbar", label: "Lumbar support", detail: "lumbar support", description: "An adjustable lower-back support.", counts: ["hasLumbarSupport"] },
                { id: "sound", label: "Premium sound", detail: "premium sound", description: "An upgraded speaker system.", counts: ["hasPremiumSoundSystem"] },
                { id: "sunroof", label: "Sunroof", detail: "a sunroof", description: "A sunroof, panoramic or glass roof — FINN lists them as one.", counts: ["hasSunroof"] },
                { id: "usb", label: "Rear USB ports", detail: "rear USB ports", description: "Charging for phones and tablets in the back.", counts: ["hasBackUSBPorts"] },
                { id: "hud", label: "Head-up display", detail: "a head-up display", description: "Your speed and directions shown on the windscreen.", counts: ["hasHeadUpDisplay"] },
            ],
        },
        cantCheck: "how comfortable the seats are or how quiet the cabin is — and I don't weigh leather seats or ambient lighting, which FINN lists but says nothing useful about",
        empty: "Tell me which, and I'll count them.",
    },
    {
        id: "environment",
        label: "The environment",
        you: "You care about the environment",
        need: "A greener car",
        said: "I care about the environment.",
        means: "How green the car is, from FINN's own figures: what it uses for its kind, or its CO₂ on the A to G label. How green is picked next to it.",
        counts: [],
        checks: [],
        worth: [],
        /* With no answer picked — "eco-friendly", typed — the CO₂ label, and low CO₂ suggested, as before. */
        figures: ["environmental"],
        suggests: "low-co2",
        chips: {
            ask: "How green should the car be?",
            mode: "optional",
            multiple: false,
            /*
             * How green, not how much it counts — that's the one scale on the
             * summary. Each judges on a figure FINN gives for every car, and
             * the greenest suggests the deal-breaker that goes with it.
             */
            options: [
                {
                    id: "clean",
                    label: "Clean for its fuel type",
                    detail: "clean for its fuel type",
                    description:
                        "Any fuel — petrol and diesel too — as long as it uses little for its kind. I compare each car's fuel or electricity use, as FINN lists it, with the others that run on the same thing.",
                    figures: ["efficiency"],
                    suggests: null,
                },
                {
                    id: "moderate",
                    label: "Moderately green",
                    detail: "moderately green",
                    description:
                        "Low CO₂ on the German label: class A to C, 115 g/km or less. I judge each car on its CO₂ class as FINN lists it, suggest “low CO₂ emissions” as a deal-breaker, and star the fuels where most of the cars here are low CO₂ when I ask what it can run on.",
                    sources: [SOURCES.co2Label],
                    figures: ["environmental"],
                    suggests: "low-co2",
                },
                {
                    id: "zero",
                    label: "Totally green",
                    detail: "totally green",
                    description:
                        "Electric: FINN lists them in CO₂ class A, which on the German label is 0 g/km. CO₂ becomes a top priority, and I'll star Electric when I ask what it can run on. FINN's CO₂ figure says nothing about making the electricity.",
                    sources: [SOURCES.co2Label],
                    figures: ["environmental"],
                    importance: "essential",
                    /* Electric is starred on "What can it run on?", not suggested as a row. */
                    suggests: null,
                },
            ],
        },
        cantCheck: "emissions over the car's whole life or from making the electricity, or how much of a plug-in hybrid's driving its figure takes to be on electricity",
    },
    {
        id: "budget",
        label: "A budget",
        you: "You're on a budget",
        need: "Using little fuel or electricity",
        said: "I'm on a budget.",
        means: "A monthly limit — and a car that uses little fuel or electricity for its kind, since that's part of what it costs.",
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
                { id: "hard", label: "Hard limit", detail: "a hard limit", description: "Nothing over it: pricier cars are set aside." },
                { id: "soft", label: "Some give", detail: "a little over is fine", description: "Cars up to about 15% over still count as within it." },
            ],
        },
        /* With no chip, "Nothing over my limit" is offered with the deal-breakers. */
        suggests: "firm-budget",
        cantCheck: "",
    },
];

export const BUBBLE_IDS = BUBBLES.map((bubble) => bubble.id);

/* -------------------------------------------------------------------------- */
/* Recommended, from what the reader said                                     */
/* -------------------------------------------------------------------------- */

/**
 * What an earlier answer says about a later choice: heated seats for cold
 * winters, lumbar support for hours at the wheel. `for` are answers that
 * recommend it on their own; `also` add to the reason only beside one of
 * them — a heated steering wheel matters more the longer you drive, but not
 * in a warm climate however long that is. Answers are a bubble ("long") or
 * a bubble's chip ("weather:snow").
 */
const RECOMMENDED: Partial<Record<EvidenceId, { for: string[]; also?: string[] }>> = {
    hasHeatedSeats: { for: ["weather:snow", "weather:cold"] },
    hasHeatedSteeringWheel: { for: ["weather:snow", "weather:cold"], also: ["long", "traffic"] },
    hasSeatCooling: { for: ["weather:hot"] },
    hasAuxiliaryHeater: { for: ["weather:snow", "weather:cold"] },
    hasLumbarSupport: { for: ["long", "traffic"] },
    hasWirelessAppleCarPlaySlashAndroidAuto: { for: ["traffic", "long"] },
    hasWirelessChargingStation: { for: ["traffic", "long"] },
    hasKeylessEntryAndStart: { for: ["traffic", "carry:shopping", "kids:baby"] },
    hasThreeZoneAutomaticClimateControls: { for: ["kids:older", "adults:back", "weather:hot"] },
    hasBackUSBPorts: { for: ["kids", "adults:back"] },
    hasHeadUpDisplay: { for: ["long", "night"] },
};

/** Each answer as the reason reads it: "because you said winters bring snow and ice". */
const SAID: Record<string, string> = {
    "weather:snow": "winters bring snow and ice",
    "weather:cold": "winters are cold",
    "weather:hot": "summers are hot",
    long: "you drive long distances",
    traffic: "you sit in traffic a lot",
    night: "you drive at night a lot",
    "carry:shopping": "you carry shopping",
    kids: "you have kids",
    "kids:baby": "your youngest is in a baby or toddler seat",
    "kids:older": "your kids are older",
    "adults:back": "adults ride in the back",
};

/** "Time on the road", said once, however it was said. */
const ON_THE_ROAD = new Set(["long", "traffic"]);

/**
 * Why a piece of equipment is recommended, from what the reader has said so
 * far: "Recommended because you said winters are cold, and you spend a lot
 * of time on the road." Null when nothing they said points to it.
 */
export function recommendedBecause(item: EvidenceId, u: Understanding, except?: BubbleId): string | null {
    const rule = RECOMMENDED[item];
    if (!rule) return null;

    /* Never a bubble's own answers: snow & ice doesn't recommend itself. */
    const said = (answer: string) => {
        const [bubble, chip] = answer.split(":") as [string, string | undefined];
        if (bubble === except) return false;
        const state = u.bubbles?.[bubble];
        return Boolean(state) && (!chip || state!.chips.includes(chip));
    };
    const reasons = rule.for.filter(said);
    if (!reasons.length) return null;

    const also = (rule.also ?? []).filter((answer) => said(answer) && !reasons.includes(answer));
    const phrases = [...new Set(reasons.map((answer) => SAID[answer]!))];
    const extra = also.some((answer) => ON_THE_ROAD.has(answer)) ? ["you spend a lot of time on the road"] : [];
    const all = [...phrases, ...extra];

    return `Recommended because you said ${all.length > 1 ? `${all.slice(0, -1).join(", ")}, and ${all.at(-1)}` : all[0]}.`;
}

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
        why: "Children, adults and a dog each need different things from a car. The “i” on each says what I'd check.",
        none: "Just me",
        placeholder: "e.g. “two teenagers and a big dog”",
        bubbles: ["kids", "adults", "dog"],
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
        why: "It decides how much long-distance comfort counts: every week makes it a top priority, a few times a year nice to have.",
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

/** How much a bubble counts: the reader's own say, else what a chip or how often said, else "Important". */
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

/** The figures a bubble judges on: what its picked answer says, else its own. */
export function figuresOf(bubble: Bubble, state: BubbleState): CategoryId[] {
    const picked = pickedChips(bubble, state).flatMap((chip) => chip.figures ?? []);
    return picked.length ? unique(picked) : (bubble.figures ?? []);
}

/** The deal-breakers a bubble's answers point to, by the rules question's ids. */
export function suggestedRules(bubble: Bubble, state: BubbleState): string[] {
    const picked = pickedChips(bubble, state);
    /* An answer that says what to suggest speaks for the bubble; one that doesn't adds to it. */
    const own = picked.some((chip) => chip.suggests !== undefined) ? undefined : bubble.suggests;

    return unique([own, ...picked.map((chip) => chip.suggests)].filter((id): id is string => Boolean(id)));
}

/**
 * Each deal-breaker a bubble's answers point to, with the answer that does:
 * "you said snow and ice" for the chip that suggests it, "you carry a lot"
 * for the bubble's own.
 */
export function suggestedBecause(bubble: Bubble, state: BubbleState): [rule: string, because: string][] {
    const picked = pickedChips(bubble, state);
    const own = picked.some((chip) => chip.suggests !== undefined) ? undefined : bubble.suggests;
    const pairs: [string, string][] = [
        ...picked.filter((chip) => chip.suggests).map((chip): [string, string] => [chip.suggests!, `you said ${chip.detail}`]),
        ...(own ? [[own, bubble.you.replace(/^./, (c) => c.toLowerCase())] as [string, string]] : []),
    ];

    return pairs.filter(([rule], index) => pairs.findIndex(([other]) => other === rule) === index);
}

/** "You have kids · a baby or toddler seat". */
export function bubbleHeading(bubble: Bubble, state: BubbleState): string {
    const details = (bubble.chips?.options ?? []).filter((option) => state.chips.includes(option.id)).map((option) => option.detail);

    return details.length ? `${bubble.you} · ${details.join(", ")}` : bubble.you;
}

/** The need a bubble stands for: null when it counts nothing yet (comforts with none picked). */
export function needOf(bubble: Bubble, state: BubbleState): Need | null {
    const items = itemsOf(bubble, state);
    const importance = importanceOf(bubble, state);

    const figures = figuresOf(bubble, state);

    if (!items.counts.length && !figures.length) return null;

    return {
        id: `bubble-${bubble.id}`,
        label: bubble.need,
        importance,
        said: bubble.said,
        priorities: unique([...figures, ...items.counts.map((id) => EVIDENCE[id]?.scoredIn).filter((id): id is CategoryId => id != null)]),
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
