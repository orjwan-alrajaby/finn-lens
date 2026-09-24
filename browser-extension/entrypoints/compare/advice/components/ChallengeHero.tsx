import { ArrowLeftRight, ExternalLink } from "lucide-react";
import { modelName } from "@/lib/car-labels";
import type { PinnedFinnCar } from "@/lib/types";
import type { CostAnalysis } from "@/lib/reasoning-engine/types";
import type { ChallengeReasoning } from "@/lib/reasoning-engine/narrative";
import { formatEUR } from "@/lib/reasoning-engine";
import { compareCosts } from "@/lib/cost-copy";

/**
 * The car in the hot seat, announced the way the recommendation is.
 *
 * The challenge tab used to open on a picker, which made it read as a tool
 * rather than as a reading — and its PDF opened on a row of buttons. It is a
 * report about one car, the same as the advice tab is, so it gets the same
 * shape: a hero naming the subject, then the evidence.
 *
 * **Black, where the recommendation is navy.** The two are the same object in
 * different roles and the page has to say which is which before a word is
 * read. Navy is FINN's own accent and belongs to the answer; black is the
 * page's ink, and reads as considered rather than as endorsed — this car is
 * being *examined*, and the hero should not look like a second recommendation
 * or a rejection. Amber was the other candidate and is already spoken for: it
 * means "over budget" everywhere else on this page, which is a claim about a
 * car rather than a role.
 *
 * The verdict here is the challenge's own — why the recommendation still
 * stands, or why this is genuinely close — never the challenger's fit band on
 * its own. A band would answer "how good is this car", and the question on
 * this tab is "would swapping be better", which is a different sentence.
 */
export function ChallengeHero({
    challenger,
    winnerName,
    reasoning,
    cost,
    against,
}: {
    challenger: PinnedFinnCar;
    winnerName: string;
    reasoning: ChallengeReasoning;
    /** The challenger's own bill. */
    cost: CostAnalysis;
    /** The recommendation's, for the figure to be read against. */
    against: CostAnalysis;
}) {
    return (
        <section className="overflow-hidden rounded-[30px] bg-finn-black shadow-xl">
            <div className="flex flex-col-reverse lg:flex-row">
                <div className="p-6 sm:p-8 lg:flex-1/2">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/10">
                        <ArrowLeftRight
                            aria-hidden="true"
                            className="h-4 w-4 text-finn-accent-blue"
                        />
                        In the hot seat, against {winnerName}
                    </div>

                    <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                        {modelName(challenger)}
                    </h2>

                    <p className="mt-1 text-sm text-white/60">
                        {[
                            challenger.equipmentLine || challenger.engine,
                            challenger.trim,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>

                    <p className="mt-1 text-sm text-white/60">
                        {[
                            challenger.vehicleType,
                            challenger.fuelType,
                            challenger.year,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>

                    <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-white/90">
                        {reasoning.verdict}
                    </p>

                    {/*
                      * The two sentences that qualify the swap, carried by the
                      * hero rather than left to the sections below. A reader
                      * who reads only this block should still know whether
                      * taking this car costs more and whether it fits what they
                      * said they could spend.
                      */}
                    {(reasoning.cost || reasoning.budget) && (
                        <div className="mt-4 max-w-2xl space-y-2 border-l-2 border-white/20 pl-4">
                            {reasoning.cost && (
                                <p className="text-sm leading-6 text-white/75">
                                    {reasoning.cost}
                                </p>
                            )}

                            {reasoning.budget && (
                                <p className="text-sm leading-6 text-white/75">
                                    {reasoning.budget}
                                </p>
                            )}
                        </div>
                    )}

                    <Balance reasoning={reasoning} />

                    {challenger.url && (
                        <div className="mt-7">
                            <a
                                href={challenger.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-black text-finn-black shadow-sm transition hover:bg-finn-snow"
                            >
                                View this car on FINN
                                <ExternalLink
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                            </a>
                        </div>
                    )}
                </div>

                <div className="relative flex min-h-64 flex-col bg-white/10 lg:min-h-full lg:flex-1/2">
                    {/* A broken image is louder than no image. */}
                    {challenger.images?.thumbnail && (
                        <div className="relative aspect-video overflow-hidden">
                            <img
                                src={challenger.images.thumbnail}
                                alt={challenger.name}
                                className="w-full scale-125 object-cover"
                            />
                        </div>
                    )}

                    <div className="p-5">
                        <CostPanel
                            cost={cost}
                            against={against}
                            winnerName={winnerName}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

/**
 * What swapping does to the bill, in the hero rather than only in the table.
 *
 * The figure alone is the wrong headline on this tab. "€669 a month" is what
 * the car costs; what the reader is deciding is whether that is more or less
 * than staying put, so the difference is the larger of the two numbers here
 * and the total is the context for it.
 */
function CostPanel({
    cost,
    against,
    winnerName,
}: {
    cost: CostAnalysis;
    against: CostAnalysis;
    winnerName: string;
}) {
    /*
     * The same `compareCosts` the table below uses, so the hero cannot end up
     * claiming a difference the breakdown contradicts — including its refusal
     * to compare two totals when either estimate is incomplete.
     */
    const difference =
        compareCosts(cost, against).find((row) => row.id === "total")
            ?.difference ?? null;

    const { breakdown } = cost;

    return (
        <div className="relative rounded-2xl bg-white/90 p-4 ring-1 ring-white/40 backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-finn-black/70">
                {breakdown.complete
                    ? "Estimated total per month"
                    : "Estimated per month (partial)"}
            </p>

            <p className="mt-1 text-3xl font-black text-finn-black">
                {formatEUR(breakdown.totalMonthly)}
            </p>

            {difference != null && (
                <p
                    className={[
                        "mt-1 text-[11px] font-black",
                        Math.round(difference) === 0
                            ? "text-finn-iron"
                            : difference < 0
                              ? "text-finn-influence-emerald"
                              : "text-finn-warning-deep",
                    ].join(" ")}
                >
                    {Math.round(difference) === 0
                        ? `about the same as ${winnerName}`
                        : `${formatEUR(Math.abs(difference))} ${
                              difference < 0 ? "less" : "more"
                          } than ${winnerName} a month`}
                </p>
            )}

            <p className="mt-2 text-[11px] leading-4 text-finn-black/70">
                Subscription plus estimated energy and extra mileage. The line
                by line comparison is further down.
            </p>
        </div>
    );
}

/**
 * Which of the reader's priorities fall on each side, as a count.
 *
 * The table below says which ones and why; this says how the balance sits, so
 * a reader who reads only the hero knows whether the swap is broadly a gain
 * before deciding whether to read the rest.
 */
function Balance({ reasoning }: { reasoning: ChallengeReasoning }) {
    const gains = reasoning.gains.length;
    const losses = reasoning.losses.length;

    if (!gains && !losses) return null;

    return (
        <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-finn-accent-blue/20 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-finn-accent-blue/40">
                {gains === 0
                    ? "Nothing you ranked improves"
                    : `Better on ${gains} of your priorities`}
            </span>

            <span className="rounded-full bg-finn-warning/20 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-finn-warning/40">
                {losses === 0
                    ? "Nothing you ranked gets worse"
                    : `Worse on ${losses}`}
            </span>
        </div>
    );
}
