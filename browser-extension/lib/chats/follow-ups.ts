import type { NeedImportance } from "@/lib/lens-ai/contract";
import { EVIDENCE, type EvidenceId } from "@/lib/lens-chat/evidence";
import { explain } from "@/lib/lens-chat/guide";
import type { Understanding } from "@/lib/lens-chat/understanding";

/**
 * The second question about a need, where one answer changes what Lens looks
 * for.
 *
 * "Kids in the back" means ISOFIX anchors for a toddler and USB ports for a
 * teenager; "long motorway drives" matters a great deal every week and very
 * little twice a year. Lens can't know which from the chip, so it asks — once
 * per need, only where the answer moves something — and says why it's asking
 * and what the answer changed.
 */

export interface FollowUpChoice {
    id: string;
    label: string;
    said: string;
    /** How much the need counts after this answer. */
    importance?: NeedImportance;
    /** Equipment that starts to count for this need, each with why it belongs to it, and equipment that stops. */
    add?: { id: EvidenceId; why: string }[];
    remove?: EvidenceId[];
    /** What Lens says back: what it will now do differently. */
    reply: string;
}

export interface FollowUp {
    /** The need it follows up, by its guide choice id ("kids"). */
    need: string;
    ask: string;
    why: string;
    multiple?: boolean;
    choices: FollowUpChoice[];
}

