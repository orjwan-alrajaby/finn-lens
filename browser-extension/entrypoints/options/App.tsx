
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Database, MessageCircle, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";

import { ImportanceBadge, ImportanceKey } from "@/components/ImportanceKey";
import { BetaTag } from "@/components/lens-parts";
import { BRAND_IDLE_SPIN } from "@/lib/brand-spinner";
import { FINN_BASE_URL } from "@/lib/constants";
import {
    clearGroups,
    DATA_GROUPS,
    summarise,
    type DataGroupId,
    type DataSummary,
} from "@/lib/chats/data";
import { summaryOf } from "@/lib/chats/flow";
import { loadSettings, setActiveChat } from "@/lib/chats/store";
import type { SavedSettings } from "@/lib/chats/types";

import { Card } from "./Card";
import { Docs } from "./Docs";
import { Guide } from "./Guide";
import { PageIntro } from "./PageIntro";
import { ProductWalkthrough } from "./ProductWalkthrough";

/**
 * Settings: the reader's saved answers, and everything Lens keeps.
 *
 * There are no priorities or profiles to set here any more — the chat is
 * where the reader says what matters, and this page only shows what they
 * asked Lens to keep, with the way to change it (a chat) or forget it. The
 * rest is their data: what's stored, how much, and deleting any of it.
 *
 * Beside it, the beta guide (#guide): what Lens is, how it decides and what
 * this beta can't do yet, for a reader who has never seen it. A tab of its
 * own rather than a card here, so it's there when wanted and out of the way
 * when the reader came to manage their data.
 */

type View = "settings" | "guide" | "demo" | "docs";

type ButtonProps = {
    onClick: () => void;
    children: ReactNode;
};

type TabProps = {
    href: string;
    current: boolean;
    children: ReactNode;
};

type ConfirmProps = {
    title: string;
    body: string;
    onConfirm: () => void;
    onCancel: () => void;
};

const PAGE_INFO: Record<View, { title: string; description: string }> = {
    settings: {
        title: "Finn Lens settings",
        description: "Your saved answers, and everything Lens keeps in this browser.",
    },
    guide: {
        title: "Finn Lens beta guide",
        description: "What Lens does, how it decides, and what this beta can't do yet.",
    },
    demo: {
        title: "Finn Lens product demo",
        description: "A walkthrough of a reader's journey through Finn Lens.",
    },
    docs: {
        title: "Finn Lens documentation",
        description: "How it's built, how it decides, and what changed — as the repository documents it.",
    },
};

/** The guide's sections are #guide-…, the demo's #demo-… and the documents #docs/…, so following one of their links keeps that tab open. */
const viewOf = (hash: string): View => {
    if (hash.startsWith("#guide")) return "guide";
    if (hash.startsWith("#demo")) return "demo";
    if (hash.startsWith("#docs")) return "docs";
    return "settings";
};

const isTopLevelHash = (hash: string) =>
    ["#guide", "#settings", "#demo"].includes(hash);

const pluralise = (count: number, singular: string) =>
    `${count} ${count === 1 ? singular : `${singular}s`}`;

