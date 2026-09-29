import { useCallback, useEffect, useState } from "react";
import { Database, MessageCircle, ShieldCheck, Trash2 } from "lucide-react";

import { BRAND_IDLE_SPIN } from "@/lib/brand-spinner";
import { FINN_BASE_URL } from "@/lib/constants";
import { clearGroups, DATA_GROUPS, summarise, type DataGroupId, type DataSummary } from "@/lib/chats/data";
import { summaryOf } from "@/lib/chats/flow";
import { loadSettings, setActiveChat } from "@/lib/chats/store";
import type { SavedSettings } from "@/lib/chats/types";

/**
 * Settings: the reader's saved answers, and everything Lens keeps.
 *
 * There are no priorities or profiles to set here any more — the chat is
 * where the reader says what matters, and this page only shows what they
 * asked Lens to keep, with the way to change it (a chat) or forget it. The
 * rest is their data: what's stored, how much, and deleting any of it.
 */

export function App() {
    const [settings, setSettings] = useState<SavedSettings | null | undefined>(undefined);
    const [summary, setSummary] = useState<DataSummary | null>(null);
    const [confirming, setConfirming] = useState<DataGroupId[] | null>(null);
    const [done, setDone] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const [saved, data] = await Promise.all([loadSettings(), summarise()]);
        setSettings(saved);
        setSummary(data);
    }, []);

    useEffect(() => {
        void refresh();

        /* A chat on finn.com can change what's stored while this is open. */
        const listener = (_: unknown, area: string) => {
            if (area === "local") void refresh();
        };

        browser.storage.onChanged.addListener(listener);
        return () => browser.storage.onChanged.removeListener(listener);
    }, [refresh]);

    const clear = async (ids: DataGroupId[]) => {
        await clearGroups(ids);
        setConfirming(null);
        setDone(ids.length > 1 ? "Everything Lens kept is gone." : `${DATA_GROUPS.find((group) => group.id === ids[0])?.title} — deleted.`);
        await refresh();
    };

    const changeInChat = async () => {
        /* No chat on screen means the bubble starts a new one — from these answers. */
        await setActiveChat(null);
        await browser.runtime.sendMessage({ type: "OPEN_LENS_ON_FINN", url: null });
    };

    const told = settings ? summaryOf(settings.understanding) : null;
    const count = (id: DataGroupId): string | null => {
        if (!summary) return null;
        if (id === "chats") return `${summary.chats} ${summary.chats === 1 ? "chat" : "chats"}${summary.judged ? `, ${summary.judged} judged` : ""}`;
        if (id === "cars") return `${summary.cars} ${summary.cars === 1 ? "car" : "cars"}`;
        if (id === "settings") return summary.hasSettings ? "Saved" : "None saved";
        return summary.present.includes(id) ? "Some" : "Nothing";
    };

    const visible = DATA_GROUPS.filter((group) => group.id !== "leftovers" || summary?.present.includes("leftovers"));

    return (
        <main className="min-h-screen bg-finn-snow font-sans text-finn-black">
            <header className="bg-gradient-to-br from-finn-highlight-navy to-finn-accent-blue text-white">
                <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-8">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                        <img src="/icon/128.png" alt="" className={`h-12 w-12 object-contain ${BRAND_IDLE_SPIN}`} />
                    </span>
                    <div>
                        <h1 className="text-[24px] font-black leading-tight tracking-tight">Finn Lens settings</h1>
                        <p className="text-[13px] text-white/75">Your saved answers, and everything Lens keeps in this browser.</p>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
                {done ? (
                    <p role="status" className="rounded-2xl bg-finn-fit-good-pale px-4 py-3 text-[13px] font-bold text-finn-fit-good">
                        {done}
                    </p>
                ) : null}

                {/* -- Answers -------------------------------------------------- */}
                <Card icon={<MessageCircle className="h-5 w-5" />} title="Your answers" subtitle="What new chats start from. You change them by talking to Lens, not here.">
                    {settings === undefined ? null : told ? (
                        <>
                            <dl className="divide-y divide-finn-cotton overflow-hidden rounded-2xl ring-1 ring-finn-cotton">
                                {told.lines.map((line) => (
                                    <div key={line.label} className="grid grid-cols-[150px_1fr] gap-4 bg-white px-4 py-3 text-[13px]">
                                        <dt className="font-bold text-finn-iron">{line.label}</dt>
                                        <dd className="font-semibold">{line.label === "For" && settings?.rentalMonths ? `${settings.rentalMonths} months, from when you start a chat` : line.value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="mt-2 text-[12px] text-finn-iron">
                                Saved {new Date(settings!.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <PrimaryButton onClick={() => void changeInChat()}>Change them in a chat</PrimaryButton>
                                <QuietButton onClick={() => setConfirming(["settings"])}>Forget my answers</QuietButton>
                            </div>
                        </>
                    ) : (
                        <div>
                            <p className="text-[13px] leading-relaxed">
                                You haven't saved any answers yet. When a chat asks <em>“Shall I keep these as your settings?”</em>, choosing <strong>Save as my settings</strong> keeps them here, and every new chat starts from them.
                            </p>
                            <div className="mt-4">
                                <PrimaryButton onClick={() => void changeInChat()}>Start a chat on finn.com</PrimaryButton>
                            </div>
                        </div>
                    )}
                </Card>

                {/* -- Data ----------------------------------------------------- */}
                <Card
                    icon={<Database className="h-5 w-5" />}
                    title="Your data"
                    subtitle={summary ? `Lens keeps about ${summary.kilobytes.toLocaleString("en-GB")} kB in this browser. Nothing is sent anywhere.` : "Everything Lens keeps in this browser."}
                >
                    <ul className="space-y-2">
                        {visible.map((group) => (
                            <li key={group.id} className="rounded-2xl bg-white p-4 ring-1 ring-finn-cotton">
                                {confirming?.length === 1 && confirming[0] === group.id ? (
                                    <Confirm
                                        title={`Delete “${group.title.toLowerCase()}”?`}
                                        body={group.consequence}
                                        onConfirm={() => void clear([group.id])}
                                        onCancel={() => setConfirming(null)}
                                    />
                                ) : (
                                    <div className="flex items-start gap-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-baseline gap-2 text-[14px] font-black">
                                                {group.title}
                                                <span className="text-[12px] font-bold text-finn-iron">{count(group.id)}</span>
                                            </p>
                                            <p className="mt-0.5 text-[12.5px] leading-snug text-finn-iron">{group.description}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setConfirming([group.id])}
                                            disabled={!summary?.present.includes(group.id)}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-finn-cotton px-3.5 py-2 text-[12px] font-black text-finn-black transition-colors hover:bg-finn-fit-limited-pale hover:text-finn-fit-limited disabled:cursor-default disabled:opacity-40 disabled:hover:bg-finn-cotton disabled:hover:text-finn-black"
                                        >
                                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                            {group.id === "cars" ? "Clear the cache" : "Delete"}
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
                                onConfirm={() => void clear(DATA_GROUPS.map((group) => group.id))}
                                onCancel={() => setConfirming(null)}
                            />
                        ) : (
                            <div className="flex items-center gap-4">
                                <p className="min-w-0 flex-1 text-[12.5px] text-finn-iron">Start over completely: every chat, your answers, and the cars Lens has read.</p>
                                <button
                                    type="button"
                                    onClick={() => setConfirming(DATA_GROUPS.map((group) => group.id))}
                                    className="shrink-0 rounded-full bg-finn-fit-limited-pale px-4 py-2 text-[12px] font-black text-finn-fit-limited hover:bg-finn-fit-limited hover:text-white"
                                >
                                    Delete everything
                                </button>
                            </div>
                        )}
                    </div>
                </Card>

                {/* -- About ---------------------------------------------------- */}
                <Card icon={<ShieldCheck className="h-5 w-5" />} title="About Finn Lens">
                    <ul className="space-y-2 text-[13px] leading-relaxed">
                        <li>
                            Lens is <strong>unofficial</strong>: it isn't made by, or affiliated with,{" "}
                            <a href={FINN_BASE_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-finn-accent-blue underline underline-offset-2">
                                FINN
                            </a>
                            .
                        </li>
                        <li>It only works on finn.com, reading the same car data FINN's own pages load while you browse.</li>
                        <li>Everything it keeps stays in this browser. There's no account and no server.</li>
                    </ul>
                </Card>
            </div>
        </main>
    );
}

function Card({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-[28px] bg-white/60 p-6 ring-1 ring-black/5">
            <div className="mb-4 flex items-start gap-3">
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

function Confirm({ title, body, onConfirm, onCancel }: { title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
    return (
        <div role="alertdialog" aria-label={title}>
            <p className="text-[14px] font-black">{title}</p>
            <p className="mt-0.5 text-[12.5px] text-finn-iron">{body}</p>
            <div className="mt-3 flex gap-2">
                <button type="button" onClick={onConfirm} className="rounded-full bg-finn-fit-limited px-4 py-2 text-[12px] font-black text-white hover:opacity-90">
                    Delete
                </button>
                <QuietButton onClick={onCancel}>Keep it</QuietButton>
            </div>
        </div>
    );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="rounded-full bg-finn-accent-blue px-4 py-2.5 text-[13px] font-black text-white transition-colors hover:bg-finn-highlight-navy">
            {children}
        </button>
    );
}

function QuietButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="rounded-full bg-finn-cotton px-4 py-2.5 text-[13px] font-black text-finn-black transition-colors hover:bg-finn-pale-blue hover:text-finn-accent-blue">
            {children}
        </button>
    );
}

