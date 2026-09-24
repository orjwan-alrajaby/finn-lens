import type { AlternativeOption, BudgetStatus } from "@/lib/reasoning-engine/types";
import { formatEUR } from "@/lib/reasoning-engine";

/**
 * The four cars worth challenging the recommendation with.
 *
 * Not a leaderboard, and deliberately not every car the user pinned: these
 * are the closest alternatives overall, so each one is a choice the reader
 * could plausibly have been given instead. A car that merely tops one
 * low-ranked category is not in here, because putting it in front of the
 * reader would imply it were a contender.
 *
 * Every figure on a card is expressed relative to the recommendation, since
 * "instead of" is the only question this section exists to answer.
 */

const BUDGET_CLASS: Record<BudgetStatus, string> = {
    within: "text-finn-iron",
    /* Deep amber: the signal hue does not carry at 11px on a pale ground. */
    over: "text-finn-warning-deep",
    unknown: "text-finn-iron",
};

export function ChallengePicker({
    options,
    winnerName,
    selectedId,
    onBack,
    onSelect,
}: {
    options: AlternativeOption[];
    winnerName: string;
    /** The car currently in the hot seat, or null when it's the winner. */
    selectedId: number | null;
    /**
     * Crosses back to the recommendation tab.
     *
     * It used to empty the hot seat instead, which was the only thing "back to
     * <winner>" could mean while both readings shared one page. With them on
     * separate tabs the label means what it says — go and look at the winner —
     * and the challenger is left where the reader put it, so returning finds
     * the comparison rather than an empty picker.
     */
    onBack: () => void;
    onSelect: (vehicleId: number | null) => void;
}) {
    if (!options.length) return null;

    return (
        /*
          * The one section on the page that is a control rather than a
          * finding, and the only one that never reaches the PDF. So it is
          * drawn the way this page draws controls — white, outlined, no
          * tint of its own — which keeps the coloured cards meaning
          * "evidence" and stops a row of buttons from looking like one.
          */
        <section className="rounded-[28px] bg-white p-6 ring-2 ring-finn-cotton sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                    {/*
                      * "Shortlist", not "Hot seat". The section that follows
                      * this one is headed "In the hot seat", and on a tab that
                      * is itself the hot seat the two labels a few hundred
                      * pixels apart said the same thing about different
                      * things. This one is the list of candidates; that one is
                      * the comparison of the chosen candidate.
                      */}
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">
                        Shortlist
                    </p>

                    {/*
                      * An invitation until a car is chosen, and the record of
                      * what was on the table afterwards — which is what it has
                      * to be in the exported report, where the choice has
                      * already been made and asking the reader to make it
                      * again reads as a page that did not register it.
                      */}
                    <h2 className="mt-2 text-2xl font-black">
                        {selectedId == null
                            ? "Want to challenge the recommendation?"
                            : `The cars closest to ${winnerName}`}
                    </h2>
                </div>

                {selectedId != null && (
                    /*
                      * The one part of this section that is only a control.
                      * The cards below it are the shortlist and belong in the
                      * exported report; a button that empties the hot seat is
                      * an action, and an action in a file is a dead pixel.
                      */
                    <button
                        type="button"
                        onClick={onBack}
                        className="finn-lens-screen-only rounded-full border border-finn-cotton px-4 py-2 text-[11px] font-bold text-finn-iron transition hover:text-finn-black"
                    >
                        Back to {winnerName}
                    </button>
                )}
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-finn-iron">
                {options.length === 1
                    ? `The one other car close enough to ${winnerName} to be worth weighing against it.`
                    : `The ${options.length} cars closest to ${winnerName} overall.`}{" "}
                Pick one and we'll show you exactly what you'd gain and lose by
                taking it instead — judged on the same priorities, mileage,
                prices and budget. Choosing one here doesn't change the
                recommendation.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {options.map((option) => (
                    <button
                        key={option.vehicle.id}
                        type="button"
                        aria-pressed={option.isSelected}
                        onClick={() => onSelect(option.vehicle.id)}
                        className={[
                            "rounded-[20px] border-2 p-3 text-left transition",
                            option.isSelected
                                ? "border-finn-accent-blue bg-finn-pale-blue"
                                : "border-finn-cotton bg-finn-cotton/60 hover:border-finn-iron/30 hover:bg-finn-cotton",
                        ].join(" ")}
                    >
                        <img
                            src={option.vehicle.images.thumbnail}
                            alt=""
                            className="h-20 w-full rounded-xl object-cover"
                        />

                        <p className="mt-2 truncate text-xs font-black text-finn-black">
                            {option.vehicle.name}
                        </p>

                        {/*
                          * Rank, not "68/100". The score is a comparison
                          * artefact — a share of the equipment we happen to
                          * check — and printing it as a mark out of a hundred
                          * invites the reader to read it as a grade the data
                          * can't support.
                          */}
                        <p className="mt-0.5 text-[10px] font-bold text-finn-iron">
                            Ranked #{option.rank}
                            {option.vehicle.fuelType
                                ? ` · ${option.vehicle.fuelType}`
                                : ""}
                        </p>

                        <p
                            className={[
                                "mt-1 text-[11px] font-bold",
                                BUDGET_CLASS[option.budgetStatus],
                            ].join(" ")}
                        >
                            {formatEUR(option.totalMonthly)}/month
                            {option.budgetStatus === "over" &&
                            option.budgetDifference != null ? (
                                <>
                                    {" · "}
                                    {formatEUR(option.budgetDifference)} over
                                    budget
                                </>
                            ) : option.budgetStatus === "unknown" ? (
                                " · cost incomplete"
                            ) : option.costDifference != null &&
                              Math.abs(option.costDifference) >= 1 ? (
                                <>
                                    {" · "}
                                    {formatEUR(Math.abs(option.costDifference))}{" "}
                                    {option.costDifference > 0
                                        ? "more"
                                        : "less"}{" "}
                                    than {winnerName}
                                </>
                            ) : null}
                        </p>

                        {option.hook && (
                            <p className="mt-1.5 text-[11px] leading-4 text-finn-black">
                                {option.hook}
                            </p>
                        )}
                    </button>
                ))}
            </div>
        </section>
    );
}
