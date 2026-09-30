import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { formatEUR } from "@/lib/reasoning-engine";
import type { CategoryId } from "@/lib/reasoning-engine/types";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import type { FinnCar } from "@/lib/types";

import { coverage, EVIDENCE, listedUpTo, withoutLabel, type EvidenceId } from "./evidence";
import { LENGTH_ANCHORS, WIDTH_ANCHORS } from "@/lib/reasoning-engine/evidence";
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
/** "4.54 m", from millimetres. */
const metres = (mm: number): string => `${(mm / 1000).toFixed(mm % 10 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "")} m`;

const USE: Partial<Record<EvidenceId, string>> = {
    hasIsofix: "anchor points that fix a child seat to the car's frame",
    rearDoors: "separate doors for the back seats",
    seatsFivePlus: "at least five seats",
    seatsSixPlus: "six or more seats",
    hasSplitFoldingRearSeats: "rear seats that fold down in parts to make the boot longer",
    hasElectricTailgate: "a boot lid that opens and closes at the press of a button",
    hasBackUSBPorts: "USB ports at the back seats",
    hasRoofRails: "rails on the roof for mounting a roof box or a bike rack",
    hasTowbar: "a hitch for towing a trailer or caravan",
    towingCapacity1500: "a trailer load of 1,500 kg or more, as FINN lists it (FINN doesn't say whether braked or unbraked)",
    compactLength: `a length of ${metres(listedUpTo(LENGTH_ANCHORS))} or less, from FINN's measurements`,
    compactWidth: `a width of ${metres(listedUpTo(WIDTH_ANCHORS))} or less, from FINN's measurements (FINN doesn't say whether that includes the mirrors)`,
    hasThreeSixtyDegreesCamera: "a camera view of all four sides of the car while you park",
    hasOneEightyDegreesReversingCamera: "a camera view of what's behind the car when you reverse",
    hasParkingSensors: "sensors that warn you as you get close to an obstacle",
    /*
     * Not "the car steering itself in": this is FINN's own "Parkassistent"
     * flag, which is on 98% of its cars and is exactly what FINN's
     * "Einparkhilfe" filter selects — a parking aid, not necessarily one that
     * takes the wheel.
     */
    hasParkingAssistant: "a parking aid FINN lists as “Parkassistent” — it doesn't say whether the car steers itself in",
    hasElectricallyFoldingMirrors: "side mirrors that fold in at the press of a button",
    hasAutomaticTransmission: "no clutch pedal and no gear changes",
    driverAssistLevel2: "the car steering to stay in its lane and keeping its distance, while you supervise",
    hasAdaptiveCruiseControl: "cruise control that brakes and speeds up to keep a set distance to the car ahead",
    hasCruiseControl: "a set speed held without your foot on the pedal",
    hasLumbarSupport: "an adjustable lower-back support (FINN doesn't say in which seats)",
    hasHeadUpDisplay: "driving information, such as your speed, shown on the windscreen",
    hasMatrixLedHeadlights: "full beam that stays on but dims the part that would dazzle other drivers",
    hasBlindSpotAssist: "a warning when a car is in your blind spot",
    hasRearCrosswalkWarning: "a warning when a car is coming as you reverse out of a space",
    hasLaneKeepingAssist: "steering that nudges the car back if you drift out of your lane",
    hasEmergencyBrakingAssist: "the car braking by itself if it detects an obstacle ahead",
    hasTrafficSignRecognition: "the speed limit shown on the dashboard, read from road signs",
    hasHeatedSeats: "seats that heat up (FINN doesn't say which ones)",
    hasHeatedSteeringWheel: "a steering wheel that heats up",
    hasRainSlashLightSensors: "wipers that switch on when rain hits the windscreen, and headlights that switch on when it gets dark",
    hasFogLights: "extra lights low on the front of the car that light the road edge in fog",
    hasCorneringLights: "a light that shines into the bend as you turn",
    hasHeadlightCleaningSystem: "washers that spray salt and dirt off the headlights",
    hasAllWheelDrive: "power sent to all four wheels",
    hasAuxiliaryHeater: "a heater that warms the car before you get in, with the engine off",
    hasHeatPump: "heating that uses less battery power",
    hasSeatCooling: "seat cooling, which FINN lists as “Sitzkühlung”",
    hasElectricFrontSeatAdjustment: "front seats adjusted with buttons instead of levers (FINN doesn't say whether both or only the driver's)",
    hasKeylessEntryAndStart: "unlocking and starting the car with the key still in your pocket",
    hasWirelessChargingStation: "a pad that charges your phone without a cable",
    hasWirelessAppleCarPlaySlashAndroidAuto: "Apple CarPlay or Android Auto without plugging your phone in",
    hasAppleCarPlaySlashAndroidAuto: "your phone's maps and music on the car's screen, through Apple CarPlay or Android Auto",
    hasThreeZoneAutomaticClimateControls: "separate temperature settings for the driver, the front passenger and the back",
    hasPremiumSoundSystem: "an upgraded speaker system",
    hasSunroof: "a sunroof, panoramic roof or glass roof — FINN lists them as one",
    hasSpareWheel: "a spare wheel to fit after a puncture",
    electricCar: "an electric car",
    winterReadyTyres: "winter or all-season tyres already fitted",
};

