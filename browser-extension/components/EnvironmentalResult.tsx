import { ComparisonTable } from "@/components/ComparisonTable";
import { readEnvironment, USE_TONE } from "@/lib/environment-copy";
import { SOURCES } from "@/lib/sources";
import type { EnvironmentalAssessment } from "@/lib/reasoning-engine/environmental";
import type { FitBand } from "@/lib/reasoning-engine/fit";
import { ROW_TONE, type RowTone } from "@/lib/row-tone";
import type { FinnCar } from "@/lib/types";
import { readUsage } from "@/lib/usage-copy";

/**
 * What a car emits, and how much it uses, laid out as the playground branch
 * did: the answer first, on a card in its own colour; then the car's figure
 * against the FINN Lens benchmark with a bar between them; then why that is
 * the result. Every word comes from `environment-copy` and `usage-copy`; this
 * file only lays them out.
 */

/**
 * The answer, before any of the working, and the largest thing here: the
 * reading in words set as a heading over one plain sentence, on a field of
 * its own tone — so a reader who has never seen a g/km figure has it from the
 * colour and the largest line.
 */
function Verdict({ words, plain, tone }: { words: string; plain: string; tone: RowTone }) {
    const colours = ROW_TONE[tone];

    return (
        <div data-tone={tone} className={`rounded-[18px] px-4 py-3.5 ${colours.ground}`}>
            <p className={`text-[17px] font-black leading-6 tracking-[-0.015em] ${colours.ink}`}>{words}</p>
            <p className="mt-1.5 text-[12.5px] leading-5 text-finn-black/85">{plain}</p>
        </div>
    );
}

/** The CO₂ result: the verdict, a plug-in hybrid's caveat, the card against the benchmark, and what it means. */
export function EnvironmentalResult({ assessment, band }: { assessment: EnvironmentalAssessment | null; band: FitBand }) {
    const reading = readEnvironment(assessment, band);

    return (
        <div className="@container flex flex-col gap-3">
            <Verdict words={reading.verdict.words} plain={reading.verdict.plain} tone={reading.verdict.tone} />

            {reading.note ? (
                <div className="rounded-[18px] bg-finn-warning-lift/60 px-4 py-3">
                    <p className="text-[12px] font-black text-finn-warning-ink">{reading.note.title}</p>
                    <p className="mt-1 text-[12px] leading-[18px] text-finn-warning-ink/90">{reading.note.body}</p>
                </div>
            ) : null}

            <ComparisonTable reading={reading} />

            {reading.meaning.map((line) => (
                <p key={line} className="text-[12.5px] leading-5 text-finn-black">
                    {line}
                </p>
            ))}

            <Sources powertrain={assessment?.powertrain ?? null} />
        </div>
    );
}

/**
 * Where the scale and the comparison points come from, linked: the CO₂ label
 * rules, the ICCT's figures for new cars, and — for a plug-in hybrid — the
 * Commission's report on how far their figures run from real driving.
 */
function Sources({ powertrain }: { powertrain: EnvironmentalAssessment["powertrain"] }) {
    const sources = [
        SOURCES.co2Label,
        SOURCES.icctFleet,
        ...(powertrain === "Electric" ? [SOURCES.icctLifeCycle] : []),
        ...(powertrain === "Plug-in Hybrid" ? [SOURCES.realWorldGap] : []),
    ];

    return (
        <p className="text-[10.5px] leading-snug text-finn-iron/70">
            Sources:{" "}
            {sources.map((source, index) => (
                <span key={source.url}>
                    {index ? " · " : ""}
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-finn-iron/80 underline decoration-finn-iron/30 underline-offset-2 hover:text-finn-accent-blue hover:decoration-finn-accent-blue/50">
                        {source.name}
                    </a>
                </span>
            ))}
        </p>
    );
}

/**
 * How much it uses: the same layout, against the benchmark for what it runs
 * on. A plug-in hybrid, and a car FINN publishes no figure for, say so in
 * place of a verdict there's no honest way to give.
 */
export function UsageResult({ car }: { car: FinnCar }) {
    const reading = readUsage(car);

    if (reading.kind !== "graded") {
        return (
            <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    {reading.fuel ? <span className="inline-flex rounded-full bg-finn-highlight-navy px-2.5 py-1 text-[11px] font-black text-white">{reading.fuel}</span> : null}
                    <span className="inline-flex rounded-full bg-finn-cotton px-2.5 py-1 text-[11px] font-black text-finn-iron">{reading.verdict}</span>
                </div>
                <p className="text-[12.5px] leading-5 text-finn-black">{reading.body}</p>
            </div>
        );
    }

    const { efficiency } = reading;

    return (
        <div className="@container flex flex-col gap-3">
            <Verdict words={efficiency.label} plain={`${efficiency.consumes}.`} tone={USE_TONE[efficiency.step]} />
            <ComparisonTable reading={reading.table} />
            <p className="text-[12.5px] leading-5 text-finn-black">{efficiency.reasoning}</p>
        </div>
    );
}
