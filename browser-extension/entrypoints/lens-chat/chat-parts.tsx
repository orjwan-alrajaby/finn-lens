import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowUp, CalendarDays, Check, MessageCircleQuestion, Shuffle, Sparkles, UserRound, Wallet } from "lucide-react";

import { InfoTip } from "@/components/InfoTip";
import { Thinking } from "@/entrypoints/compare/lens-ai/parts";

import { formatEUR, monthLabel } from "@/lib/reasoning-engine";
import { addMonths } from "@/lib/reasoning-engine/contract";
import type { WireQuestion } from "@/lib/lens-ai/contract";
import { EVIDENCE, plainly, type EvidenceId } from "@/lib/lens-chat/evidence";
import { saidFor, type GuideStep } from "@/lib/lens-chat/guide";
import { startDate, termEnd, type SearchStart } from "@/lib/lens-chat/search";
import { needChips } from "@/lib/lens-chat/plain";
import type { Understanding } from "@/lib/lens-chat/understanding";

/**
 * The conversation's pieces.
 *
 * Three kinds of thing appear in it, and each looks like what it is:
 *
 * - **Speech.** The reader's words in a navy bubble on the right; Lens's as
 *   plain text on the left, because most of what it says is a card anyway.
 * - **Asks.** When Lens needs something it asks with a small card: an icon
 *   for the kind of thing (money, dates, a question, an offer), the question,
 *   and what to tap. Answered, the card stays where it was, the choice marked,
 *   so the conversation keeps its own record of what was asked and said.
 * - **Notes.** What just happened ("Using your Lens settings") is a caption,
 *   not a speech bubble, because nobody said it.
 */

/* -------------------------------------------------------------------------- */
/* Speech                                                                     */
/* -------------------------------------------------------------------------- */

/** The reader's own words. */
export function Said({ children }: { children: ReactNode }) {
    return (
        <p className="ml-auto w-fit max-w-[85%] whitespace-pre-line rounded-[18px] rounded-br-md bg-finn-highlight-navy px-3 py-2 text-sm leading-5 text-white">
            {children}
        </p>
    );
}

/**
 * Lens, talking: plain text against the conversation's own background, the
 * way it read when this chat was born. The reader's words are the one strong
 * marker in the panel; everything Lens says is either a sentence or a card.
 */
export function Says({ children, tone }: { children: ReactNode; tone?: "note" }) {
    return (
        <p className={`max-w-[92%] text-sm leading-6 ${tone === "note" ? "text-finn-iron" : "text-finn-black"}`}>{children}</p>
    );
}

/** Lens working something out. */
export function LensThinking({ children }: { children: ReactNode }) {
    return <Thinking>{children}</Thinking>;
}

/* -------------------------------------------------------------------------- */
/* Asks                                                                       */
/* -------------------------------------------------------------------------- */

/** A tap-to-answer reply. Once the ask is answered, the one chosen stays lit. */
export function Option({
    children,
    onClick,
    disabled,
    chosen,
    primary,
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    chosen?: boolean;
    /** The one answer most people give, drawn as the main action. */
    primary?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={chosen}
            className={[
                "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-black transition",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue",
                "disabled:cursor-not-allowed disabled:opacity-50",
                chosen
                    ? "bg-finn-pale-blue text-finn-accent-blue ring-1 ring-finn-accent-blue/30"
                    : primary
                      ? "bg-finn-accent-blue text-white hover:bg-finn-highlight-navy"
                      : "bg-white text-finn-black ring-1 ring-finn-cotton hover:bg-finn-pale-blue",
            ].join(" ")}
        >
            {chosen && <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />}
            {children}
        </button>
    );
}

export type AskKind = "budget" | "dates" | "question" | "offer" | "whatIf" | "ready" | "about";

