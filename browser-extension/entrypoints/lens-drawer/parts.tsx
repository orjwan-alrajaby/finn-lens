import type { ReactNode } from "react";
import { Check, ChevronDown, CircleHelp, Info, Minus, X } from "lucide-react";

import { EnvironmentalResult, UsageResult } from "@/components/EnvironmentalResult";
import { BandChip, CarPhoto, euros, WinnerChip } from "@/components/lens-parts";
import { configurationName } from "@/lib/car-labels";
import { bandForScore } from "@/lib/reasoning-engine/bands";
import { assessEnvironment } from "@/lib/reasoning-engine/environmental";
import { FIT_BANDS, type FitBand, type FitLevel } from "@/lib/reasoning-engine/fit";
import type { CategoryId } from "@/lib/reasoning-engine/types";
import type { CostAnalysis } from "@/lib/reasoning-engine/types";
import type { FitStory, StorySection, Tone } from "@/lib/lens-chat/fit-story";

import type { JudgedCar } from "./useJudgedCar";

/**
 * The pieces the drawer is built from: compact, so a car's whole reading fits
 * the reader's eye, and every line still says what it is based on.
 */

/**
 * One part of a drawer. `folded` keeps it to its title until tapped — the
 * drawer opens on why and what it costs, and the rest is one tap away.
 */
export function Section({ title, children, aside, folded = false }: { title: string; children: ReactNode; aside?: ReactNode; folded?: boolean }) {
    if (folded) {
        return (
            <details className="group border-t border-finn-cotton px-5 py-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue [&::-webkit-details-marker]:hidden">
                    <h2 className="text-[11px] font-black uppercase tracking-wide text-finn-iron group-hover:text-finn-black">{title}</h2>
                    <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-finn-iron transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2.5">{children}</div>
            </details>
        );
    }

    return (
        <section className="border-t border-finn-cotton px-5 py-4">
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h2 className="text-[11px] font-black uppercase tracking-wide text-finn-iron">{title}</h2>
                {aside}
            </div>
            {children}
        </section>
    );
}

const TONE: Record<Tone, { icon: ReactNode; ring: string; label: string }> = {
    good: { icon: <Check className="h-3 w-3" strokeWidth={3} />, ring: "bg-finn-fit-good-pale text-finn-fit-good", label: "Has it" },
    missing: { icon: <X className="h-3 w-3" strokeWidth={3} />, ring: "bg-finn-fit-limited-pale text-finn-fit-limited", label: "Missing" },
    unknown: { icon: <CircleHelp className="h-3 w-3" strokeWidth={2.5} />, ring: "bg-finn-cotton text-finn-iron", label: "Unknown" },
    note: { icon: <Minus className="h-3 w-3" strokeWidth={3} />, ring: "bg-finn-fit-partial-pale text-finn-fit-partial", label: "Partly" },
};

export function ToneDot({ tone, size = "sm" }: { tone: Tone; size?: "sm" | "md" }) {
    return (
        <span
            aria-label={TONE[tone].label}
            className={`inline-flex shrink-0 items-center justify-center rounded-full ${TONE[tone].ring} ${size === "md" ? "h-6 w-6" : "h-[18px] w-[18px]"}`}
        >
            {TONE[tone].icon}
        </span>
    );
}

/** The band this car earned on one priority, as the engine scored it. */
function bandOn(value: JudgedCar, priority: CategoryId): FitBand {
    const detail = value.judged.run.recommendation.scores.find((score) => score.vehicleId === value.car.id)?.details[priority];
    const level: FitLevel = detail?.assessed ? bandForScore(detail.exactScore) : "unknown";

    return { level, label: FIT_BANDS[level].label };
}

/**
 * A need judged on a figure: under the need the reader named, the figure
 * against its benchmark, as the playground's environmental section drew it —
 * the verdict in its colour, the bar, and why.
 */
function FigureRow({ section, value }: { section: StorySection; value: JudgedCar }) {
    const figure = section.figure!;

    return (
        <li className="rounded-xl bg-finn-snow p-3 ring-1 ring-black/[0.03]">
            <p className="mb-2.5 text-[11px] text-finn-iron">You said: {figure.need}</p>
            {figure.kind === "co2" ? (
                <EnvironmentalResult assessment={assessEnvironment(value.car)} band={bandOn(value, "environmental")} />
            ) : (
                <UsageResult car={value.car} />
            )}
        </li>
    );
}

/** One thing the reader asked for, and what this car does about it. */
export function StoryRow({ section, value }: { section: StorySection; value?: JudgedCar }) {
    if (section.figure && value) return <FigureRow section={section} value={value} />;

    return (
        <li className="rounded-xl bg-finn-snow p-3 ring-1 ring-black/[0.03]">
            <div className="flex items-start gap-2.5">
                <ToneDot tone={section.tone} size="md" />
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black leading-snug text-finn-black">{section.title}</p>
                    <p className="text-[11px] text-finn-iron">You said: {section.short}</p>
                </div>
            </div>
            <ul className="mt-2 space-y-1.5 pl-[34px]">
                {section.lines.map((line, index) => (
                    <li key={index} className="flex items-start gap-2 text-[12.5px] leading-snug text-finn-black">
                        <span className="mt-px">
                            <ToneDot tone={line.tone} />
                        </span>
                        <span className={line.tone === "note" ? "text-finn-iron" : ""}>
                            {line.text}
                            {line.sources?.length ? (
                                <span className="mt-0.5 block text-[10.5px] text-finn-iron/70">
                                    Source{line.sources.length > 1 ? "s" : ""}:{" "}
                                    {line.sources.map((source, index) => (
                                        <span key={source.url}>
                                            {index ? " · " : ""}
                                            <a href={source.url} target="_blank" rel="noreferrer" className="text-finn-iron/80 underline decoration-finn-iron/30 underline-offset-2 hover:text-finn-accent-blue hover:decoration-finn-accent-blue/50">
                                                {source.name}
                                            </a>
                                        </span>
                                    ))}
                                </span>
                            ) : null}
                        </span>
                    </li>
                ))}
            </ul>
        </li>
    );
}

