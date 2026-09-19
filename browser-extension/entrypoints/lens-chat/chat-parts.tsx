import { useState, type ReactNode } from "react";
import { ArrowUp, Check } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import type { WireQuestion } from "@/lib/lens-ai/contract";
import { plainly, type EvidenceId } from "@/lib/lens-chat/evidence";
import { needChips } from "@/lib/lens-chat/plain";
import type { Understanding } from "@/lib/lens-chat/understanding";

/**
 * The conversation itself: what was said, what Lens is asking, and a line of
 * chips saying what it's working with.
 *
 * Everything here is deliberately plain. Lens speaks as text, the reader's own
 * words get the one strong marker in the panel, and a question is a question
 * with something to tap — not a card, a panel or a form. What Lens understood,
 * how it is judging and what it found all live outside the transcript, because
 * a conversation that keeps printing reports to itself stops being one.
 */

/** The reader's own words — typed, or chosen from something Lens offered. */
export function Said({ children }: { children: ReactNode }) {
    return (
        <p className="ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-md bg-finn-highlight-navy px-3 py-2 text-sm leading-5 text-white">
            {children}
        </p>
    );
}

/** Lens, talking. A note is Lens telling the reader what just happened. */
export function Says({ children, tone }: { children: ReactNode; tone?: "note" }) {
    return (
        <p className={`max-w-[92%] text-sm leading-6 ${tone === "note" ? "text-finn-iron" : "text-finn-black"}`}>
            {children}
        </p>
    );
}

/** A tap-to-answer reply. */
export function Option({
    children,
    onClick,
    disabled,
    chosen,
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    chosen?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={chosen}
            className={[
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition disabled:opacity-50",
                chosen
                    ? "bg-finn-accent-blue text-white"
                    : "bg-white text-finn-accent-blue ring-1 ring-finn-cotton hover:bg-finn-pale-blue",
            ].join(" ")}
        >
            {chosen && <Check aria-hidden="true" className="h-3 w-3" />}
            {children}
        </button>
    );
}

/** One thing Lens wants to know, in the conversation's own voice. */
export function Asked({ children, options }: { children: ReactNode; options: ReactNode }) {
    return (
        <div className="max-w-[92%] space-y-2">
            <div className="space-y-1 text-sm leading-6 text-finn-black">{children}</div>
            <div className="flex flex-wrap gap-1.5">{options}</div>
        </div>
    );
}

/** The amounts most readers pick, offered before anyone types one. */
const BUDGET_CHOICES = [400, 500, 600, 750];

export function BudgetAsk({ busy, onAnswer }: { busy: boolean; onAnswer: (monthly: number | null) => void }) {
    return (
        <Asked
            options={
                <>
                    {BUDGET_CHOICES.map((amount) => (
                        <Option key={amount} onClick={() => onAnswer(amount)} disabled={busy}>
                            Up to {formatEUR(amount)}
                        </Option>
                    ))}
                    <Option onClick={() => onAnswer(null)} disabled={busy}>
                        No limit
                    </Option>
                </>
            }
        >
            <p>What&rsquo;s the most you&rsquo;d spend a month, all in?</p>
        </Asked>
    );
}

/**
 * The days someone needs a car between.
 *
 * Two full-width date fields in a panel this narrow, and nothing is reported
 * until both ends are in: half a period is neither a period nor a refusal.
 * Days rather than months because FINN publishes an earliest delivery date,
 * so "I need it by the 25th" is a real answer to whether a car can arrive.
 */
export function PeriodAsk({
    busy,
    onAnswer,
}: {
    busy: boolean;
    onAnswer: (from: string | null, to: string | null, startDay: number | null) => void;
}) {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    const backwards = Boolean(from && to && to < from);
    const field =
        "mt-1 h-10 w-full min-w-0 rounded-xl bg-white px-3 text-sm font-bold text-finn-black ring-1 ring-finn-cotton outline-none focus:ring-2 focus:ring-finn-accent-blue";

    const send = (start: string, end: string) => {
        if (!start || !end || end < start) return;

        onAnswer(start.slice(0, 7), end.slice(0, 7), Number(start.slice(8, 10)));
    };

    return (
        <div className="max-w-[92%] space-y-2">
            <p className="text-sm leading-6 text-finn-black">When do you need it, and until when?</p>

            <div className="space-y-2">
                <label className="block text-[11px] font-bold text-finn-iron">
                    From
                    <input
                        type="date"
                        value={from}
                        disabled={busy}
                        onChange={(event) => {
                            setFrom(event.target.value);
                            send(event.target.value, to);
                        }}
                        className={field}
                    />
                </label>

                <label className="block text-[11px] font-bold text-finn-iron">
                    Until
                    <input
                        type="date"
                        value={to}
                        min={from || undefined}
                        disabled={busy}
                        onChange={(event) => {
                            setTo(event.target.value);
                            send(from, event.target.value);
                        }}
                        aria-invalid={backwards || undefined}
                        className={`${field} aria-invalid:text-finn-error`}
                    />
                </label>
            </div>

            {backwards && <p className="text-[11px] leading-4 text-finn-error">The second date is before the first.</p>}

            <div className="flex flex-wrap gap-1.5">
                <Option onClick={() => onAnswer(null, null, null)} disabled={busy}>
                    I don&rsquo;t have fixed dates
                </Option>
            </div>
        </div>
    );
}

/** The model's question, with its reason and its answers. */
export function QuestionAsk({
    question,
    busy,
    onAnswer,
}: {
    question: WireQuestion;
    busy: boolean;
    onAnswer: (answer: string) => void;
}) {
    return (
        <Asked
            options={question.options.map((option) => (
                <Option key={option} onClick={() => onAnswer(option)} disabled={busy}>
                    {option}
                </Option>
            ))}
        >
            <p>{question.ask}</p>
            {question.why && <p className="text-finn-iron">{sentence(question.why)}</p>}
        </Asked>
    );
}

