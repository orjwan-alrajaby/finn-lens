import { CATEGORIES, CATEGORY_IDS, SIGNALS } from "@/lib/reasoning-engine/constants";
import { bootLitres, evRangeKm, isBinarySignal, lengthMm, signalUtility } from "@/lib/reasoning-engine/evidence";
import type { CategoryId, SignalId } from "@/lib/reasoning-engine/types";
import type { FinnCar } from "@/lib/types";

/**
 * What Lens can actually check on a car, for connecting a reader's needs to
 * it.
 *
 * Everything Lens reads from FINN — its equipment list and the handful of
 * facts derived from its structured fields. Most of it is scored by some
 * priority; some of it isn't (privacy glass, leather seats). Unscored evidence never moves a score. It is here so that "I want
 * the kids kept busy" can be answered with what FINN actually lists, stated
 * as a fact about the car, and not with a guess.
 */

/**
 * `electricRange` isn't one of the engine's signals — range reaches a score
 * through longDistance's own trip factor rather than as a raisable feature —
 * but it's the first thing anyone driving far asks about, and FINN publishes
 * it. So Lens can point at it even though nobody can raise it.
 */
export type EvidenceId = SignalId | "electricRange" | "electricCar" | "suvBody" | "winterReadyTyres";

/** Where Lens's own label would claim more than FINN's field says. */
const RELABEL: Partial<Record<EvidenceId, string>> = {
    /* The engine's label reads "Boot space (seats up)", which FINN never states. */
    bootVolume: "Boot space",
};

/** Evidence Lens reads but never scores, with the reason it isn't scored. */
const READ_ONLY: Partial<Record<EvidenceId, string>> = {
    /* FINN's single boot figure is sometimes seats-up and sometimes seats-folded. */
    bootVolume:
        "How much the boot holds, as FINN publishes it. FINN doesn't say whether the figure is with the rear seats up or folded, so Lens quotes it and doesn't score it.",
    electricRange:
        "The WLTP range FINN publishes for an electric car. Lens already weighs range inside long-distance driving; this is the figure itself.",
};

export interface EvidenceDef {
    id: EvidenceId;
    label: string;
    explanation: string;
    /** The priority that scores it, if any. Null means Lens only reads it. */
    scoredIn: CategoryId | null;
    /** Whether a reader can raise it inside that priority. */
    raisable: boolean;
    /**
     * True where finding it is the bad news: "I really don't want an SUV" is
     * a need, and the car being one is what answers it — the wrong way.
     */
    undesirable?: boolean;
    /** How to name it where not having it is the point: "Not an SUV". */
    negativeLabel?: string;
}

const homeOf = (id: SignalId): { category: CategoryId | null; raisable: boolean } => {
    for (const category of CATEGORY_IDS) {
        const def = CATEGORIES[category] as {
            features: readonly string[];
            expected?: readonly string[];
            alsoCounts?: readonly string[];
        };

        if (def.features.includes(id)) return { category, raisable: true };
        if (def.expected?.includes(id) || def.alsoCounts?.includes(id)) return { category, raisable: false };
    }

    return { category: null, raisable: false };
};

