import {
    MAX_PRIORITIES,
    MIN_PRIORITIES,
} from "@/lib/reasoning-engine/constants";

/**
 * The priority order, as one list.
 *
 * This started life in Settings, where an answer already existed and only
 * needed adjusting, and it is now the only way the question gets asked
 * anywhere. The compare flow used to split it in two — a screen to choose
 * priorities, then a screen to order them — which asked the reader to hold
 * a decision in their head across a page turn and gave them no way to see,
 * while choosing, what the order they were building actually looked like.
 * One list answers both halves at once: what you picked is what you see,
 * in the order it counts.
 *
 * Both callers get the same list. What differs is the framing around it —
 * Settings says "your priorities", the compare flow explains what a
 * priority is first — and how the profiles are offered.
 *
 * Three pieces, and they are used in different combinations: the list
 * itself, the profiles that fill it in one go, and the sentence that
 * explains what an order is for. Every caller takes at least two of them,
 * which is why this stays one module with one entry.
 */

export { applicableProfiles, matchingProfile, ProfilePresets } from "./ProfilePresets";
export { PriorityOrderList } from "./PriorityOrderList";
export { ProfileOrderChips } from "./ProfileOrderChips";
export { ProfileBasisNote } from "./ProfileBasisNote";

export const PRIORITY_ORDER_DESCRIPTION =
    `What matters to you about a car, in the order it matters. The first counts ` +
    `for the most and the last for the least, and this order is what every ` +
    `explanation Finn Lens gives you is measured against — on your pinned cars ` +
    `and on any car you open on finn.com — whenever Lens is judging by your ` +
    `settings rather than by your chat. Lens starts you on an order of its ` +
    `own; changing anything here makes it yours. Between ${MIN_PRIORITIES} and ` +
    `${MAX_PRIORITIES}.`;