export function StoryList({ story, value }: { story: FitStory; value?: JudgedCar }) {
    return (
        <ul className="space-y-2">
            {story.sections.map((section) => (
                <StoryRow key={section.key} section={section} value={value} />
            ))}
        </ul>
    );
}

/**
 * How much it uses, for a reader who didn't ask: it's on their bill every
 * month either way, as the playground had it. A reader who did ask has it in
 * their own need's row already.
 */
export function UsageSection({ value, folded = false, title = "How much it uses" }: { value: JudgedCar; folded?: boolean; title?: string }) {
    if (value.story?.sections.some((section) => section.figure?.kind === "efficiency")) return null;

    return (
        <Section title={title} folded={folded}>
            <UsageResult car={value.car} />
        </Section>
    );
}

export function Catch({ story }: { story: FitStory }) {
    if (!story.catch) return null;

    return (
        <div className="flex gap-2.5 rounded-xl bg-finn-warning-lift/50 p-3 text-[12.5px] leading-snug text-finn-warning-ink">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
                <p className="font-semibold">{story.catch.text}</p>
                {story.catch.alternative ? <p className="mt-1">{story.catch.alternative}</p> : null}
            </div>
        </div>
    );
}

/** Where the money goes, line by line, and what's estimated rather than FINN's own figure. */
export function CostTable({ cost }: { cost: CostAnalysis }) {
    const { breakdown } = cost;

    return (
        <div>
            <dl className="divide-y divide-finn-cotton overflow-hidden rounded-xl ring-1 ring-finn-cotton">
                {cost.lines.map((line) => (
                    <div key={line.id} className="flex items-start justify-between gap-3 bg-white px-3 py-2.5">
                        <dt className="min-w-0">
                            <span className="block text-[12.5px] font-bold text-finn-black">{line.label}</span>
                            <span className="block text-[11px] leading-snug text-finn-iron">{line.explanation}</span>
                            {/* Any figure that isn't FINN's says where it's from, with a link to check it. */}
                            {line.sources?.map((source) => (
                                <span key={source.url} className="mt-1 block text-[10.5px] leading-snug text-finn-iron/70">
                                    Source:{" "}
                                    <a href={source.url} target="_blank" rel="noreferrer" className="text-finn-iron/80 underline decoration-finn-iron/30 underline-offset-2 hover:text-finn-accent-blue hover:decoration-finn-accent-blue/50">
                                        {source.name}
                                    </a>
                                </span>
                            ))}
                        </dt>
                        <dd className="shrink-0 text-[13px] font-black tabular-nums text-finn-black">
                            {line.available && line.amount != null ? euros(line.amount) : "—"}
                        </dd>
                    </div>
                ))}
                <div className="flex items-center justify-between gap-3 bg-finn-pale-blue px-3 py-2.5">
                    <dt className="text-[12.5px] font-black text-finn-black">{breakdown.complete ? "A month, estimated" : "A month, as far as Lens can tell"}</dt>
                    <dd className="text-[15px] font-black tabular-nums text-finn-accent-blue">{euros(breakdown.totalMonthly)}</dd>
                </div>
            </dl>
            {cost.budgetSentence ? <p className="mt-2 text-[12px] leading-snug text-finn-iron">{cost.budgetSentence}</p> : null}
            {cost.caveats.map((caveat) => (
                <p key={caveat} className="mt-1 text-[11.5px] leading-snug text-finn-iron">
                    {caveat}
                </p>
            ))}
        </div>
    );
}

/** The car itself: photo, name, the chip it wears on FINN's card, and what it costs. */
export function CarHeader({ value }: { value: JudgedCar }) {
    const { car, verdict, judgement, cost, isWinner } = value;
    /* Its place among the cars that were ranked: the ones set aside before ranking have none. */
    const total = Object.values(judgement.verdicts).filter((item) => item.rank != null).length;

    return (
        <div className="px-5 pt-4 pb-4">
            <CarPhoto src={car.images?.thumbnail || null} alt={car.name} className="h-40 w-full rounded-2xl" />

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {isWinner ? <WinnerChip label={verdict.closest ? "Lens's pick" : undefined} /> : <BandChip band={verdict.setAside ? "unknown" : verdict.band} label={verdict.label} />}
                {verdict.rank != null ? (
                    <span className="rounded-full bg-finn-cotton px-2.5 py-1 text-[11px] font-black text-finn-black">
                        #{verdict.rank} of {total} ranked
                    </span>
                ) : null}
                {verdict.over ? (
                    <span className="rounded-full bg-finn-fit-limited-pale px-2.5 py-1 text-[11px] font-black text-finn-fit-limited">
                        {verdict.over === "budget" ? "Over your budget" : "Not for your dates"}
                    </span>
                ) : null}
            </div>

            <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-[19px] font-black leading-tight text-finn-black">{car.name}</h1>
                    <p className="text-[12.5px] text-finn-iron">{configurationName(car)}</p>
                </div>
                {cost ? (
                    <p className="shrink-0 text-right text-[11px] text-finn-iron">
                        <span className="block text-[18px] font-black tabular-nums text-finn-black">{euros(cost.breakdown.totalMonthly)}</span>
                        {cost.breakdown.complete ? "a month, estimated" : "a month, as far as Lens can tell"}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
