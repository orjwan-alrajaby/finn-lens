import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Download } from "lucide-react";

import "@/assets/tailwind.css";
import { BetaTag } from "@/components/lens-parts";
import { BRAND_IDLE_SPIN } from "@/lib/brand-spinner";
import { Guide } from "@/entrypoints/options/Guide";
import { ProductWalkthrough } from "@/entrypoints/options/ProductWalkthrough";

import { Docs } from "@/entrypoints/options/Docs";
import { INSTALL_STEPS, packageUrl } from "@/lib/release";

/**
 * The published page: the beta guide and the product demo, as the
 * extension's Settings shows them, without the tab that needs the extension
 * (Settings itself reads the reader's stored chats) — and the branch's
 * documentation, read from the repository's own markdown.
 */

declare const __LENS_VERSION__: string;
/** The bare version, "0.9.1", which the package is named by. */
declare const __LENS_RELEASE__: string;

/** The package this version of the pages describes. */
const DOWNLOAD = packageUrl(__LENS_RELEASE__);

type View = "guide" | "demo" | "docs";

const PAGES: Record<View, { title: string; tab: string; description: string }> = {
    guide: { title: "Finn Lens beta guide", tab: "Finn Lens · Beta guide", description: "What Lens does, how it decides, and what this beta can't do yet." },
    demo: { title: "Finn Lens product demo", tab: "Finn Lens · Product demo", description: "A walkthrough of a reader's journey through Finn Lens." },
    docs: { title: "Finn Lens documentation", tab: "Finn Lens · Documentation", description: "How it's built, how it decides, and what changed — as the repository documents it." },
};

/** The guide's sections are `#guide-…`, the demo's `#demo-…` and the documents `#docs/…`, so a section's link keeps its page open. */
const viewOf = (hash: string): View => (hash.startsWith("#demo") ? "demo" : hash.startsWith("#docs") ? "docs" : "guide");

function Site() {
    const [hash, setHash] = useState(() => window.location.hash);
    const view = viewOf(hash);

    useEffect(() => {
        const follow = () => setHash(window.location.hash);

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
                        <img src={`${import.meta.env.BASE_URL}icon/128.png`} alt="" className={`h-12 w-12 object-contain ${BRAND_IDLE_SPIN}`} />
                    </span>
                    <div>
                        <h1 className="flex items-center gap-2 text-[24px] font-black leading-tight tracking-tight">
                            {PAGES[view].title}
                            <BetaTag className="text-[11px]" />
                        </h1>
                        <p className="text-[13px] text-white/75">{PAGES[view].description}</p>
                    </div>
                </div>
                <nav aria-label="Finn Lens" className="mx-auto flex max-w-3xl flex-wrap gap-2 px-6 pb-5">
                    <Tab href="#guide" current={view === "guide"}>
                        Beta guide
                    </Tab>
                    <Tab href="#demo" current={view === "demo"}>
                        Product demo
                    </Tab>
                    <Tab href="#docs" current={view === "docs"}>
                        Documentation
                    </Tab>
                    <a
                        href={DOWNLOAD}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-finn-warning-lift px-4 py-2 text-[13px] font-black text-finn-highlight-navy transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:ml-auto"
                    >
                        <Download aria-hidden="true" className="h-4 w-4" />
                        Download the beta for Chrome
                    </a>
                </nav>
            </header>

            <div className="mx-auto max-w-3xl px-6 py-8">{view === "guide" ? <Guide version={__LENS_VERSION__} /> : view === "demo" ? <ProductWalkthrough release={__LENS_RELEASE__} /> : <Docs hash={hash} />}</div>

            <footer className="mx-auto max-w-3xl px-6 pb-10 text-[13px] leading-relaxed text-finn-black/75">
                <p>
                    To install it, download <a href={DOWNLOAD} className="font-bold text-finn-accent-blue underline">the {__LENS_VERSION__} package</a> and follow{" "}
                    <a href={INSTALL_STEPS} className="font-bold text-finn-accent-blue underline">the beta note's steps</a> — about two minutes, in Chrome on a computer.
                </p>
                <p className="mt-2">Finn Lens {__LENS_VERSION__} is an independent project. It isn't made by, or affiliated with, FINN.</p>
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
                "whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
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
