import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";

import { ExternalLink, FileText, FolderGit2 } from "lucide-react";

import { REPOSITORY, SITE } from "@/lib/release";

import { OnThisPage, type TocGroup } from "./OnThisPage";
import { PageIntro } from "./PageIntro";

import readme from "../../../README.md?raw";
import changelog from "../../CHANGELOG.md?raw";
import beta from "../../../docs/BETA.md?raw";
import how from "../../../docs/HOW-FINN-LENS-DECIDES.md?raw";
import emissions from "../../../docs/FINN-LENS-EMISSIONS-SCORING.md?raw";
import bubbles from "../../../docs/LIFE-BUBBLES-SPEC-v2.md?raw";
import shortlist from "../../../docs/FUTURE-SHORTLIST.md?raw";

import "./docs.css";

/**
 * The branch's documentation, as the repository has it: each document is the
 * markdown file itself, imported at build time, so this tab can't say
 * anything the files don't. A tab in Settings, and on the published page
 * (`site/`).
 *
 * Links between documents open them here, a link to a section of the
 * published guide or demo opens that tab, and a link into the code opens it on
 * GitHub, where the repository is.
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
    { id: "overview", file: "README.md", label: "Overview", number: "01", source: "README.md", markdown: readme },
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

/** A file or folder in the repository, on GitHub — which sends a folder's `blob` link on to its `tree`. */
const onGitHub = (path: string) => `${REPOSITORY}/blob/main/${path}`;

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
    /*
     * One object per document, kept across renders: React writes the HTML again
     * whenever this prop is a new object, which would undo the anchors and links
     * set below — Settings re-renders the moment its stored data arrives.
     */
    const html = useMemo(() => ({ __html: marked.parse(doc.markdown, { async: false, gfm: true }) }), [doc]);
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

            if (href.startsWith(SITE) && href.includes("#")) {
                link.setAttribute("href", href.slice(href.indexOf("#")));
                continue;
            }

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

            if (target) {
                link.setAttribute("href", `#docs/${target.id}${fragment ? `/${fragment}` : ""}`);
                continue;
            }

            /* Relative to the document's own place in the repository, as GitHub reads it. */
            link.href = new URL(href, onGitHub(doc.source)).href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
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

            <PageIntro icon={<FileText />} title="Documentation">
                <p>
                    How Finn Lens is built, how it decides, and what changed in each version: the repository's own documents, as they are in this
                    build.
                </p>
                <a
                    href={REPOSITORY}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-finn-cotton bg-white px-4 py-2 text-[13px] font-black text-finn-highlight-navy transition-colors hover:bg-finn-pale-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                >
                    <FolderGit2 aria-hidden="true" className="h-4 w-4" />
                    Source code on GitHub
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-finn-black/60" />
                </a>
            </PageIntro>

            <div className="xl:hidden">
                <OnThisPage groups={GROUPS} active={`docs/${doc.id}`} variant="inline" />
            </div>

            <article className="rounded-2xl border border-finn-cotton bg-white p-4 sm:p-8">
                <p className="mb-4 text-[12.5px] font-bold text-finn-black/70">
                    From the repository:{" "}
                    <a href={onGitHub(doc.source)} target="_blank" rel="noopener noreferrer" className="text-finn-accent-blue underline underline-offset-2">
                        <code className="font-mono">{doc.source}</code>
                    </a>
                </p>
                <section ref={body} className="doc-prose" dangerouslySetInnerHTML={html} />
            </article>
        </div>
    );
}
