import type { ReactNode } from "react";
import { Trophy } from "lucide-react";

import type { FitLevel } from "@/lib/reasoning-engine/fit";

/**
 * The small pieces the chat and the drawer share with the chips on FINN's
 * cards: the mark, the verdict and the trophy look the same wherever the
 * reader meets them, so the thing they tapped on the card is recognisably the
 * thing the drawer is talking about.
 */

/** Lens's mark on its white disc — the same lockup the chips carry. */
export function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm ${className}`}
            style={{ width: size, height: size }}
        >
            <img
                src={browser.runtime.getURL("/icon/128.png")}
                alt=""
                aria-hidden="true"
                className="block object-contain"
                style={{ width: Math.round(size * 0.8), height: Math.round(size * 0.8) }}
            />
        </span>
    );
}

/** The chip colours, matching `content/lens/chips.ts`. */
export const BAND_TONE: Record<FitLevel, string> = {
    strong: "bg-finn-fit-strong-pale text-finn-fit-strong",
    good: "bg-finn-fit-good-pale text-finn-fit-good",
    partial: "bg-finn-fit-partial-pale text-finn-fit-partial",
    limited: "bg-finn-fit-limited-pale text-finn-fit-limited",
    unknown: "bg-finn-cotton text-finn-iron",
};

export function BandChip({ band, label, className = "" }: { band: FitLevel; label: string; className?: string }) {
    return (
        <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-black ${BAND_TONE[band]} ${className}`}>
            {label}
        </span>
    );
}

/** The winner's chip: gold, with the trophy. */
/** The winner's gold, wherever it's marked: its chip, and the buttons that go to it. */
export const WINNER_GOLD = {
    background: "linear-gradient(135deg, #fff3c4 0%, #fcd34d 45%, #f59e0b 100%)",
    boxShadow: "0 0 0 1px #fff, 0 0 0 3px rgba(245,158,11,.3)",
} as const;

export function WinnerChip({ label = "Best for you", className = "" }: { label?: string; className?: string }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11px] font-black text-[#5b3a00] ${className}`}
            style={WINNER_GOLD}
        >
            <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[#b7791f] shadow-sm">
                <Trophy aria-hidden="true" className="h-3 w-3" strokeWidth={2.6} />
            </span>
            {label}
        </span>
    );
}

/**
 * "Beta", beside Lens's name wherever the reader sees it — the chat, the
 * popup, Settings — so nobody mistakes this build for a finished product.
 * Drawn for the navy headers all three have.
 */
export function BetaTag({ className = "" }: { className?: string }) {
    return (
        <span
            title="A beta: Lens is still being tried out."
            className={`inline-flex items-center rounded-full bg-white/15 px-1.5 py-px text-[9.5px] font-black uppercase tracking-wider text-white/90 ring-1 ring-white/25 ${className}`}
        >
            Beta
        </span>
    );
}

/** A car's photo on FINN's pale blue ground, or the ground alone when FINN sent none. */
export function CarPhoto({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
    return (
        <div className={`overflow-hidden bg-finn-pale-blue ${className}`}>
            {src ? <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" /> : null}
        </div>
    );
}

export function IconButton({
    label,
    onClick,
    children,
    tone = "light",
}: {
    label: string;
    onClick: () => void;
    children: ReactNode;
    tone?: "light" | "dark";
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={[
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue",
                tone === "dark" ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-finn-iron hover:bg-finn-cotton hover:text-finn-black",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

export const euros = (value: number): string => `€${Math.round(value).toLocaleString("en-GB")}`;