const formatSavedDate = (date: string | number | Date) =>
    new Date(date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

function getDataGroupCount(
    id: DataGroupId,
    summary: DataSummary | null,
): string | null {
    if (!summary) return null;

    switch (id) {
        case "chats":
            return [
                pluralise(summary.chats, "chat"),
                summary.judged ? `${summary.judged} judged` : null,
            ]
                .filter(Boolean)
                .join(", ");

        case "cars":
            return pluralise(summary.cars, "car");

        case "settings":
            return summary.hasSettings ? "Saved" : "None saved";

        default:
            return summary.present.includes(id) ? "Some" : "Nothing";
    }
}

export function App() {
    const [settings, setSettings] = useState<
        SavedSettings | null | undefined
    >(undefined);
    const [summary, setSummary] = useState<DataSummary | null>(null);
    const [confirming, setConfirming] = useState<DataGroupId[] | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [hash, setHash] = useState(() => window.location.hash);
    const view = viewOf(hash);

    useEffect(() => {
        const followHash = () => setHash(window.location.hash);

        window.addEventListener("hashchange", followHash);

        return () => window.removeEventListener("hashchange", followHash);
    }, []);

    useEffect(() => {
        document.title = PAGE_INFO[view].title;

        // A section's own link scrolls to it; switching tabs starts at the top.
        if (isTopLevelHash(window.location.hash)) {
            window.scrollTo(0, 0);
        }
    }, [view]);

    const refresh = useCallback(async () => {
        const [savedSettings, dataSummary] = await Promise.all([
            loadSettings(),
            summarise(),
        ]);

        setSettings(savedSettings);
        setSummary(dataSummary);
    }, []);

    useEffect(() => {
        void refresh();

        // A chat on finn.com can change what's stored while this is open.
        const handleStorageChange = (_changes: unknown, area: string) => {
            if (area === "local") void refresh();
        };

        browser.storage.onChanged.addListener(handleStorageChange);

        return () =>
            browser.storage.onChanged.removeListener(handleStorageChange);
    }, [refresh]);

    const clear = async (ids: DataGroupId[]) => {
        await clearGroups(ids);

        setConfirming(null);
        setDone(
            ids.length > 1
                ? "Everything Lens kept is gone."
                : `${DATA_GROUPS.find((group) => group.id === ids[0])?.title} — deleted.`,
        );

        await refresh();
    };

    const changeInChat = async () => {
        // No chat on screen means the bubble starts a new one from these answers.
        await setActiveChat(null);

        await browser.runtime.sendMessage({
            type: "OPEN_LENS_ON_FINN",
            url: null,
        });
    };

    const told = settings ? summaryOf(settings.understanding) : null;

    const visibleGroups = DATA_GROUPS.filter(
        (group) =>
            group.id !== "leftovers" ||
            summary?.present.includes("leftovers"),
    );

    return (
        <main className="min-h-screen bg-finn-snow font-sans text-finn-black">
            <header className="bg-gradient-to-br from-finn-highlight-navy to-finn-accent-blue text-white">
                <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 pt-8 pb-5">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                        <img
                            src="/icon/128.png"
                            alt=""
                            className={`h-12 w-12 object-contain ${BRAND_IDLE_SPIN}`}
                        />
                    </span>

                    <div>
                        <h1 className="flex items-center gap-2 text-[24px] font-black leading-tight tracking-tight">
                            {PAGE_INFO[view].title}
                            <BetaTag className="text-[11px]" />
                        </h1>

                        <p className="text-[13px] text-white/75">
                            {PAGE_INFO[view].description}
                        </p>
                    </div>
                </div>

                <nav
                    aria-label="Finn Lens"
                    className="mx-auto flex max-w-3xl flex-wrap gap-2 px-6 pb-5"
                >
                    <Tab href="#settings" current={view === "settings"}>
                        Settings
                    </Tab>

                    <Tab href="#guide" current={view === "guide"}>
                        Beta guide
                    </Tab>

                    <Tab href="#demo" current={view === "demo"}>
                        Product demo
                    </Tab>

                    <Tab href="#docs" current={view === "docs"}>
                        Documentation
                    </Tab>
                </nav>
            </header>

            {view === "guide" ? (
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <Guide version={browser.runtime.getManifest().version_name ?? browser.runtime.getManifest().version} />
                </div>
            ) : view === "demo" ? (
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <ProductWalkthrough />
                </div>
            ) : view === "docs" ? (
                <div className="mx-auto max-w-3xl px-6 py-8">
                    <Docs hash={hash} />
                </div>
            ) : (
                <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
                    <PageIntro icon={<SlidersHorizontal />} eyebrow="Settings" title="Your answers and your data">
                        <p>
                            The answers new chats start from, and everything Lens keeps in this browser: what it is, how much, and a way to delete
                            any of it. Nothing here is sent anywhere.
                        </p>
                    </PageIntro>

                    {done ? (
                        <p
                            role="status"
                            className="rounded-2xl bg-finn-fit-good-pale px-4 py-3 text-[13px] font-bold text-finn-fit-good"
                        >
                            {done}
                        </p>
                    ) : null}

                    {/* Answers */}
                    <Card
                        icon={<MessageCircle className="h-5 w-5" />}
                        title="Your answers"
                        subtitle="What new chats start from. You change them by talking to Lens, not here."
                    >
                        {settings === undefined ? null : told ? (
                            <>
                                {told.bubbles?.length ? (
                                    <ul className="mb-3 space-y-2 rounded-2xl bg-white p-4 ring-1 ring-finn-cotton">
                                        {told.bubbles.map((bubble) => (
                                            <li key={bubble.id}>
                                                <p className="flex items-baseline gap-2 text-[13.5px] font-black">
                                                    {bubble.heading}

                                                    {/* Importance is irrelevant when a bubble checks nothing. */}
                                                    {bubble.counting !== false ? (
                                                        <ImportanceBadge
                                                            importance={bubble.importance}
                                                            guess={!bubble.importanceSaid}
                                                        />
                                                    ) : null}
                                                </p>

                                                {bubble.figure ||
                                                    bubble.counts.length ||
                                                    bubble.shared?.length ? (
                                                    <p className="text-[12px] text-finn-iron">
                                                        Lens checks:{" "}
                                                        {[
                                                            bubble.figure,
                                                            ...bubble.counts.map(
                                                                (item) => item.label,
                                                            ),
                                                            ...(bubble.shared ?? []).map(
                                                                (item) => item.label,
                                                            ),
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ")}
                                                    </p>
                                                ) : bubble.settled || bubble.empty ? (
                                                    <p className="text-[12px] text-finn-iron">
                                                        {bubble.settled ?? bubble.empty}
                                                    </p>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}

                                {told.needs?.length ? (
                                    <ul className="mb-3 space-y-2 rounded-2xl bg-white p-4 ring-1 ring-finn-cotton">
                                        {told.needs.map((need) => (
                                            <li key={need.id}>
                                                <p className="flex items-baseline gap-2 text-[13.5px] font-black">
                                                    {need.label}
                                                    <ImportanceBadge
                                                        importance={need.importance}
                                                    />
                                                </p>

                                                {need.looksFor.length ? (
                                                    <p className="text-[12px] text-finn-iron">
                                                        Lens looks for:{" "}
                                                        {need.looksFor.join(" · ")}
                                                    </p>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}

                                {told.bubbles?.some(
                                    (bubble) => bubble.counting !== false,
                                ) || told.needs?.length ? (
                                    <div className="mb-3">
                                        <ImportanceKey
                                            guesses={Boolean(
                                                told.bubbles?.some(
                                                    (bubble) =>
                                                        bubble.counting !== false &&
                                                        !bubble.importanceSaid,
                                                ),
                                            )}
                                        />
                                    </div>
                                ) : null}

                                <dl className="divide-y divide-finn-cotton overflow-hidden rounded-2xl ring-1 ring-finn-cotton">
                                    {told.lines.map((line) => (
                                        <div
                                            key={line.label}
                                            className="grid grid-cols-[150px_1fr] gap-4 bg-white px-4 py-3 text-[13px]"
                                        >
                                            <dt className="font-bold text-finn-iron">
                                                {line.label}
                                            </dt>

                                            <dd className="font-semibold">
                                                {line.label === "For" &&
                                                    settings?.rentalMonths
                                                    ? `${settings?.rentalMonths} months, from the month after you start a chat`
                                                    : line.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>

                                <p className="mt-2 text-[12px] text-finn-iron">
                                    Saved {formatSavedDate(settings?.savedAt ?? "")}.
                                </p>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <PrimaryButton
                                        onClick={() => void changeInChat()}
                                    >
                                        Change them in a chat
                                    </PrimaryButton>

                                    <QuietButton
                                        onClick={() => setConfirming(["settings"])}
                                    >
                                        Forget my answers
                                    </QuietButton>
                                </div>
                            </>
                        ) : (
                            <div>
                                <p className="text-[13px] leading-relaxed">
                                    You haven't saved any answers yet. When a chat
                                    asks <em>“Shall I keep these as your settings?”</em>,
                                    choosing <strong>Save as my settings</strong> keeps
                                    them here, and every new chat starts from them.
                                </p>

                                <div className="mt-4">
                                    <PrimaryButton
                                        onClick={() => void changeInChat()}
                                    >
                                        Start a chat on finn.com
                                    </PrimaryButton>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Data */}
                    <Card
                        icon={<Database className="h-5 w-5" />}
                        title="Your data"
                        subtitle={
                            summary
                                ? `Lens keeps about ${summary.kilobytes.toLocaleString("en-GB")} kB in this browser. None of it is sent anywhere.`
                                : "Everything Lens keeps in this browser."
                        }
                    >
                        <ul className="space-y-2">
                            {visibleGroups.map((group) => (
                                <li
                                    key={group.id}
                                    className="rounded-2xl bg-white p-4 ring-1 ring-finn-cotton"
                                >
                                    {confirming?.length === 1 &&
                                        confirming[0] === group.id ? (
                                        <Confirm
                                            title={`Delete “${group.title.charAt(0).toLowerCase()}${group.title.slice(1)}”?`}
                                            body={group.consequence}
                                            onConfirm={() => void clear([group.id])}
                                            onCancel={() => setConfirming(null)}
                                        />
                                    ) : (
                                        <div className="flex items-start gap-4">
                                            <div className="min-w-0 flex-1">
                                                <p className="flex items-baseline gap-2 text-[14px] font-black">
                                                    {group.title}

                                                    <span className="text-[12px] font-bold text-finn-iron">
                                                        {getDataGroupCount(
                                                            group.id,
                                                            summary,
                                                        )}
                                                    </span>
                                                </p>

                                                <p className="mt-0.5 text-[12.5px] leading-snug text-finn-iron">
                                                    {group.description}
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setConfirming([group.id])
                                                }
                                                disabled={
                                                    !summary?.present.includes(
                                                        group.id,
                                                    )
                                                }
                                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-finn-cotton px-3.5 py-2 text-[12px] font-black text-finn-black transition-colors hover:bg-finn-fit-limited-pale hover:text-finn-fit-limited disabled:cursor-default disabled:opacity-40 disabled:hover:bg-finn-cotton disabled:hover:text-finn-black"
                                            >
                                                <Trash2
                                                    aria-hidden="true"
                                                    className="h-3.5 w-3.5"
                                                />

                                                {group.id === "cars"
                                                    ? "Clear the cache"
                                                    : "Delete"}
                                            </button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>

                        <div className="mt-4 rounded-2xl border border-dashed border-finn-fit-limited/30 p-4">
                            {confirming && confirming.length > 1 ? (
                                <Confirm
                                    title="Delete everything Lens keeps?"
                                    body="Every chat, your saved answers and the cars Lens has read. Lens will greet you like it's the first time."
                                    onConfirm={() =>
                                        void clear(
                                            DATA_GROUPS.map((group) => group.id),
                                        )
                                    }
                                    onCancel={() => setConfirming(null)}
                                />
                            ) : (
                                <div className="flex items-center gap-4">
                                    <p className="min-w-0 flex-1 text-[12.5px] text-finn-iron">
                                        Start over completely: every chat, your
                                        answers, and the cars Lens has read.
                                    </p>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setConfirming(
                                                DATA_GROUPS.map(
                                                    (group) => group.id,
                                                ),
                                            )
                                        }
                                        className="shrink-0 rounded-full bg-finn-fit-limited-pale px-4 py-2 text-[12px] font-black text-finn-fit-limited hover:bg-finn-fit-limited hover:text-white"
                                    >
                                        Delete everything
                                    </button>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* About */}
                    <Card
                        icon={<ShieldCheck className="h-5 w-5" />}
                        title="About Finn Lens"
                    >
                        <ul className="space-y-2 text-[13px] leading-relaxed">
                            <li>
                                Lens is <strong>unofficial</strong>: it isn't made
                                by, or affiliated with,{" "}
                                <a
                                    href={FINN_BASE_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-finn-accent-blue underline underline-offset-2"
                                >
                                    FINN
                                </a>
                                .
                            </li>

                            <li>
                                It only works on finn.com. It reads FINN's car
                                data: what FINN's pages load as you browse, and
                                FINN's own API for cars on the page it doesn't
                                have yet.
                            </li>

                            <li>
                                Everything it keeps stays in this browser, and
                                nothing you tell it leaves it. There's no account
                                and no Lens server: its only requests are to
                                finn.com for car data, and for the car photos
                                FINN's data links to.
                            </li>

                            <li>
                                New to Lens? The{" "}
                                <a
                                    href="#guide"
                                    className="font-bold text-finn-accent-blue underline underline-offset-2"
                                >
                                    beta guide
                                </a>{" "}
                                says what it does, how it decides, and what this
                                beta can't do yet.
                            </li>
                        </ul>
                    </Card>
                </div>
            )}
        </main>
    );
}

/** One of the header's tabs, on the navy. */
function Tab({ href, current, children }: TabProps) {
    const baseClasses =
        "whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

    const stateClasses = current
        ? "bg-white text-finn-highlight-navy"
        : "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20";

    return (
        <a
            href={href}
            aria-current={current ? "page" : undefined}
            className={`${baseClasses} ${stateClasses}`}
        >
            {children}
        </a>
    );
}

function Confirm({
    title,
    body,
    onConfirm,
    onCancel,
}: ConfirmProps) {
    return (
        <div role="alertdialog" aria-label={title}>
            <p className="text-[14px] font-black">{title}</p>
            <p className="mt-0.5 text-[12.5px] text-finn-iron">{body}</p>

            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={onConfirm}
                    className="rounded-full bg-finn-fit-limited px-4 py-2 text-[12px] font-black text-white hover:opacity-90"
                >
                    Delete
                </button>

                <QuietButton onClick={onCancel}>Keep it</QuietButton>
            </div>
        </div>
    );
}

function PrimaryButton({ onClick, children }: ButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-full bg-finn-accent-blue px-4 py-2.5 text-[13px] font-black text-white transition-colors hover:bg-finn-highlight-navy"
        >
            {children}
        </button>
    );
}

function QuietButton({ onClick, children }: ButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-full bg-finn-cotton px-4 py-2.5 text-[13px] font-black text-finn-black transition-colors hover:bg-finn-pale-blue hover:text-finn-accent-blue"
        >
            {children}
        </button>
    );
}