/** What a piece of equipment is for, in the words above, or nothing. */
export const purposeOf = (id: EvidenceId): string => USE[id] ?? "";

/**
 * A piece of equipment as it serves one need: what it does, and why it's
 * there for this need — "separate doors for the back seats, so children get
 * in and out…". Wherever a need and a feature are shown together, the link
 * between them is said, so the reader never has to guess it.
 */
export const explain = (id: EvidenceId, why?: string): string =>
    [purposeOf(id), why].filter(Boolean).join(", ");

/* -------------------------------------------------------------------------- */
/* The steps                                                                  */
/* -------------------------------------------------------------------------- */

export type GuideStepId = "life" | "rules" | "distance";

/** How the needs are laid out: the way people describe their own lives. */
export const NEED_GROUPS = {
    passengers: "How many ride with you",
    people: "Who rides with you",
    driving: "Where you drive",
    parking: "Where you park",
    weather: "The weather",
    loads: "What you carry",
    you: "What makes it yours",
    co2: "CO₂ emissions",
    efficiency: "Fuel or electricity use",
} as const;

export type NeedGroup = keyof typeof NEED_GROUPS;

/** One thing the reader can tap, and what it means to Lens. */
export interface GuideChoice {
    id: string;
    /** On the chip. */
    label: string;
    /** Recorded in the conversation as the reader's own words. */
    said: string;
    /** What choosing it means, in a sentence, shown before and after it's picked. */
    description?: string;
    /** What the answer itself means, in the reader's terms: "Commuting" beside "City driving". */
    means?: string;
    /** Where it sits among the others, so a long list can be scanned. */
    group?: NeedGroup;
    /** A need this stands for: what the car has to do, and what Lens looks at. */
    need?: {
        label: string;
        importance: NeedImportance;
        priorities: CategoryId[];
        evidence: EvidenceId[];
        /** Why each piece of equipment belongs to this need, as a clause: "so children can…". */
        reasons?: Partial<Record<EvidenceId, string>>;
    };
    /** A car Lens should keep or set aside outright. */
    rule?: { id: EvidenceId; mode: "must" | "without"; label: string };
    /** Kilometres a month, for FINN's mileage charge. */
    monthlyKm?: number;
    /** How many people usually ride with the driver. */
    passengers?: number;
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

const need = (
    id: string,
    group: NeedGroup,
    label: string,
    said: string,
    description: string,
    priorities: CategoryId[],
    /** Each piece of equipment, with why it belongs to this need — said wherever the link is shown. */
    evidence: [EvidenceId, string][],
    needLabel = label,
): GuideChoice => ({
    id,
    group,
    label,
    said,
    description,
    need: {
        label: needLabel,
        importance: "important",
        priorities,
        evidence: evidence.map(([item]) => item),
        reasons: Object.fromEntries(evidence),
    },
});

/*
 * Every need names equipment FINN lists and Lens can check, and the
 * priorities that equipment is scored under — so choosing one moves the
 * judgement, and the reader can be told exactly how.
 */
/** Two or more passengers: someone sits in the back, plus whatever seats the count needs. */
const passengersNeed = (count: number, label: string, said: string, description: string, needLabel: string, seats: [EvidenceId, string][]): GuideChoice => {
    const choice = need(`passengers-${count}`, "passengers", label, said, description, ["practicality"], [
        ["rearDoors", "so whoever sits in the back gets in without the front seat folding forward"],
        ...seats,
    ], needLabel);

    /* Six people can't share five seats: that one isn't a preference. */
    return { ...choice, passengers: count, need: { ...choice.need!, importance: count >= 5 ? "essential" : "important" } };
};

/** One question's three answers about how much something matters, each the same need at its own importance. */
function howMuch(group: "co2" | "efficiency", needLabel: string, priority: CategoryId, what: string): GuideChoice[] {
    const levels: [string, string, string, NeedImportance][] = [
        ["decides", "A lot — it could decide it", `A lot — ${what} could decide it.`, "essential"],
        ["matters", "It matters", `${what.charAt(0).toUpperCase()}${what.slice(1)} matters to me.`, "important"],
        ["bonus", "A little — it's a bonus", `A little — ${what} is a bonus.`, "niceToHave"],
    ];

    return levels.map(([level, label, said, importance]) => ({
        id: `${group}-${level}`,
        group,
        label,
        said,
        need: { label: needLabel, importance, priorities: [priority], evidence: [] },
    }));
}

/*
 * How many people ride along, first: the count is what decides seats and
 * doors. One passenger sits beside the driver, so it asks nothing of the car;
 * a second means someone sits in the back; five people need five seats, and
 * six need six.
 */
const PASSENGERS: GuideChoice[] = [
    {
        id: "passengers-1",
        group: "passengers",
        label: "1",
        said: "Usually one other person.",
        description: "One passenger can sit beside you, so there's nothing extra to check for seats or doors.",
        passengers: 1,
    },
    passengersNeed(2, "2", "Usually two other people.", "Someone sits in the back, so I'll check for rear doors.", "Two passengers", []),
    passengersNeed(3, "3", "Usually three other people.", "Someone sits in the back, so I'll check for rear doors.", "Three passengers", []),
    passengersNeed(4, "4", "Usually four other people.", "Room for everyone: rear doors, and five seats.", "Four passengers", [["seatsFivePlus", "so all five of you have a seat"]]),
    passengersNeed(5, "5 or more", "Usually five or more other people.", "Room for everyone: rear doors, and six or more seats.", "Five or more passengers", [["seatsSixPlus", "so everyone has a seat"]]),
];

const CHOICES: GuideChoice[] = [
    ...PASSENGERS,
    /* Seats and doors come from the count; these are what each kind of passenger needs besides. */
    need("kids", "people", "Children", "Children.",
        "ISOFIX anchors for child seats, rear doors, rear seats that fold, and USB ports in the back.",
        /* Where its equipment is scored: ISOFIX under Practicality, rear USB ports under Comfort. */
        ["practicality", "comfort"],
        [
            ["hasIsofix", "so the seat is held by the car's frame, not only by a seat belt"],
            /* A child seat goes in the back even when the child is the only passenger. */
            ["rearDoors", "so children get in and out, and seats get fitted, without climbing past the front seats"],
            ["hasSplitFoldingRearSeats", "so you can fold one part for a pram and still seat a child"],
            ["hasBackUSBPorts", "so children can charge tablets and phones on longer drives"],
        ],
        "Travelling with children"),
    /*
     * Adults, not elderly passengers. What makes a car easier for someone
     * who struggles to get in — seat height, step-in height, how wide the
     * doors open — isn't in FINN's data, so Lens can't judge it and doesn't
     * offer to. What adults in the back need, it can check.
     */
    need("adults", "people", "Adults", "Adults.",
        "A temperature setting of their own in the back, and USB ports there to charge their phones.",
        ["comfort"],
        [
            ["hasThreeZoneAutomaticClimateControls", "so passengers in the back can set their own temperature"],
            ["hasBackUSBPorts", "so passengers in the back can charge their phones"],
        ],
        "Adult passengers"),
    need("dog", "people", "Pets", "A pet.",
        "An electric tailgate that opens the boot at the press of a button, rear seats that fold down for more floor space, and rear doors.",
        ["practicality"],
        [
            ["hasElectricTailgate", "so you can open the boot while holding a lead or a carrier"],
            ["hasSplitFoldingRearSeats", "so a bigger pet or a crate gets more floor space"],
            ["rearDoors", "so a pet can get in and out of the back seat directly"],
        ],
        "Travelling with a pet"),
    /*
     * The driving itself — traffic, not parking, which is its own question.
     * Not adaptive cruise control for jams: Lens scores it under Long
     * Distance, which marks an electric car down for its range, and a city
     * driver would be judged on trips they never described.
     */
    need("city", "driving", "City driving", "I drive in the city.",
        "An automatic gearbox for stop-and-go traffic, a narrow car for narrow streets, blind spot warning, traffic sign recognition and automatic emergency braking.",
        ["cityParking", "safetyAssistance"],
        [
            ["hasAutomaticTransmission", "so stop-and-go traffic doesn't mean constant clutch work"],
            ["compactWidth", "so it fits narrow streets and lanes"],
            ["hasBlindSpotAssist", "for cyclists and cars slipping in beside you on busy roads"],
            ["hasTrafficSignRecognition", "since the limit changes from street to street"],
            ["hasEmergencyBrakingAssist", "for sudden stops, and people stepping out between parked cars"],
        ]),
    /*
     * Where they park, asked of everyone: every driver parks somewhere, and
     * each kind of space calls for its own help. A driveway asks for none.
     */
    need("street", "parking", "On the street", "On the street.",
        "A shorter car, a reversing camera, parking sensors and a 360° camera.",
        ["cityParking"],
        [
            ["compactLength", "so it fits shorter street spaces"],
            ["hasOneEightyDegreesReversingCamera", "so you can see how close you are when reversing into a space"],
            ["hasParkingSensors", "so you know when you're about to touch another car"],
            ["hasThreeSixtyDegreesCamera", "so you can check the kerb and every side in a tight space"],
        ],
        "Parking on the street"),
    need("garage", "parking", "A garage at home", "In a garage at home.",
        "A narrow, shorter car, mirrors that fold in at the press of a button, and parking sensors.",
        ["cityParking"],
        [
            ["compactWidth", "so it clears the garage door frame"],
            ["compactLength", "so it fits the garage with room to walk round it"],
            ["hasElectricallyFoldingMirrors", "so the mirrors aren't clipped on the door frame"],
            ["hasParkingSensors", "so you know how close the back wall is"],
        ],
        "Parking in a garage at home"),
    need("multi-storey", "parking", "Multi-storey or underground car parks", "In multi-storey or underground car parks.",
        "A narrow car, mirrors that fold in, a 360° camera and parking sensors.",
        ["cityParking"],
        [
            ["compactWidth", "so it fits narrow bays between pillars"],
            ["hasElectricallyFoldingMirrors", "so the mirrors aren't clipped in narrow bays"],
            ["hasThreeSixtyDegreesCamera", "so you can see pillars beside you while you turn in"],
            ["hasParkingSensors", "so you know when you're about to touch a pillar or a wall"],
        ],
        "Parking in multi-storey car parks"),
    need("open-car-park", "parking", "Open car parks", "In open car parks, like at the supermarket or work.",
        "Rear cross-traffic alert, a reversing camera and parking sensors.",
        ["cityParking", "safetyAssistance"],
        [
            ["hasRearCrosswalkWarning", "for reversing out between parked cars, where you can't see traffic coming"],
            ["hasOneEightyDegreesReversingCamera", "so you aren't reversing out on mirrors alone"],
            ["hasParkingSensors", "so you know when you're about to touch another car"],
        ],
        "Parking in open car parks"),
    {
        id: "driveway",
        group: "parking",
        label: "A driveway",
        said: "On a driveway.",
        description: "A driveway leaves plenty of room, so there's nothing extra to check for parking.",
    },
    need("commute", "driving", "Commuting", "I commute by car.",
        "Adaptive cruise control that keeps a set distance in traffic, an automatic gearbox, keyless entry and start, and Apple CarPlay or Android Auto.",
        ["longDistance", "comfort"],
        [
            ["hasAdaptiveCruiseControl", "so in stop-and-go traffic you aren't braking and accelerating yourself"],
            ["hasAutomaticTransmission", "so stop-and-go traffic doesn't mean constant clutch work"],
            ["hasKeylessEntryAndStart", "so you don't take the key out of your pocket twice a day"],
            ["hasAppleCarPlaySlashAndroidAuto", "so navigation with live traffic is on screen for the daily route"],
        ]),
    need("motorway", "driving", "Long motorway drives", "I do long motorway drives.",
        "Level 2 driver assistance that steers to stay in lane and keeps its distance while you supervise, adaptive cruise control, adjustable lower-back support, and a head-up display.",
        ["longDistance"],
        [
            ["driverAssistLevel2", "which cuts down the steering and braking you do over hours of motorway"],
            ["hasAdaptiveCruiseControl", "so you aren't adjusting your speed to the car ahead for hours"],
            ["hasLumbarSupport", "for several hours in the seat"],
            ["hasHeadUpDisplay", "so you don't look down from the road at motorway speed"],
        ]),
    need("roadtrips", "driving", "Road trips & holidays", "I take the car on road trips and holidays.",
        "Roof rails for a roof box, rear seats that fold for longer luggage, Level 2 driver assistance for the motorway, and adjustable lower-back support.",
        ["practicality", "longDistance"],
        [
            ["hasRoofRails", "so a roof box can take the luggage that doesn't fit in the boot"],
            ["hasSplitFoldingRearSeats", "so long items fit while a rear seat stays free"],
            ["driverAssistLevel2", "for the long motorway stretches of a trip"],
            ["hasLumbarSupport", "for hours in the driver's seat"],
        ],
        "Road trips and holidays"),
    need("night", "driving", "Driving at night", "I often drive at night.",
        "Matrix LED headlights that keep full beam on without dazzling other drivers, cornering lights, headlights that switch on when it gets dark, and fog lights.",
        ["safetyAssistance", "climateSuitability"],
        [
            ["hasMatrixLedHeadlights", "so you can drive unlit roads with full beam on"],
            ["hasCorneringLights", "so bends on unlit roads are lit before you drive into them"],
            ["hasRainSlashLightSensors", "so you can't forget the headlights at dusk"],
            ["hasFogLights", "which matters most at night, when fog hides the road edge completely"],
        ]),
    /* The cold alone; what kind of winter it is — snow, rain and fog, or dry — is the next question. */
    need("winter", "weather", "Cold winters", "Our winters get cold.",
        "Seat heating and a heated steering wheel. The next question adds what your kind of winter needs besides.",
        ["climateSuitability"],
        [
            ["hasHeatedSeats", "so you're warm before the heater catches up on a cold morning"],
            ["hasHeatedSteeringWheel", "so the wheel isn't ice-cold to hold on winter mornings"],
        ],
        "Cold winters"),
    need("summer", "weather", "Hot summers", "Our summers get hot.",
        "Ventilated seats that blow air through the seat, and 3-zone climate control with separate temperatures for the driver, the front passenger and the back.",
        ["climateSuitability", "comfort"],
        [
            ["hasSeatCooling", "so the seat cools down after the car has stood in the sun"],
            ["hasThreeZoneAutomaticClimateControls", "so passengers in the back can set a cooler temperature for themselves"],
        ],
        "Staying cool in summer"),
    /* What's carried, named outright: each load has its own equipment, and "a lot" says none of it. */
    need("bulky", "loads", "Big or bulky things", "Big or bulky things — shopping, furniture, tools.",
        "Rear seats that fold down in parts, and an electric tailgate.",
        ["practicality"],
        [
            ["hasSplitFoldingRearSeats", "so long or bulky things fit"],
            ["hasElectricTailgate", "so you can open the boot with your hands full"],
        ],
        "Bulky loads"),
    need("bikes", "loads", "Bikes, skis or a roof box", "Bikes, skis or a roof box.",
        "Roof rails for a roof box or rack, and a towbar for a bike rack.",
        ["practicality"],
        [
            ["hasRoofRails", "so a roof box or rack can take what doesn't fit inside"],
            ["hasTowbar", "for a bike rack on the towbar"],
        ],
        "Bikes and roof loads"),
    need("towing", "loads", "A trailer or caravan", "I tow a trailer or a caravan.",
        "A towbar, and a trailer load of 1,500 kg or more as FINN lists it.",
        ["practicality"],
        [
            ["hasTowbar", "which you need to tow anything"],
            ["towingCapacity1500", "so you can check it against the weight of what you tow"],
        ],
        "Towing"),
    need("nervous", "you", "Driving makes me nervous", "Driving makes me nervous.",
        "Blind spot warning, rear cross-traffic alert when reversing out, a 360° camera and parking sensors for parking, and lane keeping assist.",
        ["safetyAssistance", "cityParking"],
        [
            ["hasBlindSpotAssist", "so you're warned about cars you can't see when changing lanes"],
            ["hasRearCrosswalkWarning", "for reversing out between parked cars, where you can't see traffic coming"],
            ["hasThreeSixtyDegreesCamera", "so you can check every side before you move"],
            ["hasParkingSensors", "so you know how much room is left"],
            ["hasLaneKeepingAssist", "for a moment's inattention"],
        ],
        /* Said back as "It helps with driving nerves" — "help for a nervous driver" came out "It helps with help for…". */
        "Driving nerves"),
    /* Not "safety above all": which need wins is what the tie-break asks, not this. */
    need("safety", "you", "Safety features", "Safety features matter to me.",
        "Automatic emergency braking, blind spot warning, lane keeping assist, rear cross-traffic alert, and traffic sign recognition.",
        ["safetyAssistance"],
        [
            ["hasEmergencyBrakingAssist", "which can prevent a collision, or make it less severe, if you react too late"],
            ["hasBlindSpotAssist", "which covers what the mirrors don't show"],
            ["hasLaneKeepingAssist", "for a moment's inattention"],
            ["hasRearCrosswalkWarning", "for reversing out between parked cars, where you can't see traffic coming"],
            ["hasTrafficSignRecognition", "so you always know the current limit"],
        ],
        /* "It partly covers safety", not "It partly covers safety above all". */
        "Safety"),
    need("tech", "you", "Phone connection", "I want my phone to connect to the car.",
        "Apple CarPlay or Android Auto (wired or wireless), and a wireless charging pad for your phone.",
        ["comfort"],
        [
            ["hasWirelessAppleCarPlaySlashAndroidAuto", "so your phone connects to the car's screen as soon as you get in"],
            ["hasAppleCarPlaySlashAndroidAuto", "so the apps you already use run on the car's screen"],
            ["hasWirelessChargingStation", "so your phone charges while it runs maps and music"],
        ]),
    need("comfort", "you", "Everyday comfort", "I want comfort features I'd use every day.",
        "Front seats adjusted with buttons, keyless entry and start, a wireless charging pad, and 3-zone climate control.",
        ["comfort"],
        [
            ["hasElectricFrontSeatAdjustment", "so you can set your seating position precisely"],
            ["hasKeylessEntryAndStart", "which saves taking the key out every time"],
            ["hasWirelessChargingStation", "so your phone is charged when you arrive"],
            ["hasThreeZoneAutomaticClimateControls", "so each passenger sets their own temperature"],
        ],
        "Everyday comfort"),
    /*
     * How much CO₂ and consumption matter are their own questions, each
     * answered in words on the reader's own scale — not a tick among
     * comforts. Each answer is the same need at the importance it names;
     * "Not really" is no need at all.
     */
    ...howMuch("co2", "CO₂ emissions", "environmental", "the CO₂ it puts out"),
    ...howMuch("efficiency", "Using little fuel or electricity", "efficiency", "how little it uses"),
];

/*
 * What each answer means, for its "i" — so "Commuting" and "City driving"
 * aren't left for the reader to tell apart. Where two answers are different
 * axes rather than rivals, the meaning says to pick both.
 */
const MEANS: Record<string, string> = {
    kids: "Children who ride with you, in child seats or not.",
    adults: "Grown-ups riding with you: family, friends or colleagues.",
    dog: "A dog, cat or other pet that travels in the car.",
    city: "Driving in town: traffic lights, stop-and-go traffic, narrow streets, cyclists and people crossing. Where you park is asked next.",
    commute: "The same trip to work or school most weekdays, whatever the roads. If it's through town, pick City driving too.",
    motorway: "Hours at a steady speed on the motorway, for work or to see people. How often is asked next.",
    roadtrips: "Longer trips with luggage: holidays and weekends away, often loaded up.",
    night: "A lot of your driving happens after dark, on lit or unlit roads.",
    street: "Parking at the kerb, often parallel, between other cars.",
    garage: "Your own garage, where the door frame and the walls are close.",
    "multi-storey": "Car parks with levels, ramps, pillars and narrow bays — at the mall, the station, the city centre.",
    "open-car-park": "Open-air car parks at the supermarket, work or the gym, where you reverse out into passing traffic.",
    winter: "Winters cold enough that you scrape the windscreen. What they're like is asked next.",
    summer: "Summers hot enough that the car is an oven after standing in the sun.",
    bulky: "Big shopping, flat-pack furniture, a pram or tools: things that need the seats folded.",
    bikes: "Bikes, skis or a roof box: loads that go on the roof or a rack.",
    towing: "A trailer, caravan or horse box behind the car.",
    nervous: "Driving makes you anxious. What worries you most — parking, traffic, reversing out — is asked next.",
    safety: "As much help avoiding a collision as the cars offer, whoever is driving.",
    tech: "Your phone's maps, music and calls on the car's screen, and charging it without a cable.",
    comfort: "Small comforts you'd use every day: electric seats, keyless entry, wireless charging, your own temperature.",
};

const LIFE: GuideChoice[] = CHOICES.map((choice) => (MEANS[choice.id] ? { ...choice, means: MEANS[choice.id] } : choice));

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
    { id: "must-tow", label: "Must tow", said: "It has to be able to tow.", rule: { id: "hasTowbar", mode: "must", label: "Towbar" } },
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
    /* A year's figure beside each: people know their annual mileage better than a month's. */
    { id: "km-500", label: "About 500 km (6,000 a year)", said: "I drive about 500 km a month.", monthlyKm: 500 },
    { id: "km-1000", label: "About 1,000 km (12,000 a year)", said: "I drive about 1,000 km a month.", monthlyKm: 1000 },
    { id: "km-1500", label: "About 1,500 km (18,000 a year)", said: "I drive about 1,500 km a month.", monthlyKm: 1500 },
    { id: "km-2500", label: "2,500 km or more (30,000+ a year)", said: "I drive 2,500 km a month or more.", monthlyKm: 2500 },
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