export const EVIDENCE: Record<EvidenceId, EvidenceDef> = {
    ...(Object.fromEntries(
        (Object.keys(SIGNALS) as SignalId[])
            /* `Fahrerassistenz` is a level, read through driverAssistLevel2 instead. */
            .filter((id) => id !== "hasDriverAssistance")
            .map((id) => {
                const home = homeOf(id);

                const readOnly = READ_ONLY[id];

                return [
                    id,
                    {
                        id,
                        label: RELABEL[id] ?? SIGNALS[id].label,
                        explanation: readOnly ?? SIGNALS[id].explanation,
                        scoredIn: readOnly ? null : home.category,
                        raisable: readOnly ? false : home.raisable,
                    },
                ];
            }),
    ) as Record<SignalId, EvidenceDef>),

    electricRange: {
        id: "electricRange",
        label: "Electric range",
        explanation: READ_ONLY.electricRange!,
        scoredIn: null,
        raisable: false,
    },

    /*
     * Body type and tyres come from FINN's own structured fields — `cartype`
     * and `tires` — rather than from the equipment list. Neither is scored:
     * Lens ranks on what a car has, not on what shape it is. They're here
     * because "I don't want a massive SUV" and "winter is unpleasant here"
     * are answered by facts FINN publishes, and answering them from length
     * alone was guessing at something Lens could simply read.
     */
    electricCar: {
        id: "electricCar",
        label: "Electric",
        negativeLabel: "Not electric",
        explanation:
            "Whether FINN lists this car as electric. Lens doesn't score fuel type — it prices each car on what it burns or charges — but wanting one, or not, is a rule a reader can give.",
        scoredIn: null,
        raisable: false,
    },

    suvBody: {
        id: "suvBody",
        label: "SUV",
        negativeLabel: "Not an SUV",
        explanation:
            "Whether FINN files this car as an SUV. Lens doesn't score body type — it reads it, so a reader who doesn't want one can see what they're being offered.",
        scoredIn: null,
        raisable: false,
        undesirable: true,
    },

    winterReadyTyres: {
        id: "winterReadyTyres",
        label: "All-season or winter tyres",
        explanation:
            "What FINN says is fitted: all-season tyres, or a summer and a winter set. Not scored — nearly every FINN car comes on all-season tyres — but it's the answer to what the car is shod with in winter.",
        scoredIn: null,
        raisable: false,
    },
};

/** How FINN's `cartype` reads in a sentence. */
const BODY_WORDS: Record<string, string> = {
    suv: "an SUV",
    "klein- und kompaktwagen": "a small or compact car",
    kompaktwagen: "a compact car",
    kleinwagen: "a small car",
    kombi: "an estate",
    limousine: "a saloon",
    cabriolet: "a convertible",
    hatchback: "a hatchback",
    van: "a van",
    transporter: "a van",
};

const bodyWord = (car: FinnCar): string | null => {
    const type = String(car.vehicleType ?? "").trim();

    return type ? (BODY_WORDS[type.toLowerCase()] ?? `a ${type.toLowerCase()}`) : null;
};

const isSuv = (car: FinnCar): boolean => /\bsuv\b/i.test(String(car.vehicleType ?? ""));

/*
 * Names for the handful of things readers ask not to have. Everything else
 * falls back to "No <label>", which reads well enough for equipment.
 */
for (const [id, label] of [
    ["seatsSixPlus", "Not a seven-seater"],
    ["hasTowbar", "No towbar"],
    ["driverAssistLevel2", "Doesn't drive itself"],
] as const) {
    EVIDENCE[id].negativeLabel = label;
}

export const EVIDENCE_IDS = Object.keys(EVIDENCE) as EvidenceId[];

export const isEvidenceId = (value: unknown): value is EvidenceId =>
    typeof value === "string" && value in EVIDENCE;

export type EvidenceState = "listed" | "notListed" | "unknown";

/** Range enough to stop thinking about stopping, on FINN's own WLTP figure. */
const LONG_RANGE_KM = 350;

/** What FINN's data says about one piece of evidence on one car. */
export function readEvidence(car: FinnCar, id: EvidenceId): EvidenceState {
    if (id === "electricRange") {
        const range = evRangeKm(car);

        return range == null ? "unknown" : range >= LONG_RANGE_KM ? "listed" : "notListed";
    }

    if (id === "electricCar") {
        return car.fuelType === "Electric" ? "listed" : "notListed";
    }

    if (id === "suvBody") {
        return bodyWord(car) == null ? "unknown" : isSuv(car) ? "listed" : "notListed";
    }

    if (id === "winterReadyTyres") {
        return car.tyres == null ? "unknown" : "listed";
    }

    const utility = signalUtility(id, car);

    if (utility == null) return "unknown";

    /* A measured figure (length) is "listed" when it scores well on its own curve. */
    if (!isBinarySignal(id)) return utility >= 0.6 ? "listed" : "notListed";

    return utility === 1 ? "listed" : "notListed";
}

/** Figures quoted to the reader that can't say whether a need is met. */
export const AMBIGUOUS_FIGURES = new Set<EvidenceId>(["bootVolume"]);

