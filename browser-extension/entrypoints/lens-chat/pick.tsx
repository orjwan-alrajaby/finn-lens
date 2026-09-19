import { ArrowRight, Eye, Pin } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import { FIT_BANDS } from "@/lib/reasoning-engine/fit";
import type { FitStory } from "@/lib/lens-chat/fit-story";
import { matchSentence } from "@/lib/lens-chat/plain";
import type { CarLine } from "@/lib/lens-chat/run";

import type { CarActions } from "./cards";

/*
 * "It isn't an SUV", "FINN files it as a van": true, and a strange thing to
 * offer as a reason to look at a car. What the reader ruled out is a filter
 * Lens already applied, so the case for the car is made of what it has. Both
 * lines are still there under "See why", where the check itself is the point.
 */
const ABSENCE = /^(It isn't |FINN files it as )/;

/**
 * What Lens would look at first — one card, once.
 *
 * The chat used to answer by appending a recommendation to the transcript,
 * then another one under the next message, each carrying its own evidence,
 * ranking and row of buttons. A reader scrolling back found four answers and
 * no way to tell which was current. There is one of these now, at the foot of
 * the conversation, and a new comparison changes it rather than joining it.
 *
 * It says the answer, the case for it in a few words, and the one thing the
 * reader gives up. Everything behind that — what Lens checked, what else it
 * ranked, how it weighed anything — is a tap away in the inspector, where
 * someone who wants it can read it without the rest of the conversation
 * having to carry it.
 */
export function PickCard({
    story,
    car,
    alternative,
    actions,
    onWhy,
    onAlternatives,
}: {
    story: FitStory;
    car: CarLine;
    /** The nearest thing worth naming, when there is one. */
    alternative: CarLine | null;
    actions: CarActions;
    onWhy: () => void;
    onAlternatives: () => void;
}) {
    const pinned = actions.pinnedIds.has(car.id);
    /*
     * Facts, not a second copy of the sentence above them. The sentence says
     * which of their needs this car covers; these say what FINN publishes that
     * makes it true — three at most, because the case for a car is a sentence
     * and a handful of facts, not an inventory.
     */
    const evidence = story.sections
        .filter((section) => section.kind === "need")
        .flatMap((section) => section.lines.filter((line) => line.tone === "good" && !ABSENCE.test(line.text)).slice(0, 1))
        .slice(0, 3)
        .map((line) => line.text);

    return (
        <section className="rounded-[20px] bg-white p-4 ring-1 ring-finn-cotton">
            <p className="text-[11px] font-bold text-finn-iron">{story.eyebrow}</p>

            <h3 className="mt-1 text-[17px] font-black leading-6 text-finn-black">{story.carName}</h3>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] leading-5">
                <span className="font-black text-finn-black">
                    {car.costComplete ? "" : "from "}
                    {formatEUR(car.monthly)}/month
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${FIT_BANDS[car.band].chipClass}`}>{car.bandLabel}</span>
            </p>

            <p className="mt-2.5 text-sm leading-6 text-finn-black">{matchSentence(story)}</p>

            {evidence.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[13px] leading-5 text-finn-iron">
                    {evidence.map((line) => (
                        <li key={line}>· {line}</li>
                    ))}
                </ul>
            )}

            {story.catch && (
                <p className="mt-2.5 text-[13px] leading-5 text-finn-black">
                    <span className="font-black">Main compromise: </span>
                    {story.catch.text}
                </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" onClick={onWhy} className="inline-flex items-center gap-1 text-[13px] font-black text-finn-accent-blue hover:underline">
                    See why
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </button>

                {alternative && (
                    <button
                        type="button"
                        onClick={onAlternatives}
                        className="inline-flex items-center gap-1 text-[13px] font-bold text-finn-iron hover:text-finn-black"
                    >
                        Other options
                    </button>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-finn-cotton pt-3">
                <Action onClick={() => actions.onPin(car.id, !pinned)} pressed={pinned}>
                    <Pin aria-hidden="true" className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
                    {pinned ? "Pinned" : "Pin"}
                </Action>

                {actions.canShow(car.id) && (
                    <Action onClick={() => actions.onShow(car.id)}>
                        <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                        Show on page
                    </Action>
                )}
            </div>
        </section>
    );
}

function Action({ children, onClick, pressed }: { children: React.ReactNode; onClick: () => void; pressed?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition ${
                pressed ? "bg-finn-pale-blue text-finn-accent-blue" : "text-finn-iron hover:bg-finn-snow hover:text-finn-black"
            }`}
        >
            {children}
        </button>
    );
}