const ASK_LOOK: Record<AskKind, { label: string; icon: ReactNode }> = {
    about: { label: "About you", icon: <UserRound aria-hidden="true" className="h-3.5 w-3.5" /> },
    budget: { label: "Your budget", icon: <Wallet aria-hidden="true" className="h-3.5 w-3.5" /> },
    dates: { label: "Your dates", icon: <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" /> },
    question: { label: "Lens asks", icon: <MessageCircleQuestion aria-hidden="true" className="h-3.5 w-3.5" /> },
    offer: { label: "Worth a look", icon: <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> },
    whatIf: { label: "What if", icon: <Shuffle aria-hidden="true" className="h-3.5 w-3.5" /> },
    ready: { label: "Ready to compare", icon: <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> },
};

/** Set inside an AskGroup: the group draws the card, each ask is a section of it. */
const InGroup = createContext(false);

/**
 * Several things Lens is asking at once, as one card.
 *
 * Lens waits for all of them before it compares, so they're one piece of the
 * conversation, and the count says how far through it the reader is. Four
 * separate cards said the same thing with four times the chrome.
 */
export function AskGroup({ total, answered, children }: { total: number; answered: number; children: ReactNode }) {
    const finished = answered >= total;

    return (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-finn-cotton">
            <div className="flex items-center justify-between gap-3 bg-finn-pale-blue px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">
                    {finished ? "All answered" : "Before I compare"}
                </p>
                <span className="flex items-center gap-2" aria-label={`${answered} of ${total} answered`}>
                    <span className="text-[10px] font-black tabular-nums text-finn-iron">
                        {answered} of {total}
                    </span>
                    <span className="flex gap-0.5">
                        {Array.from({ length: total }, (_, index) => (
                            <span key={index} className={`h-1 w-4 rounded-full ${index < answered ? "bg-finn-accent-blue" : "bg-white"}`} />
                        ))}
                    </span>
                </span>
            </div>
            <div className="divide-y divide-finn-cotton">
                <InGroup.Provider value>{children}</InGroup.Provider>
            </div>
        </section>
    );
}

/**
 * One thing Lens wants to know.
 *
 * Answered, it stays exactly where it was — the question, the options, the
 * one chosen lit — and quietens, so the open asks are the ones that stand
 * out. Where the answer isn't one of the options (dates typed in, a figure of
 * their own), it's written under them.
 */
export function Asked({
    kind = "question",
    title,
    children,
    options,
    answer,
    done = false,
}: {
    kind?: AskKind;
    title: ReactNode;
    children?: ReactNode;
    options: ReactNode;
    answer?: string | null;
    done?: boolean;
}) {
    const look = ASK_LOOK[kind];
    const grouped = useContext(InGroup);

    return (
        <section
            className={grouped ? "px-4 py-3" : "overflow-hidden rounded-[22px] bg-white ring-1 ring-finn-cotton"}
        >
            <p
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${
                    done ? "text-finn-iron" : "text-finn-accent-blue"
                } ${grouped ? "" : "bg-finn-pale-blue px-4 pb-1.5 pt-3"}`}
            >
                {done ? <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} /> : look.icon}
                {look.label}
            </p>

            <div className={grouped ? "" : "bg-finn-pale-blue px-4 pb-3"}>
                <p className={`text-sm font-black leading-5 ${done ? "text-finn-iron" : "text-finn-black"}`}>{title}</p>
                {children && <div className="mt-1 space-y-1 text-xs leading-5 text-finn-iron">{children}</div>}
            </div>

            {options && <div className={`flex flex-wrap gap-1.5 ${grouped ? "mt-2.5" : "px-4 py-3"}`}>{options}</div>}

            {answer && (
                <p className={`flex items-start gap-1.5 text-xs font-black leading-5 text-finn-accent-blue ${grouped ? "mt-2" : "border-t border-finn-cotton px-4 py-2.5"}`}>
                    <Check aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={3} />
                    {answer}
                </p>
            )}
        </section>
    );
}

/** What an ask shows once it's done with: the answer given, if any, and which option it was. */
export interface AskAnswer {
    /** The reader's answer, as it reads in the conversation. */
    text: string | null;
    /** The option tapped, to mark it; null for a typed or a skipped answer. */
    choice: string | null;
}

/** The amounts most readers pick, offered before anyone types one. */
const BUDGET_CHOICES = [400, 500, 600, 750];

export function BudgetAsk({
    busy,
    answered,
    prefill = null,
    keep = null,
    title,
    onAnswer,
}: {
    busy: boolean;
    answered: AskAnswer | null;
    /** An amount to start from — the top of the price filter — already in the reader's own field. */
    prefill?: number | null;
    /** The limit they gave before, when Lens is asking again: offered as it was. */
    keep?: number | null;
    /** What to ask, when it isn't the usual question. */
    title?: string;
    onAnswer: (monthly: number | null, choice: string) => void;
}) {
    const done = answered != null;
    const [own, setOwn] = useState(prefill ? String(Math.round(prefill)) : "");
    const figure = Number(own);
    const ownOk = own !== "" && figure >= 100 && figure <= 5000;
    const labels = BUDGET_CHOICES.map((amount) => `Up to ${formatEUR(amount)}`);
    const keepLabel = keep ? `Keep ${formatEUR(keep)}` : null;
    const tapped = answered?.choice != null && [...labels, "No limit", ...(keepLabel ? [keepLabel] : [])].includes(answered.choice);

    return (
        <Asked
            kind="budget"
            done={done}
            title={title ?? "What’s the most you’d spend a month, all in?"}
            answer={tapped ? null : answered?.text}
            options={
                <>
                    {keep && keepLabel && (
                        <Option primary onClick={() => onAnswer(keep, keepLabel)} disabled={busy || done} chosen={answered?.choice === keepLabel}>
                            {keepLabel}
                        </Option>
                    )}
                    {BUDGET_CHOICES.map((amount, index) => (
                        <Option key={amount} onClick={() => onAnswer(amount, labels[index]!)} disabled={busy || done} chosen={answered?.choice === labels[index]}>
                            {labels[index]}
                        </Option>
                    ))}
                    <Option onClick={() => onAnswer(null, "No limit")} disabled={busy || done} chosen={answered?.choice === "No limit"}>
                        No limit
                    </Option>

                    {!done && (
                        /* A figure of their own, for anyone whose budget isn't a round hundred. */
                        <form
                            className="inline-flex h-9 items-center gap-1 rounded-full bg-finn-snow pl-3 pr-1 ring-1 ring-finn-cotton focus-within:ring-2 focus-within:ring-finn-accent-blue"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (ownOk) onAnswer(Math.round(figure), `Up to ${formatEUR(Math.round(figure))}`);
                            }}
                        >
                            <span className="text-[13px] font-bold text-finn-iron">€</span>
                            <input
                                inputMode="numeric"
                                value={own}
                                onChange={(event) => setOwn(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                                placeholder="Other"
                                aria-label="Your own monthly maximum, in euros"
                                disabled={busy}
                                className="w-14 bg-transparent text-[13px] font-bold text-finn-black outline-none placeholder:font-semibold placeholder:text-finn-iron/70"
                            />
                            <button
                                type="submit"
                                disabled={!ownOk || busy}
                                aria-label="Use this amount"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-finn-accent-blue text-white transition disabled:opacity-30"
                            >
                                <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
                            </button>
                        </form>
                    )}
                </>
            }
        />
    );
}

/** "2026-10-08" as "8 October 2026". */
const dayLabel = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-10-08" as "8 Oct". */
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** What the date question says, given what the reader's filters already fixed. */
export function periodTitle(termMonths: number | null, start: SearchStart | null): string {
    if (termMonths && start) return `Your filters say a ${termMonths}-month contract ${start.phrase}. Do these dates work?`;
    if (termMonths) return `Your filters say a ${termMonths}-month contract. When should it start?`;
    if (start) return `Your filters say you need it ${start.phrase}. Until when?`;

    return "When do you need it, and until when?";
}

/**
 * The days someone needs a car between.
 *
 * Native date fields, which handle clicks, keys and the browser's own
 * calendar properly — Radix has no date picker to use instead. What they
 * don't do is tell a finished choice from one in progress: Chrome changes the
 * value from the arrow keys, the spinner or a half-typed date, so nothing is
 * sent until the reader presses the button, and the answer says the dates in
 * full.
 *
 * Both fields are always the reader's to change. Whatever Lens already knows
 * fills them in — the start from FINN's availability filter, the end from its
 * contract length, or the dates they gave before when Lens is asking again —
 * so the usual answer is one press, and a different one is two.
 */
export function PeriodAsk({
    busy,
    answered,
    termMonths = null,
    start = null,
    prefill = null,
    title,
    onAnswer,
}: {
    busy: boolean;
    answered: AskAnswer | null;
    /** A contract length from FINN's filters: the end follows the start by that many months until the reader changes it. */
    termMonths?: number | null;
    /** When the car is needed, from FINN's availability filter — "within 14 days", "from November". */
    start?: SearchStart | null;
    /** Dates to start from, "2026-11-01" — the ones given before, when Lens is asking again. */
    prefill?: { from: string | null; to: string | null } | null;
    /** What to ask, when it isn't the usual question — asking again after a filter changed. */
    title?: string;
    onAnswer: (from: string | null, to: string | null, startDay: number | null, said: string) => void;
}) {
    const initialFrom = prefill?.from ?? (start ? startDate(start) : "");
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(prefill?.to ?? (termMonths && initialFrom ? termEnd(initialFrom, termMonths) : ""));
    /* Once the reader picks an end themselves, moving the start no longer moves it. */
    const [toTouched, setToTouched] = useState(Boolean(prefill?.to));

    const done = answered != null;
    const backwards = Boolean(from && to && to < from);
    const complete = Boolean(from && to && !backwards);
    const field =
        "mt-1 h-10 w-full min-w-0 rounded-xl bg-finn-snow px-2.5 text-[13px] font-bold text-finn-black ring-1 ring-finn-cotton outline-none focus:bg-white focus:ring-2 focus:ring-finn-accent-blue";

    const changeFrom = (value: string) => {
        setFrom(value);
        if (termMonths && value && !toTouched) setTo(termEnd(value, termMonths));
    };

    const send = () => {
        if (complete) onAnswer(from.slice(0, 7), to.slice(0, 7), Number(from.slice(8, 10)), `From ${dayLabel(from)} until ${dayLabel(to)}.`);
    };

    return (
        <Asked
            kind="dates"
            done={done}
            title={title ?? periodTitle(termMonths, start)}
            answer={answered?.text}
            options={
                done ? null : (
                    <>
                        <Option primary onClick={send} disabled={busy || !complete}>
                            {complete ? `Use ${shortDay(from)} – ${shortDay(to)}` : "Use these dates"}
                        </Option>
                        <Option onClick={() => onAnswer(null, null, null, "I don't have fixed dates.")} disabled={busy}>
                            No fixed dates
                        </Option>
                    </>
                )
            }
        >
            {!done && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="block text-[11px] font-bold text-finn-iron">
                        From{start && from === startDate(start) ? " · your filter" : ""}
                        <input type="date" value={from} disabled={busy} onChange={(event) => changeFrom(event.target.value)} className={field} />
                    </label>

                    <label className="block text-[11px] font-bold text-finn-iron">
                        Until{termMonths && !toTouched && to ? ` · ${termMonths} months` : ""}
                        <input
                            type="date"
                            value={to}
                            min={from || undefined}
                            disabled={busy}
                            onChange={(event) => {
                                setTo(event.target.value);
                                setToTouched(true);
                            }}
                            aria-invalid={backwards || undefined}
                            className={`${field} aria-invalid:text-finn-error aria-invalid:ring-finn-error`}
                        />
                    </label>

                    {backwards && <p className="col-span-2 text-[11px] leading-4 text-finn-error">The second date is before the first.</p>}
                </div>
            )}
        </Asked>
    );
}

/**
 * A question the reader made out of date before answering it — they changed
 * the filter it was about. It stays in the record, struck through, with the
 * reason; the new question is asked below it.
 */
export function ScratchedAsk({ kind, title, reason }: { kind: AskKind; title: string; reason: string }) {
    return (
        <Asked
            kind={kind}
            done
            title={<s className="decoration-finn-iron/60">{title}</s>}
            answer={reason}
            options={null}
        />
    );
}

/**
 * Lens's own question, answered by tapping.
 *
 * This is how the conversation runs when there is no model to read a
 * sentence: Lens asks in its own words, the reader picks from what Lens can
 * actually check on these cars, and nothing moves until they say they're done.
 * Several answers stay open until then, because "kids in the back" and "long
 * motorway drives" are both true of the same person, and sending each tap
 * straight through would answer the question three times.
 */
export function ChoiceAsk({
    step,
    busy,
    answered,
    onAnswer,
}: {
    step: GuideStep;
    busy: boolean;
    answered: AskAnswer | null;
    onAnswer: (chosen: string[], said: string) => void;
}) {
    const done = answered != null;
    const [chosen, setChosen] = useState<string[]>([]);

    const pick = (id: string) => {
        if (!step.multiple) {
            const choice = step.choices.find((item) => item.id === id);

            /* One answer: tapping it is the whole answer, so it goes at once. */
            onAnswer([id], choice?.said ?? "");
            return;
        }

        setChosen((all) => (all.includes(id) ? all.filter((item) => item !== id) : [...all, id]));
    };

    return (
        <Asked
            kind="about"
            done={done}
            title={step.ask}
            answer={answered?.text}
            options={
                done ? null : (
                    <>
                        {step.choices.map((choice) => (
                            <Option key={choice.id} onClick={() => pick(choice.id)} disabled={busy} chosen={chosen.includes(choice.id)}>
                                {choice.label}
                            </Option>
                        ))}

                        {step.multiple ? (
                            <Option
                                primary={chosen.length > 0}
                                disabled={busy}
                                onClick={() => onAnswer(chosen, saidFor(step, chosen))}
                            >
                                {chosen.length ? `That's ${chosen.length === 1 ? "it" : `all ${chosen.length}`}` : step.none}
                            </Option>
                        ) : (
                            <Option disabled={busy} onClick={() => onAnswer([], step.none)}>
                                {step.none}
                            </Option>
                        )}
                    </>
                )
            }
        >
            {step.hint && !done && <p>{step.hint}</p>}
        </Asked>
    );
}

