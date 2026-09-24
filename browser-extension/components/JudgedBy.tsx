import { useEffect, useState } from "react";
import { MessageCircle, SlidersHorizontal } from "lucide-react";

import { currentJudging, judgeBy, judgingLabel, watchJudging, type Judging } from "@/lib/lens-chat/judging";

/**
 * Whose answers the page is judging by, kept current.
 *
 * Read once and again whenever the chat's search, the reader's switch or the
 * saved settings change — in any tab — so a page never shows verdicts by one
 * while saying it uses the other.
 */
export function useJudging(): Judging | null {
    const [judging, setJudging] = useState<Judging | null>(null);

    useEffect(() => {
        let live = true;
        const read = () =>
            void currentJudging().then((next) => {
                if (live) setJudging(next);
            });

        read();
        const stop = watchJudging(read);

        return () => {
            live = false;
            stop();
        };
    }, []);

    return judging;
}

/**
 * The line that says whose answers every verdict on the page is by, with the
 * other one a tap away when there is one.
 *
 * The chat and the saved settings can rank the same cars differently. Every
 * page that shows a verdict says which it used, the same way, so the reader
 * never has to work out why the pinned cars page disagrees with the chat.
 */
export function JudgedBy({ judging, className = "" }: { judging: Judging; className?: string }) {
    const label = judgingLabel(judging);
    const chat = judging.by === "chat";

    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-finn-pale-blue px-4 py-3 ${className}`}>
            <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-finn-accent-blue ring-1 ring-finn-cotton">
                    {chat ? <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" /> : <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-finn-accent-blue">{label.short}</p>
                    <p className="text-sm font-bold leading-5 text-finn-black">{label.long}</p>
                    <p className="text-xs leading-5 text-finn-iron">
                        {chat
                            ? "Badges on finn.com, this page and the recommendation all use your conversation's answers until you start a new one."
                            : "The priorities, driving and budget you saved in Settings."}
                    </p>
                </div>
            </div>

            {label.switchTo && (
                <button
                    type="button"
                    onClick={() => void judgeBy(chat ? "settings" : "chat")}
                    className="inline-flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-xs font-black text-finn-accent-blue ring-1 ring-finn-cotton transition hover:bg-white/70"
                >
                    {label.switchTo}
                </button>
            )}
        </div>
    );
}
