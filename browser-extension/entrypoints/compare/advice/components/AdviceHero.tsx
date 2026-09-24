import { ExternalLink, Sparkles, TriangleAlert } from "lucide-react";
import { modelName } from "@/lib/car-labels";
import type {
    CategoryId,
    CostBreakdown,
    VehicleEvaluation,
} from "@/lib/reasoning-engine/types";
import type { AdviceNarrative } from "@/lib/reasoning-engine/narrative";
import { formatEUR, getCategory } from "@/lib/reasoning-engine";

interface AdviceHeroProps {
    evaluation: VehicleEvaluation;
    narrative: AdviceNarrative;
    cost: CostBreakdown;
    priorities: CategoryId[];
    isFallback: boolean;
    /** Set when the reader gave a rental period the winner isn't confirmed to fit. */
    rentalFallback?: "noneFit" | "unconfirmed" | null;
    /** Set when the reader drives automatics only and the winner isn't a confirmed automatic. */
    gearboxFallback?: "noneFit" | "unconfirmed" | null;
    /**
     * Crosses to the challenge tab, or null when there is nothing to challenge
     * with — one pinned car is a recommendation with no rivals, and a button
     * leading to a page that says so is a button that wasted a click.
     *
     * This slot used to open the answers drawer. That was the wrong thing for
     * it to do from here: the drawer is already reachable from the page header
     * and again from the sidebar directly below this hero, so it was the third
     * copy of one control — while the obvious next question after reading a
     * recommendation, "is there something better?", had no affordance at all
     * until the reader found the tabs.
     */
    onChallenge: (() => void) | null;
}

function determineSubtitle(
    equipmentLine: string | null,
    engine: string,
    trim: string,
) {
    if (!equipmentLine) return `${engine} ${trim}`;
    if (equipmentLine.length <= 10) return `${equipmentLine} ${trim}`;

    return equipmentLine;
}

/**
 * How the hero is painted, which depends on what it is announcing.
 *
 * A recommendation that fits gets FINN's navy, confident and full-bleed. One
 * that only exists because nothing fit the budget is drawn in the warning
 * hue instead — the caveat has to be carried by the same thing that carries
 * the verdict, or it is a footnote under a confident blue block and nobody
 * reads it.
 */
const PALETTE = {
    fits: {
        ground: "bg-finn-highlight-navy",
        photo: "bg-finn-accent-blue/40",
        icon: "text-finn-accent-blue",
        eyebrow: "bg-white/10 text-white ring-white/10",
        title: "text-white",
        sub: "text-white/60",
        lede: "text-white/90",
        note: "text-white/75",
        rule: "border-white/20",
        chip: "bg-white/10 text-white ring-white/10",
        panel: "bg-white/90 ring-finn-accent-blue",
        panelLabel: "text-finn-highlight-navy/80",
        panelFigure: "text-finn-highlight-navy",
        panelNote: "text-finn-highlight-navy/80",
        link: "bg-white text-finn-highlight-navy hover:bg-finn-snow",
        secondary:
            "bg-white/10 text-white ring-white/15 hover:bg-white/15",
    },
    /*
     * The navy card's structure, one hue over: two clearly separated halves,
     * with the quieter one carrying the words.
     *
     * Which half takes the colour is the opposite of the blue card's answer,
     * and deliberately so. Navy is dark, so its text half can be the deep
     * one and still hold white type; amber is a light hue, so the half doing
     * the reading is the pale one and the saturated gold goes behind the
     * photo, where nothing has to be legible on top of it. The card stays
     * unmistakably warm — the strongest statement of the hue is simply on
     * the side that can afford it.
     *
     * The layers invert with the ground. On navy they are translucent white,
     * lifting off a dark card; here they are translucent gold, because white
     * on a pale ground is not a layer at all.
     */
    overBudget: {
        ground: "bg-finn-warning-lift",
        photo: "bg-finn-warning-ground",
        icon: "text-finn-warning-ink",
        eyebrow:
            "bg-finn-warning-ground/35 text-finn-warning-ink ring-finn-warning-ground/55",
        title: "text-finn-black",
        sub: "text-finn-warning-ink/85",
        lede: "text-finn-black",
        note: "text-finn-warning-ink/85",
        rule: "border-finn-warning-ink/25",
        chip: "bg-white text-finn-black ring-white",
        panel: "bg-white/90 ring-finn-warning-ground",
        panelLabel: "text-finn-warning-ink/80",
        panelFigure: "text-finn-black",
        panelNote: "text-finn-warning-ink/80",
        link: "bg-finn-warning-ink text-white hover:brightness-125",
        secondary:
            "bg-finn-warning-ground/25 text-finn-black ring-finn-warning-ground/50 hover:bg-finn-warning-ground/40",
    },
} as const;

