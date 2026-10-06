import { useMemo } from "react";
import { ChevronRight, Scale, Trophy } from "lucide-react";

import { BandChip, CarPhoto, euros } from "@/components/lens-parts";
import { configurationName } from "@/lib/car-labels";
import { IMPORTANCE_LABEL, summaryOf } from "@/lib/chats/flow";
import { weighingOf, type Weighing } from "@/lib/chats/weighing";
import { requestOpenDrawer } from "@/lib/chats/bridge";

import { sameJudgement } from "./useJudgedCar";
import { alternativesWithinLimits } from "@/lib/lens-chat/run";
import { whyNot } from "@/lib/lens-chat/why-not";

import { Catch, CostTable, Section, StoryList, UsageSection } from "./parts";
import type { JudgedCar } from "./useJudgedCar";

/**
 * The case for the car with the trophy.
 *
 * Where a car's drawer says how that car fits, this one argues: why it won
 * and what it costs, open; then, a tap each, how it answers each thing the
 * reader said, what they give up by choosing it, why each of the next cars
 * lost, how it was weighed, and what it costs to run. Every sentence is the
 * engine's — read off the same run that put the trophy on the card.
 *
 * `print` lays the same argument out for the PDF: wider, with a masthead, and
 * without the buttons that only mean something on screen.
 */


