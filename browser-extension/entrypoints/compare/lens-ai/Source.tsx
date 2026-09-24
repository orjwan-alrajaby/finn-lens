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
                            eyebrow={`From your chat on finn.com${session.at ? ` · ${when(session.at)}` : ""} · ${session.carIds.length} cars`}
                            title={nameFor(session)}
                            note={[
                                session.summary !== nameFor(session) ? session.summary : "",
                                session.basis === "settings" ? "Ranked by your settings and filters" : "Ranked by what you told the chat",
                            ]
                                .filter(Boolean)
                                .join(" · ")}
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
                            eyebrow={`Kept comparison${search.at ? ` · ${when(search.at)}` : ""} · ${search.carIds.length} cars`}
                            title={search.name}
                            note={[...new Set(search.note.split(" · "))].filter((part) => part && part !== search.name).join(" · ") || undefined}
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
                        note="The priorities, driving and budget you saved in Settings — over your pinned cars, or the chat's cars when fewer than two are pinned. You can change which cars on the next screen."
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

/** Which cars the page ranks: the reader's pins, or the cars a search compared. */
export type CarsChoice =
    | { kind: "pinned" }
    | { kind: "search"; search: LensSession; from: "chat" | "kept"; name: string };

/**
 * What this page is, in two parts the reader can change separately.
 *
 * Choosing a search used to decide two things at once: whose answers rank the
 * cars, and which cars. "Rank them by my settings" therefore also meant "and
 * only my pinned cars" — and with nothing pinned it showed nothing at all,
 * though the reader had just been looking at seventy cars in the chat. Now
 * the page says both, and either can be changed without the other: the chat's
 * cars ranked by the settings, the pinned cars ranked by the chat.
 */
export function SourceBar({
    source,
    offers,
    cars,
    pinnedCount,
    detail,
    onAnswers,
    onCars,
    onBrowse,
}: {
    source: ChosenSource;
    offers: SourceOffers;
    cars: CarsChoice;
    pinnedCount: number;
    /** What happened to the cars: "2 no longer available · 3 set aside by your chat's rules". */
    detail: string | null;
    onAnswers: (chosen: ChosenSource) => void;
    onCars: (choice: CarsChoice) => void;
    /** Back to the full list of searches, with what each is about. */
    onBrowse: () => void;
}) {
    const answersValue = source.kind === "session" ? "session" : source.kind === "saved" ? `saved:${source.search.id}` : "settings";
    const carsValue = cars.kind === "pinned" ? "pinned" : cars.from === "chat" ? "chat" : `kept:${cars.search.carIds.length}`;
    const kept = source.kind === "saved" ? source.search : null;

    const pickAnswers = (value: string) => {
        if (value === "settings") onAnswers({ kind: "settings" });
        else if (value === "session" && offers.session) onAnswers({ kind: "session", session: offers.session });
        else {
            const search = offers.searches.find((item) => `saved:${item.id}` === value);
            if (search) onAnswers({ kind: "saved", search });
        }
    };

    const pickCars = (value: string) => {
        if (value === "pinned") onCars({ kind: "pinned" });
        else if (value === "chat" && offers.session) onCars({ kind: "search", search: offers.session, from: "chat", name: nameFor(offers.session) });
        else if (kept) onCars({ kind: "search", search: kept, from: "kept", name: kept.name });
    };

    const select =
        "mt-1 h-10 w-full min-w-0 truncate rounded-xl bg-white px-3 pr-8 text-sm font-black text-finn-black ring-1 ring-finn-cotton outline-none focus:ring-2 focus:ring-finn-accent-blue";

    return (
        <section className="finn-lens-screen-only mb-4 rounded-[22px] bg-finn-pale-blue px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="block min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-finn-accent-blue">
                    Ranked by
                    <select value={answersValue} onChange={(event) => pickAnswers(event.target.value)} className={select}>
                        {offers.session && <option value="session">Your chat: {nameFor(offers.session)}</option>}
                        {offers.searches.map((search) => (
                            <option key={search.id} value={`saved:${search.id}`}>
                                Kept search: {search.name}
                            </option>
                        ))}
                        <option value="settings">Your saved Lens settings</option>
                    </select>
                </label>

                <label className="block min-w-0 text-[10px] font-black uppercase tracking-[0.14em] text-finn-accent-blue">
                    Cars
                    <select value={carsValue} onChange={(event) => pickCars(event.target.value)} className={select}>
                        <option value="pinned" disabled={pinnedCount === 0}>
                            {pinnedCount ? `Your ${pinnedCount} pinned ${pinnedCount === 1 ? "car" : "cars"}` : "Your pinned cars (none yet)"}
                        </option>
                        {offers.session && (
                            <option value="chat">
                                The {offers.session.carIds.length} from your chat ({offers.session.headline.replace(/^Comparing /, "")})
                            </option>
                        )}
                        {kept && <option value={`kept:${kept.carIds.length}`}>The {kept.carIds.length} from “{kept.name}”</option>}
                    </select>
                </label>

                {offers.searches.length > 0 && (
                    <button
                        type="button"
                        onClick={onBrowse}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-4 text-xs font-black text-finn-accent-blue ring-1 ring-finn-cotton transition hover:bg-white/60"
                    >
                        All searches
                    </button>
                )}
            </div>

            {detail && <p className="mt-2 text-xs leading-5 text-finn-iron">{detail}</p>}
        </section>
    );
}
