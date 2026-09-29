import { useEffect, useState } from "react";
import { ChevronRight, ExternalLink, Globe, MessageCircle, RefreshCw, Settings, SquarePen, Trophy } from "lucide-react";

import { BRAND_IDLE_SPIN } from "@/lib/brand-spinner";
import { FINN_BASE_URL } from "@/lib/constants";
import { activeChat, listChats, setActiveChat } from "@/lib/chats/store";
import type { Chat, ChatMessage } from "@/lib/chats/types";
import { calculateTimeAgo } from "@/lib/utils";
import type { PageStats } from "@/entrypoints/content/page/stats";

/**
 * The toolbar popup: what Lens is, whether it's working where the reader is,
 * and the way back into it.
 *
 * Everything Lens does happens on finn.com, in the bubble. The popup says so,
 * says whether Lens is live on this tab and what it sees here, and gets the
 * reader to their chats — or to finn.com, when they're somewhere else.
 */

type Where =
    /** On finn.com, with Lens running on the page. */
    | { kind: "online"; stats: PageStats }
    /** On finn.com, in a tab opened before Lens was installed: it needs a reload. */
    | { kind: "asleep"; tabId: number }
    /** Anywhere else. */
    | { kind: "offline" };

async function locate(): Promise<Where> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !tab.url?.startsWith(FINN_BASE_URL)) return { kind: "offline" };

    try {
        const stats = (await browser.tabs.sendMessage(tab.id, { type: "LENS_PAGE_STATS" })) as PageStats | null;
        return stats ? { kind: "online", stats } : { kind: "asleep", tabId: tab.id };
    } catch {
        return { kind: "asleep", tabId: tab.id };
    }
}

async function openOnFinn(url: string | null = null) {
    await browser.runtime.sendMessage({ type: "OPEN_LENS_ON_FINN", url });
    window.close();
}

const winnerOf = (chat: Chat): Extract<ChatMessage, { kind: "result" }>["winner"] => {
    const result = [...chat.messages].reverse().find((message) => message.kind === "result");
    return result?.kind === "result" ? result.winner : null;
};

