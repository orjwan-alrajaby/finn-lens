import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, MessageCircleQuestion, Play } from "lucide-react";

import { CATEGORIES } from "@/lib/reasoning-engine/constants";
import { formatEUR } from "@/lib/reasoning-engine";
import type { AdviceNarrative } from "@/lib/reasoning-engine/narrative";
import type { Recommendation } from "@/lib/reasoning-engine/types";
import { ask } from "@/lib/lens-ai/client";
import { buildLensFacts } from "@/lib/lens-ai/context";
import { carLabel, type Outcome } from "@/lib/lens-ai/outcome";
import {
    isEmptyChange,
    validateChange,
    type ValidatedChange,
} from "@/lib/lens-ai/proposal";
import { buildVocabulary, describeCurrent } from "@/lib/lens-ai/vocabulary";
import type { PinnedFinnCar } from "@/lib/types";

import { useCompareStore } from "../store";
import {
    proposalFor,
    runProposal,
    useCurrentAnswers,
    useEnabledCategories,
    useLensAiStatus,
    type Proposal,
} from "./hooks";
import { OutcomeCard } from "./OutcomeCard";
import { ProposalReview } from "./ProposalReview";
import {
    AiError,
    ExperimentTag,
    PrimaryButton,
    SecondaryButton,
    Thinking,
} from "./parts";

/**
 * "Ask Lens" — questions about the recommendation on the page.
 *
 * Two kinds of answer, and the difference between them is the experiment:
 *
 * - **A question** is answered by the model, from `buildLensFacts` — the
 *   engine's own scores, costs, tradeoffs and head-to-heads, and nothing else.
 * - **A what-if** is *not* answered by the model. It comes back as a proposed
 *   change to the reader's answers, shown as Lens settings; "Run comparison"
 *   re-runs the real engine and shows what moved. Keeping it goes through the
 *   same `applyAnswers` as every other change.
 *
 * Deliberately not a chat. Exchanges stack as question-and-answer pairs on the
 * page's own ground, the last few are sent back for context, and a reload
 * forgets them.
 */

const HISTORY_SENT = 3;
const EXCHANGES_KEPT = 6;

type Exchange = {
    id: number;
    question: string;
} & (
    | { state: "thinking" }
    | { state: "error"; message: string }
    | { state: "answer"; answer: string }
    | {
          state: "whatIf";
          answer: string;
          change: ValidatedChange;
          result:
              | { stage: "proposed" }
              | { stage: "ran"; outcome: Outcome; proposal: Proposal }
              | { stage: "kept"; outcome: Outcome }
              | { stage: "cancelled" };
      }
);

function suggestionsFor(rec: Recommendation, cars: PinnedFinnCar[]): string[] {
    const { winner, runnerUp, context } = rec;
    const name = (car: PinnedFinnCar) => carLabel(car, cars);

    const cheapest = [...context.ranked]
        .filter((car) => context.costs[car.id]?.complete)
        .sort(
            (a, b) =>
                (context.costs[a.id]?.totalMonthly ?? 0) -
                (context.costs[b.id]?.totalMonthly ?? 0),
        )[0];

    const second = context.priorities[1];
    const budget = context.preferences.monthlyBudget;
    const winnerCost = context.costs[winner.id]?.totalMonthly ?? 0;

    return [
        `Why ${name(winner)}?`,
        runnerUp ? `Why didn't you choose ${name(runnerUp)}?` : null,
        cheapest && cheapest.id !== winner.id
            ? `What am I giving up with the cheaper ${name(cheapest)}?`
            : null,
        "Would this still make sense for long road trips?",
        second
            ? `What if ${CATEGORIES[second].label} was my number one priority?`
            : null,
        budget > 0
            ? "What if I could spend €150 more per month?"
            : winnerCost > 100
              ? `What if my budget was ${formatEUR(Math.floor((winnerCost - 1) / 50) * 50)} a month?`
              : null,
    ].filter((item): item is string => Boolean(item));
}

