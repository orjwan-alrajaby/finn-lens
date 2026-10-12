import type { ReactNode } from "react";

/**
 * The card that opens each of Settings' tabs: an icon, which tab this is, a
 * title and a line on what's in it — the same on all four, so moving between
 * them reads as one place. Anything a tab needs to say up front goes under it.
 */
export function PageIntro({
    icon,
    eyebrow,
    title,
    badge,
    children,
}: {
    icon: ReactNode;
    /** Which tab: "Beta guide", "Product demo". */
    eyebrow: string;
    title: string;
    /** Beside the title: the version, say. */
    badge?: ReactNode;
    /** What the tab holds, and anything else it needs to say first. */
    children: ReactNode;
}) {
    return (
        <header className="rounded-2xl border border-[#e8e5df] bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#0072ea] [&>svg]:h-5 [&>svg]:w-5">
                    {icon}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#0072ea]">Finn Lens · {eyebrow}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black text-[#17243b] sm:text-2xl">{title}</h2>
                        {badge}
                    </div>
                    <div className="mt-2 space-y-3 text-[13.5px] leading-relaxed text-[#17243b]/80">{children}</div>
                </div>
            </div>
        </header>
    );
}