export function WinnerView({ value, print = false }: { value: JudgedCar; print?: boolean }) {
    const { car, judged, judgement, story, cost, chat } = value;
    const { run } = judged;
    const { narrative } = run;
    const { verdict } = narrative;

    const runnersUp = useMemo(
        () => alternativesWithinLimits(run, 3).map((line) => ({ line, versus: whyNot(run, line.id) })),
        [run],
    );

    const told = useMemo(() => summaryOf(judgement.understanding), [judgement.understanding]);
    const weighing = useMemo(() => weighingOf(judgement.understanding, told), [judgement.understanding, told]);
    const notes = [verdict.budgetNote, verdict.marginNote, verdict.dependsNote].filter((note): note is string => Boolean(note));

    return (
        <article>
            {print ? (
                <header className="flex items-center justify-between border-b border-finn-cotton px-5 py-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-wide text-finn-iron">Finn Lens · your best match</p>
                        <p className="text-[13px] text-finn-black">From your chat “{chat.title}”, judged {new Date(judgement.at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                    </div>
                    <p className="text-right text-[11px] text-finn-iron">{judgement.headline}</p>
                </header>
            ) : null}

            {/* -- The pick ---------------------------------------------------- */}
            <div className="relative overflow-hidden bg-gradient-to-b from-[#fff6d6] via-[#fffbeb] to-white px-5 pt-5 pb-4">
                <div className="flex items-center gap-3">
                    <span
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md"
                        style={{ background: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 60%, #d97706 100%)" }}
                    >
                        <Trophy aria-hidden="true" className="h-5 w-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-[#9a6200]">Best for you, of {judgement.carIds.length} cars</p>
                        <h1 className="text-[20px] font-black leading-tight text-finn-black">{car.name}</h1>
                        <p className="text-[12.5px] text-finn-iron">{configurationName(car)}</p>
                    </div>
                </div>

                <CarPhoto src={car.images?.thumbnail || null} alt={car.name} className="mt-4 h-44 w-full rounded-2xl ring-1 ring-[#f5d78a]/60" />

                <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-[14px] font-bold leading-snug text-finn-black">{verdict.headline}</p>
                    {cost ? (
                        <p className="shrink-0 text-right text-[11px] text-finn-iron">
                            <span className="block text-[20px] font-black tabular-nums text-finn-black">{euros(cost.breakdown.totalMonthly)}</span>
                            a month, estimated
                        </p>
                    ) : null}
                </div>
            </div>

            {/* -- Why ---------------------------------------------------------- */}
            <Section title="Why it won">
                <ol className="space-y-2">
                    {verdict.reasons.map((reason, index) => (
                        <li key={reason} className="flex gap-2.5 text-[13px] leading-relaxed text-finn-black">
                            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fff3c4] text-[11px] font-black text-[#9a6200]">
                                {index + 1}
                            </span>
                            <span>{reason}</span>
                        </li>
                    ))}
                </ol>
                {notes.map((note) => (
                    <p key={note} className="mt-2.5 rounded-xl bg-finn-snow p-3 text-[12.5px] leading-snug text-finn-black">
                        {note}
                    </p>
                ))}
            </Section>

            {cost ? (
                <Section title="What it costs">
                    <CostTable cost={cost} />
                </Section>
            ) : null}

            {/* -- The rest, a tap away: the PDF has all of it open ---------------- */}
            {story?.sections.length ? (
                <Section title="How it fits what you told me" folded={!print}>
                    <StoryList story={story} value={value} />
                    {story.catch ? (
                        <div className="mt-2">
                            <Catch story={story} />
                        </div>
                    ) : null}
                </Section>
            ) : null}

            {narrative.tradeoffs.length ? (
                <Section title="What you'd give up" folded={!print}>
                    <ul className="space-y-2">
                        {narrative.tradeoffs.map((tradeoff) => (
                            <li key={tradeoff.headline} className="flex gap-2.5 rounded-xl bg-finn-snow p-3">
                                <Scale aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-finn-fit-partial" />
                                <div className="text-[12.5px] leading-snug text-finn-black">
                                    <p className="font-black">{tradeoff.headline}</p>
                                    <p className="mt-0.5">{tradeoff.evidence}</p>
                                    <p className="mt-0.5 text-finn-iron">{tradeoff.relevance}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Section>
            ) : null}

            {runnersUp.length ? (
                <Section title="Why not the others" folded={!print}>
                    <ul className="space-y-2">
                        {runnersUp.map(({ line, versus }) => (
                            <li key={line.id} className="rounded-xl p-3 ring-1 ring-finn-cotton">
                                <div className="flex items-center gap-3">
                                    <CarPhoto src={line.image} alt="" className="h-10 w-14 shrink-0 rounded-lg" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-black text-finn-black">{line.name}</p>
                                        <p className="text-[11.5px] text-finn-iron">
                                            about {euros(line.monthly)}/month
                                            {line.budget === "over" ? <span className="font-bold text-finn-fit-limited"> · over your limit</span> : null}
                                        </p>
                                    </div>
                                    <BandChip band={line.band} label={line.bandLabel} />
                                </div>
                                {versus ? <p className="mt-2 text-[12.5px] leading-snug text-finn-black">{versus.sentences.slice(0, 2).join(" ")}</p> : null}
                                {!print ? (
                                    <button
                                        type="button"
                                        onClick={() => void requestOpenDrawer(chat.id, line.id, sameJudgement(value))}
                                        className="mt-2 inline-flex items-center gap-1 text-[12px] font-black text-finn-accent-blue hover:underline"
                                    >
                                        How the {line.name} fits you
                                        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                                    </button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </Section>
            ) : null}

            {/* -- How I weighed it: what you said, how much each counted, what set cars aside, money & time -- */}
            <Section title="How I weighed it" folded={!print}>
                <Weighed weighing={weighing} />
            </Section>

            <UsageSection value={value} folded={!print} title="Costs of use" />

            {print ? (
                <p className="border-t border-finn-cotton px-5 py-3 text-[10.5px] leading-snug text-finn-iron">
                    Lens judges what FINN lists for each car against what you told it. Monthly costs are estimates: FINN's subscription price, plus fuel or charging at a price Lens assumes (not a quote), plus the FINN mileage package the stated distance needs. Lens adds nothing else, so costs like parking or tolls aren't in it.
                    {value.url ? (
                        <>
                            {" "}
                            <a href={value.url} className="font-bold text-finn-accent-blue">
                                See this car on FINN
                            </a>
                            .
                        </>
                    ) : null}
                </p>
            ) : null}
        </article>
    );
}

/**
 * How the pick was weighed, in the reader's terms: each thing they said,
 * strongest first, with how much it counted, its share of the decision as a
 * bar, and what Lens looked at for it; then what set cars aside, and the
 * money and dates. One scale — the one they set — and no percentages.
 */
function Weighed({ weighing }: { weighing: Weighing }) {
    return (
        <div className="space-y-4">
            {weighing.needs.length ? (
                <div>
                    <p className="mb-2 text-[12px] leading-snug text-finn-iron">What counted, strongest first, and each one's part of the decision.</p>
                    <ul className="space-y-3">
                        {weighing.needs.map((need) => (
                            <li key={need.id}>
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="min-w-0 text-[12.5px] font-bold leading-snug text-finn-black">{need.label}</p>
                                    <span className="shrink-0 rounded-full bg-finn-pale-blue px-2 py-0.5 text-[10.5px] font-black text-finn-accent-blue">{IMPORTANCE_LABEL[need.importance]}</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <Pips percent={need.percent} />
                                    <span className="text-[12px] font-black tabular-nums text-finn-black">{need.percent}%</span>
                                </div>
                                {need.looksAt.length ? <p className="mt-0.5 text-[11.5px] leading-snug text-finn-iron">Looked at: {need.looksAt.join(" · ")}</p> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {weighing.setAside.length ? (
                <div>
                    <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-finn-iron">Set aside before weighing</p>
                    <dl className="space-y-1">
                        {weighing.setAside.map((line) => (
                            <div key={line.label} className="grid grid-cols-[112px_1fr] gap-3 text-[12.5px]">
                                <dt className="font-bold text-finn-iron">{line.label}</dt>
                                <dd className="text-finn-black">{line.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ) : null}

            {weighing.terms.length ? (
                <div>
                    <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-finn-iron">Money & time</p>
                    <dl className="space-y-1">
                        {weighing.terms.map((line) => (
                            <div key={line.label} className="grid grid-cols-[112px_1fr] gap-3 text-[12.5px]">
                                <dt className="font-bold text-finn-iron">{line.label}</dt>
                                <dd className="text-finn-black">{line.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            ) : null}
        </div>
    );
}

/** A share as ten short segments, one per 10% — at least one lit, so nothing that counted reads as nothing. */
function Pips({ percent }: { percent: number }) {
    const lit = Math.max(1, Math.min(10, Math.round(percent / 10)));

    return (
        <span aria-hidden="true" className="inline-flex gap-0.5">
            {Array.from({ length: 10 }, (_, index) => (
                <span
                    key={index}
                    className={`h-2 w-3 rounded-[3px] ${index < lit ? "bg-finn-accent-blue" : "bg-finn-pale-blue ring-1 ring-inset ring-finn-accent-blue/35"}`}
                />
            ))}
        </span>
    );
}