export function AskLens({
    cars,
    recommendation,
    narrative,
}: {
    cars: PinnedFinnCar[];
    recommendation: Recommendation;
    narrative: AdviceNarrative;
}) {
    const { status } = useLensAiStatus();
    const answers = useCurrentAnswers();
    const enabled = useEnabledCategories();
    const applyAnswers = useCompareStore((state) => state.applyAnswers);

    const [question, setQuestion] = useState("");
    const [exchanges, setExchanges] = useState<Exchange[]>([]);
    const nextId = useRef(1);
    const endRef = useRef<HTMLDivElement | null>(null);

    const vocabulary = useMemo(() => buildVocabulary(enabled), [enabled]);
    const facts = useMemo(
        () => buildLensFacts(recommendation, narrative),
        [recommendation, narrative],
    );
    const suggestions = useMemo(
        () => suggestionsFor(recommendation, cars),
        [recommendation, cars],
    );

    const latestId = exchanges.at(-1)?.id;

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [latestId, exchanges.at(-1)?.state]);

    if (status.state !== "ready") return null;

    const busy = exchanges.some((item) => item.state === "thinking");

    const update = (id: number, next: (item: Exchange) => Exchange) =>
        setExchanges((all) => all.map((item) => (item.id === id ? next(item) : item)));

    const submit = async (text: string) => {
        const said = text.trim();
        if (!said || busy) return;

        const id = nextId.current++;

        setQuestion("");
        setExchanges((all) => [
            ...all.slice(-(EXCHANGES_KEPT - 1)),
            { id, question: said, state: "thinking" },
        ]);

        const history = exchanges
            .flatMap((item) =>
                item.state === "answer" || item.state === "whatIf"
                    ? [{ question: item.question, answer: item.answer }]
                    : [],
            )
            .slice(-HISTORY_SENT);

        const response = await ask({
            question: said,
            vocabulary,
            current: describeCurrent(answers),
            facts,
            history,
        });

        if (!response.ok) {
            update(id, () => ({ id, question: said, state: "error", message: response.error }));
            return;
        }

        const { kind, answer, change } = response.result;

        if (kind === "whatIf" && change) {
            const validated = validateChange(change, answers, enabled);

            if (import.meta.env.DEV) {
                console.debug("[Lens AI] what-if validated", { raw: change, validated });
            }

            update(id, () => ({
                id,
                question: said,
                state: "whatIf",
                answer,
                change: validated,
                result: { stage: "proposed" },
            }));
            return;
        }

        update(id, () => ({ id, question: said, state: "answer", answer }));
    };

    return (
        <section className="finn-lens-screen-only mt-6 rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">
                    <MessageCircleQuestion aria-hidden="true" className="h-3.5 w-3.5" />
                    Ask Lens
                </p>

                <ExperimentTag status={status} />
            </div>

            <h2 className="mt-1.5 text-xl font-black tracking-tight text-finn-black">
                Questions about this recommendation?
            </h2>

            <p className="mt-1 text-sm leading-6 text-finn-iron">
                Answered only from what Lens worked out for these {cars.length}{" "}
                cars. Ask "what if…" and Lens re-runs the comparison itself.
            </p>

            {exchanges.length > 0 && (
                <div className="mt-5 space-y-5">
                    {exchanges.map((item) => (
                        <ExchangeView
                            key={item.id}
                            exchange={item}
                            answers={answers}
                            active={item.id === latestId}
                            onRetry={() => {
                                setExchanges((all) => all.filter((other) => other.id !== item.id));
                                void submit(item.question);
                            }}
                            onRun={(proposal) => {
                                const ran = runProposal(cars, proposal);

                                if (!ran) return;

                                update(item.id, (current) =>
                                    current.state === "whatIf"
                                        ? {
                                              ...current,
                                              result: { stage: "ran", outcome: ran.outcome, proposal },
                                          }
                                        : current,
                                );
                            }}
                            onKeep={() => {
                                if (item.state !== "whatIf" || item.result.stage !== "ran") return;

                                applyAnswers(item.result.proposal.after, "lensAi");

                                update(item.id, (current) =>
                                    current.state === "whatIf" && current.result.stage === "ran"
                                        ? { ...current, result: { stage: "kept", outcome: current.result.outcome } }
                                        : current,
                                );
                            }}
                            onCancel={() =>
                                update(item.id, (current) =>
                                    current.state === "whatIf"
                                        ? { ...current, result: { stage: "cancelled" } }
                                        : current,
                                )
                            }
                        />
                    ))}
                    <div ref={endRef} />
                </div>
            )}

            <div className="mt-5 flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                    <button
                        key={suggestion}
                        type="button"
                        disabled={busy}
                        onClick={() => void submit(suggestion)}
                        className="rounded-full bg-finn-pale-blue px-3 py-1.5 text-[11px] font-bold text-finn-accent-blue transition hover:bg-finn-accent-blue hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {suggestion}
                    </button>
                ))}
            </div>

            <form
                className="mt-3 flex items-center gap-2 rounded-full bg-finn-snow py-1.5 pl-4 pr-1.5 ring-1 ring-transparent transition focus-within:ring-finn-accent-blue"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit(question);
                }}
            >
                <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    maxLength={600}
                    placeholder="Ask anything about these cars, or “what if…”"
                    aria-label="Ask Lens a question"
                    className="min-w-0 flex-1 bg-transparent text-sm text-finn-black outline-none placeholder:text-finn-iron/70"
                />

                <button
                    type="submit"
                    disabled={!question.trim() || busy}
                    aria-label="Ask"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-finn-accent-blue text-white transition hover:bg-finn-highlight-navy disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </button>
            </form>
        </section>
    );
}

