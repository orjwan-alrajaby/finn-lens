import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Info, PencilLine, Plus, ShieldCheck, Star, Undo2, X } from "lucide-react";

import { ImportanceBadge, ImportanceKey } from "@/components/ImportanceKey";
import { BandChip, BrandMark, CarPhoto, euros, WinnerChip } from "@/components/lens-parts";
import { LocateButton } from "@/components/LocateButton";
import { activeFollowUp, followUps, IMPORTANCE_LABEL } from "@/lib/chats/flow";
import { IMPORTANCE, IMPORTANCE_LEVELS, SCALE_EXPLAINED } from "@/lib/lens-chat/importance";
import { DEAL_MEANS } from "@/lib/lens-chat/deals";
import type { Source } from "@/lib/sources";
import { tipItem, type TipContent, type TipItem } from "@/lib/lens-chat/messages";
import { TIP_CARD, TIP_DOT, TIP_HEADING, type TipTone } from "@/lib/lens-chat/tip-style";
import type { BubbleChips, CarSnapshot, ChatMessage, ChatStep, Choice, CustomAnswer, DealRow, StepId, SummaryBubble } from "@/lib/chats/types";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import { lowerFirst } from "@/lib/reasoning-engine/format";

/**
 * The conversation, as the reader sees it.
 *
 * Lens's messages arrive one at a time with a moment of "typing" before each,
 * so a greeting reads as someone talking rather than a page appearing. A chat
 * reopened later is shown whole, straight away.
 */

/* -------------------------------------------------------------------------- */
/* Arriving one at a time                                                     */
/* -------------------------------------------------------------------------- */

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const lengthOf = (message: ChatMessage): number =>
    message.kind === "text" ? message.text.length : message.kind === "ask" ? message.step.ask.length : 120;

/**
 * How many messages are on screen. Lens's new ones are let through after a
 * pause that grows a little with what it is saying; the reader's own appear at
 * once. `chatKey` changing resets it: a chat opened from the list is shown
 * whole, unless it is brand new, when its greeting is "typed".
 */
export function useReveal(messages: ChatMessage[], chatKey: string | null, fresh: boolean) {
    const [count, setCount] = useState(fresh ? 0 : messages.length);
    const key = useRef(chatKey);

    useEffect(() => {
        if (key.current === chatKey) return;

        key.current = chatKey;
        setCount(fresh ? 0 : messages.length);
    }, [chatKey, fresh, messages.length]);

    /* Taken back: the chat is shorter than what was shown, and what comes next is revealed afresh. */
    useEffect(() => {
        if (count > messages.length) setCount(messages.length);
    }, [count, messages.length]);

    useEffect(() => {
        if (count >= messages.length) return;

        const next = messages[count]!;

        if (next.from === "reader") {
            setCount((value) => value + 1);
            return;
        }

        const delay = reducedMotion() ? 120 : Math.min(1100, 380 + lengthOf(next) * 3.5);
        const timer = window.setTimeout(() => setCount((value) => value + 1), delay);

        return () => window.clearTimeout(timer);
    }, [count, messages]);

    return { shown: messages.slice(0, count), typing: count < messages.length };
}

/* -------------------------------------------------------------------------- */
/* Bubbles                                                                    */
/* -------------------------------------------------------------------------- */

/** A row of Lens's; the mark sits beside the last message of each run, as in any messenger. */
function LensRow({ avatar, children }: { avatar: boolean; children: React.ReactNode }) {
    return (
        <div className="flex items-end gap-2">
            <div className="w-7 shrink-0">{avatar ? <BrandMark size={28} className="ring-1 ring-finn-cotton" /> : null}</div>
            <div className="min-w-0 max-w-[86%] space-y-2">{children}</div>
        </div>
    );
}

function LensBubble({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-finn-black shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5">
            {children}
        </div>
    );
}

function ReaderBubble({ text, onEdit }: { text: string; onEdit?: () => void }) {
    return (
        <div className="flex flex-col items-end gap-1">
            <div className="max-w-[82%] rounded-2xl rounded-br-md bg-finn-accent-blue px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                {text}
            </div>
            {/* The last answer can be taken back: the question comes again, with it still picked. */}
            {onEdit ? (
                <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold text-finn-accent-blue transition-colors hover:bg-finn-pale-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                >
                    <PencilLine aria-hidden="true" className="h-3 w-3" />
                    Edit this answer
                </button>
            ) : null}
        </div>
    );
}

export function Typing() {
    return (
        <LensRow avatar>
            <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 ring-1 ring-black/5" role="status" aria-label="Lens is typing">
                {[0, 1, 2].map((dot) => (
                    <span
                        key={dot}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-finn-iron/60 motion-reduce:animate-none"
                        style={{ animationDelay: `${dot * 140}ms`, animationDuration: "900ms" }}
                    />
                ))}
            </div>
        </LensRow>
    );
}

/* -------------------------------------------------------------------------- */
/* A question with answers to tap                                             */
/* -------------------------------------------------------------------------- */

export type { TipContent };

/**
 * Where an "i" can open its panel outside the chat: beside it on finn.com,
 * on the chat's left (see `entrypoints/content/lens/companion.ts`). `show`
 * says whether it could; where it can't, or there's no page — a test, a
 * phone's sheet — the "i" opens its panel inside the chat instead.
 */
export interface TipCompanion {
    show(tip: TipContent, y: number): Promise<boolean>;
    /** The "i" moved with the chat's scroll; false once the panel has gone. */
    move(y: number): Promise<boolean>;
    hide(): void;
}

export const TipCompanionContext = createContext<TipCompanion | null>(null);

/*
 * Which "i" has the companion: one at a time, so opening another takes it
 * over, and its own "i" shows it's no longer open.
 */
let outsideTip: string | null = null;
const outsideListeners = new Set<() => void>();
const setOutsideTip = (id: string | null) => {
    outsideTip = id;
    outsideListeners.forEach((listener) => listener());
};

/** The reader closed the companion on the page's side: no "i" has it now. */
export const companionClosed = () => setOutsideTip(null);

/** The panel's width, and the gap it keeps from the "i" and from the edges. */
const TIP_WIDTH = 260;
const TIP_GAP = 8;

/**
 * The "i" beside an answer, opened by clicking it (or Enter / Space) and
 * never by hovering — a tooltip that pops up as the pointer passes covers
 * the very chips the reader is reaching for.
 *
 * On finn.com its panel is the chat's companion, beside the chat on its left
 * and joined to it level with the "i", so it never covers what it explains;
 * it follows the "i" as the chat scrolls, and stays open while the reader
 * taps. Where that has no room, it's a small panel inside the chat, to the
 * "i"'s left, else right, else below. A second click, ×, or Escape closes
 * either; the one inside the chat closes on a click elsewhere too.
 */
export function InfoTip({ label, tone = "idle", tip }: { label: string; tone?: "idle" | "on"; tip: TipContent }) {
    const companion = useContext(TipCompanionContext);
    const [outside, setOutside] = useState(false);
    const [open, setOpen] = useState(false);
    const [at, setAt] = useState<{ top: number; left: number; side: "left" | "right" | "below"; arrow: number } | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const id = useId();

    useLayoutEffect(() => {
        if (!open || !button.current || !panel.current) return;

        const anchor = button.current.getBoundingClientRect();
        const box = panel.current.getBoundingClientRect();
        const middle = anchor.top + anchor.height / 2;
        const clampTop = (top: number) => Math.min(Math.max(TIP_GAP, top), window.innerHeight - box.height - TIP_GAP);
        const beside = clampTop(middle - 22);

        if (anchor.left - TIP_GAP - box.width >= TIP_GAP) {
            setAt({ side: "left", left: anchor.left - TIP_GAP - box.width, top: beside, arrow: middle - beside });
        } else if (anchor.right + TIP_GAP + box.width <= window.innerWidth - TIP_GAP) {
            setAt({ side: "right", left: anchor.right + TIP_GAP, top: beside, arrow: middle - beside });
        } else {
            const left = Math.min(Math.max(TIP_GAP, anchor.left + anchor.width / 2 - box.width / 2), window.innerWidth - box.width - TIP_GAP);
            setAt({ side: "below", left, top: anchor.bottom + TIP_GAP, arrow: anchor.left + anchor.width / 2 - left });
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const away = (event: PointerEvent) => {
            if (!button.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            button.current?.focus();
        };
        /* Scrolling or resizing moves the "i" away from a panel fixed to the viewport: close it rather than leave it floating. */
        const moved = (event: Event) => {
            if (!panel.current?.contains(event.target as Node)) setOpen(false);
        };

        document.addEventListener("pointerdown", away);
        document.addEventListener("keydown", escape);
        document.addEventListener("scroll", moved, true);
        window.addEventListener("resize", moved);
        return () => {
            document.removeEventListener("pointerdown", away);
            document.removeEventListener("keydown", escape);
            document.removeEventListener("scroll", moved, true);
            window.removeEventListener("resize", moved);
        };
    }, [open]);

    /* Whether this "i" has the companion, kept in step with whichever has it. */
    useEffect(() => {
        const listener = () => setOutside(outsideTip === id);
        outsideListeners.add(listener);
        return () => {
            outsideListeners.delete(listener);
            /* Gone — the question answered, the chat moved on — so its panel goes too. */
            if (outsideTip === id) {
                companion?.hide();
                setOutsideTip(null);
            }
        };
    }, [id, companion]);

    /* While it has the companion: follow the chat's scroll, and let Escape close it. */
    useEffect(() => {
        if (!outside || !companion) return;

        let frame = 0;
        const follow = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const box = button.current?.getBoundingClientRect();
                if (!box) return;
                void companion.move(box.top + box.height / 2).then((shown) => {
                    if (!shown && outsideTip === id) setOutsideTip(null);
                });
            });
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            companion.hide();
            setOutsideTip(null);
            button.current?.focus();
        };

        document.addEventListener("scroll", follow, true);
        document.addEventListener("keydown", escape);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener("scroll", follow, true);
            document.removeEventListener("keydown", escape);
        };
    }, [outside, companion, id]);

    const toggle = async () => {
        if (outside) {
            companion?.hide();
            setOutsideTip(null);
            return;
        }
        if (open) {
            setOpen(false);
            return;
        }

        const box = button.current?.getBoundingClientRect();
        if (companion && box && (await companion.show(tip, box.top + box.height / 2))) {
            setOutsideTip(id);
            return;
        }

        /* No room beside the chat: inside it, and the companion isn't anyone's now. */
        if (outsideTip) setOutsideTip(null);
        setOpen(true);
    };

    return (
        <>
            <button
                ref={button}
                type="button"
                aria-label={`What “${label}” means`}
                aria-expanded={open || outside}
                aria-controls={open ? id : undefined}
                onClick={(event) => {
                    event.stopPropagation();
                    void toggle();
                }}
                className={[
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-finn-accent-blue",
                    /* Pressed: a solid disc, so which "i" the panel belongs to is plain at a glance. */
                    open || outside
                        ? tone === "on"
                            ? "bg-white text-finn-accent-blue shadow-sm ring-2 ring-white/50"
                            : "bg-finn-accent-blue text-white shadow-sm ring-2 ring-finn-accent-blue/30"
                        : tone === "on"
                          ? "text-white/80 hover:bg-white/20 hover:text-white"
                          : "text-finn-accent-blue/70 hover:bg-finn-pale-blue hover:text-finn-accent-blue",
                ].join(" ")}
            >
                <Info aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
            {open ? (
                <div
                    ref={panel}
                    id={id}
                    role="dialog"
                    aria-label={tip.title}
                    onClick={(event) => event.stopPropagation()}
                    style={{ position: "fixed", top: at?.top ?? -9999, left: at?.left ?? -9999, width: TIP_WIDTH, maxWidth: `calc(100vw - ${TIP_GAP * 2}px)` }}
                    className="z-50 rounded-xl bg-white text-left font-normal shadow-[0_8px_24px_rgba(0,0,0,0.16)] ring-1 ring-black/10"
                >
                    {/* The pointer: a corner of the panel turned towards the "i". */}
                    {at ? (
                        <span
                            aria-hidden="true"
                            style={at.side === "below" ? { top: -5, left: at.arrow - 5 } : { top: Math.max(10, at.arrow - 5), [at.side === "left" ? "right" : "left"]: -5 }}
                            className={[
                                "absolute h-2.5 w-2.5 rotate-45 bg-white",
                                at.side === "left" ? "border-t border-r border-black/10" : at.side === "right" ? "border-b border-l border-black/10" : "border-t border-l border-black/10",
                            ].join(" ")}
                        />
                    ) : null}
                    <TipPanel tip={tip} onClose={() => setOpen(false)} />
                </div>
            ) : null}
        </>
    );
}

