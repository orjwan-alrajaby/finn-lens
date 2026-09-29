import type { ReactNode } from "react";

import {
    SPINNER_ANIMATION,
    SPINNER_CENTRE,
    SPINNER_HUB,
    SPINNER_SPOKE,
    SPINNER_SPOKE_ANGLES,
    SPINNER_SPOKE_WIDTH,
    SPINNER_TYRE,
    SPINNER_VIEW_BOX,
} from "@/lib/brand-spinner";

/**
 * The one loading indicator Lens uses: its own wheel, from `lib/brand-spinner`.
 *
 * The tyre takes `currentColor`; only the hub keeps a fixed colour. Decorative
 * on its own — every caller pairs it with words, and those words are what a
 * screen reader should read.
 */
export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
    return (
        <svg
            viewBox={SPINNER_VIEW_BOX}
            aria-hidden="true"
            focusable="false"
            className={`${className} shrink-0 ${SPINNER_ANIMATION}`}
        >
            <circle
                cx={SPINNER_CENTRE}
                cy={SPINNER_CENTRE}
                r={SPINNER_TYRE.radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={SPINNER_TYRE.width}
            />

            <g
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={SPINNER_SPOKE_WIDTH}
                strokeLinejoin="round"
            >
                {SPINNER_SPOKE_ANGLES.map((angle) => (
                    <path
                        key={angle}
                        d={SPINNER_SPOKE}
                        transform={
                            angle
                                ? `rotate(${angle} ${SPINNER_CENTRE} ${SPINNER_CENTRE})`
                                : undefined
                        }
                    />
                ))}
            </g>

            <circle
                cx={SPINNER_CENTRE}
                cy={SPINNER_CENTRE}
                r={SPINNER_HUB.radius}
                fill={SPINNER_HUB.fill}
            />
        </svg>
    );
}

/**
 * A whole surface that has nothing to show yet.
 *
 * Four pages open this way — the popup while it works out which tab you are
 * on, settings and the compare page while they read your saved answers, the
 * setup flow while it decides which step you are up to — and all four used to
 * do it with a sentence of grey text alone. The wheel is what says the pause
 * is the app working rather than the app broken.
 *
 * The message stays. It is the more useful half: "Checking current page…" and
 * "Reading your settings…" say which wait this is, and a reader who sees the
 * same spinner everywhere needs the words to tell them apart.
 */
export function LoadingScreen({
    children,
    className = "min-h-screen bg-finn-snow",
}: {
    /** What is being waited for, in the reader's terms. */
    children: ReactNode;
    /** The ground this fills. */
    className?: string;
}) {
    return (
        <div
            role="status"
            className={`flex items-center justify-center ${className}`}
        >
            <span className="flex items-center gap-3 text-sm text-finn-iron">
                <Spinner className="h-5 w-5 text-finn-black/70" />
                {children}
            </span>
        </div>
    );
}