    /*
     * With no cars in hand — a chat started on FINN's home page — there is
     * nothing to narrow by, and narrowing by nothing would drop every choice.
     * The questions are asked whole, and the judgement narrows later.
     */
    const narrow = cars.length > 0;

    const life = LIFE.flatMap((choice): GuideChoice[] => {
        if (!choice.need) return [choice];

        const priorities = choice.need.priorities.filter(allowed);
        const evidence = narrow ? choice.need.evidence.filter((id) => findable(cars, id)) : choice.need.evidence;
        const checkable = priorities.length > 0 && (evidence.length > 0 || CATEGORIES[priorities[0]!].numericOnly);

        if (checkable) return [{ ...choice, need: { ...choice.need, priorities, evidence } }];

        /*
         * Who rides along, and where they park, is the reader's answer
         * whatever the cars here list: "Adults" can't go missing from "who
         * are they?" because no car on the page has rear USB ports. It
         * stays, and says it adds nothing.
         */
        return choice.group === "passengers" || choice.group === "people" || choice.group === "parking"
            ? [{ ...choice, need: undefined, description: "None of the cars here list what I'd check for that, so there's nothing extra to check." }]
            : [];
    });

    const rules = narrow ? RULES.filter((choice) => ruleSplits(cars, choice)) : RULES;

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
                      ask: "Anything a car must have, or must not be?",
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
            none: "Not sure",
        },
    ];

    return steps.filter((step) => !skip.includes(step.id));
}