/** What's inside the "i"'s panel, laid out the same way every time. */
export function TipPanel({ tip, onClose }: { tip: TipContent; onClose?: () => void }) {
    const body = (tip.body ?? []).filter((paragraph): paragraph is string => Boolean(paragraph));
    const lists = (tip.lists ?? []).filter((list) => list.items.length);

    return (
        <div className="relative max-h-[min(70vh,460px)] overflow-y-auto text-[13px] leading-[1.55] text-finn-black">
            <div className="flex items-center gap-2 border-b border-finn-cotton px-3 py-2.5">
                <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-finn-accent-blue text-white">
                    <Info className="h-3.5 w-3.5" strokeWidth={2.6} />
                </span>
                <p className="min-w-0 flex-1 text-[13.5px] font-black leading-snug">{tip.title}</p>
                {onClose ? (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-finn-iron hover:bg-finn-snow hover:text-finn-black focus-visible:outline-2 focus-visible:outline-finn-accent-blue"
                    >
                        <X aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.6} />
                    </button>
                ) : null}
            </div>

            <div className="space-y-2.5 px-3 pt-3 pb-3">
                {/* What it means first, then why it's starred: the star is about something the reader has just read. */}
                {body.map((paragraph) => (
                    <p key={paragraph} className="px-0.5">
                        {paragraph}
                    </p>
                ))}

                {tip.recommended ? (
                    <div className={`${TIP_CARD} flex gap-2`}>
                        <TipDot tone="star" />
                        <p className="text-[12.5px] font-semibold leading-snug text-[#7a4f00]">{tip.recommended}</p>
                    </div>
                ) : null}

                {lists.map((list) => {
                    const tone = list.tone ?? "check";
                    return (
                        <div key={list.label} className={TIP_CARD}>
                            <p className={`text-[12.5px] font-black ${TIP_HEADING[tone]}`}>{list.label}</p>
                            <ul className="mt-1.5 space-y-1.5">
                                {list.items.map((item) => (
                                    <TipListItem key={tipItem(item).label} item={item} tone={tone} />
                                ))}
                            </ul>
                            {list.hint ? <p className="mt-2 text-[11.5px] leading-snug text-finn-iron">{list.hint}</p> : null}
                        </div>
                    );
                })}

                {tip.note ? (
                    <div className="flex items-start gap-2 px-0.5">
                        <TipDot tone="note" />
                        <p className="text-[12px] leading-snug text-finn-iron">{tip.note}</p>
                    </div>
                ) : null}

                <TipSources sources={tip.sources} />
            </div>
        </div>
    );
}

/** One listed thing, with its own small "i" opening what it does right under its name. */
function TipListItem({ item, tone }: { item: string | TipItem; tone: TipTone }) {
    const { label, does } = tipItem(item);
    const [open, setOpen] = useState(false);

    return (
        <li>
            <span className="flex items-start gap-2">
                <TipDot tone={tone} />
                <span className="leading-snug">{label}</span>
                {does ? (
                    <button
                        type="button"
                        aria-label={`What “${label}” is`}
                        aria-expanded={open}
                        onClick={() => setOpen((current) => !current)}
                        className={[
                            "mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors",
                            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-finn-accent-blue",
                            open ? "bg-finn-accent-blue text-white" : "text-finn-accent-blue/70 hover:bg-finn-pale-blue hover:text-finn-accent-blue",
                        ].join(" ")}
                    >
                        <Info aria-hidden="true" className="h-3 w-3" strokeWidth={2.6} />
                    </button>
                ) : null}
            </span>
            {open && does ? <p className="mt-0.5 pl-[26px] text-[12px] leading-snug text-finn-iron">{does}</p> : null}
        </li>
    );
}

/** The small coloured disc on each line of the "i" panel, as the drawer has them. */
function TipDot({ tone }: { tone: TipTone }) {
    return (
        <span aria-hidden="true" className={`mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${TIP_DOT[tone]}`}>
            {tone === "star" ? (
                <Star className="h-2.5 w-2.5 fill-current" />
            ) : tone === "note" ? (
                <Info className="h-3 w-3" strokeWidth={2.6} />
            ) : (
                <Check className="h-3 w-3" strokeWidth={3} />
            )}
        </span>
    );
}

/**
 * Where something in a tooltip comes from, when it isn't FINN's: "Source ↗",
 * linked to check. The panel is small, so the name is left to the link's
 * label — read out by a screen reader, and on the page it opens.
 */
