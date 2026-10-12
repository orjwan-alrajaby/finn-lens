import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import "@/assets/tailwind.css";
import { BetaTag } from "@/components/lens-parts";
import { Guide } from "@/entrypoints/options/Guide";
import { ProductWalkthrough } from "@/entrypoints/options/ProductWalkthrough";

/**
 * The published page: the beta guide and the product demo, as the
 * extension's Settings shows them, without the tab that needs the extension
 * (Settings itself reads the reader's stored chats).
 */

declare const __LENS_VERSION__: string;

type View = "guide" | "demo";

const PAGES: Record<View, { title: string; tab: string; description: string }> = {
    guide: { title: "Finn Lens beta guide", tab: "Finn Lens · Beta guide", description: "What Lens does, how it decides, and what this beta can't do yet." },
    demo: { title: "Finn Lens product demo", tab: "Finn Lens · Product demo", description: "A walkthrough of a reader's journey through Finn Lens." },
};

/** The guide's sections are `#guide-…` and the demo's `#demo-…`, so a section's link keeps its page open. */
const viewOf = (hash: string): View => (hash.startsWith("#demo") ? "demo" : "guide");

function Site() {
    const [view, setView] = useState<View>(() => viewOf(window.location.hash));

    useEffect(() => {
        const follow = () => setView(viewOf(window.location.hash));

        window.addEventListener("hashchange", follow);
        return () => window.removeEventListener("hashchange", follow);
    }, []);

    useEffect(() => {
        document.title = PAGES[view].tab;
        /* A section's own link scrolls to it; switching pages starts at the top. */
        if (window.location.hash === "#guide" || window.location.hash === "#demo") window.scrollTo(0, 0);
    }, [view]);

    return (
        <main className="min-h-screen bg-finn-snow font-sans text-finn-black">
            <header className="bg-gradient-to-br from-finn-highlight-navy to-finn-accent-blue text-white">
                <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 pt-8 pb-5">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                        <img src={`${import.meta.env.BASE_URL}icon/128.png`} alt="" className="h-12 w-12 object-contain" />
                    </span>
                    <div>
                        <h1 className="flex items-center gap-2 text-[24px] font-black leading-tight tracking-tight">
                            {PAGES[view].title}
                            <BetaTag className="text-[11px]" />
                        </h1>
                        <p className="text-[13px] text-white/75">{PAGES[view].description}</p>
                    </div>
                </div>
                <nav aria-label="Finn Lens" className="mx-auto flex max-w-3xl gap-2 px-6 pb-5">
                    <Tab href="#guide" current={view === "guide"}>
                        Beta guide
                    </Tab>
                    <Tab href="#demo" current={view === "demo"}>
                        Product demo
                    </Tab>
                </nav>
            </header>

            <div className="mx-auto max-w-3xl px-6 py-8">{view === "guide" ? <Guide version={__LENS_VERSION__} /> : <ProductWalkthrough />}</div>

            <footer className="mx-auto max-w-3xl px-6 pb-10 text-[13px] leading-relaxed text-finn-black/75">
                Finn Lens {__LENS_VERSION__} is an independent project. It isn't made by, or affiliated with, FINN.
            </footer>
        </main>
    );
}

function Tab({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
    return (
        <a
            href={href}
            aria-current={current ? "page" : undefined}
            className={[
                "rounded-full px-4 py-2 text-[13px] font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                current ? "bg-white text-finn-highlight-navy" : "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20",
            ].join(" ")}
        >
            {children}
        </a>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Site />
    </StrictMode>,
);
