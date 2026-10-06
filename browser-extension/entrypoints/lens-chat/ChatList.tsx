import { useEffect, useState } from "react";
import { ChevronRight, SquarePen, Trash2, Trophy } from "lucide-react";

import { deleteChat, listChats } from "@/lib/chats/store";
import type { Chat } from "@/lib/chats/types";
import { calculateTimeAgo } from "@/lib/utils";

/**
 * Every conversation the reader has had with Lens, newest first — like the
 * list of chats in any messenger. Opening one carries on from where it was,
 * and puts that chat's judgement on the cards.
 */

function preview(chat: Chat): string {
    const result = [...chat.messages].reverse().find((message) => message.kind === "result");

    if (result?.kind === "result" && result.winner) return `Picked the ${result.winner.name}`;

    const last = [...chat.messages].reverse().find((message) => message.kind === "text");

    return last?.kind === "text" ? last.text : "Just started";
}

export function ChatList({
    activeId,
    onOpen,
    onNew,
    onDeleted,
}: {
    activeId: string | null;
    onOpen: (id: string) => void;
    onNew: () => void;
    onDeleted: (id: string) => void;
}) {
    const [chats, setChats] = useState<Chat[] | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);

    useEffect(() => {
        void listChats().then(setChats);
    }, []);

    const remove = async (id: string) => {
        await deleteChat(id);
        setConfirming(null);
        setChats(await listChats());
        onDeleted(id);
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
                <h2 className="text-[13px] font-black uppercase tracking-wide text-finn-iron">Your chats</h2>
                <button
                    type="button"
                    onClick={onNew}
                    className="inline-flex items-center gap-1.5 rounded-full bg-finn-accent-blue px-3.5 py-2 text-[12.5px] font-black text-white transition-colors hover:bg-finn-highlight-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                >
                    <SquarePen aria-hidden="true" className="h-4 w-4" />
                    New chat
                </button>
            </div>

            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-4">
                {chats?.length === 0 ? <li className="px-1 py-6 text-center text-[13px] text-finn-iron">No chats yet.</li> : null}

                {chats?.map((chat) => {
                    const active = chat.id === activeId;

                    if (confirming === chat.id) {
                        return (
                            <li key={chat.id} className="rounded-2xl bg-white p-3.5 ring-1 ring-finn-fit-limited/30">
                                <p className="text-[13px] font-bold text-finn-black">Delete “{chat.title}”?</p>
                                <p className="mt-0.5 text-[12px] text-finn-iron">
                                    The conversation and its judgement go for good{active ? ", and the chips come off the cards" : ""}.
                                </p>
                                <div className="mt-2.5 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void remove(chat.id)}
                                        className="rounded-full bg-finn-fit-limited px-3.5 py-1.5 text-[12px] font-black text-white hover:opacity-90"
                                    >
                                        Delete
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirming(null)}
                                        className="rounded-full bg-finn-cotton px-3.5 py-1.5 text-[12px] font-black text-finn-black hover:bg-finn-pale-blue"
                                    >
                                        Keep it
                                    </button>
                                </div>
                            </li>
                        );
                    }

                    return (
                        <li key={chat.id} className="group relative">
                            <button
                                type="button"
                                onClick={() => onOpen(chat.id)}
                                className={[
                                    "flex w-full items-center gap-3 rounded-2xl p-3 pr-11 text-left transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue",
                                    active ? "bg-finn-pale-blue ring-1 ring-finn-accent-blue/25" : "bg-white ring-1 ring-black/5 hover:bg-finn-pale-blue/60",
                                ].join(" ")}
                            >
                                <span
                                    className={[
                                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                                        chat.judgement ? "bg-[#fff3c4] text-[#b7791f]" : "bg-finn-cotton text-finn-iron",
                                    ].join(" ")}
                                    aria-hidden="true"
                                >
                                    {chat.judgement ? <Trophy className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline gap-2">
                                        <span className="truncate text-[13px] font-black text-finn-black">{chat.title}</span>
                                        <span className="ml-auto shrink-0 text-[11px] text-finn-iron">{calculateTimeAgo(chat.updatedAt)}</span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-[12px] text-finn-iron">{preview(chat)}</span>
                                    {active && chat.judgement ? (
                                        <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue">
                                            On the cards now
                                        </span>
                                    ) : null}
                                </span>
                            </button>

                            <button
                                type="button"
                                aria-label={`Delete “${chat.title}”`}
                                onClick={() => setConfirming(chat.id)}
                                className="absolute top-1/2 right-2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-finn-iron opacity-60 transition hover:bg-white hover:text-finn-fit-limited hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                            >
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