export function App() {
    const [where, setWhere] = useState<Where | null>(null);
    const [chats, setChats] = useState<Chat[]>([]);
    const [current, setCurrent] = useState<Chat | null>(null);

    useEffect(() => {
        void locate().then(setWhere);
        void listChats().then(setChats);
        void activeChat().then(setCurrent);
    }, []);

    const online = where?.kind === "online";
    const pick = current ? winnerOf(current) : null;
    const others = chats.filter((chat) => chat.id !== current?.id).slice(0, 3);

    const openChat = async (chat: Chat) => {
        await setActiveChat(chat.id);
        /* Where it judged its cars, unless the reader is on finn.com already. */
        await openOnFinn(online ? null : (chat.judgement?.pageUrl ?? null));
    };

    return (
        <main className="w-[380px] bg-finn-cotton font-sans text-finn-black">
            {/* -- Who, and whether it's working here ------------------------ */}
            <div className="relative isolate overflow-hidden rounded-b-[28px] px-5 pt-5 pb-7 text-white">
                <div
                    className={[
                        "absolute inset-0 -z-10 transition-[background] duration-300",
                        online ? "bg-gradient-to-br from-finn-highlight-navy to-finn-accent-blue" : "bg-gradient-to-br from-finn-black to-finn-highlight-navy/90",
                    ].join(" ")}
                />

                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
                            <img src="/icon/128.png" alt="" className={`h-10 w-10 object-contain ${BRAND_IDLE_SPIN}`} />
                        </span>
                        <div>
                            <h1 className="text-[15px] font-black leading-none tracking-tight">Finn Lens</h1>
                            <p className="mt-1 text-[11px] text-white/65">Ranks finn.com's cars against what you need</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="Settings and your data"
                        title="Settings and your data"
                        onClick={() => void browser.runtime.openOptionsPage()}
                        className="rounded-full border border-white/20 bg-white/10 p-2 text-white/80 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                        <Settings aria-hidden="true" className="h-4 w-4" />
                    </button>
                </header>

                <section className="mt-6">
                    {where?.kind === "offline" ? (
                        <>
                            <h2 className="text-[22px] font-black leading-snug tracking-[-0.02em]">Lens lives on finn.com</h2>
                            <p className="mt-1.5 text-[13px] leading-5 text-white/70">
                                Open a car listing there and Lens will ask what you need, then judge the cars on the page for you.
                            </p>
                        </>
                    ) : pick ? (
                        <>
                            <p className="text-[11px] font-black uppercase tracking-wide text-[#fcd34d]">Your current pick</p>
                            <h2 className="mt-0.5 text-[22px] font-black leading-snug tracking-[-0.02em]">{pick.name}</h2>
                            <p className="mt-1 text-[13px] leading-5 text-white/70">
                                {pick.monthly != null ? `About €${pick.monthly.toLocaleString("en-GB")} a month, estimated. ` : ""}From your chat “{current?.title}”.
                            </p>
                        </>
                    ) : (
                        <>
                            <h2 className="text-[22px] font-black leading-snug tracking-[-0.02em]">Tell Lens what you need, and it'll rank the cars on this page</h2>
                            <p className="mt-1.5 text-[13px] leading-5 text-white/70">
                                A few questions, a judgement on every car here, and the reasons behind it.
                            </p>
                        </>
                    )}

                    <StatusPill where={where} />
                </section>
            </div>

            <div className="space-y-3 p-4">
                {/* -- What Lens sees here ------------------------------------ */}
                {where?.kind === "online" ? (
                    <div className="flex divide-x divide-dashed divide-finn-iron/25 overflow-hidden rounded-[22px] bg-white shadow-sm">
                        <Metric label="Detected" value={where.stats.detected} helper="cars on this page" />
                        <Metric label="Judged" value={where.stats.judged} helper={where.stats.judged ? "wear a chip" : "not yet"} accent={where.stats.judged > 0} />
                        <Metric label="Chats" value={chats.length} helper="kept" />
                    </div>
                ) : null}

                {where?.kind === "asleep" ? (
                    <div className="rounded-[22px] bg-white p-4 shadow-sm">
                        <p className="text-[13px] font-black">Lens hasn't started on this tab yet</p>
                        <p className="mt-1 text-[12px] leading-snug text-finn-iron">This page was open before Lens was installed. Reload it and the bubble will appear.</p>
                        <button
                            type="button"
                            onClick={() => {
                                void browser.tabs.reload(where.tabId);
                                window.close();
                            }}
                            className="mt-3 inline-flex items-center gap-2 rounded-full bg-finn-highlight-navy px-4 py-2 text-[12px] font-black text-white hover:bg-finn-accent-blue"
                        >
                            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                            Reload this page
                        </button>
                    </div>
                ) : null}

                {where?.kind === "offline" && !chats.length ? (
                    <div className="flex flex-col items-center rounded-[22px] border border-dashed border-finn-iron/25 bg-white px-6 py-7 text-center shadow-sm">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-finn-pale-blue text-finn-accent-blue">
                            <Globe aria-hidden="true" className="h-5 w-5" />
                        </span>
                        <p className="mt-3 text-[13px] font-black">Head to finn.com to get started</p>
                        <p className="mt-1 max-w-64 text-[12px] leading-5 text-finn-iron">Lens works while you browse FINN's cars, so it can read them and judge them for you.</p>
                    </div>
                ) : null}

                {/* -- The way in ----------------------------------------------- */}
                <div className="rounded-[22px] bg-white p-3 shadow-sm">
                    {current ? (
                        <button
                            type="button"
                            onClick={() => void openChat(current)}
                            className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-finn-pale-blue"
                        >
                            <ChatIcon chat={current} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[10.5px] font-black uppercase tracking-wide text-finn-accent-blue">Your current chat</span>
                                <span className="block truncate text-[13px] font-black">{current.title}</span>
                                <span className="block truncate text-[11.5px] text-finn-iron">{pick ? `Picked the ${pick.name}` : "Still talking"} · {calculateTimeAgo(current.updatedAt)}</span>
                            </span>
                            <ChevronRight aria-hidden="true" className="h-4 w-4 text-finn-iron" />
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={() => void openOnFinn()}
                        className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-finn-accent-blue px-4 py-3 text-[13px] font-black text-white transition-colors hover:bg-finn-highlight-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                    >
                        {where?.kind === "offline" ? <ExternalLink aria-hidden="true" className="h-4 w-4" /> : <MessageCircle aria-hidden="true" className="h-4 w-4" />}
                        {where?.kind === "offline" ? "Open finn.com with Lens" : current ? "Open the chat on this page" : "Start chatting with Lens"}
                    </button>
                </div>

                {others.length ? (
                    <div className="rounded-[22px] bg-white p-3 shadow-sm">
                        <p className="px-2 pt-1 pb-2 text-[10.5px] font-black uppercase tracking-wide text-finn-iron">Earlier chats</p>
                        <ul>
                            {others.map((chat) => (
                                <li key={chat.id}>
                                    <button
                                        type="button"
                                        onClick={() => void openChat(chat)}
                                        className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-finn-pale-blue"
                                    >
                                        <ChatIcon chat={chat} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[12.5px] font-black">{chat.title}</span>
                                            <span className="block truncate text-[11px] text-finn-iron">
                                                {winnerOf(chat) ? `Picked the ${winnerOf(chat)!.name}` : "Not judged yet"} · {calculateTimeAgo(chat.updatedAt)}
                                            </span>
                                        </span>
                                        <ChevronRight aria-hidden="true" className="h-4 w-4 text-finn-iron" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                <footer className="flex items-center justify-between gap-3 px-2 pt-1 pb-2 text-[11px] leading-4 text-finn-iron">
                    <p>
                        Unofficial — not made by or affiliated with{" "}
                        <a href={FINN_BASE_URL} target="_blank" rel="noopener noreferrer" className="text-finn-accent-blue underline underline-offset-2">
                            FINN
                        </a>
                        .
                    </p>
                    <button type="button" onClick={() => void browser.runtime.openOptionsPage()} className="shrink-0 font-bold text-finn-accent-blue hover:underline">
                        Your data
                    </button>
                </footer>
            </div>
        </main>
    );
}

function StatusPill({ where }: { where: Where | null }) {
    const [dot, text] =
        where == null
            ? ["bg-white/50", "Checking this page…"]
            : where.kind === "online"
              ? ["bg-finn-success", `Online · ${where.stats.detected} ${where.stats.detected === 1 ? "car" : "cars"} on this page`]
              : where.kind === "asleep"
                ? ["bg-finn-warning", "On finn.com · reload to start Lens"]
                : ["bg-finn-iron", "Offline · works only on finn.com"];

    return (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-white/85 ring-1 ring-white/15">
            <span className={`h-2 w-2 rounded-full ${dot} ${where?.kind === "online" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
            {text}
        </div>
    );
}

function Metric({ label, value, helper, accent = false }: { label: string; value: number; helper: string; accent?: boolean }) {
    return (
        <div className="flex flex-1 flex-col items-center py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-finn-iron">{label}</p>
            <p className={`mt-1.5 font-mono text-[34px] font-bold leading-none tracking-[-0.02em] ${accent ? "text-finn-accent-blue" : "text-finn-highlight-navy"}`}>{value}</p>
            <p className="mt-1.5 text-[11px] text-finn-iron">{helper}</p>
        </div>
    );
}

function ChatIcon({ chat }: { chat: Chat }) {
    return (
        <span
            aria-hidden="true"
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chat.judgement ? "bg-[#fff3c4] text-[#b7791f]" : "bg-finn-snow text-finn-iron"}`}
        >
            {chat.judgement ? <Trophy className="h-4 w-4" /> : chat.messages.length ? <MessageCircle className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}
        </span>
    );
}