/**
 * Whether this car answers the need the evidence was cited for: normally that
 * it's listed, and for evidence nobody wants (an SUV body) that it isn't.
 * Null where FINN says nothing either way.
 */
export function evidenceMet(car: FinnCar, id: EvidenceId, unwanted = EVIDENCE[id].undesirable === true): boolean | null {
    /*
     * A figure Lens quotes but can't read as an answer. FINN's boot litres are
     * seats-up on one car and seats-folded on the next — the same BMW X1
     * appears at 1,545 L and at 500 L — so "a 1,010 L boot" on a 3.6 m city
     * car told someone who carries a lot for the weekend that it helps, when
     * nothing Lens has can say so.
     */
    if (AMBIGUOUS_FIGURES.has(id)) return null;

    const state = readEvidence(car, id);

    if (state === "unknown") return null;

    return unwanted ? state === "notListed" : state === "listed";
}

/** What to call a piece of evidence where not having it is the point. */
export const withoutLabel = (id: EvidenceId): string =>
    EVIDENCE[id].negativeLabel ?? `No ${EVIDENCE[id].label.toLowerCase()}`;

/** The thing itself, in a sentence: "you ruled out an SUV". */
const PHRASES: Partial<Record<EvidenceId, string>> = {
    electricCar: "an electric car",
    seatsFivePlus: "a five-seater or bigger",
    hasAutomaticTransmission: "an automatic",
    suvBody: "an SUV",
    seatsSixPlus: "a seven-seater",
    driverAssistLevel2: "a car that steers itself",
    hasTowbar: "a towbar",
};