export const FOLLOW_UPS: Record<string, FollowUp> = {
    kids: {
        need: "kids",
        ask: "Do your kids still ride in child seats?",
        why: "Your answer decides whether I count ISOFIX anchors, which child seats fix to, or instead rear USB ports and a rear climate setting for children who no longer use one.",
        choices: [
            {
                id: "seats",
                label: "Yes, baby or toddler seats",
                said: "Yes, they're in baby or toddler seats.",
                importance: "essential",
                add: [{ id: "hasElectricTailgate", why: "so you can open the boot while holding a child or a pram" }],
                reply: "Then kids in the back is a must-have. I'll also count an electric tailgate, which opens the boot at the press of a button while you're holding a child or a pram.",
            },
            {
                id: "boosters",
                label: "Booster seats",
                said: "They're on booster seats.",
                reply: "Booster seats: I'll keep counting ISOFIX anchors and rear doors.",
            },
            {
                id: "older",
                label: "They're older now",
                said: "They're older now, no child seats.",
                remove: ["hasIsofix"],
                add: [{ id: "hasThreeZoneAutomaticClimateControls", why: "so children in the back can set their own temperature" }],
                reply: "Then I won't count ISOFIX anchors. I'll count rear USB ports and 3-zone climate control, which gives the back seats their own temperature setting.",
            },
        ],
    },
    motorway: {
        need: "motorway",
        ask: "How often are you on the motorway?",
        why: "Your answer sets how much long motorway drives count — and with them adaptive cruise control, Level 2 driver assistance, lower-back support and a head-up display — against your other needs.",
        choices: [
            { id: "weekly", label: "Every week", said: "Every week.", importance: "essential", reply: "Every week: I'll treat long motorway drives as a must-have." },
            { id: "monthly", label: "About once a month", said: "About once a month.", importance: "important", reply: "Once a month: I'll count long motorway drives as important." },
            { id: "rarely", label: "A few times a year", said: "Only a few times a year.", importance: "niceToHave", reply: "A few times a year: I'll count long motorway drives as nice to have, so they won't decide the ranking on their own." },
        ],
    },
    commute: {
        need: "commute",
        ask: "How long is your commute, one way?",
        why: "Your answer sets how much your commute counts — and with it adaptive cruise control, an automatic gearbox, keyless entry and CarPlay — against your other needs.",
        choices: [
            { id: "short", label: "Under 20 minutes", said: "Under 20 minutes.", importance: "niceToHave", reply: "Under 20 minutes: I'll count your commute as nice to have." },
            { id: "medium", label: "20–45 minutes", said: "Between 20 and 45 minutes.", importance: "important", reply: "20–45 minutes: I'll count your commute as important." },
            { id: "long", label: "Over 45 minutes", said: "Over 45 minutes.", importance: "essential", reply: "Over 45 minutes: I'll treat your commute as a must-have." },
        ],
    },
    city: {
        need: "city",
        ask: "Where do you usually park?",
        why: "Your answer decides whether I also count a 360° camera, for tight street spaces, or mirrors that fold in, for narrow garage and car-park bays.",
        choices: [
            {
                id: "street",
                label: "On the street",
                said: "Mostly on the street.",
                add: [{ id: "hasThreeSixtyDegreesCamera", why: "so you can check every side in a tight street space" }],
                reply: "Street parking: I'll also count a 360° camera, which shows all four sides of the car while you park.",
            },
            {
                id: "garage",
                label: "A garage or car park",
                said: "In a garage or a car park.",
                add: [{ id: "hasElectricallyFoldingMirrors", why: "so the mirrors aren't clipped in narrow car-park bays" }],
                reply: "Garages and car parks: I'll count mirrors that fold in at the press of a button, alongside the car's width.",
            },
            {
                id: "driveway",
                label: "A driveway",
                said: "I have a driveway.",
                importance: "niceToHave",
                reply: "With a driveway, I'll count city driving and parking as nice to have.",
            },
        ],
    },
    winter: {
        need: "winter",
        ask: "What are your winters like?",
        why: "Snow and ice adds all-wheel drive and an auxiliary heater to what I check, and makes winter a must-have; a cold but dry winter keeps the list as it is.",
        choices: [
            {
                id: "snow",
                label: "Snow and ice",
                said: "Snow and ice.",
                importance: "essential",
                add: [
                    { id: "hasAllWheelDrive", why: "for grip pulling away and climbing on snow and ice — it doesn't shorten braking" },
                    { id: "hasAuxiliaryHeater", why: "so the car is warm and the windows clear before you set off" },
                ],
                reply: "Snow and ice: winter is a must-have, and I'll also count all-wheel drive and an auxiliary heater.",
            },
            { id: "cold", label: "Cold but mostly dry", said: "Cold but mostly dry.", reply: "Cold but dry: I'll count heated seats and a heated steering wheel, without adding all-wheel drive." },
            { id: "mild", label: "Fairly mild", said: "Fairly mild, really.", importance: "niceToHave", reply: "Mild winters: I'll count winter equipment as nice to have." },
        ],
    },
    carrying: {
        need: "carrying",
        ask: "What do you carry most?",
        why: "Each kind of load needs different equipment: folding rear seats and an electric tailgate for bulky things, roof rails and a towbar for a bike rack. Pick all that apply.",
        multiple: true,
        choices: [
            {
                id: "bulky",
                label: "Big shopping or furniture",
                said: "Big shopping and the odd bit of furniture.",
                add: [
                    { id: "hasSplitFoldingRearSeats", why: "so bulky things fit" },
                    { id: "hasElectricTailgate", why: "so you can open the boot with your hands full" },
                ],
                reply: "folding rear seats and an electric tailgate",
            },
            { id: "bikes", label: "Bikes or sports gear", said: "Bikes and sports gear.", add: [
                    { id: "hasRoofRails", why: "for a bike rack on the roof" },
                    { id: "hasTowbar", why: "for a bike rack on the towbar" },
                ], reply: "roof rails and a towbar for a bike rack" },
            { id: "work", label: "Tools for work", said: "Tools and equipment for work.", add: [{ id: "hasSplitFoldingRearSeats", why: "so long tools and equipment fit" }], remove: ["seatsFivePlus"], reply: "folding rear seats, without counting the number of seats" },
        ],
    },
    nervous: {
        need: "nervous",
        ask: "What makes driving stressful for you?",
        why: "Each worry has its own equipment: parking sensors and a 360° camera for parking, blind spot warning and lane keeping for traffic, a reversing camera and rear cross-traffic alert for backing out. I'll count the ones that match.",
        multiple: true,
        choices: [
            { id: "parking", label: "Parking", said: "Parking.", add: [
                    { id: "hasThreeSixtyDegreesCamera", why: "so you can check every side before you move" },
                    { id: "hasParkingSensors", why: "so you know how much room is left" },
                ], reply: "a 360° camera and parking sensors" },
            { id: "traffic", label: "Busy traffic, changing lanes", said: "Busy traffic and changing lanes.", add: [
                    { id: "hasBlindSpotAssist", why: "for the cars you can't see when changing lanes" },
                    { id: "hasLaneKeepingAssist", why: "for a moment's inattention" },
                    /*
                     * Not adaptive cruise control: Lens scores it under Long
                     * Distance Travel, which also marks an electric car down
                     * for its range — a nervous driver in town would have
                     * been judged on trips they never described.
                     */
                ], reply: "blind spot warning and lane keeping assist" },
            { id: "reversing", label: "Reversing out", said: "Reversing out of spaces.", add: [
                    { id: "hasRearCrosswalkWarning", why: "for reversing out between parked cars, where you can't see traffic coming" },
                    { id: "hasOneEightyDegreesReversingCamera", why: "so you aren't reversing on mirrors alone" },
                ], reply: "a reversing camera and rear cross-traffic alert" },
        ],
    },
};

