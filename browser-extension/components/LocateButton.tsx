import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";

import { WINNER_GOLD } from "./lens-parts";

/**
 * "Show me that car": scrolls FINN's page to its card and lights it up.
 *
 * Wherever Lens names another car — one that does better on something, one
 * that came next — the reader can go and look at it, rather than hunt for it
 * on a page of twenty-four. The same mark as the drawer's own, so it reads as
 * the same action everywhere. A car that isn't on this page any more says so
 * instead of doing nothing.
 */

type Located = { shown: boolean } | null | void;

export function LocateButton({
    name,
    onLocate,
    size = "md",
    label,
    winner = false,
}: {
    /** The car, for the button's name: "Show the MG ZS on the page". */
    name?: string;
    onLocate: () => Promise<Located> | Located;
    /** `md` is the drawer's footer button; `sm` sits beside a car in a list; `text` sits after a sentence. */
    size?: "md" | "sm" | "text";
    /** The words on a `text` button. */
    label?: string;
    /** It goes to the winner: in the winner's gold, as everything that goes to it is. */
    winner?: boolean;
}) {
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        if (!missing) return;
        const timer = window.setTimeout(() => setMissing(false), 2400);
        return () => window.clearTimeout(timer);
    }, [missing]);

    const named = name ? `Show the ${name} on the page` : "Show this car on the page";
    const locate = async () => {
        const result = await onLocate();
        if (result && !result.shown) setMissing(true);
    };

    if (size === "text") {
        return (
            <button
                type="button"
                onClick={() => void locate()}
                aria-label={named}
                className="finn-lens-screen-only mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-finn-cotton px-3 py-1.5 text-[11.5px] font-black text-finn-black transition-colors hover:bg-finn-pale-blue hover:text-finn-accent-blue"
            >
                <LocateFixed aria-hidden="true" className="h-3.5 w-3.5" />
                {missing ? "Not on this page" : (label ?? "Show on the page")}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={() => void locate()}
            aria-label={named}
            title={missing ? "Not on this page" : named}
            style={winner && !missing ? WINNER_GOLD : undefined}
            className={`finn-lens-screen-only inline-flex shrink-0 items-center justify-center rounded-full transition ${
                winner ? "text-[#5b3a00] hover:brightness-105" : "bg-finn-cotton text-finn-black hover:bg-finn-pale-blue hover:text-finn-accent-blue"
            } ${size === "sm" ? "h-8 w-8" : "h-10 w-10"} ${missing ? `ring-2 ring-finn-fit-limited/40 ${winner ? "bg-finn-cotton" : ""}` : ""}`}
        >
            <LocateFixed aria-hidden="true" className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
    );
}
