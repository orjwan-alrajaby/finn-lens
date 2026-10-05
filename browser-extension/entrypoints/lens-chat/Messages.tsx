import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Info, PencilLine, Plus, X } from "lucide-react";

import { BandChip, BrandMark, CarPhoto, euros, WinnerChip } from "@/components/lens-parts";
import { allChips, coveredBy, IMPORTANCE_LABEL } from "@/lib/chats/flow";
import type { BubbleChips, CarSnapshot, ChatMessage, Choice, CustomAnswer, DealRow, StepId, SummaryBubble } from "@/lib/chats/types";
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

/**
 * The "i" beside an answer: a brief explanation as a tooltip. It opens on
 * hover or keyboard focus, and on a tap for touch screens, and closes on
 * Escape or a tap anywhere else. Fixed to the viewport and held inside it,
 * so it never runs off the edge of the narrow chat.
 */
export function InfoTip({ label, tone = "idle", children }: { label: string; tone?: "idle" | "on"; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [at, setAt] = useState<{ top: number; left: number } | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const tip = useRef<HTMLDivElement>(null);
    const id = useId();

    useLayoutEffect(() => {
        if (!open || !button.current || !tip.current) return;

        const anchor = button.current.getBoundingClientRect();
        const box = tip.current.getBoundingClientRect();
        const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - box.width / 2), window.innerWidth - box.width - 8);
        const above = anchor.top - box.height - 6;

        setAt({ top: above >= 8 ? above : anchor.bottom + 6, left });
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const away = (event: PointerEvent) => {
            if (!button.current?.contains(event.target as Node) && !tip.current?.contains(event.target as Node)) setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", away);
        document.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", away);
            document.removeEventListener("keydown", escape);
        };
    }, [open]);

    return (
        <>
            <button
                ref={button}
                type="button"
                aria-label={`What “${label}” means`}
                aria-describedby={open ? id : undefined}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen(true);
                }}
                className={[
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-finn-accent-blue",
                    tone === "on" ? "text-white/80 hover:bg-white/20 hover:text-white" : "text-finn-accent-blue/70 hover:bg-finn-pale-blue hover:text-finn-accent-blue",
                ].join(" ")}
            >
                <Info aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
            {open ? (
                <div
                    ref={tip}
                    id={id}
                    role="tooltip"
                    style={{ position: "fixed", top: at?.top ?? -9999, left: at?.left ?? -9999 }}
                    className="z-50 w-64 max-w-[calc(100vw-16px)] space-y-0.5 rounded-xl bg-finn-highlight-navy px-3 py-2 text-left text-[11.5px] font-normal leading-snug text-white shadow-lg"
                >
                    {children}
                </div>
            ) : null}
        </>
    );
}

