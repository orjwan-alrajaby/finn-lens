import { useEffect, useState } from "react";
import { ChevronRight, MessageCircle, Trophy } from "lucide-react";

import { BrandMark } from "@/components/lens-parts";
import { FINN_BASE_URL } from "@/lib/constants";
import { listChats, setActiveChat } from "@/lib/chats/store";
import type { Chat } from "@/lib/chats/types";
import { calculateTimeAgo } from "@/lib/utils";

/**
 * The toolbar popup: the way back to Lens.
 *
 * Everything Lens does happens on finn.com, in the bubble. This only gets the
 * reader there — to the chat on the page they're on, or to one of their
 * chats, opened where it judged its cars.
 */

const RECENT = 5;

async function openOnFinn(url: string | null = null) {
    await browser.runtime.sendMessage({ type: "OPEN_LENS_ON_FINN", url });
    window.close();
}

export function App() {
    const [chats, setChats] = useState<Chat[]>([]);
    const [onFinn, setOnFinn] = useState(false);

    useEffect(() => {
        void listChats().then((all) => setChats(all.slice(0, RECENT)));
        void browser.tabs
            .query({ active: true, currentWindow: true })
            .then(([tab]) => setOnFinn(Boolean(tab?.url?.startsWith(FINN_BASE_URL))));
    }, []);

    const openChat = async (chat: Chat) => {
        await setActiveChat(chat.id);
        /* Where it judged its cars, unless the reader is on finn.com already. */
        await openOnFinn(onFinn ? null : (chat.judgement?.pageUrl ?? null));
    };

    return (
        <div className="w-[340px] font-sans text-finn-black">
            <header className="flex items-center gap-2.5 bg-finn-highlight-navy px-4 py-3.5 text-white">
                <BrandMark size={34} />
                <div>
                    <p className="text-[15px] font-black leading-tight">Finn Lens</p>
                    <p className="text-[11.5px] text-white/70">Chat your way to the right FINN car</p>
                </div>
            </header>

            <div className="p-4">
                <button
                    type="button"
                    onClick={() => void openOnFinn()}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-finn-accent-blue px-4 py-3 text-[13px] font-black text-white transition-colors hover:bg-finn-highlight-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                >
                    <MessageCircle aria-hidden="true" className="h-4 w-4" />
                    {onFinn ? "Chat with Lens on this page" : "Open Lens on finn.com"}
                </button>

                {chats.length ? (
                    <>
                        <h2 className="mt-5 mb-2 text-[11px] font-black uppercase tracking-wide text-finn-iron">Your recent chats</h2>
                        <ul className="space-y-1.5">
                            {chats.map((chat) => (
                                <li key={chat.id}>
                                    <button
                                        type="button"
                                        onClick={() => void openChat(chat)}
                                        className="flex w-full items-center gap-3 rounded-2xl bg-finn-snow p-2.5 text-left ring-1 ring-black/5 transition-colors hover:bg-finn-pale-blue focus-visible:outline-2 focus-visible:outline-finn-accent-blue"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${chat.judgement ? "bg-[#fff3c4] text-[#b7791f]" : "bg-white text-finn-iron"}`}
                                        >
                                            {chat.judgement ? <Trophy className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[12.5px] font-black">{chat.title}</span>
                                            <span className="block truncate text-[11px] text-finn-iron">{calculateTimeAgo(chat.updatedAt)}</span>
                                        </span>
                                        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-finn-iron" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <p className="mt-4 text-center text-[12.5px] leading-snug text-finn-iron">
                        Open finn.com and Lens will ask you a few questions, then judge the cars there for you.
                    </p>
                )}
            </div>
        </div>
    );
}
