import { ChevronRight, CircleCheck, CircleDot, CircleHelp, CircleX, ExternalLink, Eye, MessageCircleQuestion, Pin, Rows3, Scale } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import type { FitStory, StorySection, Tone } from "@/lib/lens-chat/fit-story";
import { matchSentence } from "@/lib/lens-chat/plain";
import type { CarLine } from "@/lib/lens-chat/run";

import { BandChip, SmallButton, type CarActions } from "./cards";

/*
 * "It isn't an SUV", "FINN files it as a van": true, and a strange thing to
 * offer as a reason to look at a car. What the reader ruled out is a filter
 * Lens already applied, so the case for the car is made of what it has.
 */
const ABSENCE = /^(It isn't |FINN files it as )/;

/** The line that says equipment is on nearly every car here — true, and never the reason. */
const COMMON = /nearly every car here/;

/** The small uppercase label every Lens section opens with. */
export const EYEBROW = "text-[10px] font-black uppercase tracking-[0.16em]";

/**
 * What Lens would look at first — one card, once, at the foot of the
 * conversation, changed rather than repeated when the comparison changes.
 *
 * Drawn the way the recommendation page draws its answer: a navy block with
 * the car, its price and its fit, then, in white, what it does for each thing
 * the reader said, the one thing they'd give up, and the cars close behind —
 * each of which opens against the match, need by need.
 */
export function PickCard({
    story,
    level,
    car,
    alternative,
    alternatives,
    actions,
    onWhy,
    onAlternatives,
    onCar,
    onOpenPage,
    basis = "chat",
}: {
    story: FitStory;
    /**
     * What the ranking was built from: what the reader told the chat, or their
     * saved settings with this page's filters. Said under the card, because
     * the two look identical and mean different things.
     */
    basis?: "chat" | "settings";
    /** Cars Lens shows as the same match, and whether this is the cheapest of them. */
    level?: { others: number; cheapest: boolean; nextUp: number | null } | null;
    car: CarLine;
    /** The nearest thing worth naming, when there is one. */
    alternative: CarLine | null;
    /** The closest few, for the row under the card. Falls back to `alternative`. */
    alternatives?: CarLine[];
    actions: CarActions;
    onWhy: () => void;
    onAlternatives: () => void;
    /** A car in "Also close" was tapped: show it against the match. */
    onCar?: (carId: number) => void;
    /** Take this search to the recommendation page, which then opens on it. */
    onOpenPage?: () => void;
}) {
    const pinned = actions.pinnedIds.has(car.id);
    const others = alternatives ?? (alternative ? [alternative] : []);
    const needs = story.sections.filter((section) => section.kind === "need");
    const money = story.sections.find((section) => section.key === "budget");
    const shown = needs.slice(0, 4);

    return (
        <section className="overflow-hidden rounded-[22px] bg-finn-pale-blue">
            <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">{story.eyebrow}</p>

                <div className="mt-2 flex items-start gap-3">
                    {car.image && (
                        <img
                            src={car.image}
                            alt=""
                            /* A photo FINN's CDN won't serve is a white box; better no photo at all. */
                            onError={(event) => {
                                event.currentTarget.style.display = "none";
                            }}
                            className="h-12 w-[72px] shrink-0 rounded-xl bg-white object-cover"
                        />
                    )}

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="text-base font-black leading-5 text-finn-black">{story.carName}</h3>
                            <BandChip car={car} score={car.total} />
                        </div>

                        <p className="mt-0.5 text-[11px] leading-4 text-finn-iron">
                            {[car.configuration, `${car.costComplete ? "~" : "from "}${formatEUR(car.monthly)}/month`].filter(Boolean).join(" · ")}
                        </p>
                        {money && <p className={`text-[11px] font-bold leading-4 ${toneText(money.tone)}`}>{money.title}</p>}
                    </div>
                </div>

                <p className="mt-3 text-[13px] font-semibold leading-5 text-finn-black">{matchSentence(story)}</p>

                {/*
                  * Where other cars carry the same match, the price is the
                  * reason this one is the pick — and saying so is the
                  * difference between an answer and an arbitrary choice.
                  */}
                {level && level.cheapest && (
                    <p className="mt-2 text-[11px] leading-4 text-finn-iron">
                        {level.others === 1 ? "One other car here matches the same" : `${level.others} other cars here match the same`} on what Lens can check
                        {level.nextUp ? `, and this is the cheaper by ${formatEUR(level.nextUp)}/month` : ", and this is the cheapest of them"}.
                    </p>
                )}
            </div>

            {/* What it does for each thing they said, read off this car. */}
            {shown.length > 0 && (
                <div className="bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-finn-accent-blue">Against what you told me</p>
                    <ul className="mt-1.5 divide-y divide-finn-cotton">
                        {shown.map((section) => (
                            <NeedRow key={section.key} section={section} />
                        ))}
                    </ul>
                    <button type="button" onClick={onWhy} className="mt-2 text-[11px] font-black text-finn-accent-blue hover:underline">
                        {needs.length > shown.length ? `All ${needs.length} things Lens checked →` : "Everything Lens checked →"}
                    </button>
                </div>
            )}

            {story.catch && (
                <div className="bg-finn-warning/10 px-4 py-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-finn-warning-deep">
                        <Scale aria-hidden="true" className="h-3 w-3" />
                        Main trade-off
                    </p>
                    <p className="mt-1 text-xs leading-5 text-finn-black">{story.catch.text}</p>
                    {story.catch.alternative && <p className="mt-0.5 text-xs leading-5 text-finn-iron">{story.catch.alternative}</p>}
                </div>
            )}

            {others.length > 0 && (
                <div className="bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-finn-iron">Closest alternatives · tap to compare</p>

                    <ul className="mt-1.5 divide-y divide-finn-cotton">
                        {others.map((other) => (
                            <li key={other.id}>
                                <button
                                    type="button"
                                    onClick={() => (onCar ? onCar(other.id) : onAlternatives())}
                                    className="w-full py-1.5 text-left transition hover:bg-finn-pale-blue/40"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 truncate text-xs font-black text-finn-black">{other.name}</span>
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            <span className="text-[10px] font-bold text-finn-iron">{formatEUR(other.monthly)}/mo</span>
                                            <BandChip car={other} score={other.total} />
                                            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-finn-iron" />
                                        </span>
                                    </div>
                                    {other.budget === "over" && <p className="text-[10px] font-bold text-finn-warning-deep">over budget</p>}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-wrap gap-1.5 border-t border-white/60 bg-white px-4 py-3">
                <SmallButton tone={pinned ? "quiet" : "solid"} pressed={pinned} onClick={() => actions.onPin(car.id, !pinned)}>
                    <Pin aria-hidden="true" className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
                    {pinned ? "Pinned" : "Pin this car"}
                </SmallButton>

                <SmallButton onClick={onWhy}>
                    <MessageCircleQuestion aria-hidden="true" className="h-3.5 w-3.5" />
                    Why this car?
                </SmallButton>

                {others.length > 0 && (
                    <SmallButton onClick={onAlternatives}>
                        <Rows3 aria-hidden="true" className="h-3.5 w-3.5" />
                        Compare alternatives
                    </SmallButton>
                )}

                {actions.canShow(car.id) && (
                    <SmallButton onClick={() => actions.onShow(car.id)}>
                        <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                        Show on page
                    </SmallButton>
                )}

                {onOpenPage && (
                    <SmallButton onClick={onOpenPage}>
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                        Open the full recommendation
                    </SmallButton>
                )}
            </div>

            <p className="bg-white px-4 pb-3 text-[10px] leading-4 text-finn-iron">
                {basis === "chat"
                    ? "Ranked by Lens's own scoring, from what you told me in this chat. Nothing is pinned unless you pin it."
                    : "Ranked by Lens's own scoring, from your saved Lens settings and this page's filters. Nothing is pinned unless you pin it."}
            </p>
        </section>
    );
}

const toneText = (tone: Tone) =>
    tone === "good" ? "text-finn-influence-emerald" : tone === "missing" ? "text-finn-influence-red" : tone === "note" ? "text-finn-warning-deep" : "text-finn-iron";

const TONE_LABEL: Record<Tone, string> = { good: "Covered", note: "Partly covered", missing: "Not covered", unknown: "Lens can't tell" };

/** Covered, partly, not, or unknown — the outline marks the recommendation page's evidence chips use. */
function ToneIcon({ tone, className = "h-4 w-4" }: { tone: Tone; className?: string }) {
    const base = `${className} shrink-0`;

    return tone === "good" ? (
        <CircleCheck aria-hidden="true" strokeWidth={2.25} className={`${base} text-finn-influence-emerald`} />
    ) : tone === "missing" ? (
        <CircleX aria-hidden="true" strokeWidth={2.25} className={`${base} text-finn-influence-red`} />
    ) : tone === "note" ? (
        <CircleDot aria-hidden="true" strokeWidth={2.25} className={`${base} text-finn-warning-deep`} />
    ) : (
        <CircleHelp aria-hidden="true" strokeWidth={2.25} className={`${base} text-finn-iron`} />
    );
}

/** The mark with its meaning attached, for anywhere a verdict is shown on its own. */
export function ToneMark({ tone, size = "md" }: { tone: Tone; size?: "sm" | "md" }) {
    return (
        <span role="img" aria-label={TONE_LABEL[tone]} className="inline-flex shrink-0">
            <ToneIcon tone={tone} className={size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
        </span>
    );
}

/** One of their needs, and what FINN lists on this car for it. */
function NeedRow({ section }: { section: StorySection }) {
    /*
     * What sets it apart, not what every car has: the first thing it has
     * and, where it falls short, the first thing it lacks — "so does nearly
     * every car here" is true and the least useful line to lead with.
     */
    const telling = section.lines.filter((line) => !ABSENCE.test(line.text) && !COMMON.test(line.text));
    const has = telling.find((line) => line.tone === "good");
    const lacks = telling.find((line) => line.tone === "missing" || line.tone === "unknown");
    const detail =
        [has, lacks].filter(Boolean).map((line) => line!.text).join(" ") ||
        telling[0]?.text ||
        section.lines.find((line) => !ABSENCE.test(line.text))?.text ||
        /*
         * Unless that leaves nothing. "It isn't an SUV" is noise under a need
         * about carrying children, which is what the filter above is for — but
         * under "Not an SUV" it is the whole answer, and dropping it left the
         * row as a heading with blank space beneath it.
         */
        section.lines[0]?.text;

    return (
        <li className="flex gap-2 py-1.5">
            <span className="mt-0.5">
                <ToneMark tone={section.tone} size="sm" />
            </span>
            <div className="min-w-0">
                <p className="text-xs font-black leading-4 text-finn-black">{section.short}</p>
                {detail && <p className="text-[11px] leading-4 text-finn-iron">{detail}</p>}
            </div>
        </li>
    );
}

function Action({ children, onClick, pressed }: { children: React.ReactNode; onClick: () => void; pressed?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12px] font-black transition ${
                pressed ? "bg-finn-highlight-navy text-white" : "bg-white text-finn-highlight-navy ring-1 ring-finn-highlight-navy/25 hover:ring-finn-highlight-navy"
            }`}
        >
            {children}
        </button>
    );
}
