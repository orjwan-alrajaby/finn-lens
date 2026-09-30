import type { ReactNode } from "react";
import { Cloud, Fuel, Zap } from "lucide-react";

import { ExplainedRow, type Explanation } from "@/components/ExplainedRow";
import {
    type ComparisonReading,
    type EnvironmentFigure,
    type EnvironmentRow,
    type RowRelation,
} from "@/lib/environment-copy";
import { ROW_TONE } from "@/lib/row-tone";

/**
 * This car against the FINN Lens benchmark, one card per measure.
 *
 * A card each, not rows of a table. The table this replaces was accurate and
 * horrible to look at: a column header strip reading MEASURE / THIS CAR /
 * FINN LENS BENCHMARK, hairline dividers, a 4px edge, and five sizes of type
 * per row with two coloured pills competing inside them. It read as a
 * spreadsheet with fine print, which is what a reader who doesn't know whether
 * 126 g/km is good or bad least needs.
 *
 * What carries meaning now:
 *
 * - **the figure**, at a size you can read across a room, in black;
 * - **the verdict**, as coloured words beside it rather than a second pill —
 *   the class pill is the only pill left in a card;
 * - **the bar**, thick enough to be the thing your eye lands on, filled in the
 *   row's own colour with the benchmark notched across it in blue;
 * - **blue**, used for one thing only: the benchmark, wherever it appears.
 *
 * The tone is on `data-tone` as well as in the colours, so what a card claims
 * can be checked without pinning a class name.
 *
 * Every word comes from `environment-copy` or `usage-copy`; this file only
 * lays them out.
 */

/** Lucide shapes, one per kind of measure. */
const ROW_ICON = { co2: Cloud, fuel: Fuel, electricity: Zap } as const;

/** The one micro-caption size, for the two things a figure can be. */
const CAPTION = "text-[10px] font-black uppercase tracking-[0.12em]";

export function ComparisonTable({ reading }: { reading: ComparisonReading }) {
    return (
        <div className="@container/table flex flex-col gap-2.5">
            {reading.rows.map((row, index) => (
                <Card
                    key={row.id}
                    row={row}
                    rating={index === 0 ? reading.rating : null}
                />
            ))}

            {reading.source && (
                <p
                    data-disclaimer=""
                    className="px-1 text-[11px] leading-4 text-finn-iron"
                >
                    {reading.source}
                </p>
            )}
        </div>
    );
}

