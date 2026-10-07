/**
 * The "i" panel's visual language, the drawer's own: soft rounded cards, and
 * a small coloured disc on each line saying what kind of line it is. Shared
 * by the panel beside the chat (drawn by the content script) and the one
 * inside it (React), so the two can't drift apart.
 *
 * - **check**: what Lens counts for this answer — the chat's blue.
 * - **standard**: what it also checks, on nearly every car — the drawer's
 *   "has it" green, since nearly every car does.
 * - **star**: why it's recommended — the drawer's amber.
 * - **note**: a quiet aside — grey.
 */

export type TipTone = "check" | "standard" | "star" | "note";

export const TIP_DOT: Record<TipTone, string> = {
    check: "bg-finn-pale-blue text-finn-accent-blue",
    standard: "bg-finn-fit-good-pale text-finn-fit-good",
    star: "bg-finn-fit-partial-pale text-finn-fit-partial",
    note: "bg-finn-cotton text-finn-iron",
};

/** A list's heading takes its tone's colour, a shade deeper than its dots. */
export const TIP_HEADING: Record<"check" | "standard", string> = {
    check: "text-finn-highlight-navy",
    standard: "text-finn-fit-good",
};

/** One card: a section of the panel, as the drawer draws a need. */
export const TIP_CARD = "rounded-xl bg-finn-snow p-3 ring-1 ring-black/[0.03]";