/**
 * Equipment Lens noticed and the reader never asked for.
 *
 * The teaching is the point — most people have never heard of half of what
 * FINN lists — so it stays in the conversation, as two sentences: what the
 * thing is, and why it might matter to them. Answering it is one tap, and
 * what Lens does with the answer is its own business.
 */
export function FeatureAsk({
    id,
    why,
    busy,
    onAnswer,
}: {
    id: EvidenceId;
    why: string;
    busy: boolean;
    onAnswer: (take: boolean) => void;
}) {
    return (
        <Asked
            options={
                <>
                    <Option onClick={() => onAnswer(true)} disabled={busy}>
                        Yes, consider it
                    </Option>
                    <Option onClick={() => onAnswer(false)} disabled={busy}>
                        No, not important
                    </Option>
                </>
            }
        >
            <p>{plainly(id)}</p>
            {why && <p>{sentence(why)} Would that help?</p>}
            {!why && <p>Would that help?</p>}
        </Asked>
    );
}

/**
 * A change to their situation Lens hasn't made yet.
 *
 * "What if I could spend €100 more?" is a question about them, so it's asked
 * where they asked it — as a line of speech with what would change under it,
 * not as a card with a table inside.
 */
export function WhatIfAsk({
    reply,
    lines,
    status,
    busy,
    onRun,
    onCancel,
}: {
    reply: string;
    lines: { label: string; from: string; to: string }[];
    status: "pending" | "ran" | "used" | "cancelled";
    busy: boolean;
    onRun: () => void;
    onCancel: () => void;
}) {
    if (status === "cancelled") return <Says tone="note">Left as it was.</Says>;

    const changes = lines.map((line) => `${line.label}: ${line.from} → ${line.to}`);

    return (
        <Asked
            options={
                status === "pending" ? (
                    <>
                        {lines.length > 0 && (
                            <Option onClick={onRun} disabled={busy}>
                                Try it
                            </Option>
                        )}
                        <Option onClick={onCancel} disabled={busy}>
                            Leave it as it is
                        </Option>
                    </>
                ) : null
            }
        >
            {reply && <p>{reply}</p>}
            {changes.length > 0 ? (
                <ul className="space-y-0.5 text-finn-iron">
                    {changes.map((change) => (
                        <li key={change}>{change}</li>
                    ))}
                </ul>
            ) : (
                <p className="text-finn-iron">That doesn&rsquo;t change anything Lens uses.</p>
            )}
        </Asked>
    );
}

/** Lens has everything it asked for: the reader decides when it compares. */
export function ConfirmAsk({
    headline,
    isUpdate,
    busy,
    done,
    onCompare,
    onCorrect,
}: {
    /** The set of cars, named as the header names it: "3 cars on this page". */
    headline: string;
    isUpdate: boolean;
    busy: boolean;
    done: boolean;
    onCompare: () => void;
    onCorrect: () => void;
}) {
    if (done) {
        return (
            <Says tone="note">
                <Check aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 text-finn-influence-emerald" />
                {isUpdate ? "Updated." : "Compared."}
            </Says>
        );
    }

    return (
        <Asked
            options={
                <>
                    <Option onClick={onCompare} disabled={busy}>
                        {isUpdate ? "Yes, update it" : "Yes, go ahead"}
                    </Option>
                    <Option onClick={onCorrect} disabled={busy}>
                        Not quite
                    </Option>
                </>
            }
        >
            <p>
                {isUpdate
                    ? "Shall I redo the comparison with that?"
                    : `That's everything I need. Shall I compare ${/^\d/.test(headline) ? `the ${headline}` : headline}?`}
            </p>
        </Asked>
    );
}

/**
 * What Lens is working with, under the header.
 *
 * A glance, not a dashboard: the money, the dates and the first few things
 * they asked for, with the rest a tap away. It updates as the conversation
 * does, which is what stops the conversation having to repeat itself.
 */
export function LensStatus({ understanding, onOpen }: { understanding: Understanding; onOpen: () => void }) {
    const chips = needChips(understanding);

    if (!chips.length) return null;

    return (
        <div className="flex items-center gap-2 border-b border-finn-cotton bg-white px-3 py-2">
            {/*
              * Clipped, not truncated: three chips ending in "…" read as
              * broken, where a line that runs off the edge reads as a line
              * with more on it — and "Your needs" is where the more is.
              */}
            <div
                className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
                style={{ maskImage: "linear-gradient(to right, black 85%, transparent)" }}
            >
                {chips.map((chip) => (
                    <span key={chip} className="shrink-0 whitespace-nowrap rounded-full bg-finn-snow px-2 py-0.5 text-[11px] font-bold text-finn-black">
                        {chip}
                    </span>
                ))}
            </div>

            <button
                type="button"
                onClick={onOpen}
                className="shrink-0 text-[11px] font-black text-finn-accent-blue hover:underline"
            >
                Your needs
            </button>
        </div>
    );
}

/** The composer's own hint that there is nothing stopping you typing. */
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
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        onSend();
                    }
                }}
                placeholder={placeholder}
                aria-label="Message Lens"
                className="max-h-24 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 outline-none placeholder:text-finn-iron/70"
            />
            <button
                type="submit"
                aria-label="Send"
                disabled={!value.trim() || busy || !ready}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-finn-accent-blue text-white transition hover:bg-finn-highlight-navy disabled:opacity-40"
            >
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </button>
        </form>
    );
}

const sentence = (value: string): string =>
    `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/[.\s]+$/, "")}.`;
