import { Sparkles } from "lucide-react";

import type { PinnedFinnCar } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { FinnLink } from "@/components/FinnLink";
import { adviceFileName } from "@/lib/advice-pdf";

import { AdviceHero } from "./components/AdviceHero";
import { AdviceSidebar } from "./components/AdviceSidebar";
import { BudgetNotice } from "./components/BudgetNotice";
import { CostAnalysis } from "./components/CostAnalysis";
import { EnergyUse } from "./components/EnergyUse";
import { ExportMasthead } from "./components/ExportMasthead";
import { Tradeoffs } from "./components/Tradeoffs";
import { WhyItWins } from "./components/WhyItWins";
import { ExportButton, usePdfExport } from "./usePdfExport";
import { useRecommendation } from "./useRecommendation";
import { AskLens } from "../lens-ai/AskLens";

/**
 * The recommendation: one car, and the case for it.
 *
 * This used to also hold the hot seat — a picker, a gains-and-losses table,
 * and a cost section that swapped its subject to whichever car the picker was
 * pointing at. One page therefore argued for a car and then argued against it,
 * and which of the two it was currently about depended on a control halfway
 * down it. The PDF was worse: the export flattened both halves into one
 * document, so a reader sending it to somebody could not say which car it was
 * recommending. Challenging now has its own tab and its own file.
 *
 * What is left is a single subject. Every figure on this view is the winner's,
 * so nothing here changes under the reader except by their own answers.
 *
 * The order of the sections is the argument, and it follows the order a reader
 * asks the questions in:
 *
 *   1. Which car?           — the hero
 *   2. What does it cost?   — at their mileage, not the sticker
 *   3. What does it use?    — the consumption behind that cost
 *   4. Why that one?        — their priorities, in their order
 *   5. What am I giving up? — the tradeoffs
 *
 * Money and consumption come before the equipment audit because they are what
 * this page can tell a reader that a FINN listing cannot. The hero already
 * carries the verdict, so nothing is lost by making the case for it after.
 *
 * Everything is a reading of the answers held in the compare store, so a
 * change made in the drawer re-reasons the page under the reader's hands.
 */
export function Advice({
    cars,
    onAdjust,
    onChallenge,
}: {
    cars: PinnedFinnCar[];
    /** Opens the drawer, which is where every input to this page lives. */
    onAdjust: () => void;
    /** Crosses to the challenge tab. */
    onChallenge: () => void;
}) {
    const advice = useRecommendation(cars);

    const { printable, exporting, start } = usePdfExport(
        advice ? adviceFileName(advice.winner.name) : null,
    );

    if (!advice) {
        return (
            <EmptyState
                icon={<Sparkles aria-hidden="true" className="h-7 w-7" />}
                title="Nothing to evaluate yet"
            >
                <p className="mt-2 text-sm leading-6 text-finn-iron">
                    Pin a few cars on <FinnLink /> and Finn Lens will compare
                    them here.
                </p>
            </EmptyState>
        );
    }

    const {
        recommendation,
        context,
        winner,
        winnerNarrative,
        winnerCost,
        isFallback,
        fallbackReason,
        options,
    } = advice;

    return (
        <div
            ref={printable}
            data-exporting={exporting || undefined}
            className="w-full"
        >
            <ExportMasthead />

            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-finn-accent-blue">
                        Finn Lens · Advice
                    </p>

                    <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                        Here's the car that fits you best.
                    </h1>

                    <p className="mt-2 text-sm text-finn-iron">
                        Judged on your priorities, your driving assumptions and
                        your budget, across all {cars.length} cars being compared.
                    </p>
                </div>

                <ExportButton exporting={exporting} onExport={start} />
            </header>

            {winnerCost && (
                <AdviceHero
                    evaluation={recommendation.evaluation}
                    narrative={winnerNarrative}
                    cost={winnerCost}
                    priorities={context.priorities}
                    isFallback={isFallback}
                    rentalFallback={recommendation.rentalFallback}
                    gearboxFallback={recommendation.gearboxFallback}
                    /* Nothing to challenge with means nowhere to send them. */
                    onChallenge={options.length ? onChallenge : null}
                />
            )}

            {/*
              * Experimental, and screen-only: questions about the result
              * directly under it. Renders nothing unless Lens AI is turned
              * on in Settings, so the page reads exactly as before without it.
              */}
            <AskLens
                cars={cars}
                recommendation={recommendation}
                narrative={winnerNarrative}
            />

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-6">
                    {/*
                      * The money and the consumption before the equipment
                      * audit: they are what this page can say that a listing
                      * cannot. Both describe the winner and only the winner —
                      * the challenger's figures live under the other tab,
                      * beside the table that explains why it is being
                      * considered at all.
                      */}
                    <CostAnalysis
                        analysis={recommendation.evaluation.cost}
                        reasoning={winnerNarrative.cost}
                    />

                    <EnergyUse car={winner} />

                    <WhyItWins
                        narrative={winnerNarrative}
                        subjectName={winner.name}
                    />

                    <Tradeoffs
                        tradeoffs={winnerNarrative.tradeoffs}
                        isRecommendation
                        subjectName={winner.name}
                    />
                </div>

                <AdviceSidebar
                    weights={context.weights}
                    preferences={context.preferences}
                    onAdjust={onAdjust}
                    notice={
                        isFallback && fallbackReason ? (
                            <BudgetNotice
                                winner={winner}
                                context={context}
                                reason={fallbackReason}
                                onAdjust={onAdjust}
                            />
                        ) : null
                    }
                />
            </div>
        </div>
    );
}
