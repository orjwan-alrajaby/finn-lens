import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, MessagesSquare, SquarePen, X } from "lucide-react";

import { BrandMark, IconButton } from "@/components/lens-parts";
import { onPageChanged, requestCloseChat, requestOpenDrawer, requestPageContext } from "@/lib/chats/bridge";
import { depthOf } from "@/lib/chats/depth";
import { rewindable } from "@/lib/chats/flow";
import { loadedCars, pageCars } from "@/lib/chats/scope";
import { ACTIVE_CHAT_KEY, activeChatId } from "@/lib/chats/store";

import { ChatList } from "./ChatList";
import { MessageList, useReveal } from "./Messages";
import { useConversation, type PageCars } from "./useConversation";

/**
 * Lens, in the bubble on finn.com.
 *
 * Opens on the chat the page's chips belong to, or — the first time, and
 * whenever there isn't one — on a new chat that greets the reader. Every
 * chat is kept, and the list of them is one tap away.
 */

const EMPTY_PAGE: PageCars = { cars: [], headline: "", url: "", urls: {} };

export function App() {
    const [page, setPage] = useState<PageCars>(EMPTY_PAGE);
    const [pageRead, setPageRead] = useState(false);
    /** The chat on screen was just started here, so its greeting is "typed" rather than shown whole. */
    const [fresh, setFresh] = useState(false);
    const [view, setView] = useState<"chat" | "list">("chat");
    const conversation = useConversation(page);
    const { chat, busy } = conversation;

    /* -- The page ----------------------------------------------------------- */

    const readPage = useCallback(async () => {
        const [context, loaded] = await Promise.all([requestPageContext(), loadedCars()]);
        const cars = pageCars(context, loaded);

        setPage({ cars: cars.cars, headline: cars.headline, url: context?.url ?? "", urls: context?.carUrls ?? {} });
        setPageRead(true);
    }, []);

    useEffect(() => {
        void readPage();

        /* A burst of changes — FINN draws cards and loads cars together — is read once. */
        let timer: number | undefined;

        return onPageChanged(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => void readPage(), 300);
        });
    }, [readPage]);

    /* -- Which chat --------------------------------------------------------- */

    const started = useRef(false);

    useEffect(() => {
        if (!pageRead || started.current) return;
        started.current = true;

        void (async () => {
            const id = await activeChatId();
            const opened = id ? await conversation.open(id) : null;

            if (!opened) {
                setFresh(true);
                await conversation.startNew();
            }
        })();
    }, [pageRead, conversation]);

    /*
     * The popup can open another chat while this one is on screen, and
     * Settings can take it away: follow either.
     */
    useEffect(() => {
        const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
            if (area !== "local" || !(ACTIVE_CHAT_KEY in changes)) return;

            const next = changes[ACTIVE_CHAT_KEY]?.newValue;

            if (next === conversation.chat?.id) return;

            setView("chat");

            if (typeof next === "string") {
                setFresh(false);
                void conversation.open(next);
            } else {
                setFresh(true);
                void conversation.startNew();
            }
        };

        browser.storage.onChanged.addListener(listener);
        return () => browser.storage.onChanged.removeListener(listener);
    }, [conversation]);

    const startNew = async () => {
        setFresh(true);
        setView("chat");
        await conversation.startNew();
    };

    const openChat = async (id: string) => {
        setFresh(false);
        setView("chat");
        await conversation.open(id);
    };

    /* -- The conversation --------------------------------------------------- */

    const { shown, typing } = useReveal(chat?.messages ?? [], chat?.id ?? null, fresh);
    const scroller = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    }, [shown.length, typing, busy]);

    const settled = !typing && !busy && chat != null;
    const openAsk = chat?.messages.some((message) => message.kind === "ask" && !message.answered) ?? false;

    /* Cars on this page the chat's judgement didn't cover: a different page, or more cars since. */
    const unjudged = useMemo(() => {
        if (!chat?.judgement) return 0;

        return page.cars.filter((car) => !(car.id in chat.judgement!.verdicts)).length;
    }, [chat?.judgement, page.cars]);

    const replies: { label: string; run: () => void }[] = [];

    if (settled && chat.phase === "judged") {
        replies.push({ label: "Why this car?", run: () => void conversation.whyWinner() });
        /* How much Lens explains, from here on: the other way from where it is. */
        if (depthOf(chat).explain !== "detailed") replies.push({ label: "Tell me more", run: () => void conversation.explain("detailed") });
        if (depthOf(chat).explain !== "quick") replies.push({ label: "Keep it quick", run: () => void conversation.explain("quick") });
        replies.push({ label: "Change my answers", run: () => void conversation.change() });
        replies.push({ label: "New chat", run: () => void startNew() });
    }

    if (settled && chat.phase === "ready" && !openAsk && page.cars.length) {
        replies.push({ label: "Judge the cars here", run: () => void conversation.judgeHere() });
    }

    return (
        <div className="flex h-screen flex-col bg-finn-snow font-sans text-finn-black">
            <header className="flex shrink-0 items-center gap-2.5 bg-finn-highlight-navy px-3 py-2.5 text-white">
                {view === "list" && chat ? (
                    <IconButton label="Back to the chat" tone="dark" onClick={() => setView("chat")}>
                        <ArrowLeft aria-hidden="true" className="h-5 w-5" />
                    </IconButton>
                ) : (
                    <BrandMark size={34} />
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black leading-tight">Lens</p>
                    <p className="truncate text-[11.5px] text-white/70">
                        {view === "list" ? "Every chat you've had" : (chat?.title ?? "Your car-choosing assistant")}
                    </p>
                </div>
                {view === "chat" ? (
                    <>
                        <IconButton label="Your chats" tone="dark" onClick={() => setView("list")}>
                            <MessagesSquare aria-hidden="true" className="h-[18px] w-[18px]" />
                        </IconButton>
                        <IconButton label="New chat" tone="dark" onClick={() => void startNew()}>
                            <SquarePen aria-hidden="true" className="h-[18px] w-[18px]" />
                        </IconButton>
                    </>
                ) : null}
                <IconButton label="Close" tone="dark" onClick={() => void requestCloseChat()}>
                    <X aria-hidden="true" className="h-5 w-5" />
                </IconButton>
            </header>

            {view === "list" ? (
                <ChatList
                    activeId={chat?.id ?? null}
                    onOpen={(id) => void openChat(id)}
                    onNew={() => void startNew()}
                    onDeleted={(id) => {
                        if (id === chat?.id) conversation.clear();
                    }}
                />
            ) : (
                <>
                    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                        {chat ? (
                            <MessageList
                                messages={shown}
                                typing={typing || busy}
                                busy={busy}
                                onAnswer={(askId, chosen, extra) => void conversation.tap(askId, chosen, extra)}
                                onImportance={(needId, level) => void conversation.importance(needId, level)}
                                onChange={(step) => void conversation.changeOne(step)}
                                editable={rewindable(chat)}
                                onEdit={() => void conversation.takeBack()}
                                onOpenCar={(id, judgement) => chat && void requestOpenDrawer(chat.id, id, judgement)}
                                explain={depthOf(chat).explain}
                            />
                        ) : null}
                    </div>

                    {settled && unjudged > 0 && chat.phase === "judged" ? (
                        <div className="flex shrink-0 items-center gap-3 border-t border-finn-cotton bg-white px-3.5 py-2.5">
                            <p className="min-w-0 flex-1 text-[12px] leading-snug text-finn-iron">
                                {unjudged} {unjudged === 1 ? "car on this page isn't" : "cars on this page aren't"} in this judgement yet.
                            </p>
                            <button
                                type="button"
                                onClick={() => void conversation.addHere()}
                                className="shrink-0 rounded-full bg-finn-pale-blue px-3 py-1.5 text-[12px] font-black text-finn-accent-blue transition-colors hover:bg-finn-accent-blue hover:text-white"
                            >
                                Add them to the judgement
                            </button>
                        </div>
                    ) : null}

                    {replies.length ? (
                        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-finn-cotton bg-white px-3 pt-2.5 pb-0.5">
                            {replies.map((reply) => (
                                <button
                                    key={reply.label}
                                    type="button"
                                    onClick={reply.run}
                                    className="shrink-0 rounded-full bg-finn-pale-blue px-3.5 py-2 text-[12.5px] font-bold text-finn-accent-blue transition-colors hover:bg-finn-accent-blue hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                                >
                                    {reply.label}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <Composer disabled={!chat || busy} asking={openAsk} onSend={(text) => void conversation.type(text)} />
                </>
            )}
        </div>
    );
}

function Composer({ disabled, asking, onSend }: { disabled: boolean; asking: boolean; onSend: (text: string) => void }) {
    const [text, setText] = useState("");

    const send = () => {
        if (!text.trim() || disabled) return;

        onSend(text);
        setText("");
    };

    return (
        <form
            className="flex shrink-0 items-center gap-2 border-t border-finn-cotton bg-white px-3 py-2.5"
            onSubmit={(event) => {
                event.preventDefault();
                send();
            }}
        >
            <label className="sr-only" htmlFor="lens-message">
                Message Lens
            </label>
            <input
                id="lens-message"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={asking ? "Tap an answer, or type your own…" : "Type a message…"}
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-full bg-finn-snow px-4 text-[13.5px] text-finn-black ring-1 ring-finn-cotton outline-none placeholder:text-finn-iron/80 focus:ring-2 focus:ring-finn-accent-blue/40"
            />
            <button
                type="submit"
                disabled={disabled || !text.trim()}
                aria-label="Send"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-finn-accent-blue text-white transition-colors hover:bg-finn-highlight-navy disabled:bg-finn-cotton disabled:text-finn-iron"
            >
                <ArrowUp aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
            </button>
        </form>
    );
}