/** The model's question, with its reason and its answers. */
export function QuestionAsk({
    question,
    busy,
    answered,
    onAnswer,
}: {
    question: WireQuestion;
    busy: boolean;
    answered: AskAnswer | null;
    onAnswer: (answer: string) => void;
}) {
    const tapped = answered?.choice != null && question.options.includes(answered.choice);

    return (
        <Asked
            kind="question"
            done={answered != null}
            title={question.ask}
            answer={tapped ? null : answered?.text}
            options={question.options.map((option) => (
                <Option key={option} onClick={() => onAnswer(option)} disabled={busy || answered != null} chosen={answered?.choice === option}>
                    {option}
                </Option>
            ))}
        >
            {question.why && answered == null && <p>{sentence(question.why)}</p>}
        </Asked>
    );
}

/**
 * Equipment Lens noticed and the reader never asked for.
 *
 * Named first, with why it might matter to them; what the thing actually is
 * waits behind "What is it?" for anyone who hasn't met it — most people
 * haven't heard of half of what FINN lists, and nobody needs the definition
 * of the half they have.
 */
export function FeatureAsk({
    id,
    why,
    busy,
    answered,
    onAnswer,
}: {
    id: EvidenceId;
    why: string;
    busy: boolean;
    answered: AskAnswer | null;
    onAnswer: (take: boolean) => void;
}) {
    const done = answered != null;

    return (
        <Asked
            kind="offer"
            done={done}
            title={
                /* What the thing is waits behind an "i", as it does everywhere else in Lens. */
                <span className="inline-flex items-center gap-1.5">
                    {EVIDENCE[id].label}
                    <InfoTip subject={EVIDENCE[id].label}>{plainly(id)}</InfoTip>
                </span>
            }
            options={
                <>
                    <Option onClick={() => onAnswer(true)} disabled={busy || done} chosen={answered?.choice === "yes"}>
                        Yes, count it
                    </Option>
                    <Option onClick={() => onAnswer(false)} disabled={busy || done} chosen={answered?.choice === "no"}>
                        Not for me
                    </Option>
                </>
            }
        >
            {why && <p>{sentence(why)}</p>}
        </Asked>
    );
}

