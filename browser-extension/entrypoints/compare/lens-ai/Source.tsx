import { ArrowRight, MessageCircle, Save, SlidersHorizontal } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { ruleLabel } from "@/lib/lens-chat/evidence";
import { nameFor, type LensSession, type SavedSearch } from "@/lib/lens-chat/session";

/**
 * Where this page's recommendation comes from.
 *
 * There used to be two answers on screen at once: the page ranked the pinned
 * cars by the reader's saved settings, and a banner above it offered the
 * search they had just built in the chat — so the first thing anyone saw was
 * a recommendation and an invitation to replace it. Now the page has one
 * source at a time, and says which:
 *
 * - opened from the chat, it is that conversation's search, applied without
 *   asking, because pressing the button in the chat *was* the answer;
 * - opened any other way with searches kept, it asks first and shows nothing
 *   until the reader picks;
 * - with nothing kept, there is nothing to ask about.
 */

export type ChosenSource =
    | { kind: "settings" }
    | { kind: "session"; session: LensSession }
    | { kind: "saved"; search: SavedSearch };

export interface SourceOffers {
    session: LensSession | null;
    searches: SavedSearch[];
}

const when = (iso: string): string => {
    const date = new Date(iso);

    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
};

/** What a search is about, in the reader's own words, for recognising it later. */
function Summary({ session }: { session: LensSession }) {
    const budget = session.answers.preferences.monthlyBudget;

    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            {budget > 0 && <Chip>Up to {formatEUR(budget)}/month</Chip>}
            {session.rules.map((rule) => (
                <Chip key={rule.id}>{ruleLabel(rule.id, rule.mode)}</Chip>
            ))}
            {session.answers.priorities.slice(0, 3).map((id) => (
                <Chip key={id}>{CATEGORIES[id].label}</Chip>
            ))}
        </div>
    );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold ring-1 ring-finn-cotton">{children}</span>
);

/**
 * The question asked before anything is ranked: which of the reader's
 * searches is this page about?
 */
export function ChooseSource({ offers, onChoose }: { offers: SourceOffers; onChoose: (source: ChosenSource) => void }) {
    const { session, searches } = offers;

    return (
        <section className="finn-lens-screen-only mb-6 rounded-[22px] bg-white p-5 ring-1 ring-finn-cotton">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">Before Lens ranks anything</p>
            <h2 className="mt-1 text-xl font-black tracking-tight">Which search should this be about?</h2>
            <p className="mt-1 text-sm leading-6 text-finn-iron">
                You have {session ? "a conversation with Lens" : ""}
                {session && searches.length ? " and " : ""}
                {searches.length ? `${searches.length} kept ${searches.length === 1 ? "comparison" : "comparisons"}` : ""}. Pick one, or use
                the settings you saved.
            </p>

            <ul className="mt-4 space-y-2">
                {session && (
                    <li>
                        <Option
                            icon={<MessageCircle aria-hidden="true" className="h-4 w-4" />}
                            eyebrow={`From your chat on finn.com${session.at ? ` · ${when(session.at)}` : ""}`}
                            title={nameFor(session)}
                            note={session.summary}
                            onChoose={() => onChoose({ kind: "session", session })}
                        >
                            <Summary session={session} />
                        </Option>
                    </li>
                )}

                {searches.map((search) => (
                    <li key={search.id}>
                        <Option
                            icon={<Save aria-hidden="true" className="h-4 w-4" />}
                            eyebrow={`Kept comparison${search.at ? ` · ${when(search.at)}` : ""}`}
                            title={search.name}
                            note={search.note}
                            onChoose={() => onChoose({ kind: "saved", search })}
                        >
                            <Summary session={search} />
                        </Option>
                    </li>
                ))}

                <li>
                    <Option
                        icon={<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />}
                        eyebrow="Your saved Lens settings"
                        title="Rank them by my settings"
                        note="The priorities, driving and budget you saved in Settings."
                        onChoose={() => onChoose({ kind: "settings" })}
                    />
                </li>
            </ul>

            <p className="mt-3 text-[11px] leading-4 text-finn-iron">
                Using a search changes this page only. Your saved priorities and profiles stay as they are.
            </p>
        </section>
    );
}

function Option({
    icon,
    eyebrow,
    title,
    note,
    children,
    onChoose,
}: {
    icon: React.ReactNode;
    eyebrow: string;
    title: string;
    note?: string;
    children?: React.ReactNode;
    onChoose: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onChoose}
            className="group flex w-full items-start gap-3 rounded-2xl bg-finn-snow p-4 text-left transition hover:bg-finn-pale-blue"
        >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-finn-accent-blue ring-1 ring-finn-cotton">
                {icon}
            </span>

            <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-finn-iron">{eyebrow}</span>
                <span className="mt-0.5 block text-sm font-black text-finn-black">{title}</span>
                {note && <span className="mt-0.5 block text-xs leading-5 text-finn-iron">{note}</span>}
                {children}
            </span>

            <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-finn-iron transition group-hover:translate-x-0.5 group-hover:text-finn-accent-blue" />
        </button>
    );
}

/** What the page is currently about, and the way back to the other answers. */
export function SourceStrip({
    source,
    detail = null,
    canChange,
    onChange,
}: {
    source: ChosenSource;
    /** Which cars it covers: "Comparing 76 cars matching your filters · 2 no longer available". */
    detail?: string | null;
    /** False when there is nothing else to choose: no session, nothing kept. */
    canChange: boolean;
    onChange: () => void;
}) {
    if (source.kind === "settings" && !canChange) return null;

    const [eyebrow, title] =
        source.kind === "session"
            ? ["From your chat on finn.com", nameFor(source.session)]
            : source.kind === "saved"
              ? ["Kept comparison", source.search.name]
              : ["Your saved Lens settings", "Ranked by the settings you saved"];

    return (
        <section className="finn-lens-screen-only mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-finn-pale-blue px-4 py-3">
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-finn-accent-blue">{eyebrow}</p>
                <p className="mt-0.5 truncate text-sm font-black text-finn-black">{title}</p>
                {detail && <p className="mt-0.5 text-xs leading-5 text-finn-iron">{detail}</p>}
            </div>

            {canChange && (
                <button
                    type="button"
                    onClick={onChange}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-black text-finn-accent-blue ring-1 ring-finn-cotton transition hover:bg-white/60"
                >
                    Use a different search
                </button>
            )}
        </section>
    );
}
