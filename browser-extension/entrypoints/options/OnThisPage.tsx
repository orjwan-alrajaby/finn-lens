import { useEffect, useState } from "react";

/**
 * A page's table of contents: its sections, numbered, under the part each
 * belongs to.
 *
 * Two layouts of the same list. `rail` sits pinned in the margin beside the
 * page on a wide screen and marks the section being read; `inline` heads the
 * page where there's no margin to pin it in.
 */

export interface TocGroup {
    label?: string;
    items: readonly { id: string; label: string; number: string }[];
}

/** The section being read: the last whose top has passed the upper third of the window. */
export function useActiveSection(ids: readonly string[]): string | null {
    const [active, setActive] = useState<string | null>(ids[0] ?? null);
    const key = ids.join(" ");

    useEffect(() => {
        const update = () => {
            let current = ids[0] ?? null;

            for (const id of ids) {
                const top = document.getElementById(id)?.getBoundingClientRect().top;
                if (top != null && top <= window.innerHeight * 0.3) current = id;
            }

            /* At the very bottom, the last section is the one being read, however short. */
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = ids[ids.length - 1] ?? current;

            setActive(current);
        };

        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);

        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
        /* `key` stands for `ids`: a new array with the same sections needn't start again. */
    }, [key]);

    return active;
}

export function OnThisPage({ groups, active, variant }: { groups: readonly TocGroup[]; active: string | null; variant: "rail" | "inline" }) {
    if (variant === "rail") {
        return (
            <nav aria-label="Contents" className="text-[13px]">
                <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-finn-black/60">Contents</p>
                <div className="space-y-4">
                    {groups.map((group, index) => (
                        <div key={group.label ?? index}>
                            {group.label ? <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-finn-black/60">{group.label}</p> : null}
                            <ol className="border-l border-finn-black/10">
                                {group.items.map((item) => (
                                    <li key={item.id}>
                                        <TocLink item={item} current={item.id === active} />
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </div>
                <a href="#top" className="mt-5 inline-block text-[12.5px] font-bold text-finn-accent-blue hover:underline" onClick={toTop}>
                    ↑ Back to top
                </a>
            </nav>
        );
    }

    return (
        <nav aria-label="Contents" className="rounded-2xl bg-white p-5 ring-1 ring-finn-cotton">
            <p className="text-[11px] font-black uppercase tracking-widest text-finn-black/60">Contents</p>
            <div className="mt-3 divide-y divide-finn-cotton">
                {groups.map((group, index) => (
                    <div key={group.label ?? index} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[140px_1fr] sm:gap-4">
                        {group.label ? <p className="pt-1.5 text-[11px] font-black uppercase tracking-wide text-finn-black/60">{group.label}</p> : <span />}
                        <ol>
                            {group.items.map((item) => (
                                <li key={item.id}>
                                    <a
                                        href={`#${item.id}`}
                                        className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-[13.5px] font-bold text-finn-black/85 transition-colors hover:bg-finn-pale-blue hover:text-finn-accent-blue focus-visible:outline-2 focus-visible:outline-finn-accent-blue"
                                    >
                                        <span aria-hidden="true" className="w-5 shrink-0 font-mono text-[12px] tabular-nums text-finn-black/50">
                                            {item.number}
                                        </span>
                                        {item.label}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </div>
                ))}
            </div>
        </nav>
    );
}

function TocLink({ item, current }: { item: TocGroup["items"][number]; current: boolean }) {
    return (
        <a
            href={`#${item.id}`}
            aria-current={current ? "location" : undefined}
            className={[
                "-ml-px flex items-baseline gap-2.5 border-l-2 py-1.5 pl-3 pr-1 leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-finn-accent-blue",
                current ? "border-finn-accent-blue font-black text-finn-highlight-navy" : "border-transparent font-semibold text-finn-black/70 hover:border-finn-black/30 hover:text-finn-black",
            ].join(" ")}
        >
            <span aria-hidden="true" className={`shrink-0 font-mono text-[11.5px] tabular-nums ${current ? "text-finn-accent-blue" : "text-finn-black/45"}`}>
                {item.number}
            </span>
            {item.label}
        </a>
    );
}

/* "#top" isn't an element; scroll there without touching the hash, so the tab the page is on stays open. */
function toTop(event: React.MouseEvent) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
}