/**
 * A change to their situation Lens hasn't made yet — before and after, and a
 * choice to try it or leave things as they are.
 */
export function WhatIfAsk({
    reply,
    lines,
    status,
    busy,
    onRun,
    onCancel,
    outcome,
    onUse,
}: {
    reply: string;
    lines: { label: string; from: string; to: string }[];
    status: "pending" | "ran" | "used" | "cancelled";
    busy: boolean;
    onRun: () => void;
    onCancel: () => void;
    /** What the engine found once it was tried: the match before and after. */
    outcome?: {
        winnerChanged: boolean;
        headline: string;
        before: { name: string; monthly: number };
        after: { name: string; monthly: number };
        details: string[];
    } | null;
    onUse?: () => void;
}) {
    const done = status === "used" || status === "cancelled";
    const ran = status === "ran" && outcome;

    return (
        <Asked
            kind="whatIf"
            done={done}
            title={reply || "Try it another way?"}
            answer={status === "cancelled" ? "Left as it was." : status === "used" ? "Using the changed situation." : null}
            options={
                done ? null : ran ? (
                    <>
                        <Option primary onClick={() => onUse?.()} disabled={busy}>
                            Use this
                        </Option>
                        <Option onClick={onCancel} disabled={busy}>
                            Keep what I had
                        </Option>
                    </>
                ) : (
                    <>
                        {lines.length > 0 && (
                            <Option primary onClick={onRun} disabled={busy}>
                                Try it
                            </Option>
                        )}
                        <Option onClick={onCancel} disabled={busy}>
                            Leave it as it is
                        </Option>
                    </>
                )
            }
        >
            {ran && (
                /* The engine's answer to the what-if: the match it would give, beside the one they have. */
                <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-finn-cotton">
                    <div className="grid grid-cols-2 divide-x divide-finn-cotton text-[12px] leading-4">
                        <div className="px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-finn-iron">Now</p>
                            <p className="mt-1 truncate font-black text-finn-black">{outcome.before.name}</p>
                            <p className="tabular-nums text-finn-iron">{formatEUR(Math.round(outcome.before.monthly))}/mo</p>
                        </div>
                        <div className="bg-finn-pale-blue/60 px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-finn-accent-blue">With the change</p>
                            <p className="mt-1 truncate font-black text-finn-highlight-navy">{outcome.after.name}</p>
                            <p className="tabular-nums text-finn-highlight-navy/70">{formatEUR(Math.round(outcome.after.monthly))}/mo</p>
                        </div>
                    </div>
                    <p className="border-t border-finn-cotton px-3 py-2 text-[12px] leading-[1.4] text-finn-black">
                        {outcome.headline}
                        {outcome.details[0] && <span className="text-finn-iron"> {outcome.details[0]}</span>}
                    </p>
                </div>
            )}

            {lines.length > 0 ? (
                <ul className="space-y-1 pt-1">
                    {lines.map((line) => (
                        <li key={line.label} className="flex flex-wrap items-baseline gap-x-1.5">
                            <span className="font-bold text-finn-black">{line.label}</span>
                            <span className="line-through decoration-finn-iron/60">{line.from}</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-bold text-finn-accent-blue">{line.to}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p>That doesn&rsquo;t change anything Lens uses.</p>
            )}
        </Asked>
    );
}

/** Lens has everything it asked for: the reader decides when it compares. */
export function ConfirmAsk({
    headline,
    count,
    isUpdate,
    busy,
    done,
    onCompare,
    onCorrect,
}: {
    /** The set of cars, named as the header names it: "3 cars on this page". */
    headline: string;
    /** How many cars that is; with none, there is nothing to compare yet. */
    count?: number;
    isUpdate: boolean;
    busy: boolean;
    /** "compared" once it ran, "correcting" once the reader said not quite. */
    /** "closed" when a new conversation began before it was answered. */
    done: false | "compared" | "correcting" | "closed";
    onCompare: () => void;
    onCorrect: () => void;
}) {
    const cars = /^\d/.test(headline) ? `the ${headline}` : headline;
    const none = count === 0;
    const yes = isUpdate ? "Update my match" : count === 1 ? "Check this car" : count ? `Compare ${count} cars` : "Compare";

    return (
        <Asked
            kind="ready"
            done={Boolean(done)}
            title={none ? "That’s everything I need — but there are no cars to compare yet." : isUpdate ? "Shall I redo the comparison with that?" : "That’s everything I need."}
            options={
                <>
                    <Option primary onClick={onCompare} disabled={busy || Boolean(done) || none} chosen={done === "compared"}>
                        {yes}
                    </Option>
                    <Option onClick={onCorrect} disabled={busy || Boolean(done)} chosen={done === "correcting"}>
                        Not quite
                    </Option>
                </>
            }
        >
            {!done && none && <p>Scroll the page so FINN loads its cars, then press compare.</p>}
            {!done && !none && !isUpdate && <p>I&rsquo;ll rank {cars} against what you told me.</p>}
        </Asked>
    );
}

/* -------------------------------------------------------------------------- */
/* Around the conversation                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What Lens has in focus, under the header: the money, the dates and what they
 * asked for, a glance at a time, with the whole of it a tap away.
 */
export function LensStatus({ understanding, onOpen }: { understanding: Understanding; onOpen: () => void }) {
    const chips = needChips(understanding);

    if (!chips.length) return null;

    return (
        <button
            type="button"
            onClick={onOpen}
            className="group flex w-full items-center gap-2 border-b border-finn-cotton bg-white px-3 py-2 text-left transition hover:bg-finn-pale-blue/50"
            aria-label={`In focus: ${chips.join(", ")}. See everything Lens understood.`}
        >
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">In focus</span>
            {/*
              * Clipped, not truncated: a line that runs off the edge reads as a
              * line with more on it, and the whole of it is one tap away.
              */}
            <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden" style={{ maskImage: "linear-gradient(to right, black 82%, transparent)" }}>
                {chips.map((chip, index) => (
                    <span
                        key={chip}
                        className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            index === 0 ? "bg-finn-pale-blue text-finn-accent-blue" : "bg-finn-snow text-finn-black"
                        }`}
                    >
                        {chip}
                    </span>
                ))}
            </span>
            <span className="shrink-0 text-[11px] font-black text-finn-accent-blue group-hover:underline">Your needs</span>
        </button>
    );
}

/**
 * The foot of the panel in Lens Chat, where there is nothing to read a
 * sentence with.
 *
 * A message box that can't read a message is worse than no box: people type
 * into it, press send, and are told the thing they wanted lives in Settings.
 * So the space says what this chat does instead — Lens asks, you tap — and
 * what turning the model on would add.
 */
export function TypingOffer({
    askLabel,
    onAsk,
    onOpenSettings,
}: {
    /** "Ask me questions" before a comparison; "Change my answers" after one. */
    askLabel: string;
    onAsk: () => void;
    onOpenSettings: () => void;
}) {
    return (
        <div className="flex items-center gap-2 rounded-[20px] bg-finn-snow px-3 py-2">
            <p className="min-w-0 flex-1 text-[11px] leading-4 text-finn-iron">
                Lens asks; you tap.{" "}
                <button type="button" onClick={onOpenSettings} className="font-black text-finn-accent-blue hover:underline">
                    Turn on Lens AI
                </button>{" "}
                to type instead.
            </p>

            <button
                type="button"
                onClick={onAsk}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-black text-finn-accent-blue ring-1 ring-finn-cotton transition hover:bg-finn-pale-blue"
            >
                <MessageCircleQuestion aria-hidden="true" className="h-3.5 w-3.5" />
                {askLabel}
            </button>
        </div>
    );
}

/** Where the reader writes. Enter sends; Shift+Enter is a new line. */
export function Composer({
    value,
    placeholder,
    busy,
    ready,
    inputRef,
    onChange,
    onSend,
}: {
    value: string;
    placeholder: string;
    busy: boolean;
    ready: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    onChange: (value: string) => void;
    onSend: () => void;
}) {
    /* Back to one line once what they wrote has been sent. */
    useEffect(() => {
        if (!value && inputRef.current) inputRef.current.style.height = "";
    }, [value, inputRef]);

    return (
        <form
            className="flex items-end gap-2 rounded-[20px] bg-finn-snow py-1.5 pl-3 pr-1.5 ring-1 ring-transparent focus-within:ring-finn-accent-blue"
            onSubmit={(event) => {
                event.preventDefault();
                onSend();
            }}
        >
            <textarea
                ref={inputRef}
                value={value}
                rows={1}
                maxLength={1200}
                disabled={!ready}
                onChange={(event) => {
                    onChange(event.target.value);
                    /* Grows with what they write, up to a few lines. */
                    event.target.style.height = "auto";
                    event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        onSend();
                    }
                }}
                placeholder={placeholder}
                aria-label="Message Lens"
                className="max-h-24 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 outline-none [scrollbar-width:none] placeholder:truncate placeholder:text-finn-iron/70"
            />
            <button
                type="submit"
                aria-label="Send"
                disabled={!value.trim() || busy || !ready}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-finn-accent-blue text-white transition hover:bg-finn-highlight-navy disabled:opacity-40"
            >
                <ArrowUp aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />
            </button>
        </form>
    );
}

const sentence = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/[.\s]+$/, "")}.`;
