import type { NeedImportance } from "@/lib/lens-ai/contract";

/**
 * How much something counts, said one way everywhere the reader is asked:
 * Top priority · Important · Nice to have.
 *
 * Each step counts twice the one below it (NEED_WEIGHT is 4 : 2 : 1), and
 * that is what the meanings say — in words, never as the numbers. None of
 * them rules a car out: "Must have" and "Mustn't be" are deal-breakers, a
 * different thing, and the words are kept apart so neither reads as the
 * other.
 */
export const IMPORTANCE: Record<NeedImportance, { label: string; as: string; means: string }> = {
    essential: {
        label: "Top priority",
        /** In a sentence: "it will count as a top priority". */
        as: "a top priority",
        means: "Counts the most — twice as much as Important. A car without it can still win, but only by being clearly better at everything else.",
    },
    important: {
        label: "Important",
        as: "important",
        means: "Counts fully, alongside everything else you've said is important.",
    },
    niceToHave: {
        label: "Nice to have",
        as: "nice to have",
        means: "Counts half as much as Important: enough to settle a close call, not to decide on its own.",
    },
};

/** Highest first, as the picker shows them. */
export const IMPORTANCE_LEVELS: NeedImportance[] = ["essential", "important", "niceToHave"];

export const IMPORTANCE_LABEL: Record<NeedImportance, string> = {
    essential: IMPORTANCE.essential.label,
    important: IMPORTANCE.important.label,
    niceToHave: IMPORTANCE.niceToHave.label,
};

/** The scale in one breath, where it's first met. */
export const SCALE_EXPLAINED =
    "Top priority counts twice as much as Important, and Important twice as much as Nice to have. None of them rules a car out — that's what deal-breakers are for.";
