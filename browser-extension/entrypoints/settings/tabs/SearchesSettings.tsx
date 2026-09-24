import { useEffect, useState } from "react";
import { ArrowRight, Check, MessageCircle, Pencil, Trash2 } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import { ruleLabel } from "@/lib/lens-chat/evidence";
import {
    deleteSearch,
    loadSavedSearches,
    markHandOff,
    SAVED_SEARCHES_KEY,
    saveSearch,
    type SavedSearch,
} from "@/lib/lens-chat/session";
import { openBrowserTab } from "@/lib/utils";

import { Section } from "../components/primitives";

/**
 * The searches the reader kept, where the rest of their Lens things live.
 *
 * "Keep this search" in the chat put a search somewhere only one screen could
 * see: the list of sources on the recommendation page, reached only by
 * opening that page with something to choose between. There was no way to see
 * what had been kept, to tell two apart, to rename one or to let one go
 * without deleting all of them from the Data tab.
 */
export function SearchesSettings() {
    const [searches, setSearches] = useState<SavedSearch[] | null>(null);

    useEffect(() => {
        const read = () => void loadSavedSearches().then(setSearches);
        const listener = (changes: Record<string, unknown>, area: string) => {
            if (area === "local" && SAVED_SEARCHES_KEY in changes) read();
        };

        read();
        browser.storage.onChanged.addListener(listener);

        return () => browser.storage.onChanged.removeListener(listener);
    }, []);

    return (
        <Section
            title="Your searches"
            description="Searches you kept from a conversation with Lens. Each one is its own answers and its own cars, apart from your settings: opening one ranks its cars by what you told the chat, and your saved settings stay as they are."
        >
            {searches === null ? null : searches.length === 0 ? (
                <div className="rounded-2xl bg-finn-snow p-4 text-sm leading-6 text-finn-iron">
                    <p className="font-black text-finn-black">Nothing kept yet</p>
                    <p className="mt-1">
                        In Ask Lens on finn.com, open <span className="font-bold">Your needs</span> after a comparison and choose{" "}
                        <span className="font-bold">Keep this search</span>. It will be here, and on the recommendation page, whenever you want it
                        back.
                    </p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {searches.map((search) => (
                        <SearchRow key={search.id} search={search} />
                    ))}
                </ul>
            )}
        </Section>
    );
}

const when = (iso: string) => {
    const date = new Date(iso);

    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

function SearchRow({ search }: { search: SavedSearch }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(search.name);
    const [confirming, setConfirming] = useState(false);
    const budget = search.answers.preferences.monthlyBudget;

    const rename = () => {
        const next = name.trim();

        if (next && next !== search.name) void saveSearch({ ...search, name: next });
        setEditing(false);
    };

    return (
        <li className="rounded-2xl bg-finn-snow p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-finn-iron">
                        <MessageCircle aria-hidden="true" className="h-3 w-3" />
                        Kept {when(search.at)} · {search.basis === "settings" ? "built from your settings and filters" : "from what you told the chat"}
                    </p>

                    {editing ? (
                        <form
                            className="mt-1 flex items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                rename();
                            }}
                        >
                            <input
                                value={name}
                                autoFocus
                                maxLength={60}
                                onChange={(event) => setName(event.target.value)}
                                aria-label="Name of this search"
                                className="h-9 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm font-black text-finn-black ring-1 ring-finn-cotton outline-none focus:ring-2 focus:ring-finn-accent-blue"
                            />
                            <button type="submit" aria-label="Save the name" className="flex h-9 w-9 items-center justify-center rounded-full bg-finn-accent-blue text-white">
                                <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                            </button>
                        </form>
                    ) : (
                        <p className="mt-1 text-sm font-black text-finn-black">{search.name}</p>
                    )}

                    {/* Searches kept before notes were de-duplicated can repeat the name: say each thing once. */}
                    {(() => {
                        const note = [...new Set(search.note.split(" · "))].filter((part) => part && part !== search.name).join(" · ");

                        return note ? <p className="mt-0.5 text-xs leading-5 text-finn-iron">{note}</p> : null;
                    })()}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <Chip>{search.headline.replace(/^Comparing /, "")}</Chip>
                        {budget > 0 && <Chip>Up to {formatEUR(budget)}/month</Chip>}
                        {search.rules.map((rule) => (
                            <Chip key={rule.id}>{ruleLabel(rule.id, rule.mode)}</Chip>
                        ))}
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => void markHandOff(search.id).then(() => openBrowserTab("OPEN_COMPARE_PAGE"))}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-finn-accent-blue px-4 text-xs font-black text-white transition hover:bg-finn-highlight-navy"
                    >
                        Open its recommendation
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        aria-label={`Rename ${search.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-finn-iron ring-1 ring-finn-cotton transition hover:text-finn-black"
                    >
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                    {confirming ? (
                        <button
                            type="button"
                            onClick={() => void deleteSearch(search.id)}
                            className="inline-flex h-9 items-center rounded-full bg-finn-error px-3 text-xs font-black text-white"
                        >
                            Delete it
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirming(true)}
                            aria-label={`Delete ${search.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-finn-iron ring-1 ring-finn-cotton transition hover:text-finn-error"
                        >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold ring-1 ring-finn-cotton">{children}</span>
);
