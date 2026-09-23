import { useEffect, useRef, type RefObject } from "react";
import { SendHorizontal, X } from "lucide-react";

import { Thinking } from "@/entrypoints/compare/lens-ai/parts";
import { ConfirmAsk, FeatureAsk, LensStatus, QuestionAsk, Said, Says } from "@/entrypoints/lens-chat/chat-parts";
import { PickCard } from "@/entrypoints/lens-chat/pick";
import type { CarActions } from "@/entrypoints/lens-chat/cards";
import { DEMO_MESSAGE, DEMO_QUESTION, DEMO_REPLY, DEMO_SUGGESTIONS, type DemoConversation } from "@/lib/lens-chat/demo-conversation";

import { BrandDisc } from "../Tour/parts";

export type ChatStage = "closed" | "listening" | "understood" | "answered" | "fit";

const NO_ACTIONS: CarActions = {
    pinnedIds: new Set(),
    onPin: () => {},
    canShow: () => false,
    onShow: () => {},
};

/**
 * The Ask Lens bubble finn.com gets, drawn like the real one: navy, Lens's
 * disc, bottom right. Only there while Lens AI is on, which the step says.
 */
export function MockBubble({
    open,
    onClick,
    bubbleRef,
}: {
    open: boolean;
    onClick: () => void;
    bubbleRef: RefObject<HTMLButtonElement | null>;
}) {
    return (
        <button
            ref={bubbleRef}
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-label={open ? "Close the example chat" : "Open the example chat"}
            className="absolute right-3 bottom-3 z-40 flex h-12 items-center gap-2 rounded-full bg-finn-highlight-navy pr-4 pl-1.5 text-[13px] font-black text-white shadow-xl ring-1 ring-white/10 transition hover:bg-finn-accent-blue"
        >
            <BrandDisc size={36} />
            {open ? "Close" : "Ask Lens"}
        </button>
    );
}

/**
 * The chat the bubble opens, with one conversation in it.
 *
 * The cards are the real ones from `entrypoints/lens-chat`, fed a scripted
 * reading and a real engine run (`demoConversation`), so what the reader sees
 * here is what the chat on finn.com draws — not a picture of it.
 */
export function ChatMock({
    stage,
    demo,
    panelRef,
    onCompare,
    onClose,
}: {
    stage: ChatStage;
    demo: DemoConversation;
    /** What the guide points at: the whole chat, so its bubble sits beside it rather than over it. */
    panelRef: RefObject<HTMLDivElement | null>;
    onCompare: () => void;
    onClose: () => void;
}) {
    const scopeLabel = "3 cars on this page";
    const body = useRef<HTMLDivElement>(null);
    const message = useRef<HTMLParagraphElement>(null);
    const understanding = useRef<HTMLDivElement>(null);
    const fit = useRef<HTMLDivElement>(null);

    /* Each stage brings the start of what it adds to the top of the chat, as a new card does. */
    useEffect(() => {
        if (stage === "closed") return;

        const target = { listening: message, understood: understanding, answered: understanding, fit: fit }[stage].current;

        if (!body.current || !target) return;

        /* The confirmation is the end of the card, so that's what this step is about. */
        body.current.scrollTop = stage === "answered" ? body.current.scrollHeight : target.offsetTop - 12;
    }, [stage]);

    /*
     * Mounted while closed, only invisible: the guide finds its target when a
     * step starts, which is the same moment the step opens the chat, so a
     * chat that only existed once open would be found missing.
     */
    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Example Ask Lens chat"
            aria-hidden={stage === "closed" || undefined}
            className="data-[closed]:invisible absolute inset-x-2 top-2 bottom-[68px] z-40 flex flex-col overflow-hidden rounded-[22px] bg-white shadow-2xl ring-1 ring-black/5 sm:left-auto sm:w-[380px]"
            data-closed={stage === "closed" || undefined}
        >
            <div className="flex items-center gap-2 border-b border-finn-cotton px-3 py-2.5">
                <BrandDisc size={28} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black leading-4">Lens</p>
                    <p className="truncate text-[11px] leading-4 text-finn-iron">Comparing {scopeLabel}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close the example chat"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-finn-iron transition hover:bg-finn-snow hover:text-finn-black"
                >
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            </div>

            {stage !== "listening" && stage !== "closed" && (
                <LensStatus understanding={stage === "understood" ? demo.understanding : demo.answered} onOpen={() => {}} />
            )}

            <div ref={body} className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-finn-snow px-3 py-3">
                <div ref={message}>
                    <Said>{DEMO_MESSAGE}</Said>
                </div>

                {stage === "listening" && <Thinking>Listening…</Thinking>}

                {stage !== "listening" && (
                    <div ref={understanding} className="space-y-3">
                        <Says>{DEMO_REPLY}</Says>

                        {stage === "understood" ? (
                            <>
                                <QuestionAsk question={DEMO_QUESTION} busy={false} answered={null} onAnswer={onCompare} />
                                <FeatureAsk id={DEMO_SUGGESTIONS[0]!.id} why={DEMO_SUGGESTIONS[0]!.why} busy={false} answered={null} onAnswer={onCompare} />
                            </>
                        ) : (
                            <>
                                <QuestionAsk
                                    question={DEMO_QUESTION}
                                    busy={false}
                                    answered={{ text: DEMO_QUESTION.options[1] ?? null, choice: DEMO_QUESTION.options[1] ?? null }}
                                    onAnswer={() => {}}
                                />
                                <FeatureAsk
                                    id={DEMO_SUGGESTIONS[0]!.id}
                                    why={DEMO_SUGGESTIONS[0]!.why}
                                    busy={false}
                                    answered={{ text: "Yes, count a 360° camera.", choice: "yes" }}
                                    onAnswer={() => {}}
                                />
                                <ConfirmAsk
                                    headline="3 cars on this page"
                                    isUpdate={false}
                                    busy={false}
                                    done={stage === "fit" ? "compared" : false}
                                    onCompare={onCompare}
                                    onCorrect={() => {}}
                                />
                            </>
                        )}
                    </div>
                )}

                {stage === "fit" && demo.story && demo.match && (
                    <div ref={fit} className="space-y-3">
                        <Says>Here&rsquo;s what I&rsquo;d look at first.</Says>
                        <PickCard
                            story={demo.story}
                            car={demo.match.car}
                            alternative={demo.alternatives[0] ?? null}
                            actions={NO_ACTIONS}
                            onWhy={() => {}}
                            onAlternatives={() => {}}
                        />
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 border-t border-finn-cotton bg-white px-3 py-2">
                <span className="flex-1 text-sm text-finn-iron/70">Ask about these cars, or “what if…”</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-finn-accent-blue text-white opacity-40">
                    <SendHorizontal aria-hidden="true" className="h-4 w-4" />
                </span>
            </div>
        </div>
    );
}
