import {
    useId,
    useState,
    type HTMLAttributes,
    type ReactNode,
} from "react";
import { Info } from "lucide-react";

/** One thing a row's numbers can be asked about, and the answer. */
export interface Explanation {
    title: string;
    body: string;
}

/** "More about fuel use", leaving "CO₂ while driving" alone. */
function moreAbout(label: string): string {
    const second = label.charAt(1);

    return `More about ${
        second === second.toLowerCase()
            ? label.charAt(0).toLowerCase() + label.slice(1)
            : label
    }`;
}

/**
 * A row that explains itself: what it shows, an "i" at the far right where an
 * accordion's arrow would sit, and the row's explanations under it once the
 * "i" is clicked.
 *
 * These were tooltips. A tooltip covers whatever is around it, closes when the
 * pointer drifts, and is a cramped place to read a short paragraph, which is
 * what these explanations are. Opening them under the row keeps them next to
 * the numbers they're about, and they stay open until the reader closes them.
 *
 * The "i" is always at the far right, so every explanation opens from the same
 * place. A row with nothing to explain keeps the space, so a table's columns
 * still line up. An exported file shows every row open.
 */
export function ExplainedRow({
    label,
    explanations,
    children,
    className = "",
    panelClassName = "text-[12px] leading-[18px]",
    ...rest
}: {
    /** What the row is, for the button's name when it opens more than one answer. */
    label: string;
    explanations: Explanation[];
    children: ReactNode;
    className?: string;
    /** Type scale for the opened text, so it matches the row above it. */
    panelClassName?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const [only] = explanations;

    return (
        <div className={className} {...rest}>
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">{children}</div>

                {only ? (
                    <button
                        type="button"
                        aria-label={
                            explanations.length === 1
                                ? only.title
                                : moreAbout(label)
                        }
                        aria-expanded={open}
                        aria-controls={id}
                        onClick={() => setOpen((value) => !value)}
                        className={[
                            "finn-lens-screen-only inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                            open
                                ? "bg-finn-accent-blue text-white"
                                : "text-finn-iron hover:bg-finn-pale-blue hover:text-finn-accent-blue",
                        ].join(" ")}
                    >
                        <Info aria-hidden="true" className="h-4 w-4" />
                    </button>
                ) : (
                    <span
                        aria-hidden="true"
                        className="finn-lens-screen-only h-6 w-6 shrink-0"
                    />
                )}
            </div>

            {only && (
                <div
                    id={id}
                    className={[
                        "finn-lens-reveal-on-export mt-2.5 space-y-2 rounded-xl bg-finn-pale-blue/60 px-3 py-2.5",
                        open ? "block" : "hidden",
                        panelClassName,
                    ].join(" ")}
                >
                    {explanations.map((explanation) => (
                        <div key={explanation.title}>
                            {/*
                              * The question, only where there is more than one
                              * answer to tell apart. A row with a single
                              * explanation has already asked it twice — as the
                              * row's own label, and as the name of the "i" the
                              * reader just clicked — so printing it a third
                              * time above the answer is the panel talking to
                              * itself.
                              */}
                            {explanations.length > 1 && (
                                <p className="font-black text-finn-black">
                                    {explanation.title}
                                </p>
                            )}

                            {/* A blank line in the body starts a new paragraph. */}
                            {explanation.body.split("\n\n").map((paragraph, index) => (
                                <p
                                    key={paragraph}
                                    className={index > 0 ? "mt-1.5 text-finn-iron" : "text-finn-iron"}
                                >
                                    {paragraph}
                                </p>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
