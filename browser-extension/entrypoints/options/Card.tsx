import type { ReactNode } from "react";

/** One of the page's sections: an icon on a pale disc, a title, and what's under it. */
export function Card({ id, icon, title, subtitle, children }: { id?: string; icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-6 rounded-[28px] bg-white/60 p-6 ring-1 ring-black/5">
            <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-finn-pale-blue text-finn-accent-blue">{icon}</span>
                <div>
                    <h2 className="text-[17px] font-black leading-tight">{title}</h2>
                    {subtitle ? <p className="mt-0.5 text-[12.5px] text-finn-iron">{subtitle}</p> : null}
                </div>
            </div>
            {children}
        </section>
    );
}