/** The follow-up for a need the reader picked, if it has one. */
export const followUpFor = (choiceId: string): FollowUp | null => FOLLOW_UPS[choiceId] ?? null;

/**
 * An answer to a follow-up, applied to the need it follows up. Evidence it
 * adds carries Lens's own words for what it's for, like every other piece.
 */
export function applyFollowUp(u: Understanding, followUp: FollowUp, chosen: string[]): Understanding {
    const picked = followUp.choices.filter((choice) => chosen.includes(choice.id));
    const needId = `life-${followUp.need}`;

    return {
        ...u,
        needs: u.needs.map((need) => {
            if (need.id !== needId) return need;

            const importance = picked.map((choice) => choice.importance).find(Boolean) ?? need.importance;
            const removed = new Set(picked.flatMap((choice) => choice.remove ?? []));
            const kept = need.evidence.filter((entry) => !removed.has(entry.id));
            const have = new Set(kept.map((entry) => entry.id));
            const added = picked
                .flatMap((choice) => choice.add ?? [])
                .filter((add, index, all) => !have.has(add.id) && all.findIndex((other) => other.id === add.id) === index && EVIDENCE[add.id])
                .map((add) => ({ id: add.id, use: explain(add.id, add.why), unwanted: false, mustHave: false }));

            return { ...need, importance, evidence: [...kept, ...added] };
        }),
    };
}

/* -------------------------------------------------------------------------- */
/* Worth a look                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Equipment that genuinely serves each need but isn't what the need is
 * judged on by default — offered, never assumed.
 *
 * Curated per need rather than read off the need's priority, and each with
 * the reason it serves that need, said with the offer. A pair with no honest
 * reason isn't listed: "a sunroof" for kids in the back was on this list, and
 * the offer could only say what a sunroof is — never why it was asked.
 */