/* "Rear USB ports" belongs in a sentence as "rear USB ports", not "rear usb ports". */
export const asPhrase = (id: EvidenceId): string => {
    const label = EVIDENCE[id].label;

    return PHRASES[id] ?? (/^[A-Z0-9]{2,}/.test(label) ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`);
};

/** Evidence that describes what kind of car it is, rather than what it carries. */
const KINDS = new Set<EvidenceId>(["electricCar", "suvBody", "seatsSixPlus", "seatsFivePlus", "hasAutomaticTransmission"]);

export const isKind = (id: EvidenceId): boolean => KINDS.has(id);

/**
 * A rule in a sentence. A kind of car is something the car *is*; everything
 * else is something it *has*, and "Must be rear doors" is neither.
 */
export const ruleLabel = (id: EvidenceId, mode: "without" | "must"): string =>
    mode === "without"
        ? `No ${barePhrase(id)}`
        : KINDS.has(id)
          ? `Must be ${asPhrase(id)}`
          : `Must have ${EVIDENCE[id].label.toLowerCase()}`;

/**
 * What a piece of equipment does, for someone who has never read a car
 * review. One sentence: what it is, and what it does for you — never why you
 * should want it.
 *
 * The engine's own explanations are written for the compare page, where a
 * reader has come to study the reasoning. In a chat they are too long to put
 * behind a tap, so the equipment people actually meet gets a short form here
 * and everything else falls back to Lens's own words.
 */
const PLAIN: Partial<Record<EvidenceId, string>> = {
    hasThreeSixtyDegreesCamera:
        "Cameras around the car combine into a view from above, so you can see the space on every side while parking.",
    hasOneEightyDegreesReversingCamera: "Shows the area behind the car on a screen while you reverse.",
    hasParkingSensors: "Sensors that beep faster as you get closer to something you can't see.",
    hasParkingAssistant: "Steers the car into a parking space itself while you control the pedals.",
    hasMatrixLedHeadlights:
        "Headlights split into sections that switch off individually, keeping more of the road lit without dazzling oncoming drivers.",
    hasCorneringLights: "Extra lights that come on as you turn, lighting the bend rather than straight ahead.",
    hasBackUSBPorts: "USB sockets in the back seats, for charging phones or tablets without a cable from the front.",
    hasBlindSpotAssist: "Warns you when another car is beside you where your mirrors don't show it.",
    hasRearCrosswalkWarning: "Warns you about traffic crossing behind while you reverse out of a space.",
    hasEmergencyBrakingAssist: "Brakes for you if it detects a collision coming and you haven't reacted.",
    hasAdaptiveCruiseControl: "Holds a set speed and keeps your distance from the car in front by itself.",
    driverAssistLevel2: "Steers to stay centred in the lane while also holding speed and distance.",
    hasLaneKeepingAssist: "Nudges the steering back if you drift out of your lane without indicating.",
    hasIsofix: "Standard anchor points that a child seat clips straight into, instead of being belted in.",
    hasLumbarSupport: "An adjustable support for the lower back, for long stretches behind the wheel.",
    hasHeatedSteeringWheel: "The wheel itself warms up, so you can drive without gloves on a cold morning.",
    hasHeatPump: "Heats the cabin far more efficiently than a normal electric heater, so winter costs less range.",
    hasElectricTailgate: "The boot opens and closes on a motor, which helps when your hands are full.",
    hasSplitFoldingRearSeats: "The back seat folds in sections, so you can carry something long and a passenger at once.",
    bootVolume: "How much the boot holds, as FINN publishes it. FINN doesn't say whether the figure is with the seats up or folded.",
    electricRange: "How far FINN says the car goes on a full charge, measured on the standard WLTP cycle.",
    compactLength: "How long the car is, bumper to bumper.",
    compactWidth: "How wide the car is, excluding the mirrors.",
    suvBody: "Whether FINN files this car as an SUV. It's a category, not a measurement — some are shorter than ordinary hatchbacks.",
    winterReadyTyres: "What FINN says is fitted: all-season tyres, or a summer and a winter set.",
};

/** The short explanation where there is one, Lens's own where there isn't. */
export const plainly = (id: EvidenceId): string => PLAIN[id] ?? EVIDENCE[id].explanation;

/** The same phrase without its article, for "no SUV" rather than "no an SUV". */
export const barePhrase = (id: EvidenceId): string => asPhrase(id).replace(/^(a|an|the) /, "");

/**
 * A measured fact worth quoting instead of a yes or no, in both directions:
 * "4.68 m long" says more than "no", and is the honest thing to say about a
 * car whose length FINN publishes and which simply isn't small.
 */
export function measuredDisplay(car: FinnCar, id: EvidenceId): string | null {
    if (id === "compactLength") {
        const length = lengthMm(car);

        return length ? `${(length / 1000).toFixed(2)} m long` : null;
    }

    if (id === "bootVolume") {
        const litres = bootLitres(car);

        return litres ? `a ${Math.round(litres)} L boot` : null;
    }

    if (id === "electricRange") {
        const range = evRangeKm(car);

        return range ? `${Math.round(range)} km of range on FINN's figure` : null;
    }

    if (id === "suvBody") return bodyWord(car);

    if (id === "winterReadyTyres") {
        return car.tyres === "summerAndWinter"
            ? "a summer set and a winter set, in FINN's data"
            : car.tyres === "allSeason"
              ? "all-season tyres, in FINN's data"
              : null;
    }

    return null;
}

export interface Coverage {
    id: EvidenceId;
    listed: number;
    notListed: number;
    unknown: number;
    total: number;
}

export function coverage(cars: FinnCar[], id: EvidenceId): Coverage {
    const result: Coverage = { id, listed: 0, notListed: 0, unknown: 0, total: cars.length };

    for (const car of cars) {
        const state = readEvidence(car, id);

        if (state === "listed") result.listed += 1;
        else if (state === "notListed") result.notListed += 1;
        else result.unknown += 1;
    }

    return result;
}

/** The catalogue as the model sees it: what each piece is, and how common it is here. */
export function evidenceCatalogue(cars: FinnCar[]) {
    return EVIDENCE_IDS.map((id) => {
        const def = EVIDENCE[id];
        const counts = coverage(cars, id);

        return {
            id,
            label: def.label,
            explanation: def.explanation,
            scoredBy: def.scoredIn ? CATEGORIES[def.scoredIn].label : "not scored — Lens only reads it",
            listedOn: AMBIGUOUS_FIGURES.has(id)
                ? `a figure on ${counts.total - counts.unknown} of ${counts.total} cars in scope, quoted but never read as meeting a need`
                : `${counts.listed} of ${counts.total} cars in scope${counts.unknown ? ` (${counts.unknown} unknown)` : ""}`,
        };
    });
}
