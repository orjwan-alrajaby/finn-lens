import type { NeedImportance } from "@/lib/lens-ai/contract";
import { IMPORTANCE, IMPORTANCE_LEVELS, SCALE_EXPLAINED } from "@/lib/lens-chat/importance";
import { NEED_WEIGHT } from "@/lib/lens-chat/understanding";

/**
 * How much something counts, as a badge — Top priority · Important · Nice to
 * have — with its points, and the key that says what the levels mean,
 * wherever Lens says back what it understood.
 *
 * The points are the engine's own weights (NEED_WEIGHT, 4 · 2 · 1): a thing's
 * share of the decision is its points over everything's points, as the
 * drawer's "How I weighed it" shows. A badge Lens guessed, because the
 * reader never said how much that thing counts, has a dashed outline, and
 * the key says so.
 */

const points = (importance: NeedImportance): string => `${NEED_WEIGHT[importance]} ${NEED_WEIGHT[importance] === 1 ? "pt" : "pts"}`;

export function ImportanceBadge({ importance, guess = false }: { importance: NeedImportance; guess?: boolean }) {
    return (
        /* No hover title: nothing in the chat explains itself on hover. The key says what a dashed one is. */
        <span
            className={[
                "inline-flex shrink-0 items-baseline gap-1 rounded-full bg-finn-pale-blue px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue",
                guess ? "outline-1 outline-dashed outline-offset-1 outline-finn-accent-blue/60" : "",
            ].join(" ")}
        >
            {IMPORTANCE[importance].label}
            <span className="font-bold text-finn-accent-blue/70">· {points(importance)}</span>
        </span>
    );
}

/** The scale in a sentence, the three levels with their points, and what a dashed one is, where there is one. */
export function ImportanceKey({ guesses = false }: { guesses?: boolean }) {
    return (
        <section aria-label="How much it counts" className="rounded-xl bg-finn-snow px-3 py-2.5 text-[12.5px] leading-snug ring-1 ring-black/[0.06]">
            <p className="text-finn-black/85">
                <span className="font-black text-finn-highlight-navy">How much it counts: </span>
                {SCALE_EXPLAINED}
            </p>
            <p className="mt-2 flex flex-wrap gap-1.5">
                {IMPORTANCE_LEVELS.map((level) => (
                    <ImportanceBadge key={level} importance={level} />
                ))}
            </p>
            {guesses ? <p className="mt-2 text-finn-black/75">A dashed outline is my guess, where you didn't say how much it counts.</p> : null}
        </section>
    );
}