/**
 * The recommendation itself. Always the recommended car, never the car in the
 * hot seat — the two are separate concepts and the hero owns the first one.
 *
 * The headline is the conclusion. The two notes beneath it are the only place
 * on the page that the budget override and the closeness of the top two are
 * stated; everything below adds evidence rather than repeating the verdict.
 */
export function AdviceHero({
    evaluation,
    narrative,
    cost,
    priorities,
    isFallback: overBudget,
    rentalFallback = null,
    gearboxFallback = null,
    onChallenge,
}: AdviceHeroProps) {
    /* Either hard rule unmet colours the whole verdict, the way the budget always has. */
    const isFallback = overBudget || rentalFallback === "noneFit" || gearboxFallback === "noneFit";
    const winner = evaluation.vehicle;
    const { headline, budgetNote, marginNote, dependsNote } = narrative.verdict;

    /* Recommended on too little of the top two priorities to judge it on. */
    const estimate = !evaluation.score.judgeable;

    const palette = isFallback ? PALETTE.overBudget : PALETTE.fits;

    const budgetLabel =
        cost.budget == null
            ? null
            : cost.budgetStatus === "over"
                ? `${formatEUR(Math.abs(cost.budgetDifference ?? 0))} over your ${formatEUR(cost.budget)} budget`
                : cost.budgetStatus === "unknown"
                    ? `budget ${formatEUR(cost.budget)} · can't confirm it fits`
                    : `${formatEUR(Math.abs(cost.budgetDifference ?? 0))} under your ${formatEUR(cost.budget)} budget`;

    return (
        <section
            className={[
                "overflow-hidden rounded-[30px] shadow-xl",
                palette.ground,
            ].join(" ")}
        >
            <div className="flex flex-col-reverse lg:flex-row">
                <div className="p-6 sm:p-8 lg:flex-1/2">
                    <div
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${palette.eyebrow}`}
                    >
                        {isFallback ? (
                            <TriangleAlert
                                aria-hidden="true"
                                className={`h-4 w-4 ${palette.icon}`}
                            />
                        ) : (
                            <Sparkles
                                aria-hidden="true"
                                className={`h-4 w-4 ${palette.icon}`}
                            />
                        )}

                        {gearboxFallback === "noneFit"
                            ? "Closest match — nothing here is an automatic"
                            : gearboxFallback === "unconfirmed"
                              ? "Your recommendation — FINN doesn't say whether it's an automatic"
                              : rentalFallback === "noneFit"
                            ? "Closest match — nothing here fits your rental period"
                            : rentalFallback === "unconfirmed" && !overBudget
                              ? "Your recommendation — FINN can't confirm it for your rental period"
                              : isFallback
                            ? "Closest match — nothing here fits your budget"
                            : estimate
                              ? "Best estimate — FINN's data is thin on your top priorities"
                              : "Your recommendation"}
                    </div>

                    <h2
                        className={`mt-5 text-3xl font-black tracking-tight sm:text-4xl ${palette.title}`}
                    >
                        {modelName(winner)}
                    </h2>

                    <p className={`mt-1 text-sm ${palette.sub}`}>
                        {determineSubtitle(
                            winner.equipmentLine,
                            winner.engine,
                            winner.trim ?? "",
                        )}
                    </p>

                    {/*
                      * What it runs on belongs on the recommendation itself.
                      * It is the first thing that decides whether a reader
                      * can live with a car — a charger at home or not — and
                      * it was only visible further down, inside the
                      * environmental reading.
                      */}
                    <p className={`mt-1 text-sm ${palette.sub}`}>
                        {[winner.vehicleType, winner.fuelType, winner.year]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>

                    <p
                        className={`mt-5 max-w-2xl text-lg font-semibold leading-8 ${palette.lede}`}
                    >
                        {headline}
                    </p>

                    {(budgetNote || marginNote || dependsNote) && (
                        <div
                            className={`mt-4 max-w-2xl space-y-2 border-l-2 pl-4 ${palette.rule}`}
                        >
                            {budgetNote && (
                                <p
                                    className={`text-sm leading-6 ${palette.note}`}
                                >
                                    {budgetNote}
                                </p>
                            )}

                            {marginNote && (
                                <p
                                    className={`text-sm leading-6 ${palette.note}`}
                                >
                                    {marginNote}
                                </p>
                            )}

                            {dependsNote && (
                                <p
                                    className={`text-sm leading-6 ${palette.note}`}
                                >
                                    {dependsNote}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="mt-6 flex flex-wrap gap-2">
                        {priorities.map((priority, index) => (
                            <span
                                key={priority}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${palette.chip}`}
                            >
                                #{index + 1} {getCategory(priority)?.label ?? priority}
                            </span>
                        ))}
                    </div>

                    <div className="mt-7 flex flex-wrap items-center gap-3">
                        {/*
                          * Only when there is somewhere to go. FINN does not
                          * supply a URL for every car — and a button reading
                          * "View this car on FINN" that reloads the page is
                          * worse than one that isn't there.
                          */}
                        {winner.url && (
                            <a
                                href={winner.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-black shadow-sm transition ${palette.link}`}
                            >
                                View this car on FINN
                                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                            </a>
                        )}

                        {onChallenge && (
                            <button
                                type="button"
                                onClick={onChallenge}
                                className={`finn-lens-screen-only rounded-full px-5 py-3 text-xs font-bold ring-1 transition ${palette.secondary}`}
                            >
                                Challenge recommendation
                            </button>
                        )}
                    </div>
                </div>

                {/*
                  * Two stacked containers rather than a photo with a panel
                  * floating on it: the car above, what it costs below.
                  *
                  * The car used to be the background of this half, bled to
                  * its edges and cropped by whatever height the column
                  * happened to be. Given a container of its own it gets a
                  * fixed frame to sit in, and the cost box stops being an
                  * overlay that has to out-shout an unknown photo — it is
                  * simply the thing underneath.
                  */}
                <div
                    className={[
                        "relative flex min-h-64 flex-col lg:min-h-full lg:flex-1/2",
                        palette.photo,
                    ].join(" ")}
                >
                    {/* Same reason: a broken image is louder than no image. */}
                    {winner.images?.thumbnail && (
                        <div className="relative overflow-hidden aspect-video">
                            <img
                                src={winner.images.thumbnail}
                                alt={winner.name}
                                className="w-full object-cover scale-125"
                            />
                        </div>
                    )}

                    <div className="p-5">
                        <div
                            className={`relative rounded-2xl p-4 ring-1 backdrop-blur-md ${palette.panel}`}
                        >
                            <p
                                className={`text-[10px] font-bold uppercase tracking-widest ${palette.panelLabel}`}
                            >
                                {cost.complete
                                    ? "Estimated total per month"
                                    : "Estimated per month (partial)"}
                            </p>

                            <p
                                className={`mt-1 text-3xl font-black ${palette.panelFigure}`}
                            >
                                {formatEUR(cost.totalMonthly)}
                            </p>

                            {budgetLabel && (
                                <p
                                    className={[
                                        "mt-1 text-[11px] font-bold",
                                        cost.budgetStatus !== "over"
                                            ? palette.panelLabel
                                            : "font-black text-finn-warning-ink",
                                    ].join(" ")}
                                >
                                    {budgetLabel}
                                </p>
                            )}

                            <p
                                className={`mt-2 text-[11px] leading-4 ${palette.panelNote}`}
                            >
                                Subscription plus estimated energy and extra
                                mileage. The full breakdown is further down.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