/* -------------------------------------------------------------------------- */
/* Into the understanding                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Needs this step owns, so answering it again replaces its own answers only.
 *
 * A dash, not a colon: an understanding that passes through the reader has its
 * need ids slugged (`readUnderstanding`), and "life:kids" came back as
 * "life-kids" — a second need beside the first, so every tapped need doubled
 * the moment the reader typed anything.
 */
const ownedBy = (step: GuideStepId) => `${step}-`;

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
                use: explain(item, choice.need!.reasons?.[item]),
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
 * The need one of the guide's own answers stands for, narrowed to these
 * cars — so words that mean "Pets" land on exactly what tapping it would.
 * Null when the answer doesn't exist here or checks nothing on these cars.
 */
export function catalogueNeed(choiceId: string, cars: FinnCar[]): Need | null {
    const choice = guideSteps(cars).find((step) => step.id === "life")?.choices.find((item) => item.id === choiceId);

    return choice?.need ? needFor("life", choice) : null;
}

/**
 * What the reader tapped, as something Lens understands.
 *
 * The step replaces its own choices' answers and leaves everything else alone: someone
 * revisiting "what does the car have to do" is changing that answer, not
 * withdrawing their budget or their rules. Tapping nothing is an answer too —
 * it clears what that step had said.
 */
export function applyChoices(u: Understanding, step: GuideStep, chosen: string[]): Understanding {
    const picked = step.choices.filter((choice) => chosen.includes(choice.id));
    const mine = ownedBy(step.id);
    /*
     * Only the needs this step's own choices stand for. The chat asks the
     * needs a group at a time — who's in the car, then where you drive — and
     * answering the weather must not undo what was said about passengers.
     */
    const owned = new Set(step.choices.map((choice) => `${mine}${choice.id}`));
    const kept = u.needs.filter((need) => !owned.has(need.id));
    const added = picked.map((choice) => needFor(step.id, choice)).filter((need): need is Need => need != null);

    const distance = step.id === "distance" ? (picked.find((choice) => choice.monthlyKm != null) ?? null) : null;
    /* A step that asks how many ride along answers it even when nothing is tapped: "Just me" is none. */
    const counts = step.choices.some((choice) => choice.passengers != null);

    return {
        ...u,
        needs: [...kept, ...added],
        monthlyKm: step.id !== "distance" ? u.monthlyKm : distance ? { value: distance.monthlyKm!, said: distance.said } : null,
        passengers: counts ? (picked.find((choice) => choice.passengers != null)?.passengers ?? 0) : u.passengers,
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