/** What a choice means, for its tooltip: its name, what it is, and what Lens checks for it. */
function tipFor(choice: Choice): React.ReactNode | null {
    const body = choice.means ?? choice.description;
    if (!body && !choice.looksFor?.length) return null;

    return (
        <>
            <p className="font-black">{choice.label}</p>
            {body ? <p>{body}</p> : null}
            {choice.means && choice.description && choice.description !== choice.means ? <p>{choice.description}</p> : null}
            {choice.looksFor?.length ? <p className="text-white/75">I'll check: {choice.looksFor.join(" · ")}</p> : null}
        </>
    );
}

function Chip({
    label,
    selected,
    onClick,
    disabled,
    muted,
    title,
    icon,
    info,
}: {
    label: string;
    selected?: boolean;
    onClick: () => void;
    disabled?: boolean;
    muted?: boolean;
    title?: string;
    icon?: React.ReactNode;
    /** What the choice means: an "i" at the chip's right, with this as its tooltip. */
    info?: React.ReactNode | null;
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
                    {selected ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                    {label}
                </button>
                <InfoTip label={label} tone={selected ? "on" : "idle"}>
                    {info}
                </InfoTip>
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={selected}
            title={title}
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
    text?: string;
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

/** The reader's own answer: words, or a number with its unit. */
function OwnAnswer({
    custom,
    onSubmit,
    onText,
    onAdd,
    initial = "",
    inline,
}: {
    custom: CustomAnswer;
    onSubmit: (extra: AnswerExtra) => void;
    /** On a question with several answers, the words go in with the taps on "Continue". */
    onText?: (text: string) => void;
    /** On a question with several answers: the ✓ adds the words beside the taps, as a chip of their own. */
    onAdd?: (text: string) => void;
    initial?: string;
    inline: boolean;
}) {
    const [value, setValue] = useState(initial);
    const number = Number(value.replace(/[^\d.]/g, ""));
    const unit = custom.kind === "amount" ? "€ a month" : custom.kind === "months" ? "months" : custom.kind === "km" ? "km a month" : null;
    const valid = custom.kind === "text" ? value.trim().length > 1 : Number.isFinite(number) && number >= (custom.min ?? 1) && number <= (custom.max ?? Infinity);

    const submit = () => {
        if (!valid) return;
        onSubmit(custom.kind === "text" ? { text: value.trim() } : { amount: number });
    };

    const add = () => {
        if (valid) onAdd?.(value.trim());
    };

    return (
        <div className="flex w-full items-center gap-2 rounded-2xl bg-white p-1.5 pl-3 ring-1 ring-finn-accent-blue/35">
            {custom.kind === "amount" ? <span className="text-[13px] font-bold text-finn-iron">€</span> : null}
            <input
                autoFocus
                value={value}
                inputMode={custom.kind === "text" ? "text" : "numeric"}
                onChange={(event) => {
                    setValue(event.target.value);
                    onText?.(event.target.value);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") (inline ? add : submit)();
                }}
                placeholder={custom.placeholder}
                aria-label={custom.label}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-finn-black outline-none placeholder:text-finn-iron/70"
            />
            {unit ? <span className="shrink-0 text-[12px] text-finn-iron">{unit}</span> : null}
            {inline ? (
                valid && onAdd ? (
                    <button
                        type="button"
                        onClick={add}
                        aria-label="Add this"
                        title="Add this"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-finn-accent-blue text-white hover:bg-finn-highlight-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                    >
                        <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                    </button>
                ) : null
            ) : (
                <button
                    type="button"
                    onClick={submit}
                    disabled={!valid}
                    className="shrink-0 rounded-full bg-finn-accent-blue px-3 py-1.5 text-[12px] font-black text-white disabled:bg-finn-cotton disabled:text-finn-iron"
                >
                    {custom.kind === "text" ? "Send" : "Use this"}
                </button>
            )}
        </div>
    );
}

/** "a, b and c", lower-cased after the first word of each: equipment named in a sentence. */
const joinedLabels = (labels: string[]): string => {
    const lowered = labels.map(lowerFirst);

    return lowered.length <= 1 ? (lowered[0] ?? "") : `${lowered.slice(0, -1).join(", ")} and ${lowered.at(-1)}`;
};

/** The reader's own words, added beside the taps: tap them to edit, × to take them back. */
function AddedWords({ text, onEdit, onRemove }: { text: string; onEdit: () => void; onRemove: () => void }) {
    return (
        <span className="inline-flex max-w-full items-center rounded-full bg-finn-accent-blue text-white shadow-sm">
            <button
                type="button"
                onClick={onEdit}
                title="Edit"
                className="inline-flex min-w-0 items-center gap-1.5 py-2 pr-1 pl-3.5 text-[12.5px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
            >
                <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
                <span className="truncate">“{text}”</span>
            </button>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove “${text}”`}
                className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
            >
                <X aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
            </button>
        </span>
    );
}

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
    onSetAll,
}: {
    chips: BubbleChips;
    picked: string[];
    missing: boolean;
    onToggle: (id: string) => void;
    onSetAll: (ids: string[]) => void;
}) {
    const full = Boolean(chips.max && picked.length >= chips.max);
    const all = allChips(chips) ?? [];
    const canAll = all.length > 0;
    const allPicked = all.every((id) => picked.includes(id));

    return (
        <div className="basis-full rounded-2xl bg-finn-pale-blue/60 px-3 py-2 ring-1 ring-finn-accent-blue/15">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11.5px] font-bold text-finn-highlight-navy">
                    {chips.ask}
                    {chips.max ? <span className="font-semibold text-finn-iron"> Up to {chips.max}.</span> : null}
                </p>
                {canAll ? (
                    <button type="button" onClick={() => onSetAll(allPicked ? [] : all)} className="shrink-0 text-[11px] font-bold text-finn-accent-blue hover:underline">
                        {allPicked ? "Unselect all" : "Select all"}
                    </button>
                ) : null}
            </div>
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
                                {on ? <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
                                {option.label}
                            </button>
                            {option.description ? (
                                <InfoTip label={option.label} tone={on ? "on" : "idle"}>
                                    <p className="font-black">{option.label}</p>
                                    <p>{option.description}</p>
                                </InfoTip>
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
    state === "seal" ? "Seals it" : state === "must" ? (row.kind ? "Must be" : "Must have") : row.kind ? "Mustn't be" : "Mustn't have";

const DEAL_TONE: Record<DealRow["options"][number], string> = {
    must: "bg-finn-highlight-navy text-white shadow-sm",
    mustNot: "bg-finn-fit-limited text-white shadow-sm",
    seal: "bg-finn-fit-good text-white shadow-sm",
};

/**
 * Deal-breakers and deal-sealers: a row each, set to Doesn't matter, a rule
 * (must, mustn't) or a seal — only the ones that row can be here. Sent
 * together, as `row=state`.
 */
function Deals({ message, live, onAnswer }: { message: Extract<ChatMessage, { kind: "ask" }>; live: boolean; onAnswer: (chosen: string[], extra?: AnswerExtra) => void }) {
    const { step } = message;
    const rows = step.deals ?? [];
    const [states, setStates] = useState<Record<string, DealRow["options"][number] | undefined>>(() =>
        Object.fromEntries((step.selected ?? []).map((item) => item.split("=") as [string, DealRow["options"][number]])),
    );
    const [own, setOwn] = useState(false);
    const set = Object.entries(states).filter((entry): entry is [string, DealRow["options"][number]] => entry[1] != null);
    const chosen = set.map(([id, state]) => `${id}=${state}`);
    const groups = (step.groups ?? [{ id: "", title: "" }]).map((group) => ({ ...group, rows: rows.filter((row) => !group.id || row.group === group.id) }));

    return (
        <>
            <LensBubble>
                <p className="font-semibold">{step.ask}</p>
                {live && step.why ? <Why text={step.why} /> : null}
            </LensBubble>

            {live ? (
                <div className="space-y-2.5 pt-0.5">
                    {groups.map((group) => (
                        <div key={group.id}>
                            {group.title ? <p className="mb-1 px-1 text-[10.5px] font-black uppercase tracking-wide text-finn-iron">{group.title}</p> : null}
                            <ul className="divide-y divide-finn-cotton overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
                                {group.rows.map((row) => (
                                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-2">
                                        <span className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-finn-black">
                                            {row.label}
                                            <InfoTip label={row.label}>
                                                <p className="font-black">{row.label}</p>
                                                <p>{row.description}</p>
                                                {row.suggested ? <p className="text-white/75">{row.suggested}</p> : null}
                                            </InfoTip>
                                        </span>
                                        <span role="radiogroup" aria-label={row.label} className="inline-flex rounded-full bg-finn-snow p-0.5 ring-1 ring-finn-cotton">
                                            {([undefined, ...row.options] as (DealRow["options"][number] | undefined)[]).map((option) => {
                                                const on = states[row.id] === option;

                                                return (
                                                    <button
                                                        key={option ?? "none"}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={on}
                                                        onClick={() => setStates((current) => ({ ...current, [row.id]: option }))}
                                                        className={[
                                                            "rounded-full px-2.5 py-1 text-[11px] font-black transition-colors",
                                                            on ? (option ? DEAL_TONE[option] : "bg-white text-finn-black shadow-sm ring-1 ring-black/10") : "text-finn-iron hover:text-finn-black",
                                                        ].join(" ")}
                                                    >
                                                        {option ? DEAL_LABEL(row, option) : "Doesn't matter"}
                                                    </button>
                                                );
                                            })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {own && step.custom ? (
                        <OwnAnswer custom={step.custom} inline={false} onSubmit={(extra) => onAnswer(chosen, extra)} />
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {step.custom ? <Chip label={step.custom.label} muted icon={<PencilLine aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setOwn(true)} /> : null}
                            {set.length ? (
                                <button
                                    type="button"
                                    onClick={() => onAnswer(chosen)}
                                    className="inline-flex items-center gap-1 rounded-full bg-finn-highlight-navy px-4 py-2 text-[12.5px] font-black text-white shadow-sm transition-colors hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                                >
                                    Continue
                                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                                </button>
                            ) : (
                                <Chip label={step.none ?? "Nothing's off the table"} muted onClick={() => onAnswer([])} />
                            )}
                        </div>
                    )}
                </div>
            ) : null}
        </>
    );
}

function Ask({
    message,
    live,
    onAnswer,
}: {
    message: Extract<ChatMessage, { kind: "ask" }>;
    live: boolean;
    onAnswer: (chosen: string[], extra?: AnswerExtra) => void;
}) {
    const { step } = message;
    const [picked, setPicked] = useState<string[]>(step.selected ?? []);
    const [own, setOwn] = useState(false);
    const [ownText, setOwnText] = useState("");
    /* Words the reader added with the ✓, shown as a chip of their own until "Continue". */
    const [added, setAdded] = useState<string | null>(null);

    /*
     * Up to the question's own limit: past it the other chips rest, and
     * untapping one frees a place. An answer that can't be true beside
     * another takes its place instead.
     */
    const toggle = (id: string) =>
        setPicked((current) => {
            /* A bubble untapped takes its chips with it. */
            if (current.includes(id)) return current.filter((item) => item !== id && !item.startsWith(`${id}:`));

            const rivals = new Set((step.exclusive ?? []).filter((set) => set.includes(id)).flat());
            const kept = current.filter((item) => item === id || !rivals.has(item));

            return step.max && kept.length >= step.max ? kept : [...kept, id];
        });
    const full = Boolean(step.max && picked.length >= step.max);

    /* A chip under a bubble: one of its own, held to what that bubble allows. */
    const toggleChip = (bubble: string, chip: string) =>
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
    /* Bubbles that need a chip before the answer means anything: "the weather is tough", but what's it like? */
    const unfinished = Object.entries(step.bubbleChips ?? {})
        .filter(([bubble, rules]) => rules.required && picked.includes(bubble) && !picked.some((item) => item.startsWith(`${bubble}:`)))
        .map(([bubble]) => bubble);

    /* An answer something already picked mostly covers: set aside, and said why beneath the chips. */
    const covered = step.choices.flatMap((choice) => {
        if (picked.includes(choice.id)) return [];

        const by = picked.map((id) => ({ id, shared: coveredBy(step, id, choice.id) })).find((entry) => entry.shared);
        const picker = by ? step.choices.find((item) => item.id === by.id) : null;

        return by && picker ? [{ choice, by: picker, shared: by.shared! }] : [];
    });
    const setAside = new Set(covered.map((entry) => entry.choice.id));
    const chosen = step.choices.filter((choice) => picked.includes(choice.id));
    const typing = own && ownText.trim().length > 1;
    const ready = picked.length > 0 || added != null || typing;
    /* Words still in the box go in too: Continue never drops what was typed. */
    const words = typing ? ownText.trim() : added;

    const chip = (choice: Choice) => (
        <Chip
            key={choice.id}
            label={choice.label}
            selected={step.multiple && picked.includes(choice.id)}
            disabled={
                step.multiple &&
                (setAside.has(choice.id) ||
                    (full && !picked.includes(choice.id) && !(step.exclusive ?? []).some((set) => set.includes(choice.id) && set.some((id) => picked.includes(id)))))
            }
            onClick={() => (step.multiple ? toggle(choice.id) : onAnswer([choice.id]))}
            info={tipFor(choice)}
        />
    );

    const groups = step.groups?.length
        ? step.groups.map((group) => ({ ...group, choices: step.choices.filter((choice) => choice.group === group.id) }))
        : null;

    return (
        <>
            <LensBubble>
                <p className="font-semibold">{step.ask}</p>
                {live && (step.why ?? step.hint) ? <Why text={(step.why ?? step.hint)!} /> : null}
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
                                                  onSetAll={(ids) =>
                                                      setPicked((current) => [...current.filter((item) => !item.startsWith(`${choice.id}:`)), ...ids.map((id) => `${choice.id}:${id}`)])
                                                  }
                                              />,
                                          ]
                                        : chip(choice);
                                })}
                            </div>
                            {covered.map(({ choice, by, shared }) => (
                                <p key={choice.id} className="mt-1.5 flex gap-1.5 px-1 text-[11.5px] leading-snug text-finn-iron">
                                    <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-finn-accent-blue" />
                                    <span>
                                        “{choice.label}” overlaps with “{by.label}”: both check {joinedLabels(shared)}, so I've set it aside.
                                    </span>
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                        {added != null && !own ? (
                            <AddedWords
                                text={added}
                                onEdit={() => {
                                    setOwnText(added);
                                    setOwn(true);
                                }}
                                onRemove={() => setAdded(null)}
                            />
                        ) : null}
                        {step.custom && !own && added == null ? <Chip label={step.custom.label} muted icon={<PencilLine aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setOwn(true)} /> : null}
                        {step.none && !(step.multiple && ready) && !own ? <Chip label={step.none} muted onClick={() => onAnswer([])} /> : null}
                    </div>

                    {own && step.custom ? (
                        <OwnAnswer
                            custom={step.custom}
                            inline={step.multiple}
                            initial={added ?? ""}
                            onText={setOwnText}
                            onAdd={(text) => {
                                setAdded(text);
                                setOwnText("");
                                setOwn(false);
                            }}
                            onSubmit={(extra) => onAnswer(picked, extra)}
                        />
                    ) : null}

                    {step.multiple && !step.bubbleChips ? <Picked choices={chosen.filter((choice) => choice.description || choice.looksFor?.length)} /> : null}

                    {step.multiple && ready ? (
                        <button
                            type="button"
                            disabled={unfinished.length > 0}
                            title={unfinished.length ? "Pick at least one answer under each bubble that asks" : undefined}
                            onClick={() => onAnswer(picked, words ? { text: words } : undefined)}
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

const LEVELS: NeedImportance[] = ["essential", "important", "niceToHave"];

/** How much something counts, as three taps: Must have · Matters · Nice to have. */
function ImportancePicker({ label, value, onPick }: { label: string; value: NeedImportance; onPick: (level: NeedImportance) => void }) {
    return (
        <span role="radiogroup" aria-label={`How much ${label} counts`} className="inline-flex rounded-full bg-finn-snow p-0.5 ring-1 ring-finn-cotton">
            {LEVELS.map((level) => (
                <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={value === level}
                    onClick={() => onPick(level)}
                    className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-black transition-colors",
                        value === level ? "bg-finn-accent-blue text-white shadow-sm" : "text-finn-iron hover:text-finn-black",
                    ].join(" ")}
                >
                    {IMPORTANCE_LABEL[level]}
                </button>
            ))}
        </span>
    );
}

/** One item on a bubble's block: what Lens checks (×), standard (✓), or might matter (+). */
function Item({ label, kind, onClick }: { label: string; kind: "counts" | "checks" | "worth"; onClick?: () => void }) {
    if (kind === "checks") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-finn-snow px-2.5 py-1 text-[11.5px] font-semibold text-finn-iron ring-1 ring-finn-cotton">
                <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
                {label}
            </span>
        );
    }

    const body = (
        <>
            {kind === "worth" ? <Plus aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
            {label}
            {kind === "counts" && onClick ? <X aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : null}
        </>
    );
    const tone = kind === "counts" ? "bg-finn-pale-blue text-finn-highlight-navy" : "bg-white text-finn-accent-blue ring-1 ring-dashed ring-finn-accent-blue/40";

    return onClick ? (
        <button
            type="button"
            onClick={onClick}
            aria-label={kind === "counts" ? `Stop checking ${label}` : `Check ${label} too`}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold transition-colors hover:ring-2 hover:ring-finn-accent-blue/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue ${tone}`}
        >
            {body}
        </button>
    ) : (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${tone}`}>{body}</span>
    );
}

/**
 * One bubble as Lens understood it: what it will check — each can be taken
 * out — what nearly every car has, what might matter too — each can be
 * added — what it can't check, and how much the bubble counts.
 */
function UnderstoodBubble({
    bubble,
    live,
    onImportance,
    onRemove,
    onAdd,
}: {
    bubble: SummaryBubble;
    live: boolean;
    onImportance: (level: NeedImportance) => void;
    onRemove: (item: string) => void;
    onAdd: (item: string) => void;
}) {
    return (
        <li className="space-y-1.5">
            <div className={live ? "space-y-1" : "flex items-center justify-between gap-2"}>
                <span className="block text-[13px] font-black leading-snug text-finn-black">{bubble.heading}</span>
                {bubble.counting === false ? null : live ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ImportancePicker label={bubble.heading.toLowerCase()} value={bubble.importance} onPick={onImportance} />
                        {!bubble.importanceSaid ? <span className="text-[11px] text-finn-iron">My guess — change it if it's wrong</span> : null}
                    </span>
                ) : (
                    <span className="shrink-0 rounded-full bg-finn-pale-blue px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue">{IMPORTANCE_LABEL[bubble.importance]}</span>
                )}
            </div>

            {bubble.counts.length || bubble.checks.length || bubble.figure ? (
                <div className="flex flex-wrap items-center gap-1">
                    <span className="mr-0.5 text-[11px] font-bold text-finn-iron">I'll check</span>
                    {bubble.figure ? <Item label={bubble.figure} kind="counts" /> : null}
                    {bubble.counts.map((item) => (
                        <Item key={item.id} label={item.label} kind="counts" onClick={live ? () => onRemove(item.id) : undefined} />
                    ))}
                    {bubble.checks.map((item) => (
                        <Item key={item.id} label={item.label} kind="checks" />
                    ))}
                </div>
            ) : null}
            {bubble.shared?.length ? (
                <p className="text-[11.5px] leading-snug text-finn-iron">
                    Also {bubble.shared.map((item) => lowerFirst(item.label)).join(", ")}, from above.
                </p>
            ) : null}
            {bubble.checks.length ? <p className="text-[11px] leading-snug text-finn-iron">✓ Nearly every car has these: a car FINN says is missing one loses a little, and having one earns nothing.</p> : null}
            {bubble.settled ? <p className="text-[11.5px] leading-snug text-finn-iron">{bubble.settled}</p> : null}
            {bubble.empty ? <p className="text-[11.5px] leading-snug text-finn-iron">{bubble.empty}</p> : null}

            {live && bubble.worth.length ? (
                <div className="flex flex-wrap items-center gap-1">
                    <span className="mr-0.5 text-[11px] font-bold text-finn-iron">Might matter</span>
                    {bubble.worth.map((item) => (
                        <Item key={item.id} label={item.label} kind="worth" onClick={() => onAdd(item.id)} />
                    ))}
                </div>
            ) : null}

            {bubble.cantCheck ? <p className="text-[11.5px] leading-snug text-finn-iron">I can't check {bubble.cantCheck}.</p> : null}
        </li>
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
                <div className="px-3.5 pt-3 pb-3">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-black uppercase tracking-wide text-finn-iron">Your life</p>
                        {live ? (
                            <button type="button" onClick={() => onChange("bubbles")} className="text-[11.5px] font-bold text-finn-accent-blue hover:underline">
                                Change
                            </button>
                        ) : null}
                    </div>
                    <ul className="mt-2 space-y-3.5 divide-finn-cotton">
                        {message.bubbles.map((bubble) => (
                            <UnderstoodBubble
                                key={bubble.id}
                                bubble={bubble}
                                live={live}
                                onImportance={(level) => onImportance(`bubble-${bubble.id}`, level)}
                                onRemove={(item) => onRemove(bubble.id, item)}
                                onAdd={(item) => onAdd(bubble.id, item)}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}

            {message.needs?.length ? (
                <div className={`px-3.5 pt-3 pb-2 ${message.bubbles?.length ? "border-t border-finn-cotton" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-black uppercase tracking-wide text-finn-iron">{message.bubbles?.length ? "In your own words" : "What matters to you"}</p>
                        {live ? (
                            <button type="button" onClick={() => onChange("bubbles")} className="text-[11.5px] font-bold text-finn-accent-blue hover:underline">
                                Change
                            </button>
                        ) : null}
                    </div>
                    <ul className="mt-2 space-y-2.5">
                        {message.needs.map((need) => (
                            <li key={need.id}>
                                <div className={live ? "space-y-1" : "flex items-center justify-between gap-2"}>
                                    <span className="block text-[13px] font-black text-finn-black">{need.label}</span>
                                    {live ? (
                                        <span role="radiogroup" aria-label={`How much ${need.label.toLowerCase()} matters`} className="inline-flex rounded-full bg-finn-snow p-0.5 ring-1 ring-finn-cotton">
                                            {LEVELS.map((level) => (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={need.importance === level}
                                                    onClick={() => onImportance(need.id, level)}
                                                    className={[
                                                        "rounded-full px-2.5 py-1 text-[11px] font-black transition-colors",
                                                        need.importance === level ? "bg-finn-accent-blue text-white shadow-sm" : "text-finn-iron hover:text-finn-black",
                                                    ].join(" ")}
                                                >
                                                    {IMPORTANCE_LABEL[level]}
                                                </button>
                                            ))}
                                        </span>
                                    ) : (
                                        <span className="shrink-0 rounded-full bg-finn-pale-blue px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue">{IMPORTANCE_LABEL[need.importance]}</span>
                                    )}
                                </div>
                                {need.looksFor.length ? (
                                    <p className="mt-0.5 text-[11.5px] leading-snug text-finn-iron">
                                        I'll look for: {need.looksFor.join(" · ")}
                                        {need.also ? `, and ${need.also} listed above` : ""}
                                    </p>
                                ) : need.also ? (
                                    <p className="mt-0.5 text-[11.5px] leading-snug text-finn-iron">Everything I'd look for is listed above.</p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <dl className="divide-y divide-finn-cotton border-t border-finn-cotton">
                {message.lines.map((line) => (
                    <div key={line.label} className="grid grid-cols-[96px_1fr_auto] items-baseline gap-3 px-3.5 py-2.5 text-[12.5px]">
                        <dt className="font-bold text-finn-iron">{line.label}</dt>
                        <dd className="font-semibold text-finn-black">{line.value}</dd>
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
                        {car.overLimit ? <span className="font-bold text-finn-fit-limited"> · over your limit</span> : null}
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
    onWhy,
    onSeeWhy,
    onKeepShort,
}: {
    message: Extract<ChatMessage, { kind: "result" }>;
    /** Open with everything shown: the reader opened "See why" on two results in a row. */
    long: boolean;
    onOpenCar: (id: number) => void;
    onWhy: () => void;
    onSeeWhy: () => void;
    onKeepShort: () => void;
}) {
    const { winner } = message;
    const [open, setOpen] = useState(long);
    const why = message.why ?? [];
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
                            <p className="text-[11px] font-black uppercase tracking-wide text-[#9a6200]">Your strongest match</p>
                            <WinnerChip />
                        </div>
                        {winner.monthly != null ? (
                            <span className="text-right text-[11px] font-semibold text-finn-iron">
                                <span className="block text-[15px] font-black text-finn-black tabular-nums">{euros(winner.monthly)}</span>
                                a month, estimated
                            </span>
                        ) : null}
                    </div>

                    <CarPhoto src={winner.image} alt={winner.name} className="mt-2 h-28 w-full rounded-xl" />

                    <p className="mt-2.5 text-[15px] font-black leading-tight text-finn-black">{winner.name}</p>
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
                        </div>
                    ) : null}

                    {open ? (
                        <div className="mt-3 space-y-3 border-t border-[#f5d78a]/60 pt-3">
                            {reasons.length || (message.note && message.note !== know) ? (
                                <div>
                                    <p className="text-[10.5px] font-black uppercase tracking-wide text-finn-iron">What decided it</p>
                                    {message.note && message.note !== know ? <p className="mt-1 text-[12px] leading-snug text-finn-iron">{message.note}</p> : null}
                                    <ul className="mt-1 space-y-1">
                                        {reasons.map((reason) => (
                                            <li key={reason} className="flex gap-2 text-[12.5px] leading-snug text-finn-black">
                                                <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-finn-fit-good" strokeWidth={3} />
                                                <span>{reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {tradeoffs.length ? (
                                <div>
                                    <p className="text-[10.5px] font-black uppercase tracking-wide text-finn-iron">What you'd give up</p>
                                    <ul className="mt-1 space-y-1.5">
                                        {tradeoffs.map((tradeoff) => (
                                            <li key={tradeoff.headline} className="text-[12px] leading-snug text-finn-black">
                                                <span className="font-bold">{tradeoff.headline}.</span> {tradeoff.text}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {message.because?.length ? (
                                <div>
                                    <p className="text-[10.5px] font-black uppercase tracking-wide text-finn-iron">Because you said…</p>
                                    <ul className="mt-1 space-y-0.5">
                                        {message.because.map((item) => (
                                            <li key={item.said} className="text-[12px] leading-snug text-finn-black">
                                                {item.said} <span className="text-finn-iron">— {IMPORTANCE_LABEL[item.importance].toLowerCase()} → {item.into.join(", ")}</span>
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
    onImportance,
    onChange,
    onRemove,
    onAdd,
    busy,
    editable = null,
    onEdit,
    longResults = false,
    onSeeWhy = () => {},
    onKeepShort = () => {},
}: {
    messages: ChatMessage[];
    typing: boolean;
    onAnswer: (askId: string, chosen: string[], extra?: AnswerExtra) => void;
    /** A car's drawer, read out of the judgement its result came from. */
    onOpenCar: (id: number, judgement?: string) => void;
    onImportance: (needId: string, importance: NeedImportance) => void;
    onChange: (step: StepId) => void;
    /** An item a bubble checks, taken out from the summary; a suggestion added. */
    onRemove: (bubble: string, item: string) => void;
    onAdd: (bubble: string, item: string) => void;
    busy: boolean;
    /** Results open with everything shown, after "See why" on two in a row. */
    longResults?: boolean;
    onSeeWhy?: (resultId: string) => void;
    onKeepShort?: () => void;
    /** The reader message whose answer can be taken back, if any. */
    editable?: string | null;
    onEdit?: () => void;
}) {
    /* Only the newest open question takes answers; older ones read as what was asked. */
    const liveAsk = useMemo(() => {
        const last = [...messages].reverse().find((message) => message.kind === "ask");
        return last?.kind === "ask" && !last.answered ? last.id : null;
    }, [messages]);

    /* The summary can be edited until the reader says it looks good — older ones are a record. */
    const liveSummary = useMemo(() => {
        const last = [...messages].reverse().find((message) => message.kind === "summary");
        const keep = messages.find((message) => message.id === liveAsk);

        return last && keep?.kind === "ask" && keep.step.id === "confirm" && messages.indexOf(keep) > messages.indexOf(last) ? last.id : null;
    }, [messages, liveAsk]);

    const settled = !typing && !busy;

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
                body = message.step.deals ? (
                    <Deals key={message.id} message={message} live={message.id === liveAsk && settled} onAnswer={(chosen, extra) => onAnswer(message.id, chosen, extra)} />
                ) : (
                    <Ask
                        key={message.id}
                        message={message}
                        live={message.id === liveAsk && settled}
                        onAnswer={(chosen, extra) => onAnswer(message.id, chosen, extra)}
                    />
                );
                break;
            case "summary":
                body = <Summary message={message} live={message.id === liveSummary && settled} onImportance={onImportance} onChange={onChange} onRemove={onRemove} onAdd={onAdd} />;
                break;
            case "result":
                /* Each result opens on its own judgement: an earlier one on what it said then, not on a later winner. */
                body = (
                    <Result
                        message={message}
                        long={longResults}
                        onOpenCar={(id) => onOpenCar(id, message.judgement)}
                        onWhy={() => message.winner && onOpenCar(message.winner.id, message.judgement)}
                        onSeeWhy={() => onSeeWhy(message.id)}
                        onKeepShort={onKeepShort}
                    />
                );
                break;
        }

        rows.push(
            <div key={message.id} className={startsRun ? "pt-2" : ""}>
                <LensRow avatar={avatar}>{body}</LensRow>
            </div>,
        );
    });

    return (
        <div className="space-y-2" aria-live="polite">
            {rows}
            {typing ? <Typing /> : null}
        </div>
    );
}
