import type { ReactNode } from "react";

/**
 * The card that opens each of Settings' tabs: an icon, the tab's title and a
 * line on what's in it — the same on all four, so moving between them reads as
 * one place. The header above it carries the name and the nav marks the tab,
 * so the card doesn't repeat either. Anything a tab needs to say up front goes
 * under it.
 */
export function PageIntro({
    icon,
    title,
    badge,
    children,
}: {
    icon: ReactNode;
    title: string;
    /** Beside the title: the version, say. */
    badge?: ReactNode;
    /** What the tab holds, and anything else it needs to say first. */
    children: ReactNode;
}) {
    return (
        <header className="rounded-2xl border border-[#e8e5df] bg-white p-4 sm:p-6">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#0072ea] [&>svg]:h-5 [&>svg]:w-5">
                    {icon}
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-[#17243b] sm:text-2xl">{title}</h2>
                    {badge}
                </div>
            </div>

            {/* Under the icon on a phone, where its column would cost the text a sixth of the width; beside it from `sm` up. */}
            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-[#17243b]/80 sm:mt-2 sm:pl-[52px]">{children}</div>
        </header>
    );
}
