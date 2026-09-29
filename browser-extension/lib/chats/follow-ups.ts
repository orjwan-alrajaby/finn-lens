import type { NeedImportance } from "@/lib/lens-ai/contract";
import { EVIDENCE, type EvidenceId } from "@/lib/lens-chat/evidence";
import { purposeOf } from "@/lib/lens-chat/guide";
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
    /** Equipment that starts to count for this need, and equipment that stops. */
    add?: EvidenceId[];
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
        why: "Child seats need ISOFIX anchors and doors of their own at the back; older kids care more about room and charging. It changes what I look for.",
        choices: [
            {
                id: "seats",
                label: "Yes, baby or toddler seats",
                said: "Yes, they're in baby or toddler seats.",
                importance: "essential",
                add: ["hasElectricTailgate"],
                reply: "Then kids in the back is a must-have. I'll also look for an electric tailgate — a boot that opens when your hands are full of pram.",
            },
            {
                id: "boosters",
                label: "Booster seats",
                said: "They're on booster seats.",
                reply: "Booster seats it is — ISOFIX and rear doors still matter, so I'll keep looking for both.",
            },
            {
                id: "older",
                label: "They're older now",
                said: "They're older now, no child seats.",
                remove: ["hasIsofix"],
                add: ["hasThreeZoneAutomaticClimateControls"],
                reply: "Then I won't count ISOFIX. I'll look for rear USB ports and climate control the back seats can set for themselves instead.",
            },
        ],
    },
    motorway: {
        need: "motorway",
        ask: "How often are you on the motorway?",
        why: "Assistance like adaptive cruise and lane keeping earns its keep in proportion to how much you drive far — so I weigh it by how often.",
        choices: [
            { id: "weekly", label: "Every week", said: "Every week.", importance: "essential", reply: "Every week — then long-distance comfort is a must-have, and I'll weigh it heavily." },
            { id: "monthly", label: "About once a month", said: "About once a month.", importance: "important", reply: "Once a month — it counts, alongside everything else." },
            { id: "rarely", label: "A few times a year", said: "Only a few times a year.", importance: "niceToHave", reply: "A few times a year — I'll count it, but lightly, so it won't decide things on its own." },
        ],
    },
    commute: {
        need: "commute",
        ask: "How long is your commute, one way?",
        why: "A long commute makes adaptive cruise and an automatic gearbox worth a lot; a short one barely uses them.",
        choices: [
            { id: "short", label: "Under 20 minutes", said: "Under 20 minutes.", importance: "niceToHave", reply: "A short one — I'll count it lightly." },
            { id: "medium", label: "20–45 minutes", said: "Between 20 and 45 minutes.", importance: "important", reply: "Long enough to matter — it counts." },
            { id: "long", label: "Over 45 minutes", said: "Over 45 minutes.", importance: "essential", reply: "That's a lot of hours a week. I'll treat your commute as a must-have." },
        ],
    },
    city: {
        need: "city",
        ask: "Where do you usually park?",
        why: "Tight street spaces favour a short car with a camera; garages and multi-storeys favour a narrow one with folding mirrors.",
        choices: [
            {
                id: "street",
                label: "On the street",
                said: "Mostly on the street.",
                add: ["hasThreeSixtyDegreesCamera"],
                reply: "Street parking — length matters most, and I'll also look for a 360° camera to see every side.",
            },
            {
                id: "garage",
                label: "A garage or car park",
                said: "In a garage or a car park.",
                add: ["hasElectricallyFoldingMirrors"],
                reply: "Garages and car parks — I'll weigh width and mirrors that fold out of the way.",
            },
            {
                id: "driveway",
                label: "A driveway",
                said: "I have a driveway.",
                importance: "niceToHave",
                reply: "With a driveway, parking is less of a worry — I'll count it lightly.",
            },
        ],
    },
    winter: {
        need: "winter",
        ask: "What are your winters like?",
        why: "Snow and ice make all-wheel drive and a car that warms up before you get in worth paying for; a cold but dry winter mostly needs heated seats.",
        choices: [
            {
                id: "snow",
                label: "Snow and ice",
                said: "Snow and ice.",
                importance: "essential",
                add: ["hasAllWheelDrive", "hasAuxiliaryHeater"],
                reply: "Snow and ice — a must-have, then. I'll also look for all-wheel drive and an auxiliary heater.",
            },
            { id: "cold", label: "Cold but mostly dry", said: "Cold but mostly dry.", reply: "Cold and dry — heated seats and a warm wheel are what count." },
            { id: "mild", label: "Fairly mild", said: "Fairly mild, really.", importance: "niceToHave", reply: "Mild winters — I'll count it lightly." },
        ],
    },
    carrying: {
        need: "carrying",
        ask: "What do you carry most?",
        why: "Different loads need different things: a big boot and flat-folding seats for bulky shopping, roof rails or a towbar for bikes and sports gear.",
        multiple: true,
        choices: [
            {
                id: "bulky",
                label: "Big shopping or furniture",
                said: "Big shopping and the odd bit of furniture.",
                add: ["hasSplitFoldingRearSeats", "hasElectricTailgate"],
                reply: "Folding seats and an easy-opening boot, then.",
            },
            { id: "bikes", label: "Bikes or sports gear", said: "Bikes and sports gear.", add: ["hasRoofRails", "hasTowbar"], reply: "Roof rails and a towbar for a rack." },
            { id: "work", label: "Tools for work", said: "Tools and equipment for work.", add: ["hasSplitFoldingRearSeats"], remove: ["seatsFivePlus"], reply: "Load space over seats, then." },
        ],
    },
    nervous: {
        need: "nervous",
        ask: "What makes driving stressful for you?",
        why: "Different assistance helps with different worries, so I'll look for the kind that matches yours rather than all of it.",
        multiple: true,
        choices: [
            { id: "parking", label: "Parking", said: "Parking.", add: ["hasThreeSixtyDegreesCamera", "hasParkingSensors"], reply: "A 360° camera and sensors for parking." },
            { id: "traffic", label: "Busy traffic, changing lanes", said: "Busy traffic and changing lanes.", add: ["hasBlindSpotAssist", "hasLaneKeepingAssist", "hasAdaptiveCruiseControl"], reply: "Blind spot warning, lane keeping and adaptive cruise for traffic." },
            { id: "reversing", label: "Reversing out", said: "Reversing out of spaces.", add: ["hasRearCrosswalkWarning", "hasOneEightyDegreesReversingCamera"], reply: "A reversing camera and cross-traffic alert for backing out." },
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
                .filter((id, index, all) => !have.has(id) && all.indexOf(id) === index && EVIDENCE[id])
                .map((id) => ({ id, use: purposeOf(id), unwanted: false, mustHave: false }));

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
 * Curated per need rather than read off the need's priority: "rear
 * cross-traffic alert" is safety equipment, and offering it to someone who
 * said they drive at night because both sit under safety was Lens guessing at
 * a connection it then had to explain.
 */
export const WORTH_A_LOOK: Record<string, EvidenceId[]> = {
    kids: ["hasElectricTailgate", "hasThreeZoneAutomaticClimateControls", "hasSunroof"],
    dog: ["hasRoofRails", "hasSeatCooling"],
    access: ["hasParkingSensors", "hasThreeSixtyDegreesCamera"],
    city: ["hasThreeSixtyDegreesCamera", "hasParkingAssistant", "hasElectricallyFoldingMirrors"],
    commute: ["hasWirelessAppleCarPlaySlashAndroidAuto", "hasWirelessChargingStation", "driverAssistLevel2"],
    motorway: ["hasMatrixLedHeadlights", "hasPremiumSoundSystem", "hasBlindSpotAssist"],
    roadtrips: ["hasPremiumSoundSystem", "hasTowbar", "hasElectricTailgate"],
    night: ["hasHeadUpDisplay", "hasHeadlightCleaningSystem"],
    winter: ["hasHeatPump", "hasAuxiliaryHeater", "hasAllWheelDrive", "hasHeadlightCleaningSystem"],
    summer: ["hasSunroof", "hasKeylessEntryAndStart"],
    carrying: ["hasTowbar", "towingCapacity1500"],
    towing: ["hasAllWheelDrive", "hasThreeSixtyDegreesCamera"],
    nervous: ["hasAdaptiveCruiseControl", "hasParkingAssistant"],
    safety: ["hasMatrixLedHeadlights", "driverAssistLevel2", "hasThreeSixtyDegreesCamera"],
    tech: ["hasPremiumSoundSystem", "hasKeylessEntryAndStart"],
    comfort: ["hasSeatCooling", "hasHeatedSeats", "hasPremiumSoundSystem", "hasSunroof"],
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
): { id: EvidenceId; needId: string }[] {
    const rank: Record<NeedImportance, number> = { essential: 0, important: 1, niceToHave: 2 };
    const needs = u.needs
        .filter((need) => need.status === "active" && need.id.startsWith("life-"))
        .sort((a, b) => rank[a.importance] - rank[b.importance]);
    const taken = new Set(u.needs.flatMap((need) => need.evidence.map((entry) => entry.id)));
    const offers: { id: EvidenceId; needId: string }[] = [];

    if (!cars.length) return offers;

    for (const need of needs) {
        for (const id of WORTH_A_LOOK[need.id.slice("life-".length)] ?? []) {
            if (offers.length >= limit) return offers;
            /* Only what counting can move: standard equipment is checked anyway, and can't be raised. */
            if (taken.has(id) || u.declined.includes(id) || !EVIDENCE[id]?.raisable) continue;

            const { listed, total } = count(id);

            if (!total || listed === 0 || listed / total > TOO_COMMON) continue;

            taken.add(id);
            offers.push({ id, needId: need.id });
        }
    }

    return offers;
}
