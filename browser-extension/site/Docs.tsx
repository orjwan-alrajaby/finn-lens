import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";

import { OnThisPage, type TocGroup } from "@/entrypoints/options/OnThisPage";

import readme from "../README.md?raw";
import changelog from "../CHANGELOG.md?raw";
import beta from "../../docs/BETA.md?raw";
import how from "../../docs/HOW-FINN-LENS-DECIDES.md?raw";
import emissions from "../../docs/FINN-LENS-EMISSIONS-SCORING.md?raw";
import bubbles from "../../docs/LIFE-BUBBLES-SPEC-v2.md?raw";
import shortlist from "../../docs/FUTURE-SHORTLIST.md?raw";

import "./docs.css";

/**
 * The branch's documentation, as the repository has it: each document is the
 * markdown file itself, imported at build time, so this tab can't say
 * anything the files don't.
 *
 * Links between documents open them here; a link into the code, which this
 * page doesn't publish, stays as its text.
 */

interface Doc {
    id: string;
    /** The file's name, which other documents link to it by. */
    file: string;
    label: string;
    number: string;
    source: string;
    markdown: string;
}

const DOCS: Doc[] = [
    { id: "overview", file: "README.md", label: "Overview", number: "01", source: "browser-extension/README.md", markdown: readme },
    { id: "beta", file: "BETA.md", label: "The beta note", number: "02", source: "docs/BETA.md", markdown: beta },
    { id: "changelog", file: "CHANGELOG.md", label: "Changelog", number: "03", source: "browser-extension/CHANGELOG.md", markdown: changelog },
    { id: "how-lens-decides", file: "HOW-FINN-LENS-DECIDES.md", label: "How Lens decides", number: "04", source: "docs/HOW-FINN-LENS-DECIDES.md", markdown: how },
    { id: "emissions", file: "FINN-LENS-EMISSIONS-SCORING.md", label: "Emissions and efficiency", number: "05", source: "docs/FINN-LENS-EMISSIONS-SCORING.md", markdown: emissions },
    { id: "life-bubbles", file: "LIFE-BUBBLES-SPEC-v2.md", label: "The conversation's design", number: "06", source: "docs/LIFE-BUBBLES-SPEC-v2.md", markdown: bubbles },
    { id: "shortlist", file: "FUTURE-SHORTLIST.md", label: "Next: the shortlist", number: "07", source: "docs/FUTURE-SHORTLIST.md", markdown: shortlist },
];

const GROUPS: TocGroup[] = [
    { label: "Start here", items: DOCS.slice(0, 3).map(tocItem) },
    { label: "How it decides", items: DOCS.slice(3, 5).map(tocItem) },
    { label: "Design", items: DOCS.slice(5).map(tocItem) },
];

function tocItem(doc: Doc) {
    return { id: `docs/${doc.id}`, label: doc.label, number: doc.number };
}

/** `#docs`, `#docs/how-lens-decides` or `#docs/how-lens-decides/21-reading-finns-data`. */
export function docsRoute(hash: string): { doc: Doc; anchor: string | null } {
    const [, id, ...anchor] = decodeURIComponent(hash.replace(/^#/, "")).split("/");
    return { doc: DOCS.find((doc) => doc.id === id) ?? DOCS[0]!, anchor: anchor.length ? anchor.join("/") : null };
}

/** A heading's anchor as GitHub makes it, so the documents' own links land. */
function slug(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
        .replace(/\s/g, "-");
}

export function Docs({ hash }: { hash: string }) {
    const { doc, anchor } = docsRoute(hash);
    const html = useMemo(() => marked.parse(doc.markdown, { async: false, gfm: true }), [doc]);
    const body = useRef<HTMLElement>(null);

    /* Anchors on every heading, links that work here, then the place asked for. */
    useEffect(() => {
        const root = body.current;
        if (!root) return;

        const seen = new Map<string, number>();
        for (const heading of root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
            const base = slug(heading.textContent ?? "");
            const count = seen.get(base) ?? 0;
            seen.set(base, count + 1);
            heading.id = count ? `${base}-${count}` : base;
        }

        for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
            const href = link.getAttribute("href") ?? "";

            if (/^https?:/.test(href)) {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                continue;
            }

            if (href.startsWith("#")) {
                link.setAttribute("href", `#docs/${doc.id}/${href.slice(1)}`);
                continue;
            }

            const [path = "", fragment] = href.split("#");
            const target = DOCS.find((item) => path.split("/").pop() === item.file);

            if (target) link.setAttribute("href", `#docs/${target.id}${fragment ? `/${fragment}` : ""}`);
            else link.replaceWith(...link.childNodes);
        }

        const place = anchor ? document.getElementById(decodeURIComponent(anchor)) : null;
        if (place) place.scrollIntoView({ block: "start" });
        else window.scrollTo(0, 0);
    }, [html, doc.id, anchor]);

    return (
        <div className="relative space-y-4 pb-6">
            <aside className="absolute top-0 right-full mr-10 hidden h-full w-52 xl:block">
                <div className="sticky top-8">
                    <OnThisPage groups={GROUPS} active={`docs/${doc.id}`} variant="rail" />
                </div>
            </aside>

            <div className="xl:hidden">
                <OnThisPage groups={GROUPS} active={`docs/${doc.id}`} variant="inline" />
            </div>

            <article className="rounded-2xl border border-finn-cotton bg-white p-5 sm:p-8">
                <p className="mb-4 text-[12.5px] font-bold text-finn-black/70">
                    From the repository: <code className="font-mono">{doc.source}</code>
                </p>
                <section ref={body} className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
            </article>
        </div>
    );
}