export const WORTH_A_LOOK: Record<string, { id: EvidenceId; why: string }[]> = {
    kids: [
        { id: "hasElectricTailgate", why: "so you can open the boot while holding a child or a pram" },
        { id: "hasThreeZoneAutomaticClimateControls", why: "so children in the back can set their own temperature" },
    ],
    city: [{ id: "hasThreeSixtyDegreesCamera", why: "so you can check every side in a tight space" }],
    commute: [
        { id: "hasWirelessAppleCarPlaySlashAndroidAuto", why: "since you'd otherwise plug it in twice a day" },
        { id: "hasWirelessChargingStation", why: "so your phone charges on the daily drive" },
        { id: "driverAssistLevel2", why: "for slow motorway traffic on the way to work" },
    ],
    motorway: [
        { id: "hasMatrixLedHeadlights", why: "for unlit motorway stretches at night" },
        { id: "hasBlindSpotAssist", why: "for changing lanes at motorway speed" },
    ],
    roadtrips: [
        { id: "hasTowbar", why: "so you can take a bike rack or trailer on holiday" },
        { id: "hasElectricTailgate", why: "so you can open the boot with bags in your hands" },
    ],
    night: [
        /* Not a head-up display: scored under Long Distance Travel, it brings an electric car's range into a need about the dark. */
        { id: "hasHeadlightCleaningSystem", why: "because dirt on the headlights dims them" },
    ],
    winter: [
        { id: "hasHeatPump", why: "so an electric car loses less range heating the cabin in winter" },
        { id: "hasAuxiliaryHeater", why: "so the car is warm and the windows clear before you set off" },
        { id: "hasAllWheelDrive", why: "for grip pulling away and climbing on snow and ice — it doesn't shorten braking" },
        { id: "hasHeadlightCleaningSystem", why: "because winter roads coat them in salt" },
    ],
    carrying: [
        { id: "hasTowbar", why: "so a trailer can take what doesn't fit in the car" },
        { id: "towingCapacity1500", why: "so that trailer can carry a heavier load" },
    ],
    towing: [
        { id: "hasAllWheelDrive", why: "for pulling a trailer away on wet or steep ground" },
        { id: "hasThreeSixtyDegreesCamera", why: "so you can see the towbar while reversing up to a trailer" },
    ],
    safety: [
        { id: "hasMatrixLedHeadlights", why: "so you see further at night" },
        /* Not Level 2 assistance, for the same reason as adaptive cruise control for a nervous driver. */
        { id: "hasThreeSixtyDegreesCamera", why: "so you see obstacles on every side while manoeuvring" },
    ],
    comfort: [
        { id: "hasSeatCooling", why: "for hot days" },
        { id: "hasHeatedSeats", why: "for cold days" },
    ],
};

/** Equipment this common can't tell the cars apart, and so isn't worth a question. */
const TOO_COMMON = 0.85;

/**
 * What to offer: for the reader's needs, most important first, equipment
 * from that need's list that some cars here list and others don't — the only
 * kind that can change the answer.
 */
export function worthALook(
    u: Understanding,
    cars: { id: number }[],
    count: (id: EvidenceId) => { listed: number; total: number },
    limit = 2,
): { id: EvidenceId; needId: string; why: string }[] {
    const rank: Record<NeedImportance, number> = { essential: 0, important: 1, niceToHave: 2 };
    const needs = u.needs
        .filter((need) => need.status === "active" && need.id.startsWith("life-"))
        .sort((a, b) => rank[a.importance] - rank[b.importance]);
    const taken = new Set(u.needs.flatMap((need) => need.evidence.map((entry) => entry.id)));
    const offers: { id: EvidenceId; needId: string; why: string }[] = [];

    if (!cars.length) return offers;

    for (const need of needs) {
        for (const { id, why } of WORTH_A_LOOK[need.id.slice("life-".length)] ?? []) {
            if (offers.length >= limit) return offers;
            /* Only what counting can move: standard equipment is checked anyway, and can't be raised. */
            if (taken.has(id) || u.declined.includes(id) || !EVIDENCE[id]?.raisable) continue;

            const { listed, total } = count(id);

            if (!total || listed === 0 || listed / total > TOO_COMMON) continue;

            taken.add(id);
            offers.push({ id, needId: need.id, why });
        }
    }

    return offers;
}

/** Why a piece of equipment was offered for a need ("life-kids"), from the list above. */
export const offerReason = (needId: string, id: EvidenceId): string | undefined =>
    WORTH_A_LOOK[needId.replace(/^life-/, "")]?.find((entry) => entry.id === id)?.why;
