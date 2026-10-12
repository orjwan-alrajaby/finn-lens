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
    /**
     * The answers say which of the need's equipment applies, rather than
     * adding to it: "parking" is the worry, so blind spot warning is not.
     * Answering none of them leaves the need as it was.
     */
    replace?: boolean;
    /** With several answers, how many at most. */
    max?: number;
    choices: FollowUpChoice[];
}

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
            const replacing = followUp.replace === true && picked.length > 0;
            const kept = replacing ? [] : need.evidence.filter((entry) => !removed.has(entry.id));
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
        { id: "hasElectricTailgate", why: "for when you're holding a child or a pram" },
        { id: "hasThreeZoneAutomaticClimateControls", why: "so children aren't stuck with your setting" },
    ],
    commute: [
        { id: "hasWirelessAppleCarPlaySlashAndroidAuto", why: "since you'd otherwise plug it in twice a day" },
        { id: "hasWirelessChargingStation", why: "for the daily drive" },
        { id: "driverAssistLevel2", why: "for slow motorway traffic on the way to work" },
    ],
    motorway: [
        { id: "hasMatrixLedHeadlights", why: "for unlit motorway stretches at night" },
        { id: "hasBlindSpotAssist", why: "for changing lanes at motorway speed" },
    ],
    roadtrips: [
        { id: "hasTowbar", why: "so you can take a bike rack or trailer on holiday" },
        { id: "hasElectricTailgate", why: "for when your hands are full of bags" },
    ],
    night: [
        /* Not a head-up display: scored under Long Distance Travel, it brings an electric car's range into a need about the dark. */
        { id: "hasHeadlightCleaningSystem", why: "for spray and grime on night drives" },
    ],
    winter: [
        { id: "hasHeatPump", why: "so an electric car loses less range heating the cabin in winter" },
        { id: "hasAuxiliaryHeater", why: "so the windows are clear on frozen mornings" },
        { id: "hasAllWheelDrive", why: "for grip pulling away and climbing on snow and ice — it doesn't shorten braking" },
        { id: "hasHeadlightCleaningSystem", why: "because winter roads coat them in salt" },
    ],
    bulky: [{ id: "hasTowbar", why: "so a trailer can take what doesn't fit in the car" }],
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

/** Why a piece of equipment was offered for a need ("life-kids"), from the list above. */
export const offerReason = (needId: string, id: EvidenceId): string | undefined =>
    WORTH_A_LOOK[needId.replace(/^life-/, "")]?.find((entry) => entry.id === id)?.why;
