import type { ReactNode } from "react";
import { Pin } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import { FIT_BANDS } from "@/lib/reasoning-engine/fit";
import type { CarLine } from "@/lib/lens-chat/run";

/**
 * The chat's readings of a Lens result, drawn in the advice page's language:
 * the fit bands and their colours, blue for the case for a car, amber for the
 * other side of it, grey for the reader's own answers read back.
 */

/**
 * The verdict on a car — and, where there is one, the number behind it.
 *
 * Four cars all labelled "Strong match" read as four identical cars, which is
 * how a reader ends up asking why the dearer one won. The band is the word
 * for the score; showing the score beside it is what makes two cars on the
 * same label comparable at a glance.
 */
export function BandChip({ car, score }: { car: Pick<CarLine, "band" | "bandLabel">; score?: number | null }) {
    return (
        <span className="inline-flex shrink-0 items-center gap-1">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${FIT_BANDS[car.band].chipClass}`}>{car.bandLabel}</span>
            {score != null && car.band !== "unknown" && (
                <span className="text-[10px] font-black tabular-nums text-finn-iron" title="Lens's overall match, out of 100">
                    {score}
                </span>
            )}
        </span>
    );
}

export function SmallButton({
    children,
    onClick,
    tone = "quiet",
    pressed,
    disabled,
}: {
    children: ReactNode;
    onClick: () => void;
    tone?: "solid" | "quiet";
    pressed?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={pressed}
            className={[
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-50",
                tone === "solid"
                    ? "bg-finn-accent-blue text-white hover:bg-finn-highlight-navy"
                    : "bg-white text-finn-black ring-1 ring-finn-cotton hover:bg-finn-pale-blue",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

const budgetText: Record<CarLine["budget"], string | null> = {
    within: null,
    notSet: null,
    over: "over budget",
    unknown: "can't confirm budget",
};

const rentalText: Record<CarLine["rental"], string | null> = {
    fits: null,
    notSet: null,
    doesNotFit: "doesn't fit your dates",
    unknown: "dates unconfirmed",
};

function Flags({ car }: { car: CarLine }) {
    const flags = [budgetText[car.budget], rentalText[car.rental]].filter(Boolean);

    if (!flags.length) return null;

    return (
        <span className="text-[10px] font-bold text-finn-warning-deep">{flags.join(" · ")}</span>
    );
}

export interface CarActions {
    pinnedIds: Set<number>;
    onPin: (carId: number, pinned: boolean) => void;
    /** Present only for cars the page actually draws. */
    canShow: (carId: number) => boolean;
    onShow: (carId: number) => void;
}

/* -------------------------------------------------------------------------- */

export function CompareCard({
    rows,
    headline,
    actions,
}: {
    rows: (CarLine & { isMatch: boolean; rank: number })[];
    headline: string;
    actions: CarActions;
}) {
    const unpinned = rows.filter((row) => !actions.pinnedIds.has(row.id));

    return (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-finn-cotton">
            <div className="px-4 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">Compared by Lens</p>
                <p className="mt-0.5 text-xs text-finn-iron">{headline}</p>
            </div>

            <ul className="mt-2 divide-y divide-finn-cotton">
                {rows.map((row) => (
                    <li key={row.id} className={`px-4 py-2 ${row.isMatch ? "bg-finn-pale-blue/60" : ""}`}>
                        <div className="flex items-center gap-2">
                            <span className="w-5 shrink-0 text-[10px] font-black text-finn-iron">#{row.rank}</span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black text-finn-black">
                                    {row.name}
                                    {row.isMatch && <span className="ml-1.5 text-[10px] text-finn-accent-blue">your match</span>}
                                </p>
                                <p className="text-[10px] text-finn-iron">
                                    Match {row.total} · {row.costComplete ? "~" : "from "}
                                    {formatEUR(row.monthly)}/mo
                                </p>
                                <Flags car={row} />
                            </div>
                            <BandChip car={row} />
                            <button
                                type="button"
                                aria-pressed={actions.pinnedIds.has(row.id)}
                                aria-label={actions.pinnedIds.has(row.id) ? `Unpin ${row.name}` : `Pin ${row.name}`}
                                onClick={() => actions.onPin(row.id, !actions.pinnedIds.has(row.id))}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-finn-accent-blue transition hover:bg-finn-pale-blue"
                            >
                                <Pin aria-hidden="true" className={`h-3.5 w-3.5 ${actions.pinnedIds.has(row.id) ? "fill-current" : ""}`} />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            {unpinned.length > 1 && (
                <div className="border-t border-finn-cotton px-4 py-3">
                    <SmallButton onClick={() => unpinned.forEach((row) => actions.onPin(row.id, true))}>
                        <Pin aria-hidden="true" className="h-3.5 w-3.5" />
                        Pin these {unpinned.length} cars
                    </SmallButton>
                </div>
            )}
        </section>
    );
}
