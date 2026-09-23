import { Eye, Pin } from "lucide-react";

import { formatEUR } from "@/lib/reasoning-engine";
import { AMBIGUOUS_FIGURES, EVIDENCE, evidenceMet, measuredDisplay, readEvidence, type EvidenceId } from "@/lib/lens-chat/evidence";
import type { Tone } from "@/lib/lens-chat/fit-story";
import { carLabel } from "@/lib/lens-ai/outcome";
import type { LensRun } from "@/lib/lens-chat/run";
import type { Need, Understanding } from "@/lib/lens-chat/understanding";
import { CATEGORIES, SIGNALS } from "@/lib/reasoning-engine/constants";
import { bandForScore } from "@/lib/reasoning-engine/bands";
import { FIT_BANDS, type FitLevel } from "@/lib/reasoning-engine/fit";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import type { CategoryId, SignalId } from "@/lib/reasoning-engine/types";
import type { PinnedFinnCar } from "@/lib/types";

import { BandChip, SmallButton, type CarActions } from "./cards";
import { ToneMark } from "./pick";

/**
 * One car against the match, need by need.
 *
 * Tapping a car in "Also close" used to open the same ranked list "Compare
 * all" opens, which answered a question nobody asked. What someone tapping a
 * car wants to know is how it does on the things they told Lens — so this is
 * that: each of their needs, what FINN lists on this car and on their match,
 * side by side, and which of the two comes out ahead on it. Every cell is read
 * off FINN's data for that car; nothing here is scored, and nothing is
 * inferred that isn't already in the fit story.
 */
