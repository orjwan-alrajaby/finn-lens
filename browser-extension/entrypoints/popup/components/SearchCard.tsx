import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

import { useJudging } from "@/components/JudgedBy";
import { judgeBy, judgingLabel } from "@/lib/lens-chat/judging";
import { loadSavedSearches, markHandOff, nameFor, SAVED_SEARCHES_KEY } from "@/lib/lens-chat/session";
import { openBrowserTab } from "@/lib/utils";

/**
 * The chat's search, where the reader looks first.
 *
 * The popup was written before the chat existed: it counted pinned cars and
 * offered the recommendation as if that were the only way to one. A reader
 * who had worked out what they need with Lens on finn.com found no trace of
 * it here — not the search, not which answers Lens was now judging every car
 * by, and not the searches they had kept.
 */
export function SearchCard() {
    const judging = useJudging();
    const [kept, setKept] = useState(0);

    useEffect(() => {
        const read = () => void loadSavedSearches().then((searches) => setKept(searches.length));
        const listener = (changes: Record<string, unknown>, area: string) => {
            if (area === "local" && SAVED_SEARCHES_KEY in changes) read();
        };

        read();
        browser.storage.onChanged.addListener(listener);

        return () => browser.storage.onChanged.removeListener(listener);
    }, []);

    const session = judging?.by === "chat" ? judging.session : (judging?.chat ?? null);

    if (!judging || (!session && !kept)) return null;

    const label = judgingLabel(judging);

    return (
        <section className="mt-3 rounded-[22px] bg-white px-4 py-3 shadow-sm">
            {session && (
                <>
                    <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-finn-accent-blue">
                        <MessageCircle aria-hidden="true" className="h-3 w-3" />
                        Your search with Lens
                    </p>
                    <p className="mt-1 text-sm font-black text-finn-black">{nameFor(session)}</p>
                    <p className="text-xs leading-5 text-finn-iron">
                        {session.headline.replace(/^Comparing /, "")} ·{" "}
                        {session.basis === "settings" ? "ranked by your settings and filters" : "ranked by what you told the chat"}
                    </p>

                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-finn-snow px-3 py-2">
                        <p className="text-[11px] leading-4 text-finn-iron">
                            Badges and pages: <span className="font-black text-finn-black">{label.short.toLowerCase()}</span>
                        </p>
                        {label.switchTo && (
                            <button
                                type="button"
                                onClick={() => void judgeBy(judging.by === "chat" ? "settings" : "chat")}
                                className="shrink-0 text-[11px] font-black text-finn-accent-blue hover:underline"
                            >
                                {judging.by === "chat" ? "Use settings" : "Use my chat"}
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => void markHandOff().then(() => openBrowserTab("OPEN_COMPARE_PAGE"))}
                        className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-full bg-finn-accent-blue px-4 text-xs font-black text-white transition hover:bg-finn-highlight-navy"
                    >
                        Open its recommendation
                    </button>
                </>
            )}

            {kept > 0 && (
                <button
                    type="button"
                    onClick={() => void openBrowserTab("OPEN_SETTINGS_PAGE", { tab: "searches" })}
                    className={`${session ? "mt-2" : ""} w-full text-center text-[11px] font-black text-finn-accent-blue hover:underline`}
                >
                    {kept} kept {kept === 1 ? "search" : "searches"} · manage
                </button>
            )}
        </section>
    );
}