function ExchangeView({
    exchange,
    answers,
    active,
    onRetry,
    onRun,
    onKeep,
    onCancel,
}: {
    exchange: Exchange;
    answers: ReturnType<typeof useCurrentAnswers>;
    active: boolean;
    onRetry: () => void;
    onRun: (proposal: Proposal) => void;
    onKeep: () => void;
    onCancel: () => void;
}) {
    return (
        <article className="border-l-2 border-finn-pale-blue pl-4">
            <p className="text-sm font-black text-finn-black">{exchange.question}</p>

            <div className="mt-1.5">
                {exchange.state === "thinking" && <Thinking>Reading Lens's results…</Thinking>}

                {exchange.state === "error" && (
                    <AiError message={exchange.message} onRetry={active ? onRetry : undefined} />
                )}

                {exchange.state === "answer" && (
                    <Answer text={exchange.answer} />
                )}

                {exchange.state === "whatIf" && (
                    <WhatIf
                        exchange={exchange}
                        answers={answers}
                        active={active}
                        onRun={onRun}
                        onKeep={onKeep}
                        onCancel={onCancel}
                    />
                )}
            </div>
        </article>
    );
}

/** Plain paragraphs, with the model's own "- " lists kept as lists. */
function Answer({ text }: { text: string }) {
    const blocks = text.split(/\n{2,}/).filter(Boolean);

    return (
        <div className="space-y-2">
            {blocks.map((block, index) => {
                const lines = block.split("\n");
                const isList = lines.every((line) => /^\s*[-•*]\s+/.test(line));

                return isList ? (
                    <ul key={index} className="list-disc space-y-1 pl-5 text-sm leading-6 text-finn-iron">
                        {lines.map((line) => (
                            <li key={line}>{line.replace(/^\s*[-•*]\s+/, "")}</li>
                        ))}
                    </ul>
                ) : (
                    <p key={index} className="text-sm leading-6 text-finn-iron">
                        {block}
                    </p>
                );
            })}
        </div>
    );
}

function WhatIf({
    exchange,
    answers,
    active,
    onRun,
    onKeep,
    onCancel,
}: {
    exchange: Extract<Exchange, { state: "whatIf" }>;
    answers: ReturnType<typeof useCurrentAnswers>;
    active: boolean;
    onRun: (proposal: Proposal) => void;
    onKeep: () => void;
    onCancel: () => void;
}) {
    const { result, change } = exchange;

    const proposal = useMemo(() => proposalFor(change, answers), [change, answers]);
    const empty = isEmptyChange(change);

    if (result.stage === "cancelled") {
        return <p className="text-xs font-bold text-finn-iron">Left as it was.</p>;
    }

    if (result.stage === "kept") {
        return (
            <p className="flex items-center gap-1.5 text-xs font-bold text-finn-influence-emerald">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Kept. {result.outcome.headline}
            </p>
        );
    }

    if (result.stage === "ran") {
        return (
            <OutcomeCard outcome={result.outcome}>
                {active && (
                    <>
                        <PrimaryButton onClick={onKeep}>Keep these answers</PrimaryButton>
                        <SecondaryButton onClick={onCancel}>Discard</SecondaryButton>
                    </>
                )}
            </OutcomeCard>
        );
    }

    return (
        <div className="space-y-2">
            <Answer text={exchange.answer} />

            <ProposalReview
                proposal={proposal}
                eyebrow="Try this change?"
                title={empty ? "Lens can't test that as a setting" : "Lens would re-run with these answers"}
            >
                {active && !empty && (
                    <PrimaryButton onClick={() => onRun(proposal)}>
                        <Play aria-hidden="true" className="h-3.5 w-3.5" />
                        Run comparison
                    </PrimaryButton>
                )}

                {active && (
                    <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
                )}
            </ProposalReview>
        </div>
    );
}
