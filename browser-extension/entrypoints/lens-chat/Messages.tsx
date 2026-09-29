import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";

import { BandChip, BrandMark, CarPhoto, euros, WinnerChip } from "@/components/lens-parts";
import type { CarSnapshot, ChatMessage } from "@/lib/chats/types";

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

function ReaderBubble({ text }: { text: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[82%] rounded-2xl rounded-br-md bg-finn-accent-blue px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                {text}
            </div>
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

function Chip({
    label,
    selected,
    onClick,
    disabled,
    muted,
}: {
    label: string;
    selected?: boolean;
    onClick: () => void;
    disabled?: boolean;
    muted?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={selected}
            className={[
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue disabled:cursor-default",
                selected
                    ? "bg-finn-accent-blue text-white shadow-sm"
                    : muted
                      ? "bg-transparent text-finn-iron ring-1 ring-finn-iron/25 hover:bg-white hover:text-finn-black"
                      : "bg-white text-finn-accent-blue ring-1 ring-finn-accent-blue/35 hover:bg-finn-pale-blue",
            ].join(" ")}
        >
            {selected ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            {label}
        </button>
    );
}

function Ask({
    message,
    live,
    onAnswer,
}: {
    message: Extract<ChatMessage, { kind: "ask" }>;
    live: boolean;
    onAnswer: (chosen: string[]) => void;
}) {
    const { step } = message;
    const [picked, setPicked] = useState<string[]>(step.selected ?? []);

    return (
        <>
            <LensBubble>
                <p className="font-semibold">{step.ask}</p>
                {step.hint && live ? <p className="mt-1 text-[12px] leading-snug text-finn-iron">{step.hint}</p> : null}
            </LensBubble>

            {live ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {step.choices.map((choice) => (
                        <Chip
                            key={choice.id}
                            label={choice.label}
                            selected={step.multiple && picked.includes(choice.id)}
                            onClick={() =>
                                step.multiple
                                    ? setPicked((current) =>
                                          current.includes(choice.id) ? current.filter((id) => id !== choice.id) : [...current, choice.id],
                                      )
                                    : onAnswer([choice.id])
                            }
                        />
                    ))}

                    {step.none && !(step.multiple && picked.length) ? <Chip label={step.none} muted onClick={() => onAnswer([])} /> : null}

                    {step.multiple && picked.length ? (
                        <button
                            type="button"
                            onClick={() => onAnswer(picked)}
                            className="inline-flex items-center gap-1 rounded-full bg-finn-highlight-navy px-4 py-2 text-[12.5px] font-black text-white shadow-sm transition-colors hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
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

function Summary({ message }: { message: Extract<ChatMessage, { kind: "summary" }> }) {
    return (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <dl className="divide-y divide-finn-cotton">
                {message.lines.map((line) => (
                    <div key={line.label} className="grid grid-cols-[104px_1fr] gap-3 px-3.5 py-2.5 text-[12.5px]">
                        <dt className="font-bold text-finn-iron">{line.label}</dt>
                        <dd className="font-semibold text-finn-black">{line.value}</dd>
                    </div>
                ))}
            </dl>

            {message.priorities.length ? (
                <div className="border-t border-finn-cotton bg-finn-snow px-3.5 py-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-finn-iron">What counts most</p>
                    <ul className="mt-2 space-y-1.5">
                        {message.priorities.map((priority) => (
                            <li key={priority.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[12px]">
                                <span className="font-semibold text-finn-black">{priority.label}</span>
                                <span className="font-bold tabular-nums text-finn-iron">{priority.share}%</span>
                                <span className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-finn-cotton">
                                    <span className="block h-full rounded-full bg-finn-accent-blue" style={{ width: `${Math.max(4, priority.share)}%` }} />
                                </span>
                            </li>
                        ))}
                    </ul>
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
    onOpenCar,
    onWhy,
}: {
    message: Extract<ChatMessage, { kind: "result" }>;
    onOpenCar: (id: number) => void;
    onWhy: () => void;
}) {
    const { winner } = message;

    return (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            {winner ? (
                <div className="relative bg-gradient-to-b from-[#fff8e1] to-white p-3.5">
                    <div className="flex items-start justify-between gap-2">
                        <WinnerChip />
                        {winner.monthly != null ? (
                            <span className="text-right text-[11px] font-semibold text-finn-iron">
                                <span className="block text-[15px] font-black text-finn-black tabular-nums">{euros(winner.monthly)}</span>
                                a month, all in
                            </span>
                        ) : null}
                    </div>

                    <CarPhoto src={winner.image} alt={winner.name} className="mt-2 h-28 w-full rounded-xl" />

                    <p className="mt-2.5 text-[15px] font-black leading-tight text-finn-black">{winner.name}</p>
                    <p className="text-[12px] text-finn-iron">{winner.configuration}</p>

                    {message.reason ? <p className="mt-2 text-[13px] leading-relaxed text-finn-black">{message.reason}</p> : null}
                    {message.note ? (
                        <p className="mt-2 rounded-lg bg-finn-warning-lift/60 px-2.5 py-2 text-[12px] leading-snug text-finn-warning-ink">{message.note}</p>
                    ) : null}

                    <button
                        type="button"
                        onClick={onWhy}
                        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-finn-highlight-navy px-4 py-2.5 text-[12.5px] font-black text-white transition-colors hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue"
                    >
                        Why it's the best for you
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                </div>
            ) : null}

            {message.runnersUp.length ? (
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
    onWhy,
    busy,
}: {
    messages: ChatMessage[];
    typing: boolean;
    onAnswer: (askId: string, chosen: string[]) => void;
    onOpenCar: (id: number) => void;
    onWhy: () => void;
    busy: boolean;
}) {
    /* Only the newest open question takes answers; older ones read as what was asked. */
    const liveAsk = useMemo(() => {
        const last = [...messages].reverse().find((message) => message.kind === "ask");
        return last?.kind === "ask" && !last.answered ? last.id : null;
    }, [messages]);

    const rows: React.ReactNode[] = [];

    messages.forEach((message, index) => {
        const previous = messages[index - 1];
        const next = messages[index + 1];
        const startsRun = message.from === "lens" && previous != null && previous.from !== "lens";
        const avatar = message.from === "lens" && (next ? next.from !== "lens" : !typing);

        if (message.from === "reader") {
            rows.push(<ReaderBubble key={message.id} text={message.kind === "text" ? message.text : ""} />);
            return;
        }

        let body: React.ReactNode = null;

        switch (message.kind) {
            case "text":
                body = <LensBubble>{message.text}</LensBubble>;
                break;
            case "ask":
                body = (
                    <Ask
                        key={message.id}
                        message={message}
                        live={message.id === liveAsk && !typing && !busy}
                        onAnswer={(chosen) => onAnswer(message.id, chosen)}
                    />
                );
                break;
            case "summary":
                body = <Summary message={message} />;
                break;
            case "result":
                body = <Result message={message} onOpenCar={onOpenCar} onWhy={onWhy} />;
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