function Card({
    row,
    rating,
}: {
    row: EnvironmentRow;
    /** The class pill, on the card it describes. */
    rating: ComparisonReading["rating"];
}) {
    const tone = ROW_TONE[row.tone];
    const Icon = ROW_ICON[row.icon];

    /* Everything this card's numbers can be asked about, in the order they sit. */
    const explanations = [rating?.info, row.car.info, row.reference.info].filter(
        (info): info is Explanation => info != null,
    );

    return (
        <ExplainedRow
            data-row={row.id}
            data-tone={row.tone}
            label={row.label}
            explanations={explanations}
            className="rounded-[20px] bg-white p-4 ring-1 ring-finn-cotton"
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/*
                  * The measure's own mark, in its own colour, on the colour's
                  * palest ground. Small and quiet: it says which of the two
                  * questions this card answers, and nothing else.
                  */}
                <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${tone.ground}`}
                >
                    <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${tone.ink}`} />
                </span>

                <p className="text-[13px] font-black leading-5 text-finn-black">
                    {row.label}
                </p>

                {/*
                  * The class, beside the measure it is a restatement of. It
                  * is the CO₂ number said as a letter, so it belongs here and
                  * not above the answer; what the letter means opens from the
                  * card's "i".
                  */}
                {rating && (
                    <span
                        data-rating=""
                        className={`ml-auto inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-black ${ROW_TONE[rating.tone].pill}`}
                    >
                        {rating.label}
                    </span>
                )}

                {/*
                  * What it runs on, beside the use it decides the benchmark
                  * for — the same pill the class is on the CO₂ card, in the
                  * same place, tinted in this card's own tone.
                  */}
                {row.fuel && (
                    <span
                        data-fuel=""
                        className={`ml-auto inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-black ${tone.pill}`}
                    >
                        {row.fuel}
                    </span>
                )}
            </div>

            <p className="mt-1 text-[11px] leading-4 text-finn-iron">
                {row.note}
            </p>

            {/*
              * The two figures bracket the card: this car on the left, the
              * benchmark hard right, and the bar running between them
              * underneath — so the blue label sits roughly over the blue notch
              * it names. Stacked and both left-aligned when the card is too
              * narrow to hold them apart.
              *
              * Columns of a grid put them at fixed fractions, which on a wide
              * advice page left the two numbers being compared a third of a
              * screen apart with nothing between them.
              *
              * The threshold is `@sm` (24rem) rather than a narrower one
              * because of what has to fit on one line beside the figure: the
              * verdict. At 26rem — the in-page panel — "Very high electricity
              * use" was breaking across two lines next to the number, which
              * looks like a mistake rather than a layout.
              */}
            <div className="mt-3.5 flex flex-col gap-3 @sm/table:flex-row @sm/table:items-start @sm/table:justify-between @sm/table:gap-6">
                <Figure
                    caption="This car"
                    captionClass="text-finn-iron"
                    figure={row.car}
                    valueClass="text-[20px] font-black leading-6 tracking-[-0.01em] tabular-nums text-finn-black"
                    beside={
                        row.comparison && (
                            <span
                                className={`text-[12px] font-black leading-5 ${tone.ink}`}
                            >
                                {row.comparison}
                            </span>
                        )
                    }
                />

                <Figure
                    caption="FINN Lens benchmark"
                    captionClass="text-finn-accent-blue"
                    figure={row.reference}
                    valueClass="text-[15px] font-black leading-6 tabular-nums text-finn-accent-blue"
                    className="@sm/table:shrink-0 @sm/table:text-right"
                />
            </div>

            {row.relation && <RelationBar relation={row.relation} fill={tone.bar} />}
        </ExplainedRow>
    );
}

/** A figure: its caption, its value, and what the value means underneath. */
function Figure({
    caption,
    captionClass,
    figure,
    valueClass,
    beside = null,
    className = "",
}: {
    caption: string;
    captionClass: string;
    figure: EnvironmentFigure;
    valueClass: string;
    /** The verdict, in words, on the same baseline as the number. */
    beside?: ReactNode;
    className?: string;
}) {
    return (
        <div className={`min-w-0 ${className}`}>
            <p className={`${CAPTION} ${captionClass}`}>{caption}</p>

            {/*
              * `justify-end` only bites where the block is right-aligned: the
              * benchmark's value has to sit against the same edge its caption
              * does, or the column reads as two things.
              */}
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 @sm/table:[.text-right_&]:justify-end">
                <span className={valueClass}>{figure.value}</span>

                {beside}
            </p>

            {figure.meaning && (
                <p className="mt-0.5 text-[11px] leading-4 text-finn-iron">
                    {figure.meaning}
                </p>
            )}
        </div>
    );
}

/**
 * The two figures as one picture, and the thing the eye should land on.
 *
 * The car's figure fills the track in the card's own colour; the benchmark is
 * notched across it in blue, ringed in white so it stays legible wherever it
 * lands on the fill. Thick enough to read as a chart rather than as a rule
 * under the numbers — this is the only part of the card that answers "is that
 * a lot?" without being read.
 *
 * Hidden from a screen reader on purpose: both figures and the sentence under
 * the bar are already in the text, and a bar read out as a percentage of a
 * track nobody can see is worse than silence.
 */
function RelationBar({
    relation,
    fill,
}: {
    relation: RowRelation;
    fill: string;
}) {
    return (
        <div className="mt-4">
            <div
                aria-hidden="true"
                className="relative h-2.5 w-full rounded-full bg-finn-cotton"
            >
                <div
                    className={`h-2.5 rounded-full ${fill}`}
                    style={{ width: `${relation.car}%` }}
                />

                <span
                    className="absolute -top-[5px] h-5 w-[3px] -translate-x-1/2 rounded-full bg-finn-accent-blue ring-2 ring-white"
                    style={{ left: `${relation.reference}%` }}
                />
            </div>

            <p className="mt-2.5 text-[11px] font-bold leading-4 text-finn-black">
                {relation.words}
            </p>
        </div>
    );
}