export function TipSources({ sources }: { sources?: Source[] }) {
    if (!sources?.length) return null;

    return (
        <p className="flex flex-wrap gap-x-3 text-[12px]">
            {sources.map((source, index) => (
                <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Source: ${source.name} (opens in a new tab)`}
                    className="inline-flex items-center gap-0.5 font-bold text-finn-accent-blue underline decoration-finn-accent-blue/30 underline-offset-2 hover:decoration-finn-accent-blue"
                >
                    {sources.length > 1 ? `Source ${index + 1}` : "Source"}
                    <ArrowUpRight aria-hidden="true" className="h-3 w-3" strokeWidth={2.6} />
                </a>
            ))}
        </p>
    );
}

/** What a choice means, for its "i": its name, why it's starred, what it is, and what Lens checks for it. */
function tipFor(choice: Choice): TipContent | null {
    const body = choice.means ?? choice.description;
    if (!body && !choice.looksFor?.length && !choice.recommended && !choice.standard) return null;

    return {
        title: choice.label,
        recommended: choice.recommended,
        body: [body, choice.means && choice.description !== choice.means ? choice.description : null],
        lists: [
            /* Each with what it does, behind its own "i". */
            { label: "I'll check", items: choice.features?.length ? choice.features : (choice.looksFor ?? []), tone: "check" },
            /* Standard equipment, listed the same way in its own green: what it is at a glance, how little it weighs in a line. */
            ...(choice.standard
                ? [{ label: "Also checked", items: choice.standard.items ?? choice.standard.labels, hint: choice.standard.short ?? choice.standard.hint, tone: "standard" as const }]
                : []),
        ],
        sources: choice.sources,
    };
}

function Chip({
    label,
    selected,
    onClick,
    disabled,
    muted,
    icon,
    info,
    recommended = false,
}: {
    label: string;
    selected?: boolean;
    onClick: () => void;
    disabled?: boolean;
    muted?: boolean;
    icon?: React.ReactNode;
    /** What the choice means: an "i" at the chip's right, with this in its panel. */
    info?: TipContent | null;
    /** Starred: something the reader said points to it. */
    recommended?: boolean;
}) {
    if (info) {
        /*
         * Two buttons that read as one chip: the name picks it, the "i" explains
         * it. Siblings rather than nested, since a button can't hold a button.
         */
        return (
            <span
                className={[
                    "inline-flex items-center rounded-full pr-1.5 transition-colors",
                    selected ? "bg-finn-accent-blue text-white shadow-sm" : "bg-white text-finn-accent-blue ring-1 ring-finn-accent-blue/35",
                    disabled ? "opacity-40" : "",
                ].join(" ")}
            >
                <button
                    type="button"
                    onClick={onClick}
                    disabled={disabled}
                    aria-pressed={selected}
                    className={[
                        "inline-flex items-center gap-1.5 rounded-l-full py-2 pr-1 pl-3.5 text-[12.5px] font-bold disabled:cursor-default",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue",
                        selected ? "" : "hover:text-finn-highlight-navy",
                    ].join(" ")}
                >
                    {selected ? (
                        <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : recommended ? (
                        <Star role="img" aria-label="Recommended" className="h-3.5 w-3.5 fill-current" />
                    ) : null}
                    {label}
                </button>
                <InfoTip label={label} tone={selected ? "on" : "idle"} tip={info} />
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={selected}
            className={[
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue disabled:cursor-default disabled:opacity-40",
                selected
                    ? "bg-finn-accent-blue text-white shadow-sm"
                    : muted
                      ? "bg-transparent text-finn-iron ring-1 ring-finn-iron/25 hover:bg-white hover:text-finn-black"
                      : "bg-white text-finn-accent-blue ring-1 ring-finn-accent-blue/35 hover:bg-finn-pale-blue",
            ].join(" ")}
        >
            {selected ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> : icon}
            {label}
        </button>
    );
}

/** What the reader can add to a question beyond the pre-made answers. */
export interface AnswerExtra {
    amount?: number;
}

/**
 * The question's number in this run of questions: the one after those
 * answered, so it always agrees with "Answered 2 of 9". Kept on questions
 * already answered, so scrolling back reads as a numbered list. Nothing for
 * what isn't one of the questions — how it works, "looks good?".
 */
function QuestionNumber({ progress, tone = "light" }: { progress?: { done: number; total: number }; tone?: "light" | "dark" }) {
    if (!progress) return null;

    return (
        <span
            aria-label={`Question ${progress.done + 1}`}
            className={[
                "mt-px inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums",
                tone === "dark" ? "bg-white/20 text-white" : "bg-finn-highlight-navy text-white",
            ].join(" ")}
        >
            {progress.done + 1}
        </span>
    );
}

/**
 * "Never mind — keep my answers", on a question asked only because the
 * reader chose to change something: one tap puts everything back as it was,
 * so a "Change" tapped by mistake costs nothing.
 */
function NeverMind({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-bold text-finn-iron ring-1 ring-finn-iron/25 transition-colors hover:bg-white hover:text-finn-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
        >
            <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />
            Never mind — keep my answers
        </button>
    );
}

/** "Answered 2 of 9", with a bar: how far through the questions the reader is. */
function Progress({ done, total, tone = "light" }: { done: number; total: number; tone?: "light" | "dark" }) {
    return (
        <span className="mb-1.5 flex items-center gap-2">
            <span className={`shrink-0 text-[10.5px] font-black uppercase tracking-wide ${tone === "dark" ? "text-white/75" : "text-finn-iron"}`}>
                Answered {done} of {total}
            </span>
            <span
                role="progressbar"
                aria-label="Questions answered"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                className={`block h-1 flex-1 overflow-hidden rounded-full ${tone === "dark" ? "bg-white/20" : "bg-finn-cotton"}`}
            >
                <span className={`block h-full rounded-full transition-[width] ${tone === "dark" ? "bg-white" : "bg-finn-accent-blue"}`} style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
            </span>
        </span>
    );
}

/** "Follow-ups answered: 1 of 3": the chip rows a section's bubbles opened, and how many have an answer. */
function FollowUpCount({ done, total, tone = "light" }: { done: number; total: number; tone?: "light" | "dark" }) {
    return (
        <span className={`flex items-center gap-1.5 text-[11px] font-bold ${tone === "dark" ? "text-white/80" : "px-1 text-finn-iron"}`}>
            <span className="inline-flex gap-0.5" aria-hidden="true">
                {Array.from({ length: total }, (_, index) => (
                    <span key={index} className={`h-2 w-2 rounded-full ${index < done
                                ? tone === "dark"
                                    ? "bg-white"
                                    : "bg-finn-fit-good"
                                : tone === "dark"
                                  ? "bg-white/30"
                                  : "bg-[#e6e8ec] ring-1 ring-inset ring-black/10"}`} />
                ))}
            </span>
            Follow-ups answered: {done} of {total}
        </span>
    );
}

/** How an open question tells the pinned bar its follow-ups: answered of opened, or null for none. */
type FollowUps = { done: number; total: number; current: { ask: string; answered: boolean } | null } | null;
const FollowUpsReport = createContext<(askId: string, value: FollowUps) => void>(() => {});

/** The nearest ancestor that scrolls: the chat's own scroller, in the panel. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
    for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    }
    return null;
}

/**
 * The open question, pinned to the top of the chat once it has scrolled up
 * out of view — while the reader works through a long row of chips — with
 * how far through they are. Tapping it brings the question back.
 */
function PinnedQuestion({ message, follow }: { message: Extract<ChatMessage, { kind: "ask" }> | null; follow: FollowUps }) {
    const [pinned, setPinned] = useState(false);

    useEffect(() => {
        setPinned(false);
        if (!message?.progress) return;

        const question = () => document.querySelector<HTMLElement>(`[data-question="${message.id}"]`);
        const check = () => {
            const element = question();
            const scroller = scrollParent(element);
            setPinned(Boolean(element && scroller && element.getBoundingClientRect().bottom < scroller.getBoundingClientRect().top + 4));
        };

        check();
        /*
         * Scrolling isn't the only thing that moves the question: a row of
         * chips opening or closing above the fold does too, with no scroll
         * event. So the open question's row is watched for size as well.
         */
        const row = question()?.closest<HTMLElement>("[data-ask]");
        const resized = typeof ResizeObserver === "undefined" || !row ? null : new ResizeObserver(check);
        if (row) resized?.observe(row);
        document.addEventListener("scroll", check, true);
        window.addEventListener("resize", check);
        return () => {
            resized?.disconnect();
            document.removeEventListener("scroll", check, true);
            window.removeEventListener("resize", check);
        };
    }, [message]);

    if (!message?.progress) return null;

    /*
     * No height of its own, so pinning it never moves the chat under it.
     * -top-4 and -mx-3 undo the scroller's padding (py-4 px-3 in App), so it
     * meets the top and both edges of the chat.
     */
    return (
        <div className="sticky -top-4 z-30 -mx-3 h-0">
            <button
                type="button"
                tabIndex={pinned ? 0 : -1}
                aria-hidden={!pinned}
                onClick={() =>
                    document.querySelector(`[data-question="${message.id}"]`)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" })
                }
                className={[
                    "absolute inset-x-0 top-0 block bg-finn-highlight-navy/95 px-4 pt-2 pb-2.5 text-left text-white shadow-md backdrop-blur transition-[opacity,transform] duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white",
                    pinned ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
                ].join(" ")}
            >
                <Progress {...message.progress} tone="dark" />
                <span className="flex items-start gap-2">
                    <QuestionNumber progress={message.progress} tone="dark" />
                    <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-bold leading-snug">{message.step.ask}</span>
                </span>
                {follow ? (
                    <span className="mt-1.5 block space-y-0.5 border-t border-white/15 pt-1.5">
                        {follow.current ? (
                            <span className="flex items-baseline gap-1 text-[12px] font-semibold leading-snug">
                                <span aria-hidden="true">↳</span>
                                <span className="min-w-0 flex-1">{follow.current.ask}</span>
                                <span className="shrink-0 text-[10.5px] font-black uppercase tracking-wide text-white/70">{follow.current.answered ? "✓ Answered" : "To answer"}</span>
                            </span>
                        ) : null}
                        <FollowUpCount done={follow.done} total={follow.total} tone="dark" />
                    </span>
                ) : null}
            </button>
        </div>
    );
}

/**
 * What the star means, said once under "Why I'm asking" — before the reader
 * meets a starred choice — on any question that has one.
 */
function StarKey() {
    return (
        <p className="mt-1.5 flex gap-1.5 text-[12px] leading-snug text-finn-iron">
            <Star aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 fill-current text-finn-accent-blue" />
            <span>
                <span className="font-bold text-finn-accent-blue">Starred = recommended</span> from your earlier answers. The “i” on each says why.
            </span>
        </p>
    );
}

/**
 * What each option on a deal row means, said once under the question —
 * each under a chip in the colour it takes when picked — so the reader
 * knows before choosing, rather than finding out on hover. Only the
 * options some row here offers.
 */
function DealKey({ rows }: { rows: DealRow[] }) {
    const offered = new Set(rows.flatMap((row) => row.options));
    /* Rows with their own words for "must" ("My dates only") are keyed by those words, not "Must have". */
    const plain = rows.filter((row) => !row.labels?.must);
    const must = [
        plain.some((row) => row.options.includes("must") && row.kind) && "Must be",
        plain.some((row) => row.options.includes("must") && !row.kind) && "Must have",
        ...rows.filter((row) => row.labels?.must && row.options.includes("must")).map((row) => row.labels!.must!),
    ]
        .filter(Boolean)
        .join(" / ");
    const mustNot = [rows.some((row) => row.options.includes("mustNot") && row.kind) && "Mustn't be", rows.some((row) => row.options.includes("mustNot") && !row.kind) && "Mustn't have"]
        .filter(Boolean)
        .join(" / ");
    const entries: { label: string; tone: string; means: string }[] = [
        { label: "Doesn't matter", tone: DEAL_ON.none, means: "Not part of the judgement." },
        ...(offered.has("must") ? [{ label: must, tone: DEAL_ON.must, means: DEAL_MEANS.must }] : []),
        ...(offered.has("mustNot") ? [{ label: mustNot, tone: DEAL_ON.mustNot, means: DEAL_MEANS.mustNot }] : []),
        ...(offered.has("seal") ? [{ label: "Seals it", tone: DEAL_ON.seal, means: DEAL_MEANS.seal }] : []),
        ...rows
            .filter((row) => row.options.includes("flex"))
            .map((row) => ({ label: row.labels?.flex ?? "Either way", tone: DEAL_ON.flex, means: DEAL_MEANS.flex })),
    ];

    return (
        /* Edge to edge across Lens's bubble (its own px-3.5), the text kept where it would sit in a box inside it. */
        <dl className="-mx-3.5 mt-3 divide-y divide-black/5 text-[12.5px] leading-snug">
            {entries.map((entry) => (
                /*
                 * Each chip on its own line and what it means under it, so every meaning starts at the same edge;
                 * grey and white by turns, so each pair reads as one.
                 */
                <div key={entry.label} className="flex flex-col items-start gap-1 px-6 py-2 odd:bg-finn-cotton even:bg-white">
                    {/* The same filled rectangle the option becomes when picked. */}
                    <dt className={`rounded-md px-2 py-0.5 text-[10.5px] font-black ${entry.tone}`}>{entry.label}</dt>
                    <dd className="text-finn-black/85">{entry.means}</dd>
                </div>
            ))}
        </dl>
    );
}

function Why({ text }: { text: string }) {
    return (
        <p className="mt-1.5 flex gap-1.5 text-[12px] leading-snug text-finn-iron">
            <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-finn-accent-blue" />
            <span>
                <span className="font-bold text-finn-accent-blue">Why I'm asking: </span>
                {text}
            </span>
        </p>
    );
}

/** The meaning of each need the reader has picked, and exactly what Lens will check for it. */
function Picked({ choices }: { choices: Choice[] }) {
    if (!choices.length) return null;

    return (
        <div className="space-y-2 rounded-2xl bg-finn-pale-blue/60 p-3 ring-1 ring-finn-accent-blue/15">
            <p className="text-[10.5px] font-black uppercase tracking-wide text-finn-accent-blue">What you've picked means</p>
            {choices.map((choice) => (
                <div key={choice.id} className="text-[12px] leading-snug">
                    <p className="font-black text-finn-black">{choice.label}</p>
                    {choice.looksFor?.length ? (
                        <p className="text-finn-iron">I'll check: {choice.looksFor.join(" · ")}</p>
                    ) : choice.description ? (
                        <p className="text-finn-black/80">{choice.description}</p>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

/** A number of the reader's own, with its unit: another amount, length or distance. */
function OwnAnswer({ custom, onSubmit }: { custom: CustomAnswer; onSubmit: (extra: AnswerExtra) => void }) {
    const [value, setValue] = useState("");
    const number = Number(value.replace(/[^\d.]/g, ""));
    const unit = custom.kind === "amount" ? "€ a month" : custom.kind === "months" ? "months" : "km a month";
    const valid = value.trim() !== "" && Number.isFinite(number) && number >= (custom.min ?? 1) && number <= (custom.max ?? Infinity);

    const submit = () => {
        if (valid) onSubmit({ amount: number });
    };

    return (
        <div className="flex w-full items-center gap-2 rounded-2xl bg-white p-1.5 pl-3 ring-1 ring-finn-accent-blue/35">
            {custom.kind === "amount" ? <span className="text-[13px] font-bold text-finn-iron">€</span> : null}
            <input
                autoFocus
                value={value}
                inputMode="numeric"
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                }}
                placeholder={custom.placeholder}
                aria-label={custom.label}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-finn-black outline-none placeholder:text-finn-iron/70"
            />
            <span className="shrink-0 text-[12px] text-finn-iron">{unit}</span>
            <button
                type="button"
                onClick={submit}
                disabled={!valid}
                className="shrink-0 rounded-full bg-finn-accent-blue px-3 py-1.5 text-[12px] font-black text-white disabled:bg-finn-cotton disabled:text-finn-iron"
            >
                Use this
            </button>
        </div>
    );
}

/** A question's own-number answer — never words: a chat saved before "Something else…" went may still hold one. */
const numberAnswer = (step: ChatStep): CustomAnswer | undefined => (step.custom && ["amount", "months", "km"].includes(step.custom.kind) ? step.custom : undefined);

/**
 * The chips a tapped bubble opens under itself: "Where do you park most
 * often?". Smaller than the bubbles and set in, so they read as part of the
 * bubble above rather than more bubbles.
 */
function BubbleChipRow({
    chips,
    picked,
    missing,
    onToggle,
}: {
    chips: BubbleChips;
    picked: string[];
    missing: boolean;
    onToggle: (id: string) => void;
}) {
    const full = Boolean(chips.max && picked.length >= chips.max);

    return (
        <div className="basis-full rounded-2xl bg-finn-pale-blue/60 px-3 py-2 ring-1 ring-finn-accent-blue/15">
            <p className="text-[11.5px] font-bold text-finn-highlight-navy">
                {picked.length ? <Check role="img" aria-label="Answered" className="mr-1 inline h-3 w-3 text-finn-fit-good" strokeWidth={3.5} /> : null}
                {chips.ask}
                {chips.max ? <span className="font-semibold text-finn-iron"> Up to {chips.max}.</span> : null}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
                {chips.options.map((option) => {
                    const on = picked.includes(option.id);
                    const rival = (chips.exclusive ?? []).some((set) => set.includes(option.id) && set.some((id) => id !== option.id && picked.includes(id)));

                    const disabled = !on && full && !rival && chips.multiple;

                    /* The chip and its "i", side by side as one: a button can't hold a button. */
                    return (
                        <span
                            key={option.id}
                            className={[
                                "inline-flex items-center rounded-full transition-colors",
                                option.description ? "pr-1" : "",
                                on ? "bg-finn-accent-blue text-white" : "bg-white text-finn-accent-blue ring-1 ring-finn-accent-blue/30",
                                disabled ? "opacity-40" : "",
                            ].join(" ")}
                        >
                            <button
                                type="button"
                                aria-pressed={on}
                                disabled={disabled}
                                onClick={() => onToggle(option.id)}
                                className={[
                                    "inline-flex items-center gap-1 rounded-full py-1.5 pl-2.5 text-[11.5px] font-bold disabled:cursor-default",
                                    option.description ? "pr-1" : "pr-2.5",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue",
                                    on ? "" : "hover:text-finn-highlight-navy",
                                ].join(" ")}
                            >
                                {on ? <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : option.recommended ? <Star role="img" aria-label="Recommended" className="h-3 w-3 fill-current" /> : null}
                                {option.label}
                            </button>
                            {option.description ? (
                                <InfoTip
                                    label={option.label}
                                    tone={on ? "on" : "idle"}
                                    tip={{ title: option.label, recommended: option.recommended, body: [option.description], sources: option.sources }}
                                />
                            ) : null}
                        </span>
                    );
                })}
            </div>
            {missing ? <p className="mt-1 text-[11px] text-finn-iron">Pick at least one, so I know what to check.</p> : null}
        </div>
    );
}

const DEAL_LABEL = (row: DealRow, state: DealRow["options"][number]): string =>
    row.labels?.[state] ??
    (state === "seal" ? "Seals it" : state === "must" ? (row.kind ? "Must be" : "Must have") : state === "flex" ? "Either way" : row.kind ? "Mustn't be" : "Mustn't have");

type DealOption = DealRow["options"][number] | "none";

/*
 * Each option its own lively colour — blue for a must, red for a mustn't,
 * green for what seals it, violet for either way, grey for doesn't matter —
 * outlined until picked, then filled. White text on each fill stays legible.
 */
const DEAL_ON: Record<DealOption, string> = {
    none: "bg-[#52525b] text-white ring-1 ring-[#52525b]",
    must: "bg-finn-accent-blue text-white ring-1 ring-finn-accent-blue",
    mustNot: "bg-finn-error text-white ring-1 ring-finn-error",
    seal: "bg-[#0b8a4c] text-white ring-1 ring-[#0b8a4c]",
    flex: "bg-[#6d28d9] text-white ring-1 ring-[#6d28d9]",
};

const DEAL_OFF: Record<DealOption, string> = {
    none: "bg-white text-[#52525b] ring-1 ring-[#d4d4d8] hover:bg-finn-snow",
    must: "bg-white text-finn-accent-blue ring-1 ring-finn-accent-blue/45 hover:bg-finn-pale-blue",
    mustNot: "bg-white text-finn-error ring-1 ring-finn-error/45 hover:bg-finn-fit-limited-pale",
    seal: "bg-white text-[#0b8a4c] ring-1 ring-[#0b8a4c]/45 hover:bg-finn-fit-good-pale",
    flex: "bg-white text-[#6d28d9] ring-1 ring-[#6d28d9]/45 hover:bg-[#f5f3ff]",
};

/** The shape every deal option, key and button here shares: a rectangle, 8px round. */
const DEAL_SHAPE = "rounded-lg text-[12px] font-black leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue";

/**
 * Deal-breakers and deal-sealers: a row each, set to Doesn't matter, a rule
 * (must, mustn't) or a seal — only the ones that row can be here. Sent
 * together, as `row=state`.
 */
function Deals({
    message,
    live,
    onAnswer,
    onNeverMind,
}: {
    message: Extract<ChatMessage, { kind: "ask" }>;
    live: boolean;
    onAnswer: (chosen: string[], extra?: AnswerExtra) => void;
    onNeverMind?: () => void;
}) {
    const { step } = message;
    const rows = step.deals ?? [];
    const [states, setStates] = useState<Record<string, DealRow["options"][number] | undefined>>(() =>
        Object.fromEntries((step.selected ?? []).map((item) => item.split("=") as [string, DealRow["options"][number]])),
    );
    const set = Object.entries(states).filter((entry): entry is [string, DealRow["options"][number]] => entry[1] != null);
    const chosen = set.map(([id, state]) => `${id}=${state}`);
    const groups = (step.groups ?? [{ id: "", title: "" }]).map((group) => ({ ...group, rows: rows.filter((row) => !group.id || row.group === group.id) }));

    return (
        <>
            <LensBubble>
                {live && message.progress ? <Progress {...message.progress} /> : null}
                <p data-question={message.id} className="flex items-start gap-2 font-semibold">
                    <QuestionNumber progress={message.progress} />
                    <span className="min-w-0 flex-1">{step.ask}</span>
                </p>
                {live && step.why ? <Why text={step.why} /> : null}
                {live && rows.some((row) => row.suggested) ? <StarKey /> : null}
                {live ? <DealKey rows={rows} /> : null}
            </LensBubble>

            {live ? (
                <div className="space-y-4 pt-1">
                    {groups.map((group) => (
                        <div key={group.id}>
                            {group.title ? <p className="mb-1.5 px-1 text-[10.5px] font-black uppercase tracking-wide text-finn-iron">{group.title}</p> : null}
                            <ul className="divide-y divide-finn-cotton overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
                                {group.rows.map((row) => (
                                    /*
                                     * The row measures itself: with room, the options sit beside the
                                     * name at their own size; without, they fill the line under it in
                                     * equal columns. A wider chat gets the wider layout at once.
                                     */
                                    <li key={row.id} className="@container px-3.5 py-3">
                                        <div className="flex flex-col gap-2 @min-[500px]:flex-row @min-[500px]:items-center @min-[500px]:justify-between @min-[500px]:gap-4">
                                            <span className="inline-flex min-w-0 items-center gap-0.5 text-[13px] font-bold text-finn-black">
                                                {row.suggested ? <Star role="img" aria-label="Recommended" className="mr-1 h-3.5 w-3.5 shrink-0 fill-current text-finn-accent-blue" /> : null}
                                                {row.label}
                                                <InfoTip label={row.label} tip={{ title: row.label, recommended: row.suggested, body: [row.description], sources: row.sources }} />
                                            </span>
                                            <span role="radiogroup" aria-label={row.label} className="grid shrink-0 grid-flow-col auto-cols-fr gap-1.5 @min-[500px]:auto-cols-max">
                                                {(["none", ...row.options] as DealOption[]).map((option) => {
                                                    const on = (states[row.id] ?? "none") === option;

                                                    return (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={on}
                                                            onClick={() => setStates((current) => ({ ...current, [row.id]: option === "none" ? undefined : option }))}
                                                            className={[
                                                                "inline-flex items-center justify-center gap-1 px-1.5 py-2 text-center @min-[500px]:px-2.5",
                                                                DEAL_SHAPE,
                                                                on ? `${DEAL_ON[option]} shadow-sm` : DEAL_OFF[option],
                                                            ].join(" ")}
                                                        >
                                                            {/* The tick where there's room for it; narrow, the fill alone says it's picked. */}
                                                            {on ? <Check aria-hidden="true" className="hidden h-3 w-3 shrink-0 @min-[500px]:block" strokeWidth={3.5} /> : null}
                                                            {option === "none" ? "Doesn't matter" : DEAL_LABEL(row, option)}
                                                        </button>
                                                    );
                                                })}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    <div className="flex flex-wrap gap-1.5">
                        {set.length ? (
                            <button
                                type="button"
                                onClick={() => onAnswer(chosen)}
                                className={`inline-flex items-center gap-1 bg-finn-highlight-navy px-4 py-2.5 text-white shadow-sm hover:bg-finn-accent-blue ${DEAL_SHAPE}`}
                            >
                                Continue
                                <ChevronRight aria-hidden="true" className="h-4 w-4" />
                            </button>
                        ) : (
                            <button type="button" onClick={() => onAnswer([])} className={`px-4 py-2.5 ${DEAL_SHAPE} ${DEAL_OFF.none}`}>
                                {step.none ?? "Nothing's off the table"}
                            </button>
                        )}
                        {onNeverMind ? <NeverMind onClick={onNeverMind} /> : null}
                    </div>
                </div>
            ) : null}
        </>
    );
}

function Ask({
    message,
    live,
    onAnswer,
    onNeverMind,
}: {
    message: Extract<ChatMessage, { kind: "ask" }>;
    live: boolean;
    onAnswer: (chosen: string[], extra?: AnswerExtra) => void;
    /** Asked because the reader chose to change an answer: a way back, unchanged. */
    onNeverMind?: () => void;
}) {
    const { step } = message;
    const [picked, setPicked] = useState<string[]>(step.selected ?? []);
    /* The bubble whose follow-up the reader last touched: the one they're on. */
    const [touched, setTouched] = useState<string | null>(null);
    /* Their own number — another amount, length or distance — being typed. */
    const [own, setOwn] = useState(false);
    const custom = numberAnswer(step);

    /*
     * Up to the question's own limit: past it the other chips rest, and
     * untapping one frees a place. An answer that can't be true beside
     * another takes its place instead.
     */
    const toggle = (id: string) => {
        if (step.bubbleChips) setTouched(id);
        setPicked((current) => {
            /* A bubble untapped takes its chips with it. */
            if (current.includes(id)) return current.filter((item) => item !== id && !item.startsWith(`${id}:`));

            const rivals = new Set((step.exclusive ?? []).filter((set) => set.includes(id)).flat());
            const kept = current.filter((item) => item === id || !rivals.has(item));

            return step.max && kept.length >= step.max ? kept : [...kept, id];
        });
    };
    const full = Boolean(step.max && picked.length >= step.max);

    /* A chip under a bubble: one of its own, held to what that bubble allows. */
    const toggleChip = (bubble: string, chip: string) => {
        setTouched(bubble);
        setPicked((current) => {
            const rules = step.bubbleChips?.[bubble];
            const id = `${bubble}:${chip}`;
            if (!rules) return current;
            if (current.includes(id)) return current.filter((item) => item !== id);

            const mine = current.filter((item) => item.startsWith(`${bubble}:`)).map((item) => item.slice(bubble.length + 1));
            const rivals = new Set((rules.exclusive ?? []).filter((set) => set.includes(chip)).flat());
            const dropped = new Set(rules.multiple ? mine.filter((other) => rivals.has(other)) : mine);
            const kept = current.filter((item) => !(item.startsWith(`${bubble}:`) && dropped.has(item.slice(bubble.length + 1))));

            return rules.max && mine.length - dropped.size >= rules.max ? current : [...kept, id];
        });
    };
    /* The follow-ups this section has opened, how many have an answer, and the one the reader is on: for the count, and the pinned bar. */
    const follow = followUps(step, picked);
    const followDone = follow.filter((item) => item.answered).length;
    const active = activeFollowUp(step, picked, touched);
    const report = useContext(FollowUpsReport);
    useEffect(() => {
        report(message.id, live && follow.length ? { done: followDone, total: follow.length, current: active ? { ask: active.ask, answered: active.answered } : null } : null);
    }, [report, message.id, live, follow.length, followDone, active?.ask, active?.answered]);

    /* Bubbles that need a chip before the answer means anything: "the weather is tough", but what's it like? */
    const unfinished = Object.entries(step.bubbleChips ?? {})
        .filter(([bubble, rules]) => rules.required && picked.includes(bubble) && !picked.some((item) => item.startsWith(`${bubble}:`)))
        .map(([bubble]) => bubble);

    const chosen = step.choices.filter((choice) => picked.includes(choice.id));
    const ready = picked.length > 0;

    const chip = (choice: Choice) => (
        <Chip
            key={choice.id}
            label={choice.label}
            selected={step.multiple && picked.includes(choice.id)}
            disabled={
                step.multiple &&
                full &&
                !picked.includes(choice.id) &&
                !(step.exclusive ?? []).some((set) => set.includes(choice.id) && set.some((id) => picked.includes(id)))
            }
            onClick={() => (step.multiple ? toggle(choice.id) : onAnswer([choice.id]))}
            info={tipFor(choice)}
            recommended={Boolean(choice.recommended)}
        />
    );

    const groups = step.groups?.length
        ? step.groups.map((group) => ({ ...group, choices: step.choices.filter((choice) => choice.group === group.id) }))
        : null;

    return (
        <>
            <LensBubble>
                {/* How it works is read, not answered: plain text, like Lens's other words. */}
                {live && message.progress ? <Progress {...message.progress} /> : null}
                <p data-question={message.id} className={step.id === "intro" ? "" : "flex items-start gap-2 font-semibold"}>
                    <QuestionNumber progress={message.progress} />
                    <span className="min-w-0 flex-1">{step.ask}</span>
                </p>
                {live && (step.why ?? step.hint) ? <Why text={(step.why ?? step.hint)!} /> : null}
                {live && (step.choices.some((choice) => choice.recommended) || Object.values(step.bubbleChips ?? {}).some((chips) => chips.options.some((option) => option.recommended))) ? (
                    <StarKey />
                ) : null}
            </LensBubble>

            {live ? (
                <div className="space-y-2 pt-0.5">
                    {groups ? (
                        groups.map((group) => (
                            <div key={group.id}>
                                <p className="mb-1 px-1 text-[10.5px] font-black uppercase tracking-wide text-finn-iron">{group.title}</p>
                                <div className="flex flex-wrap gap-1.5">{group.choices.map(chip)}</div>
                            </div>
                        ))
                    ) : (
                        <div>
                            <div className="flex flex-wrap gap-1.5">
                                {step.choices.map((choice) => {
                                    const chips = step.bubbleChips?.[choice.id];

                                    /* A tapped bubble's chips open straight under it: a full-width row in the same flow. */
                                    return chips && picked.includes(choice.id)
                                        ? [
                                              chip(choice),
                                              <BubbleChipRow
                                                  key={`${choice.id}-chips`}
                                                  chips={chips}
                                                  picked={picked.filter((item) => item.startsWith(`${choice.id}:`)).map((item) => item.slice(choice.id.length + 1))}
                                                  missing={unfinished.includes(choice.id)}
                                                  onToggle={(id) => toggleChip(choice.id, id)}
                                              />,
                                          ]
                                        : chip(choice);
                                })}
                            </div>
                        </div>
                    )}

                    {/* Typing a number of their own takes the place of its chip only: "Not sure yet" and "Never mind" stay a tap away. */}
                    <div className="flex flex-wrap gap-1.5">
                        {custom && !own ? <Chip label={custom.label} muted icon={<PencilLine aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setOwn(true)} /> : null}
                        {step.none && !(step.multiple && ready) ? <Chip label={step.none} muted onClick={() => onAnswer([])} /> : null}
                        {onNeverMind ? <NeverMind onClick={onNeverMind} /> : null}
                    </div>

                    {own && custom ? <OwnAnswer custom={custom} onSubmit={(extra) => onAnswer(picked, extra)} /> : null}

                    {step.multiple && !step.bubbleChips ? <Picked choices={chosen.filter((choice) => choice.description || choice.looksFor?.length)} /> : null}

                    {follow.length ? <FollowUpCount done={followDone} total={follow.length} /> : null}

                    {step.multiple && ready ? (
                        <button
                            type="button"
                            disabled={unfinished.length > 0}
                            onClick={() => onAnswer(picked)}
                            className="inline-flex items-center gap-1 rounded-full bg-finn-highlight-navy px-4 py-2 text-[12.5px] font-black text-white shadow-sm transition-colors hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue disabled:cursor-default disabled:bg-finn-cotton disabled:text-finn-iron disabled:shadow-none"
                        >
                            Continue
                            <ChevronRight aria-hidden="true" className="h-4 w-4" />
                        </button>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/* What Lens will judge by                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How much something counts, as three taps — Top priority · Important · Nice
 * to have, the one scale everywhere — with what the one picked means to
 * Lens said underneath, and each one's meaning on hover.
 */
function ImportancePicker({ label, value, onPick, guess = false }: { label: string; value: NeedImportance; onPick: (level: NeedImportance) => void; guess?: boolean }) {
    return (
        <span className="block space-y-1">
            <span role="radiogroup" aria-label={`How much ${label} counts`} className="inline-flex rounded-full bg-white p-0.5 ring-1 ring-black/10">
                {IMPORTANCE_LEVELS.map((level) => (
                    <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={value === level}
                        onClick={() => onPick(level)}
                        className={[
                            "rounded-full px-2.5 py-1 text-[11.5px] font-black transition-colors",
                            value === level ? "bg-finn-accent-blue text-white shadow-sm" : "text-finn-black/70 hover:text-finn-black",
                        ].join(" ")}
                    >
                        {IMPORTANCE[level].label}
                    </button>
                ))}
            </span>
            <span className="block text-[12px] leading-snug text-finn-black/80">
                {guess ? <span className="font-bold italic">My guess — tap to change. </span> : null}
                {IMPORTANCE[value].means}
            </span>
        </span>
    );
}

/** One item on a bubble's block: what Lens checks (×), standard (✓), or might matter (+). */
function Item({ label, kind, onClick, does, here }: { label: string; kind: "counts" | "checks" | "worth"; onClick?: () => void; does?: string; here?: string }) {
    const tone =
        kind === "checks"
            ? "bg-white text-finn-black/75 ring-1 ring-black/10 font-semibold"
            : kind === "counts"
              ? "bg-white text-finn-highlight-navy ring-1 ring-finn-accent-blue/30 font-bold"
              : "bg-transparent text-finn-accent-blue ring-1 ring-dashed ring-finn-accent-blue/45 font-bold";
    const body = (
        <>
            {kind === "checks" ? <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
            {kind === "worth" ? <Plus aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
            {label}
            {kind === "counts" && onClick ? <X aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
        </>
    );
    const inner = `inline-flex items-center gap-1 rounded-full py-1.5 pl-2.5 ${does ? "pr-1" : "pr-2.5"}`;

    /* The chip — taking it out or adding it — and its "i", side by side: a button can't hold a button. */
    return (
        <span className={`inline-flex items-center rounded-full text-[12px] ${does ? "pr-1" : ""} ${tone}`}>
            {onClick ? (
                <button
                    type="button"
                    onClick={onClick}
                    aria-label={kind === "counts" ? `Stop checking ${label}` : `Check ${label} too`}
                    className={`${inner} transition-colors hover:text-finn-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue`}
                >
                    {body}
                </button>
            ) : (
                <span className={inner}>{body}</span>
            )}
            {does ? (
                <InfoTip
                    label={label}
                    tip={{
                        title: label,
                        body: [`${does.replace(/^./, (c) => c.toUpperCase())}.`],
                        note:
                            kind === "checks"
                                ? `${here ? `${here} ` : ""}Standard on nearly every car FINN lists: a car FINN says is missing it loses a little, and having it earns nothing.`
                                : kind === "worth"
                                  ? "Not checked yet — tap it to add it."
                                  : undefined,
                    }}
                />
            ) : null}
        </span>
    );
}

/** A small heading inside a summary card: "I'll check", "Might matter". */
function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-finn-black/70">
            {children}
            {hint ? <span className="ml-1 text-[11.5px] font-semibold normal-case tracking-normal text-finn-black/65">{hint}</span> : null}
        </p>
    );
}

/** Grey and white by turns, edge to edge, so one bubble is never mistaken for the next. */
const CARD_TONE = ["bg-finn-cotton", "bg-white"];

/**
 * One bubble as Lens understood it, as a card of its own: its heading and
 * how much it counts; what Lens will check, each can be taken out; the
 * standard equipment it checks too; what might matter too, each can be
 * added; and, last and quietest, what it can't check.
 */
function UnderstoodBubble({
    bubble,
    live,
    tone,
    onImportance,
    onRemove,
    onAdd,
}: {
    bubble: SummaryBubble;
    live: boolean;
    tone: string;
    onImportance: (level: NeedImportance) => void;
    onRemove: (item: string) => void;
    onAdd: (item: string) => void;
}) {
    return (
        <li className={`space-y-3 px-3.5 py-3.5 ${tone}`}>
            <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-[13.5px] font-black leading-snug text-finn-black">{bubble.heading}</p>
                    {bubble.counting !== false && !live ? (
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue ring-1 ring-finn-accent-blue/20">{IMPORTANCE_LABEL[bubble.importance]}</span>
                    ) : null}
                </div>
                {bubble.counting !== false && live ? (
                    <div>
                        <span className="mb-1 block text-[12px] font-bold text-finn-black/75">How much it counts</span>
                        <ImportancePicker label={bubble.heading.toLowerCase()} value={bubble.importance} onPick={onImportance} guess={!bubble.importanceSaid} />
                    </div>
                ) : null}
            </div>

            {bubble.counts.length || bubble.figure || bubble.shared?.length ? (
                <div>
                    <Label hint={live && bubble.counts.length ? "— tap × to take one out" : undefined}>I'll check</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {bubble.figure ? <Item label={bubble.figure} kind="counts" does={bubble.figureDoes} /> : null}
                        {bubble.counts.map((item) => (
                            <Item key={item.id} label={item.label} kind="counts" does={item.does} onClick={live ? () => onRemove(item.id) : undefined} />
                        ))}
                    </div>
                    {bubble.figureNote ? <p className="mt-1.5 text-[12.5px] leading-snug text-finn-black/80">{bubble.figureNote}</p> : null}
                    {bubble.shared?.length ? (
                        <p className="mt-1.5 text-[12.5px] leading-snug text-finn-black/80">
                            {bubble.counts.length || bubble.figure ? "Also " : ""}
                            {bubble.shared.map((item) => lowerFirst(item.label)).join(", ")}, from a card above.
                        </p>
                    ) : null}
                </div>
            ) : null}

            {bubble.checks.length ? (
                <div>
                    <p className="mb-1 flex items-center gap-0.5 text-[11px] font-black uppercase tracking-wide text-finn-black/70">
                        Standard equipment
                        <InfoTip
                            label="Standard equipment"
                            tip={{ title: "Standard equipment", body: ["On nearly every car FINN lists, and I still check it: a car FINN says is missing one loses a little, and having one earns nothing."] }}
                        />
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {bubble.checks.map((item) => (
                            <Item key={item.id} label={item.label} kind="checks" does={item.does} here={item.here} />
                        ))}
                    </div>
                </div>
            ) : null}

            {bubble.settled || bubble.empty ? (
                <p className="rounded-xl bg-white px-2.5 py-2 text-[12.5px] leading-snug text-finn-black/85 ring-1 ring-black/10">{bubble.settled ?? bubble.empty}</p>
            ) : null}

            {live && bubble.worth.length ? (
                <div>
                    <Label hint="— tap + to add">Might matter</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {bubble.worth.map((item) => (
                            <Item key={item.id} label={item.label} kind="worth" does={item.does} onClick={() => onAdd(item.id)} />
                        ))}
                    </div>
                </div>
            ) : null}

            {bubble.cantCheck ? (
                <p className="flex gap-1.5 border-t border-black/10 pt-2.5 text-[12px] leading-snug text-finn-black/75">
                    <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{bubble.cantCheck}</span>
                </p>
            ) : null}
        </li>
    );
}

/** The summary's lines, grouped: what the money and the dates are, then what rules a car out or makes it. */
const LINE_GROUPS: { title: string; steps: StepId[] }[] = [
    { title: "Your life", steps: ["bubbles"] },
    { title: "Money & time", steps: ["budget", "period", "from", "distance"] },
    { title: "Deal-breakers & sealers", steps: ["fuel", "deals", "rules"] },
];

/** One line on the summary's lists: what it is, and why it's there. */
type Reasoned = { label: string; because?: string };

/** The mark before a line on the summary's lists: a tick for what Lens looks for, a shield for the standard equipment it makes sure of. */
function ListMark({ kind }: { kind: "looks" | "standard" }) {
    return (
        <span
            aria-hidden="true"
            className={`mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${kind === "looks" ? "bg-finn-fit-good-pale text-finn-fit-good" : "bg-finn-pale-blue text-finn-accent-blue"}`}
        >
            {kind === "looks" ? <Check className="h-3 w-3" strokeWidth={3} /> : <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />}
        </span>
    );
}

/** "I'll look for:" and its lines, each with its mark and why it's there. */
function ReasonedList({ title, kind, items }: { title: string; kind: "looks" | "standard"; items: Reasoned[] }) {
    if (!items.length) return null;

    return (
        <div>
            <p className="mb-1.5 text-[12.5px] font-black text-finn-black">{title}</p>
            <ul className="space-y-1.5">
                {items.map((item) => (
                    <li key={item.label} className="flex items-start gap-2 text-[12.5px] leading-snug">
                        <ListMark kind={kind} />
                        <span>
                            <span className="font-bold text-finn-black">{item.label}</span>
                            {item.because ? <span className="text-finn-black/75"> — because {item.because}</span> : null}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** A small heading over part of a summary row: "What I asked". */
const ROW_LABEL = "text-[11px] font-black uppercase tracking-wide text-finn-black/70";

/**
 * What Lens understood, in the chat: read-only. Each thing the reader said
 * as a row of its own — what Lens asked, what they answered, what Lens
 * understood and how much it counts, then what it will look for and the
 * standard equipment it makes sure of, each with why — then the money, the
 * dates and the deal-breakers. Changing any of it is the Adjust panel's job.
 */
function StaticSummary({ message }: { message: Extract<ChatMessage, { kind: "summary" }> }) {
    const said = [
        ...(message.bubbles ?? []).map((bubble) => ({
            id: bubble.id,
            heading: bubble.heading,
            /* Absent on summaries from before it was kept: those start at what Lens understood. */
            asked: bubble.asked ?? [],
            importance: bubble.counting === false ? null : bubble.importance,
            /* Lens's guess, where the reader never said how much it counts. */
            guess: !bubble.importanceSaid,
            looksFor: [
                ...(bubble.figure ? [{ label: bubble.figure, because: bubble.figureBecause }] : []),
                ...[...bubble.counts, ...(bubble.shared ?? [])].map((item) => ({ label: item.label, because: item.because })),
            ] as Reasoned[],
            /* Standard equipment it calls for: said, so air conditioning for hot summers doesn't look forgotten. */
            standard: bubble.checks.map((item) => ({ label: item.label, because: item.because })) as Reasoned[],
            note: bubble.settled ?? bubble.empty ?? null,
        })),
        ...(message.needs ?? []).map((need) => ({
            id: need.id,
            heading: need.label,
            asked: [] as { ask: string; answer: string }[],
            importance: need.importance,
            guess: false,
            looksFor: need.looksFor.map((label) => ({ label })) as Reasoned[],
            standard: [] as Reasoned[],
            note: null,
        })),
    ];
    const counted = said.filter((item) => item.importance);

    return (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            {said.length ? (
                <section className="px-3.5 pt-3 pb-1">
                    <p className="text-[11px] font-black uppercase tracking-wide text-finn-highlight-navy">What you told me</p>
                    {/* Edge to edge across the card, grey and white by turns, the text in line with the heading. */}
                    <ul className="-mx-3.5 mt-1.5 divide-y divide-black/5">
                        {said.map((item) => (
                            <li key={item.id} className="space-y-3 px-3.5 py-3.5 odd:bg-finn-cotton even:bg-white">
                                {item.asked.length ? (
                                    <dl className="space-y-2 text-[12.5px] leading-snug">
                                        <div>
                                            <dt className={ROW_LABEL}>What I asked</dt>
                                            {item.asked.map((pair) => (
                                                <dd key={pair.ask} className="mt-0.5 text-finn-black/85">
                                                    {pair.ask}
                                                </dd>
                                            ))}
                                        </div>
                                        <div>
                                            <dt className={ROW_LABEL}>What you answered</dt>
                                            {item.asked.map((pair) => (
                                                <dd key={pair.ask} className="mt-0.5 font-bold text-finn-black">
                                                    {pair.answer}
                                                </dd>
                                            ))}
                                        </div>
                                    </dl>
                                ) : null}
                                <div>
                                    {item.asked.length ? <p className={ROW_LABEL}>What I understood</p> : null}
                                    <div className="mt-0.5 flex items-start justify-between gap-2">
                                        <p className="text-[13.5px] font-black leading-snug text-finn-black">{item.heading}</p>
                                        {item.importance ? <ImportanceBadge importance={item.importance} guess={item.guess} /> : null}
                                    </div>
                                </div>
                                {item.looksFor.length ? (
                                    <ReasonedList title="I'll look for:" kind="looks" items={item.looksFor} />
                                ) : item.note ? (
                                    <p className="text-[12.5px] leading-snug text-finn-black/80">{item.note}</p>
                                ) : null}
                                <ReasonedList title="Also making sure it has:" kind="standard" items={item.standard} />
                            </li>
                        ))}
                    </ul>
                    {/* What the badges above mean, said where they're read. */}
                    {counted.length ? (
                        <div className="pt-1 pb-2.5">
                            <ImportanceKey guesses={counted.some((item) => item.guess)} />
                        </div>
                    ) : null}
                </section>
            ) : null}

            {LINE_GROUPS.filter((group) => group.title !== "Your life").map((group) => {
                const lines = message.lines.filter((line) => group.steps.includes(line.step as StepId));
                if (!lines.length) return null;

                return (
                    <section key={group.title} className="border-t border-finn-cotton px-3.5 pt-2.5 pb-1.5">
                        <p className="text-[11px] font-black uppercase tracking-wide text-finn-highlight-navy">{group.title}</p>
                        <dl className="py-1">
                            {lines.map((line) => (
                                <div key={line.label} className="grid grid-cols-[104px_1fr] items-baseline gap-3 py-1 text-[12px]">
                                    <dt className="font-bold text-finn-iron">{line.label}</dt>
                                    <dd className="font-semibold leading-snug text-finn-black">{line.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                );
            })}
        </div>
    );
}

/**
 * "This doesn't look right": everything on the summary, to change — take an
 * item out, add a suggestion, set how much each counts, answer a question
 * again — and Done to say it's right now. Beside the chat when there's room,
 * over it when there isn't.
 */
export function AdjustPanel({
    message,
    onImportance,
    onChange,
    onRemove,
    onAdd,
    onDone,
    busy,
}: {
    message: Extract<ChatMessage, { kind: "summary" }>;
    onImportance: (needId: string, importance: NeedImportance) => void;
    onChange: (step: StepId) => void;
    onRemove: (bubble: string, item: string) => void;
    onAdd: (bubble: string, item: string) => void;
    onDone: () => void;
    busy: boolean;
}) {
    return (
        <aside aria-label="Adjust what Lens understood" className="flex h-full min-h-0 flex-col bg-white">
            <div className="shrink-0 border-b border-finn-cotton px-4 pt-3.5 pb-3">
                <p className="text-[15px] font-black text-finn-black">Adjust</p>
                <p className="mt-0.5 text-[12px] leading-snug text-finn-iron">
                    Take out what's wrong, add what's missing, and set how much each counts. “Change” answers a question again, in the chat.
                </p>
                <p className="mt-2 rounded-xl bg-finn-pale-blue/60 px-2.5 py-2 text-[11.5px] leading-snug text-finn-highlight-navy">
                    <span className="font-black">How much it counts: </span>
                    {SCALE_EXPLAINED}
                </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-finn-snow px-3 py-3.5">
                <Summary message={message} live={!busy} onImportance={onImportance} onChange={onChange} onRemove={onRemove} onAdd={onAdd} />
            </div>
            <div className="flex shrink-0 justify-end border-t border-finn-cotton bg-white px-4 py-3">
                <button
                    type="button"
                    disabled={busy}
                    onClick={onDone}
                    className="inline-flex items-center gap-1 rounded-full bg-finn-highlight-navy px-5 py-2.5 text-[13px] font-black text-white shadow-sm transition-colors hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue disabled:opacity-50"
                >
                    <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                    Done
                </button>
            </div>
        </aside>
    );
}

function Summary({
    message,
    live,
    onImportance,
    onChange,
    onRemove,
    onAdd,
}: {
    message: Extract<ChatMessage, { kind: "summary" }>;
    live: boolean;
    onImportance: (needId: string, importance: NeedImportance) => void;
    onChange: (step: StepId) => void;
    onRemove: (bubble: string, item: string) => void;
    onAdd: (bubble: string, item: string) => void;
}) {
    const [weights, setWeights] = useState(false);

    return (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            {message.bubbles?.length ? (
                <div className="pt-3.5">
                    <div className="mb-2.5 flex items-baseline justify-between gap-2 px-3.5">
                        <p className="text-[11.5px] font-black uppercase tracking-wide text-finn-highlight-navy">Your life</p>
                        {live ? (
                            <button type="button" onClick={() => onChange("changeHow")} className="text-[11.5px] font-bold text-finn-accent-blue hover:underline">
                                Change
                            </button>
                        ) : null}
                    </div>
                    <ul className="divide-y divide-black/5">
                        {message.bubbles.map((bubble, index) => (
                            <UnderstoodBubble
                                key={bubble.id}
                                bubble={bubble}
                                live={live}
                                tone={CARD_TONE[index % CARD_TONE.length]!}
                                onImportance={(level) => onImportance(`bubble-${bubble.id}`, level)}
                                onRemove={(item) => onRemove(bubble.id, item)}
                                onAdd={(item) => onAdd(bubble.id, item)}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}

            {message.needs?.length ? (
                <div className={`pt-3.5 ${message.bubbles?.length ? "border-t border-finn-cotton" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2 px-3.5">
                        <p className="text-[11px] font-black uppercase tracking-wide text-finn-iron">{message.bubbles?.length ? "In your own words" : "What matters to you"}</p>
                        {live ? (
                            <button type="button" onClick={() => onChange("changeHow")} className="text-[11.5px] font-bold text-finn-accent-blue hover:underline">
                                Change
                            </button>
                        ) : null}
                    </div>
                    <ul className="mt-2 divide-y divide-black/5">
                        {message.needs.map((need, index) => (
                            <li key={need.id} className={`px-3.5 py-3.5 ${CARD_TONE[((message.bubbles?.length ?? 0) + index) % CARD_TONE.length]}`}>
                                <div className={live ? "space-y-1" : "flex items-center justify-between gap-2"}>
                                    <span className="block text-[13px] font-black text-finn-black">{need.label}</span>
                                    {live ? (
                                        <ImportancePicker label={need.label.toLowerCase()} value={need.importance} onPick={(level) => onImportance(need.id, level)} />
                                    ) : (
                                        <span className="shrink-0 rounded-full bg-finn-pale-blue px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue">{IMPORTANCE_LABEL[need.importance]}</span>
                                    )}
                                </div>
                                {need.looksFor.length ? (
                                    <p className="mt-1 text-[12.5px] leading-snug text-finn-black/80">
                                        I'll look for: {need.looksFor.join(" · ")}
                                        {need.also ? `, and ${need.also} listed above` : ""}
                                    </p>
                                ) : need.also ? (
                                    <p className="mt-1 text-[12.5px] leading-snug text-finn-black/80">Everything I'd look for is listed above.</p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* The limits and deal-breakers, in groups with their own headings. Lines from older summaries fit one of them, or go last. */}
            {[...LINE_GROUPS, { title: "", steps: [] as StepId[] }].map((group) => {
                const lines = message.lines.filter((line) =>
                    group.title ? group.steps.includes(line.step as StepId) : !LINE_GROUPS.some((other) => other.steps.includes(line.step as StepId)),
                );
                if (!lines.length) return null;

                return (
                    <section key={group.title || "other"} className="border-t border-finn-cotton px-3.5 pt-3 pb-1.5">
                        {group.title ? <p className="mb-1 text-[11.5px] font-black uppercase tracking-wide text-finn-highlight-navy">{group.title}</p> : null}
                        <dl className="divide-y divide-finn-cotton/70">
                            {lines.map((line) => (
                                <div key={line.label} className="grid grid-cols-[104px_1fr_auto] items-baseline gap-3 py-2 text-[12.5px]">
                                    <dt className="font-bold text-finn-iron">{line.label}</dt>
                                    <dd className="font-semibold leading-snug text-finn-black">{line.value}</dd>
                                    {live && line.step ? (
                                        <button type="button" onClick={() => onChange(line.step!)} className="text-[11.5px] font-bold text-finn-accent-blue hover:underline">
                                            Change
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                </div>
                            ))}
                        </dl>
                    </section>
                );
            })}

            {message.priorities?.length ? (
                <div className="border-t border-finn-cotton bg-finn-snow px-3.5 py-2.5">
                    <button type="button" onClick={() => setWeights((open) => !open)} aria-expanded={weights} className="flex w-full items-center justify-between text-[11.5px] font-bold text-finn-iron hover:text-finn-black">
                        How this weighs the cars
                        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${weights ? "rotate-180" : ""}`} />
                    </button>
                    {weights ? (
                        <>
                            <p className="mt-1.5 text-[11.5px] leading-snug text-finn-iron">Your answers become weights on what FINN lists for each car. The more a need matters, the more its part of the car counts:</p>
                            <ul className="mt-2 space-y-1.5">
                                {message.priorities.map((priority) => (
                                    <li key={priority.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[12px]">
                                        <span className="font-semibold text-finn-black">{priority.label}</span>
                                        <span className="font-bold tabular-nums text-finn-iron">{priority.share}%</span>
                                        <span className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-finn-cotton">
                                            <span className="block h-full rounded-full bg-finn-accent-blue" style={{ width: `${Math.max(4, priority.share)}%` }} />
                                        </span>
                                        {priority.from?.length ? (
                                            <span className="col-span-2 text-[11px] leading-snug text-finn-iron">From: {priority.from.map((label, index) => (index ? lowerFirst(label) : label)).join(", ")}</span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* The judgement                                                              */
/* -------------------------------------------------------------------------- */

function RunnerUp({ car, onOpen }: { car: CarSnapshot; onOpen: () => void }) {
    return (
        <li>
            <button
                type="button"
                onClick={onOpen}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-finn-snow focus-visible:bg-finn-snow focus-visible:outline-none"
            >
                <CarPhoto src={car.image} alt="" className="h-10 w-14 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-black text-finn-black">{car.name}</span>
                    <span className="block truncate text-[11px] text-finn-iron">
                        {car.monthly != null ? `about ${euros(car.monthly)}/month` : car.configuration}
                        {car.overLimit ? <span className="font-bold text-finn-fit-limited"> · {car.over === "period" ? "not for your dates" : "over your limit"}</span> : null}
                    </span>
                </span>
                <BandChip band={car.band} label={car.bandLabel} />
            </button>
        </li>
    );
}

function Result({
    message,
    long,
    onOpenCar,
    onLocateCar,
    onWhy,
    onSeeWhy,
    onKeepShort,
}: {
    message: Extract<ChatMessage, { kind: "result" }>;
    /** Scrolls FINN's page to a car Lens names. */
    onLocateCar?: (id: number) => Promise<{ shown: boolean } | null> | void;
    /** Open with everything shown: the reader opened "See why" on two results in a row. */
    long: boolean;
    onOpenCar: (id: number) => void;
    onWhy: () => void;
    onSeeWhy: () => void;
    onKeepShort: () => void;
}) {
    const { winner } = message;
    const [open, setOpen] = useState(long);
    /* The name carries the configuration where two cars share a model; it's said on the line below, so not twice. */
    const model = winner && winner.name.endsWith(` ${winner.configuration}`) ? winner.name.slice(0, -winner.configuration.length - 1) : winner?.name;
    /* Only what the car has: a thing said that it has nothing for isn't a reason it won. */
    const why = (message.why ?? []).filter((line) => line.has.length > 0);
    const reasons = message.reasons ?? (message.reason ? [message.reason] : []);
    const tradeoffs = message.tradeoffs ?? [];
    /* One thing to know: a limit note first — it changes what the pick means — else the biggest trade-off. */
    const know = message.know !== undefined ? message.know : (message.note ?? (tradeoffs[0] ? `${tradeoffs[0].headline}. ${tradeoffs[0].text}` : null));

    return (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            {winner ? (
                <div className="relative bg-gradient-to-b from-[#fff8e1] to-white p-3.5">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wide text-[#9a6200]">{message.closest ? "Closest match" : "Your strongest match"}</p>
                            {/* "Best for you" under "Closest match" said two things at once. */}
                            <WinnerChip label={message.closest ? "Lens's pick" : undefined} />
                        </div>
                        {winner.monthly != null ? (
                            <span className="text-right text-[11px] font-semibold text-finn-iron">
                                <span className="block text-[15px] font-black text-finn-black tabular-nums">{euros(winner.monthly)}</span>
                                a month, estimated
                            </span>
                        ) : null}
                    </div>

                    <CarPhoto src={winner.image} alt={winner.name} className="mt-2 h-28 w-full rounded-xl" />

                    <p className="mt-2.5 text-[15px] font-black leading-tight text-finn-black">{model}</p>
                    <p className="text-[12px] text-finn-iron">{winner.configuration}</p>

                    {why.length ? (
                        <div className="mt-2.5">
                            <p className="text-[10.5px] font-black uppercase tracking-wide text-finn-iron">Why</p>
                            <ul className="mt-1 space-y-1">
                                {why.slice(0, 3).map((line) => (
                                    <li key={line.said} className="text-[12.5px] leading-snug text-finn-black">
                                        <span className="font-bold">{line.said}</span>
                                        <span className="text-finn-iron"> → </span>
                                        {line.has.join(", ")}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : reasons[0] ? (
                        <p className="mt-2 text-[13px] leading-relaxed text-finn-black">{reasons[0]}</p>
                    ) : null}

                    {know ? (
                        <div className="mt-2.5 rounded-lg bg-finn-warning-lift/60 px-2.5 py-2">
                            <p className="text-[10.5px] font-black uppercase tracking-wide text-finn-warning-ink">One thing to know</p>
                            <p className="mt-0.5 text-[12px] leading-snug text-finn-warning-ink">{know}</p>
                            {/* Only where the note is the trade-off that names it. */}
                            {onLocateCar && message.knowCar && know === message.know ? (
                                <LocateButton name={message.knowCar.name} size="text" label={`Show the ${message.knowCar.name}`} onLocate={() => onLocateCar(message.knowCar!.id)} />
                            ) : null}
                        </div>
                    ) : null}

                    {open ? (
                        /*
                         * Only what the car got right: everything it has for each thing the
                         * reader said. How what they said was weighed, what it lacks, and
                         * what choosing it gives up are for "The whole case" — not here.
                         */
                        <div className="mt-3 space-y-3 border-t border-[#f5d78a]/60 pt-3">
                            {why.length ? (
                                <div>
                                    <p className="text-[10.5px] font-black uppercase tracking-wide text-finn-iron">What it got right</p>
                                    <ul className="mt-1 space-y-1.5">
                                        {why.map((line) => (
                                            <li key={line.said} className="flex gap-2 text-[12.5px] leading-snug text-finn-black">
                                                <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-finn-fit-good" strokeWidth={3} />
                                                <span>
                                                    <span className="font-bold">{line.said}</span>
                                                    <span className="text-finn-iron"> → </span>
                                                    {line.has.join(", ")}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                        </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {open ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    onKeepShort();
                                }}
                                className="text-[12px] font-black text-finn-iron hover:text-finn-black"
                            >
                                Keep it short
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(true);
                                    onSeeWhy();
                                }}
                                className="inline-flex items-center gap-1 text-[12.5px] font-black text-finn-accent-blue hover:underline"
                            >
                                See why
                                <ChevronRight aria-hidden="true" className="h-4 w-4" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onWhy}
                            className="ml-auto inline-flex items-center gap-1 rounded-full bg-finn-highlight-navy px-3.5 py-2 text-[12px] font-black text-white transition-colors hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                        >
                            The whole case
                            <ChevronRight aria-hidden="true" className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            ) : null}

            {open && message.runnersUp.length ? (
                <div className="border-t border-finn-cotton">
                    <p className="px-3.5 pt-3 text-[11px] font-black uppercase tracking-wide text-finn-iron">Next closest</p>
                    <ul className="py-1">
                        {message.runnersUp.map((car) => (
                            <RunnerUp key={car.id} car={car} onOpen={() => onOpenCar(car.id)} />
                        ))}
                    </ul>
                </div>
            ) : null}

            <p className="border-t border-finn-cotton bg-finn-snow px-3.5 py-2 text-[11px] text-finn-iron">
                {message.count} {message.count === 1 ? "car" : "cars"} judged
                {message.setAside ? ` · ${message.setAside} set aside by your rules` : ""}
            </p>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* The whole list                                                             */
/* -------------------------------------------------------------------------- */

export function MessageList({
    messages,
    typing,
    onAnswer,
    onOpenCar,
    onLocateCar,
    busy,
    editable = null,
    onEdit,
    longResults = false,
    onSeeWhy = () => {},
    onKeepShort = () => {},
    onNeverMind,
}: {
    messages: ChatMessage[];
    typing: boolean;
    onAnswer: (askId: string, chosen: string[], extra?: AnswerExtra) => void;
    /** A car's drawer, read out of the judgement its result came from. */
    onOpenCar: (id: number, judgement?: string) => void;
    /** Scrolls FINN's page to a car Lens names. */
    onLocateCar?: (id: number) => Promise<{ shown: boolean } | null> | void;
    busy: boolean;
    /** Results open with everything shown, after "See why" on two in a row. */
    longResults?: boolean;
    onSeeWhy?: (resultId: string) => void;
    onKeepShort?: () => void;
    /** While changing answers: puts the chat back as it was. Shown on the open question, but not where "Never mind" is already an answer. */
    onNeverMind?: () => void;
    /** The reader message whose answer can be taken back, if any. */
    editable?: string | null;
    onEdit?: () => void;
}) {
    /* Only the newest open question takes answers; older ones read as what was asked. */
    const liveAsk = useMemo(() => {
        const last = [...messages].reverse().find((message) => message.kind === "ask");
        return last?.kind === "ask" && !last.answered ? last.id : null;
    }, [messages]);

    const settled = !typing && !busy;

    /* Each open question's follow-ups, as it reports them, for the pinned bar. */
    const [follow, setFollow] = useState<Record<string, FollowUps>>({});
    const report = useCallback((askId: string, value: FollowUps) => {
        setFollow((current) => (JSON.stringify(current[askId] ?? null) === JSON.stringify(value) ? current : { ...current, [askId]: value }));
    }, []);

    const rows: React.ReactNode[] = [];

    messages.forEach((message, index) => {
        const previous = messages[index - 1];
        const next = messages[index + 1];
        const startsRun = message.from === "lens" && previous != null && previous.from !== "lens";
        const avatar = message.from === "lens" && (next ? next.from !== "lens" : !typing);

        if (message.from === "reader") {
            rows.push(
                <ReaderBubble
                    key={message.id}
                    text={message.kind === "text" ? message.text : ""}
                    onEdit={message.id === editable && settled && onEdit ? onEdit : undefined}
                />,
            );
            return;
        }

        let body: React.ReactNode = null;

        switch (message.kind) {
            case "text":
                body = <LensBubble>{message.text}</LensBubble>;
                break;
            case "ask":
                const neverMind = message.id === liveAsk && message.step.id !== "changeHow" && message.step.id !== "changeWhich" ? onNeverMind : undefined;
                body = message.step.deals ? (
                    <Deals
                        key={message.id}
                        message={message}
                        live={message.id === liveAsk && settled}
                        onAnswer={(chosen, extra) => onAnswer(message.id, chosen, extra)}
                        onNeverMind={neverMind}
                    />
                ) : (
                    <Ask
                        key={message.id}
                        message={message}
                        live={message.id === liveAsk && settled}
                        onAnswer={(chosen, extra) => onAnswer(message.id, chosen, extra)}
                        onNeverMind={neverMind}
                    />
                );
                break;
            case "summary":
                body = <StaticSummary message={message} />;
                break;
            case "result":
                /* Each result opens on its own judgement: an earlier one on what it said then, not on a later winner. */
                body = (
                    <Result
                        message={message}
                        long={longResults}
                        onOpenCar={(id) => onOpenCar(id, message.judgement)}
                        onLocateCar={onLocateCar}
                        onWhy={() => message.winner && onOpenCar(message.winner.id, message.judgement)}
                        onSeeWhy={() => onSeeWhy(message.id)}
                        onKeepShort={onKeepShort}
                    />
                );
                break;
        }

        rows.push(
            <div key={message.id} data-ask={message.kind === "ask" ? message.id : undefined} className={startsRun ? "pt-2" : ""}>
                <LensRow avatar={avatar}>{body}</LensRow>
            </div>,
        );
    });

    const open = messages.find((message) => message.id === liveAsk);

    return (
        <FollowUpsReport.Provider value={report}>
            {/* Outside the live region: a bar sliding in isn't news to read out. */}
            <PinnedQuestion message={open?.kind === "ask" && settled ? open : null} follow={liveAsk ? (follow[liveAsk] ?? null) : null} />
            <div className="space-y-2" aria-live="polite">
                {rows}
                {typing ? <Typing /> : null}
            </div>
        </FollowUpsReport.Provider>
    );
}