export function CarCompare({
    run,
    understanding,
    lessRelevant,
    carId,
    actions,
}: {
    run: LensRun;
    understanding: Understanding;
    lessRelevant: EvidenceId[];
    carId: number;
    actions: CarActions;
}) {
    const { recommendation } = run;
    const match = recommendation.winner;
    const car = recommendation.ranked.find((item) => item.id === carId);

    if (!car) return <p className="px-1 text-[13px] text-finn-iron">Lens no longer has this car in the comparison.</p>;

    const cars = recommendation.context.vehicles;
    const costs = recommendation.context.costs;
    const difference = (costs[car.id]?.totalMonthly ?? 0) - (costs[match.id]?.totalMonthly ?? 0);
    const needs = understanding.needs.filter((need) => need.status === "active");
    const verdicts = needs.map((need) => verdictFor(need, car, match, lessRelevant));
    const sameMatch = totalFor(recommendation.scores, car.id) === totalFor(recommendation.scores, match.id);
    const ahead = verdicts.filter((item) => item === "better").length;
    const behind = verdicts.filter((item) => item === "worse").length;

    return (
        <div>
            {/* -- The two cars ------------------------------------------------- */}
            <div className="overflow-hidden border-b border-finn-cotton">
                <div className="grid grid-cols-2 divide-x divide-finn-cotton bg-finn-pale-blue">
                    <CarHead run={run} car={car} label="This car" />
                    <CarHead run={run} car={match} label="Your match" match />
                </div>

                <div className="border-t border-finn-cotton bg-white px-4 py-3 text-xs leading-5 text-finn-black">
                    <p>
                        <span className="font-black">
                            {Math.abs(difference) < 1
                                ? "The same monthly cost"
                                : `${formatEUR(Math.abs(Math.round(difference)))}/month ${difference > 0 ? "more" : "less"}`}
                        </span>
                        {Math.abs(difference) >= 1 && " than your match, all in."}
                        {costs[car.id]?.budgetStatus === "over" && <span className="text-finn-warning-deep"> It&rsquo;s over your budget.</span>}
                    </p>
                    {needs.length > 0 && (
                        <p className="mt-0.5 text-finn-iron">
                            {ahead === 0 && behind === 0
                                ? "On what you told Lens, the two are level."
                                : `Ahead of your match on ${ahead} of your ${needs.length} needs, behind on ${behind}.`}
                        </p>
                    )}
                    {sameMatch && (
                        <p className="mt-0.5 text-finn-iron">
                            Both come out at {totalFor(recommendation.scores, car.id)} out of 100 on what Lens checks, so it can&rsquo;t tell them apart there.
                            {difference > 0 ? " Your match is the cheaper of the two." : difference < 0 ? " This one is the cheaper of the two." : ""}
                        </p>
                    )}
                </div>
            </div>

            {/* -- What Lens weighed, whether or not they said anything ---------- */}
            <PriorityRows run={run} car={car} match={match} />

            {/* -- Need by need ------------------------------------------------- */}
            {needs.map((need, index) => {
                const evidence = need.evidence.filter((entry) => !lessRelevant.includes(entry.id));
                const verdict = verdicts[index]!;

                return (
                    <section key={need.id} className="border-b border-finn-cotton">
                        <div className="flex items-start justify-between gap-2 px-4 pt-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-wide text-finn-accent-blue">You said</p>
                                <p className="text-xs font-black leading-4 text-finn-black">{need.label}</p>
                            </div>
                            <Verdict verdict={verdict} />
                        </div>

                        {evidence.length > 0 ? (
                            <table className="mt-2 w-full border-t border-finn-cotton text-[11px] leading-4">
                                <thead>
                                    <tr className="text-[10px] font-black uppercase tracking-[0.1em] text-finn-iron">
                                        <th className="w-[40%] px-4 py-1.5 text-left font-black">What Lens checked</th>
                                        <th className="px-2 py-1.5 text-left font-black">This car</th>
                                        <th className="px-2 py-1.5 text-left font-black text-finn-accent-blue">Your match</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-finn-cotton">
                                    {evidence.map((entry) => (
                                        <tr key={entry.id}>
                                            <td className="px-4 py-2 align-top font-bold text-finn-black">
                                                {entry.unwanted ? "Not " : ""}
                                                {entry.unwanted ? EVIDENCE[entry.id].label.toLowerCase() : EVIDENCE[entry.id].label}
                                            </td>
                                            <td className="px-2 py-2 align-top">
                                                <Cell car={car} id={entry.id} unwanted={entry.unwanted} />
                                            </td>
                                            <td className="px-2 py-2 align-top">
                                                <Cell car={match} id={entry.id} unwanted={entry.unwanted} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="px-4 pb-3 pt-1 text-[11px] text-finn-iron">Nothing Lens can check on a car speaks to this.</p>
                        )}

                        {need.notInData && (
                            <p className="border-t border-finn-cotton px-4 py-2 text-[11px] leading-4 text-finn-iron">
                                FINN doesn&rsquo;t publish {need.notInData}, for either car.
                            </p>
                        )}
                    </section>
                );
            })}

            <div className="flex flex-wrap gap-1.5 px-4 py-3">
                <SmallButton
                    tone={actions.pinnedIds.has(car.id) ? "quiet" : "solid"}
                    pressed={actions.pinnedIds.has(car.id)}
                    onClick={() => actions.onPin(car.id, !actions.pinnedIds.has(car.id))}
                >
                    <Pin aria-hidden="true" className={`h-3.5 w-3.5 ${actions.pinnedIds.has(car.id) ? "fill-current" : ""}`} />
                    {actions.pinnedIds.has(car.id) ? "Pinned" : `Pin the ${carLabel(car, cars)}`}
                </SmallButton>
                {actions.canShow(car.id) && (
                    <SmallButton onClick={() => actions.onShow(car.id)}>
                        <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                        Show on page
                    </SmallButton>
                )}
            </div>
        </div>
    );
}

/**
 * The priorities the engine actually weighed, car against car.
 *
 * Needs are what the reader said; this is what Lens ranked on — and with no
 * conversation behind a comparison there are no needs at all, which is how
 * two cars came to look identical apart from their price. Each row is the
 * priority, what each car scores in it, and the equipment only one of them
 * carries: read from the engine's own per-priority detail, never recomputed.
 */
function PriorityRows({ run, car, match }: { run: LensRun; car: PinnedFinnCar; match: PinnedFinnCar }) {
    const { scores, weights, priorities } = run.recommendation.context;
    const detail = (vehicle: PinnedFinnCar, category: CategoryId) =>
        scores.find((score) => score.vehicleId === vehicle.id)?.details[category];

    const names = (keys: SignalId[]) =>
        keys
            .map((key) => SIGNALS[key]?.label ?? key)
            .filter(Boolean)
            .slice(0, 4)
            .join(", ");

    return (
        <section className="border-b border-finn-cotton">
            <p className="px-4 pt-3 text-[10px] font-black uppercase tracking-wide text-finn-accent-blue">What Lens weighed</p>

            <ul className="mt-1.5">
                {priorities.map((category) => {
                    const mine = detail(car, category);
                    const theirs = detail(match, category);
                    const weight = weights.find((item) => item.priority === category);

                    if (!mine && !theirs) return null;

                    /* Equipment one car carries and the other is confirmed to lack. */
                    const onlyMine = (mine?.matched ?? []).filter((key) => theirs?.missing.includes(key));
                    const onlyTheirs = (theirs?.matched ?? []).filter((key) => mine?.missing.includes(key));

                    return (
                        <li key={category} className="border-t border-finn-cotton px-4 py-2 first:border-t-0">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="min-w-0 truncate text-xs font-black text-finn-black">
                                    <span className="text-finn-accent-blue">#{weight?.rank ?? "–"}</span> {CATEGORIES[category].label}
                                    {weight && <span className="font-bold text-finn-iron"> · {weight.weightPercent}%</span>}
                                </p>
                                <p className="shrink-0 text-[11px] font-black tabular-nums">
                                    <span className={mine && theirs && mine.exactScore > theirs.exactScore ? "text-finn-influence-emerald" : "text-finn-black"}>
                                        {mine?.assessed ? mine.score : "–"}
                                    </span>
                                    <span className="text-finn-iron"> vs </span>
                                    <span className={mine && theirs && theirs.exactScore > mine.exactScore ? "text-finn-influence-emerald" : "text-finn-black"}>
                                        {theirs?.assessed ? theirs.score : "–"}
                                    </span>
                                </p>
                            </div>

                            {onlyMine.length > 0 && (
                                <p className="text-[11px] leading-4 text-finn-iron">
                                    <span className="font-bold text-finn-black">Only this car:</span> {names(onlyMine)}
                                </p>
                            )}
                            {onlyTheirs.length > 0 && (
                                <p className="text-[11px] leading-4 text-finn-iron">
                                    <span className="font-bold text-finn-black">Only your match:</span> {names(onlyTheirs)}
                                </p>
                            )}
                            {!onlyMine.length && !onlyTheirs.length && (
                                <p className="text-[11px] leading-4 text-finn-iron">Nothing Lens checks here separates them.</p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function CarHead({ run, car, label, match = false }: { run: LensRun; car: PinnedFinnCar; label: string; match?: boolean }) {
    const { recommendation } = run;
    const score = recommendation.scores.find((item) => item.vehicleId === car.id);
    const band: FitLevel = score?.judgeable ? bandForScore(totalFor(recommendation.scores, car.id)) : "unknown";
    const cost = recommendation.context.costs[car.id];

    return (
        <div className="px-3 pb-3 pt-2.5">
            <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${match ? "text-finn-accent-blue" : "text-finn-iron"}`}>{label}</p>
            <div className="mt-1 flex h-12 items-center justify-center overflow-hidden rounded-xl bg-white">
                {car.images?.thumbnail ? <img src={car.images.thumbnail} alt="" className="h-20 max-w-none object-contain" /> : null}
            </div>
            <p className="mt-1 truncate text-xs font-black leading-4">{carLabel(car, recommendation.context.vehicles)}</p>
            <p className="text-sm font-black tabular-nums text-finn-black">
                {cost?.complete ? "" : "from "}
                {formatEUR(Math.round(cost?.totalMonthly ?? 0))}
                <span className="text-[11px] font-bold text-finn-iron">/mo</span>
            </p>
            <p className="mt-1">
                <BandChip car={{ band, bandLabel: FIT_BANDS[band].label }} score={totalFor(recommendation.scores, car.id)} />
            </p>
        </div>
    );
}

/** What FINN says about one thing on one car, as a mark and a few words. */
function Cell({ car, id, unwanted }: { car: PinnedFinnCar; id: EvidenceId; unwanted: boolean }) {
    const figure = measuredDisplay(car, id);
    const met = evidenceMet(car, id, unwanted || EVIDENCE[id].undesirable === true);
    const state = readEvidence(car, id);
    const tone: Tone = AMBIGUOUS_FIGURES.has(id) ? "note" : met === true ? "good" : met === false ? "missing" : "unknown";
    const words = figure
        ? figure.replace(/^an? /, "").replace(/, in FINN's data$/, "")
        : state === "listed"
          ? unwanted ? "Has it" : "Listed"
          : state === "notListed"
            ? unwanted ? "Doesn't" : "Not listed"
            : "FINN doesn't say";

    return (
        <span className="flex items-start gap-1.5">
            {tone === "note" ? (
                <span className="mt-[3px] block h-2 w-2 shrink-0 rounded-full bg-finn-iron/40" aria-hidden="true" />
            ) : (
                <ToneMark tone={tone} size="sm" />
            )}
            <span className={tone === "missing" || tone === "unknown" ? "text-finn-iron" : "text-finn-black"}>{words}</span>
        </span>
    );
}

type Verdict = "better" | "level" | "worse" | "unknown";

/** Which of the two meets more of this need's evidence — counts of facts, never a score. */
function verdictFor(need: Need, car: PinnedFinnCar, match: PinnedFinnCar, lessRelevant: EvidenceId[]): Verdict {
    const evidence = need.evidence.filter((entry) => !lessRelevant.includes(entry.id) && !AMBIGUOUS_FIGURES.has(entry.id));
    if (!evidence.length) return "unknown";

    const met = (subject: PinnedFinnCar) => evidence.filter((entry) => evidenceMet(subject, entry.id, entry.unwanted || EVIDENCE[entry.id].undesirable === true) === true).length;
    const mine = met(car);
    const theirs = met(match);

    return mine > theirs ? "better" : mine < theirs ? "worse" : "level";
}

function Verdict({ verdict }: { verdict: Verdict }) {
    const look = {
        better: { text: "Does better", className: "bg-finn-influence-emerald-pale text-finn-influence-emerald" },
        level: { text: "Level", className: "bg-finn-cotton text-finn-iron" },
        worse: { text: "Your match does better", className: "bg-finn-influence-red-pale text-finn-influence-red" },
        unknown: { text: "Can't tell", className: "bg-finn-cotton text-finn-iron" },
    }[verdict];

    return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${look.className}`}>{look.text}</span>;
}
