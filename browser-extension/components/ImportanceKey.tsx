import type { NeedImportance } from "@/lib/lens-ai/contract";
import { IMPORTANCE, IMPORTANCE_LEVELS } from "@/lib/lens-chat/importance";

/**
 * How much something counts, as a badge — Top priority · Important · Nice to
 * have — and the key that says what each means, wherever Lens says back
 * what it understood. A badge Lens guessed, because the reader never said
 * how much that thing counts, has a dashed outline, and the key says so.
 */

export function ImportanceBadge({ importance, guess = false }: { importance: NeedImportance; guess?: boolean }) {
    return (
        /* No hover title: nothing in the chat explains itself on hover. The key says what a dashed one is. */
        <span
            className={[
                "shrink-0 rounded-full bg-finn-pale-blue px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue",
                guess ? "outline-1 outline-dashed outline-offset-1 outline-finn-accent-blue/60" : "",
            ].join(" ")}
        >
            {IMPORTANCE[importance].label}
        </span>
    );
}

/** What the three levels mean, in the badges' own look; and what a dashed one is, where there is one. */
export function ImportanceKey({ guesses = false }: { guesses?: boolean }) {
    return (
        <section aria-label="How much each counts" className="rounded-xl bg-finn-snow px-3 py-2.5 ring-1 ring-black/[0.03]">
            <p className="text-[11px] font-black uppercase tracking-wide text-finn-highlight-navy">How much each counts</p>
            <dl className="mt-1.5 space-y-1.5 text-[11.5px] leading-snug">
                {IMPORTANCE_LEVELS.map((level) => (
                    <div key={level} className="grid grid-cols-[92px_1fr] items-start gap-2">
                        <dt>
                            <ImportanceBadge importance={level} />
                        </dt>
                        <dd className="text-finn-black/80">{IMPORTANCE[level].means}</dd>
                    </div>
                ))}
            </dl>
            <p className="mt-2 text-[11px] leading-snug text-finn-iron">
                None of them rules a car out — that's what deal-breakers are for.
                {guesses ? " A dashed outline is my guess, where you didn't say how much it counts." : ""}
            </p>
        </section>
    );
}
