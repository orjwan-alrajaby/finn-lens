import { lowerFirst } from "@/lib/reasoning-engine/format";
import { SOURCES, type Source } from "@/lib/sources";
import { describeRentalProblem, formatEUR, monthLabel } from "@/lib/reasoning-engine";
import { bandForScore } from "@/lib/reasoning-engine/bands";
import { FIT_BANDS, type FitLevel } from "@/lib/reasoning-engine/fit";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import { assessEfficiency, assessEnvironment, efficiencyScore } from "@/lib/reasoning-engine/environmental";
import { isStatedFact } from "@/lib/reasoning-engine/evidence";
import type { SignalId } from "@/lib/reasoning-engine/types";
import type { WireQuestion } from "@/lib/lens-ai/contract";
import { carLabel } from "@/lib/lens-ai/outcome";
import type { PinnedFinnCar } from "@/lib/types";

import { AMBIGUOUS_FIGURES, asPhrase, isKind, barePhrase, EVIDENCE, evidenceMet, measuredDisplay, NEARLY_EVERY, readEvidence, type EvidenceId } from "./evidence";
import { lengthAmong, lengthGap, parkingContext, widthContext } from "./dimensions";

/** How a measured figure is introduced, and what to say when FINN has none. */
const MEASURED_LEAD: Partial<Record<EvidenceId, string>> = {
    compactLength: "It's",
    compactWidth: "It's",
    bootVolume: "It has",
    electricRange: "It has",
    suvBody: "FINN files it as",
    winterReadyTyres: "It comes on",
};

/** Said next to the figure, because FINN's own field is ambiguous. */
const MEASURED_CAVEAT: Partial<Record<EvidenceId, string>> = {
    bootVolume: "FINN doesn't say whether that's with the rear seats up or folded.",
};

const MEASURED_UNKNOWN: Partial<Record<EvidenceId, string>> = {
    bootVolume: "FINN doesn't publish a boot figure for this car.",
    winterReadyTyres: "FINN doesn't say which tyres this one comes on.",
    suvBody: "FINN doesn't say what body type this one is.",
    electricRange: "It isn't electric, so FINN publishes no range for it.",
};
import type { LensRun } from "./run";
import { bubbleById } from "./bubbles";
import { demandOf } from "./deals";
import { budgetCeiling } from "./understanding";
import type { Need, Understanding } from "./understanding";

/**
 * "Why this car fits the situation you described", from the engine's result.
 *
 * Organised around what the person told Lens, not around priority weights:
 * their hard constraints first, then each of their needs with what FINN
 * actually lists on this car and what that could mean for them, then the one
 * compromise most worth knowing. Every fact is read off the car. The only
 * words a model contributed are a need's label and each evidence's `use` —
 * the implication — and those are only shown next to a fact that holds.
 */

export type Tone = "good" | "missing" | "unknown" | "note";

export interface StoryLine {
    tone: Tone;
    text: string;
    /** Where a figure or rule in it comes from, when it isn't FINN's. */
    sources?: Source[];
    /**
     * What the line reads off the car — an evidence id, or a figure's line
     * ("co2#0") — so a reading two needs share is said once.
     */
    reads?: string;
    /** Whether the car meets what the line reads: false where it falls short. */
    met?: boolean | null;
    /** A car within the reader's limits that has what this one lacks, said as a sentence. */
    rival?: StoryRival;
    /** The other needs this same reading counts for, where it's said once for all of them. */
    alsoFor?: string[];
}

export interface StoryRival {
    id: number;
    name: string;
    /** "MG ZS has it, at about €419/month — still within your maximum." */
    text: string;
    /** It's the winner: named so in `text`, and shown in the winner's gold. */
    winner?: boolean;
}

export interface StorySection {
    key: string;
    title: string;
    /** The reader's own words for this need, for an explanation that answers them. */
    said: string;
    /** The need or constraint in the person's terms, for "You needed". */
    short: string;
    kind: "budget" | "rental" | "need";
    importance: Need["importance"] | "constraint";
    lines: StoryLine[];
    /** One line for the compact "Lens found" summary. */
    summary: string;
    tone: Tone;
    /**
     * A need judged on a figure rather than on equipment — CO₂, or how much
     * it uses — so the drawer can draw the figure against its benchmark in
     * place of the lines, under the need the reader named.
     */
    figure?: { kind: "co2" | "efficiency"; need: string };
    /** The other needs this whole row answers too, where it's said once for all of them. */
    alsoFor?: string[];
}

export interface FitStory {
    eyebrow: string;
    carName: string;
    band: FitLevel;
    bandLabel: string;
    /** What the band means, in human terms. */
    bandMeaning: string;
    sections: StorySection[];
    /** `car` is the one `alternative` (or, failing one, `text`) names, so the reader can find it. */
    catch: { text: string; alternative: string | null; car?: { id: number; name: string; winner?: boolean } | null } | null;
    /** What Lens still needs to know, if the conversation left something open. */
    stillToKnow: WireQuestion | null;
}

/**
 * Something the car doesn't have, said as what Lens actually knows. A stated
 * fact — the gearbox, the drive type, the seat count — is a no: "it doesn't
 * have all-wheel drive". An equipment list that doesn't mention something is
 * only that: "FINN doesn't list fog lights for this car".
 */
/**
 * What a car must be or have, as one sentence: a kind of car is something it
 * is, equipment something it has — "It is a towbar" was neither.
 */
function mustSentence(ids: EvidenceId[]): string {
    const is = ids.filter(isKind).map(asPhrase);
    const has = ids.filter((id) => !isKind(id)).map(asPhrase);

    return [is.length ? `It is ${joinNames(is)}` : null, has.length ? `${is.length ? "has" : "It has"} ${joinNames(has)}` : null]
        .filter(Boolean)
        .join(" and ");
}

/** Something FINN lists that the reader didn't want: a kind of car it is, or equipment it has. */
function listedOnIt(id: EvidenceId, measured: string | null = null): string {
    return measured || isKind(id) ? `FINN lists this one as ${measured ?? asPhrase(id)}` : `FINN lists ${asPhrase(id)} on this one`;
}

/** The same for what it mustn't be or have: "It isn't an SUV and has no towbar". */
function withoutSentence(ids: EvidenceId[]): string {
    const isnt = ids.filter(isKind).map(asPhrase);
    const hasNo = ids.filter((id) => !isKind(id)).map(barePhrase);

    return [isnt.length ? `It isn't ${isnt.join(" or ")}` : null, hasNo.length ? `${isnt.length ? "has" : "It has"} no ${joinNames(hasNo)}` : null]
        .filter(Boolean)
        .join(" and ");
}

function absent(id: EvidenceId): string {
    const label = EVIDENCE[id].label;
    const named = /^(I\b|[A-Z]{2,})/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);

    return isStatedFact(id as SignalId) ? `It doesn't have ${named}` : `FINN doesn't list ${named} for this car`;
}

const joinNames = (names: string[]): string =>
    names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/*
 * What a band is, not how much a car has: a band is a weighted score, and
 * "covers most of what Lens could check" said of a car at 45 of 100 claimed a
 * share the number doesn't carry.
 */
const BAND_MEANING: Record<FitLevel, string> = {
    strong: "the top of Lens's four bands",
    good: "the second of Lens's four bands",
    partial: "the third of Lens's four bands",
    limited: "the lowest of Lens's four bands",
    unknown: "FINN's data on it is too thin for Lens to place it in a band",
};

/*
 * What the band was worked out from, as it was: equipment, the CO₂ figure,
 * or both. "Which of the things you asked for FINN lists on it" was said to
 * a reader who asked about emissions alone, of a figure, not a list.
 */
function bandBasis(run: LensRun): string {
    const equipment = Object.values(run.answers.features).some((items) => items.length > 0);
    /* The figures it was judged on: CO₂, consumption, or both. */
    const figures = [
        ...(run.answers.priorities.includes("environmental") ? ["CO₂"] : []),
        ...(run.answers.priorities.includes("efficiency") ? ["consumption"] : []),
    ];
    const named = figures.length ? `the ${figures.join(" and ")} figure${figures.length > 1 ? "s" : ""} FINN lists for it` : "";
    const from = equipment && named
        ? `which of the things you asked for FINN lists on it, and ${figures.length > 1 ? "its CO₂ and consumption figures" : `its ${figures[0]} figure`}`
        : named || "which of the things you asked for FINN lists on it";

    return `worked out from ${from}${run.answers.priorities.length > 1 ? ", weighted by how much each matters to you" : ""}`;
}

/* "Blind spot warning" → "blind spot warning", but never "I" → "i" or "ISOFIX" → "iSOFIX". */
const lower = lowerFirst;

/** "a, b and c". */
const listed = (parts: string[]): string => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

const sentence = (value: string) => {
    const trimmed = value.trim().replace(/[.;,]+$/, "");
    return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.` : "";
};

const dayLabel = (iso: string) => {
    const date = new Date(`${iso}T00:00:00Z`);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
};

/** Within the reader's hard constraints, as far as Lens can confirm. */
function isValid(run: LensRun, car: PinnedFinnCar): boolean {
    const cost = run.recommendation.context.costs[car.id];
    if (!cost) return false;

    const budgetOk = cost.budget == null || cost.budgetStatus === "within";
    const rentalOk = cost.contract.status === "notSet" || cost.contract.status === "fits";

    return budgetOk && rentalOk;
}

/**
 * What a car emits, and what Lens made of it — the same verdict the ranking
 * used, so the card, the reading behind it and the score can't disagree.
 *
 * The verdict is the engine's own (`assessEnvironment`), on the EU CO₂ label
 * the priority scores: A is nothing at the tailpipe, B (up to 95 g/km) is low,
 * C below the 136 g/km average for a new car that burns fuel, D around it, E
 * and beyond above it. It used to be blended here with how the car stood among
 * the cars compared, so a class D car among thirstier ones came out "good" and
 * was headed "Low emissions" — a claim the engine, scoring it as partial,
 * never made. Where the car stands among the others is still said; it is
 * context, not the verdict.
 */
function emissionsReading(car: PinnedFinnCar, cars: PinnedFinnCar[]): { tone: Tone; label: string; lines: StoryLine[] } {
    const env = assessEnvironment(car);
    const co2 = env?.co2;

    if (!co2) {
        return {
            tone: "unknown",
            label: "No CO₂ figure",
            lines: [
                {
                    tone: "unknown",
                    text: "FINN doesn't publish a CO₂ figure for this car, so Lens couldn't judge it on emissions — it counted neither for nor against it.",
                },
            ],
        };
    }

    const tone: Tone = co2.level === "none" || co2.level === "low" ? "good" : co2.level === "high" ? "missing" : "note";

    const figures = cars
        .filter((other) => other.id !== car.id)
        .map((other) => assessEnvironment(other)?.co2?.gPerKm)
        .filter((value): value is number => value != null);
    const lower = figures.filter((value) => value < co2.gPerKm).length;
    const among =
        !figures.length || co2.gPerKm === 0
            ? ""
            : lower === 0
              ? ` None of the other ${figures.length} cars here emits less.`
              : ` ${lower} of the other ${figures.length} cars here ${lower === 1 ? "emits" : "emit"} less.`;

    return {
        tone,
        label: co2.label,
        lines: [
            { tone, text: `${co2.display}. ${co2.explanation}${among}` },
            ...(env.powertrain === "Plug-in Hybrid" && env.caveats[0] ? [{ tone: "note" as const, text: env.caveats[0] }] : []),
            ...(env.powertrain === "Plug-in Hybrid" && env.caveats[1] ? [{ tone: "note" as const, text: env.caveats[1], sources: [SOURCES.realWorldGap] }] : []),
            {
                tone: "note",
                text: "Lens places emissions on the A–G CO₂ label German law uses for new cars (Pkw-EnVKV): A is nothing at the tailpipe, B up to 95 g/km, C up to 115, D up to 135, E up to 155, F up to 175, and G above. For comparison, new cars that burn fuel emit about 136 g/km on average (ICCT, from EU registrations 2021–2024).",
                sources: [SOURCES.co2Label, SOURCES.icctFleet],
            },
        ],
    };
}

/**
 * How much of its own kind of energy the car uses, as Efficiency scored it:
 * the engine's own words for it, against the FINN Lens benchmark for cars
 * that run on the same thing, and where it stands among those here.
 */
function efficiencyReading(car: PinnedFinnCar, cars: PinnedFinnCar[]): { tone: Tone; label: string; lines: StoryLine[] } {
    const reading = assessEfficiency(car);

    if (!reading) {
        return {
            tone: "unknown",
            label: car.fuelType === "Plug-in Hybrid" ? "Not judged for a plug-in hybrid" : "No consumption figure",
            lines: [
                {
                    tone: "unknown",
                    text:
                        car.fuelType === "Plug-in Hybrid"
                            ? "FINN's one consumption figure for a plug-in hybrid mixes fuel and electricity, so Lens couldn't judge how efficient it is — it counted neither for nor against it."
                            : "FINN doesn't publish a consumption figure for this car, so Lens couldn't judge how efficient it is — it counted neither for nor against it.",
                },
            ],
        };
    }

    const tone: Tone = reading.level === "high" ? "good" : reading.level === "low" ? "missing" : "note";
    /* Only cars that run on the same thing: litres and kWh don't compare. */
    const mine = efficiencyScore(car)?.consumption;
    const same = cars.filter((other) => other.id !== car.id && other.fuelType === car.fuelType).map((other) => efficiencyScore(other)?.consumption).filter((value): value is number => value != null);
    const less = mine == null ? 0 : same.filter((value) => value < mine).length;
    const among = !same.length || mine == null ? "" : less === 0 ? ` None of the other ${same.length} like it here uses less.` : ` ${less} of the other ${same.length} like it here ${less === 1 ? "uses" : "use"} less.`;

    return {
        tone,
        label: reading.label,
        lines: [
            { tone, text: `${reading.consumes}. ${reading.explanation}${among}` },
            { tone: "note", text: `${reading.provenance.title} ${reading.provenance.body.replace(/\n\n/g, " ")}` },
        ],
    };
}

function evidenceLine(
    car: PinnedFinnCar,
    entry: { id: EvidenceId; use: string; unwanted?: boolean },
    cars: PinnedFinnCar[] = [],
): StoryLine {
    const def = { ...EVIDENCE[entry.id], undesirable: entry.unwanted ?? EVIDENCE[entry.id].undesirable };
    const state = readEvidence(car, entry.id);
    const met = evidenceMet(car, entry.id, def.undesirable === true);
    const measured = measuredDisplay(car, entry.id);

    /*
     * A figure FINN publishes is worth quoting whichever way it falls: "4.68 m
     * long" is the honest answer for a car that isn't small, where "FINN
     * doesn't list compact length" would read as missing data.
     */
    /*
     * A use clause describes the thing the reader asked about. Where they
     * asked for it to be absent, that clause describes what they didn't want,
     * so appending it to good news reads as nonsense: "FINN files it as a
     * small or compact car — is classified as an SUV."
     */
    const useClause = def.undesirable ? "" : entry.use;

    /* An SUV body is answered below, where its length can be said beside it. */
    if (measured && !(entry.id === "suvBody" && state === "listed")) {
        /*
         * A measurement says more beside something the reader can picture. It
         * is context, not a verdict: Lens never says a car is easy to park,
         * only how it compares with a typical bay.
         */
        const context = entry.id === "compactLength" ? parkingContext(car) : entry.id === "compactWidth" ? widthContext(car) : null;

        return {
            tone: met === false && def.undesirable ? "missing" : met ? "good" : "note",
            text:
                sentence(`${MEASURED_LEAD[entry.id] ?? "It's"} ${measured}${context ? `, ${context}` : ""}${met && useClause ? ` — ${useClause}` : ""}`) +
                (MEASURED_CAVEAT[entry.id] ? ` ${MEASURED_CAVEAT[entry.id]}` : ""),
        };
    }

    /*
     * A body style is a category, not a size. Where FINN files a car as an
     * SUV and its own measurements say it is shorter than most of the cars
     * here, both belong in the same sentence.
     */
    if (entry.id === "suvBody" && state === "listed") {
        const among = lengthAmong(car, cars);
        const measuredSize = among && among.shorterThan > among.total / 2 ? ` — though at ${measuredDisplay(car, "compactLength") ?? "its length"} it is shorter than ${among.shorterThan} of the ${among.total} other cars here` : "";

        return {
            tone: def.undesirable && !measuredSize ? "missing" : def.undesirable ? "note" : "good",
            text: `FINN files it as an SUV${measuredSize}.`,
        };
    }

    if (state === "unknown" && MEASURED_LEAD[entry.id]) {
        return { tone: "unknown", text: MEASURED_UNKNOWN[entry.id]! };
    }

    if (state === "listed") {
        return def.undesirable
            ? { tone: "missing", text: `${listedOnIt(entry.id)}, which you'd rather avoid.` }
            : { tone: "good", text: sentence(`${def.label} ${useClause ? `— ${useClause}` : "is listed"}`) };
    }

    if (state === "notListed") {
        return def.undesirable
            ? { tone: "good", text: `It isn't ${asPhrase(entry.id)}.` }
            : isKind(entry.id)
              ? /* A kind of car is something it is, not an item on a list. */
                { tone: "missing", text: `It isn't ${asPhrase(entry.id)}.` }
              : { tone: "missing", text: `${absent(entry.id)}.` };
    }

    return { tone: "unknown", text: `FINN doesn't say whether it has ${lower(def.label)}.` };
}

/** Why the car on the card isn't the best car here at any price, when nothing fits the limit. */
/*
 * Where the money goes, when it's the kilometres. Someone driving 1,540 km a
 * month is paying FINN for 1,040 of them on top of every price here, and
 * "nothing fits" without that reads as "the cars are too expensive".
 */
function mileageShare(run: LensRun): string {
    const cost = run.recommendation.context.costs[run.recommendation.winner.id];
    const excess = cost?.excessMileage;

    if (!excess?.amount || excess.amount < 0.15 * cost!.totalMonthly) return "";

    const km = (value: number) => `${value.toLocaleString("en-GB")} km`;
    const pack = excess.mileagePackage;

    if (pack && excess.excessKm <= 0) {
        return `About ${formatEUR(excess.amount)} of this car's figure is FINN's ${km(pack.km)} mileage package, which your distance needs.`;
    }

    if (pack) {
        return `About ${formatEUR(excess.amount)} of this car's figure is mileage: FINN's largest package (${km(pack.km)} a month) plus ${km(excess.excessKm)} a month beyond it at FINN's per-kilometre price.`;
    }

    if (excess.excessKm <= 0) return "";

    return `About ${formatEUR(excess.amount)} of this car's figure is FINN's per-kilometre charge for the ${km(excess.excessKm)} a month you drive beyond the ${km(excess.includedMonthlyKm)} it includes.`;
}

function nearestLine(run: LensRun, limit: number): StoryLine {
    const near = run.nearestToLimit!;
    const best = near.bestAtAnyPrice;
    const short = near.cheapest - limit;

    return {
        tone: "note",
        text: [
            `The cheapest car here comes to about ${formatEUR(near.cheapest)}/month all in, so Lens compared only the cars within ${formatEUR(near.upTo - near.cheapest)} of it${
                best ? ` — not the best match at any price, the ${best.name} at about ${formatEUR(best.monthly)}` : ""
            }.`,
            short > 0 ? `Getting under ${formatEUR(limit)} would take a car about ${formatEUR(short)} a month cheaper than anything on this page.` : "",
            mileageShare(run),
        ]
            .filter(Boolean)
            .join(" "),
    };
}

export function tellFitStory(
    run: LensRun,
    u: Understanding,
    lessRelevant: EvidenceId[],
    stillToKnow: WireQuestion | null,
    /**
     * Another car Lens ranked, to tell the same story about it instead of the
     * match: what it does for each of the reader's needs, read off that car.
     */
    carId: number | null = null,
): FitStory {
    const { recommendation, narrative } = run;
    const { context } = recommendation;
    const match = recommendation.winner;
    const winner = (carId != null ? recommendation.ranked.find((car) => car.id === carId) : null) ?? match;
    const other = winner.id !== match.id;
    const cars = context.vehicles;
    const name = (car: PinnedFinnCar) => carLabel(car, cars);
    const cost = context.costs[winner.id];
    const score = recommendation.scores.find((item) => item.vehicleId === winner.id);
    const total = totalFor(recommendation.scores, winner.id);
    const band: FitLevel = score?.judgeable ? bandForScore(total) : "unknown";
    const single = cars.length === 1;

    const sections: StorySection[] = [];

    const met = (car: PinnedFinnCar, entry: { id: EvidenceId; unwanted?: boolean }) =>
        evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true);

    /*
     * Another car the reader could take that has what this one lacks: within
     * their limits, the highest ranked, with its price and how it differs —
     * so "a car here has it" comes with which one.
     */
    const rivalFor = (entry: { id: EvidenceId; unwanted?: boolean }): StoryRival | undefined => {
        const car = recommendation.ranked.find((item) => item.id !== winner.id && isValid(run, item) && met(item, entry) === true);
        if (!car) return undefined;

        const unwanted = entry.unwanted ?? EVIDENCE[entry.id].undesirable === true;
        const theirs = context.costs[car.id];
        const shorter = lengthGap(car, winner, "this one");
        const does = unwanted ? (isKind(entry.id) ? "isn't one" : "doesn't have it") : measuredDisplay(winner, entry.id) ? "does better on it" : "has it";

        /* About another car's drawer, the car that has it can be the winner: called so, as every mention of it is. */
        const winning = car.id === match.id;

        return {
            id: car.id,
            name: name(car),
            ...(winning ? { winner: true } : {}),
            text: `${winning ? `The winner “${name(car)}”` : name(car)} ${does}${theirs ? `, at about ${formatEUR(theirs.totalMonthly)}/month` : ""}${u.budget?.kind === "hardMax" ? " — still within your maximum" : ""}${shorter ? `, and it's ${shorter}` : ""}.`,
        };
    };

    /* -- The budget ------------------------------------------------------ */

    if (u.budget && cost) {
        const monthly = cost.totalMonthly;
        const lines: StoryLine[] = [];
        let tone: Tone = "good";
        let title: string;

        if (u.budget.kind === "hardMax") {
            if (cost.budgetStatus === "within") {
                title = `It stays within your ${formatEUR(u.budget.monthly)} limit`;
                lines.push({ tone: "good", text: `At about ${formatEUR(monthly)}/month, it respects the maximum you gave me.` });
            } else if (cost.budgetStatus === "unknown") {
                tone = "unknown";
                title = `It may fit your ${formatEUR(u.budget.monthly)} limit`;
                lines.push({ tone: "unknown", text: `What Lens can estimate comes to ${formatEUR(monthly)}/month, but part of the cost is missing, so it can't confirm the car stays under your maximum.` });
            } else if (other) {
                /* Another car, over it: about this car, not "nothing here fits" — the match may well fit. */
                tone = "missing";
                title = `It's over your ${formatEUR(u.budget.monthly)} limit`;
                lines.push({
                    tone: "missing",
                    text: `At ${cost.complete ? "about" : "least"} ${formatEUR(monthly)}/month, it's ${cost.complete ? "" : "at least "}${formatEUR(monthly - u.budget.monthly)} over the maximum you gave me.`,
                });
            } else {
                tone = "missing";
                title = `Nothing here stays within ${formatEUR(u.budget.monthly)}`;
                lines.push({ tone: "missing", text: `This is the closest match, at about ${formatEUR(monthly)}/month — ${formatEUR(monthly - u.budget.monthly)} over the maximum you gave me.` });
            }

            if (run.nearestToLimit) lines.push(nearestLine(run, u.budget.monthly));

            const top = recommendation.topScorer;
            const topCost = context.costs[top.id];

            if (!other && recommendation.budgetChangedTheAnswer && top.id !== winner.id && topCost?.budgetStatus === "over") {
                lines.push({
                    tone: "note",
                    text: `${name(top)} scores higher overall, but at about ${formatEUR(topCost.totalMonthly)}/month it breaks your maximum, so I treated it as outside your options.`,
                });
            }
        } else {
            /*
             * A soft figure still draws a line — see `budgetCeiling`. Saying
             * where it was drawn is the difference between "you said around
             * €600" and a €1,353 car turning up as the answer.
             */
            const gap = monthly - u.budget.monthly;
            const ceiling = budgetCeiling(u.budget);
            const beyond = monthly > ceiling;

            tone = beyond ? "missing" : gap > 0 ? "note" : "good";
            title = beyond
                ? other
                    ? `Beyond the ${formatEUR(u.budget.monthly)} you mentioned`
                    : `Nothing here comes near the ${formatEUR(u.budget.monthly)} you mentioned`
                : gap > 0
                  ? gap <= u.budget.monthly * 0.1
                    ? `A little above the ${formatEUR(u.budget.monthly)} you mentioned`
                    : `${formatEUR(gap)} above the ${formatEUR(u.budget.monthly)} you mentioned`
                  : `Within the ${formatEUR(u.budget.monthly)} you mentioned`;
            lines.push({
                tone,
                text: beyond
                    ? other
                        ? `About ${formatEUR(monthly)}/month — ${formatEUR(gap)} above it, and past the ${formatEUR(ceiling)} Lens stretched to for a figure you called a target.`
                        : `The closest match costs about ${formatEUR(monthly)}/month — ${formatEUR(gap)} above it. Lens stretched to ${formatEUR(ceiling)} for a figure you called a target, and nothing here fits even that.`
                    : `About ${formatEUR(monthly)}/month${Math.abs(gap) >= 1 ? ` — ${formatEUR(Math.abs(gap))} ${gap > 0 ? "above" : "below"} it` : ""}. ${
                          u.budget.stretchTo
                              ? `You said you could stretch to ${formatEUR(u.budget.stretchTo)}, so Lens looked no further than that.`
                              : `You called it a figure to aim at rather than a limit, so Lens looked at cars up to about ${formatEUR(ceiling)} and no further.`
                      }`,
            });
        }

        if (u.budget.kind !== "hardMax" && run.nearestToLimit) lines.push(nearestLine(run, u.budget.monthly));

        sections.push({
            key: "budget",
            said: u.budget.said,
            title,
            short: u.budget.kind === "hardMax" ? `${formatEUR(u.budget.monthly)}/month maximum` : `Around ${formatEUR(u.budget.monthly)}/month`,
            kind: "budget",
            importance: "constraint",
            lines,
            summary: `About ${formatEUR(monthly)}/month`,
            tone,
        });
    }

    /*
     * With no budget there is no money section, and nowhere for the
     * kilometres to be said — yet for someone asking whether a 60 km commute
     * changes what makes sense, FINN's charge for the distance beyond what it
     * includes is most of the answer.
     */
    if (!u.budget && u.monthlyKm) {
        const share = mileageShare(run);

        if (share) {
            sections.push({
                key: "mileage",
                said: u.monthlyKm.said,
                title: "Your mileage is part of every price here",
                short: `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month`,
                kind: "budget",
                importance: "constraint",
                lines: [{ tone: "note", text: share }],
                summary: `About ${formatEUR(cost?.totalMonthly ?? 0)}/month`,
                tone: "note",
            });
        }
    }

    /* -- What they ruled out --------------------------------------------- */

    if (run.ruledOut) {
        const { evidence: rules, setAside, nothingLeft, withoutEach = [] } = run.ruledOut;
        const total = cars.length + (nothingLeft ? 0 : setAside);
        const asked = rules
            .map((rule) => (rule.mode === "without" ? `no ${barePhrase(rule.id)}` : asPhrase(rule.id)))
            .join(" and ");
        const kept = rules.every((rule) => rule.mode === "without");

        /*
         * Nothing has them all. That isn't Lens falling short: it's a choice
         * only the reader can make, so it's put to them — what each one costs
         * them, and which they'd let go of.
         */
        if (nothingLeft) {
            /* With one, letting it go brings every car back: nothing to weigh up. */
            const easing = rules.length > 1 ? [...withoutEach].filter((item) => item.fits > 0).sort((a, b) => b.fits - a.fits) : [];

            sections.push({
                key: "ruled-out",
                said: rules.map((rule) => rule.said).filter(Boolean)[0] ?? "",
                title: rules.length === 1 ? `No car here meets “${lowerFirst(demandOf(rules[0]!))}”` : "No car here has all of your deal-breakers",
                short: `${rules.length} deal-breakers`,
                kind: "budget",
                importance: "constraint",
                tone: "note",
                lines: [
                    {
                        tone: "note",
                        text:
                            rules.length === 1
                                ? cars.length === 1
                                    ? "The one car compared doesn't."
                                    : `None of the ${cars.length} cars compared does.`
                                : cars.length === 1
                                  ? `The one car compared doesn't meet ${rules.length === 2 ? "both" : `all ${rules.length}`} at once: ${listed(rules.map((rule) => lowerFirst(demandOf(rule))))}.`
                                  : `Of the ${cars.length} cars compared, none meets ${rules.length === 2 ? "both" : `all ${rules.length}`} at once: ${listed(rules.map((rule) => lowerFirst(demandOf(rule))))}.`,
                    },
                    ...easing.map((item) => ({
                        tone: "note" as const,
                        text: `Let go of “${lowerFirst(demandOf(item))}” and ${item.fits} ${item.fits === 1 ? "car fits" : "cars fit"} everything else.`,
                    })),
                    {
                        tone: "note",
                        /* By the time there's a pick to show, the reader has said to keep them. */
                        text: `You kept ${rules.length === 1 ? "it" : "them all"}, so this is the best fit for everything else you told me. To let ${rules.length === 1 ? "it" : "one"} go, change your deal-breakers and I'll judge again.`,
                    },
                ],
                summary: "No car here has them all",
            });
        } else {
            sections.push({
                key: "ruled-out",
                said: rules.map((rule) => rule.said).filter(Boolean)[0] ?? "",
                title: kept ? withoutSentence(rules.map((rule) => rule.id)) : mustSentence(rules.filter((rule) => rule.mode === "must").map((rule) => rule.id)),
                short: asked,
                kind: "budget",
                importance: "constraint",
                tone: "good",
                lines: [{ tone: "good", text: `You asked for ${asked}, so Lens set aside ${setAside} of ${total} cars here before ranking the rest.` }],
                summary: asked,
            });
        }
    }

    /* -- The rental period ----------------------------------------------- */

    if (u.rental && cost) {
        const contract = cost.contract;
        const problem = describeRentalProblem(contract);
        const lines: StoryLine[] = [];
        const period = `${monthLabel(u.rental.from)} to ${monthLabel(u.rental.to)}`;
        let tone: Tone = "good";

        if (problem) {
            tone = contract.status === "doesNotFit" ? "missing" : "unknown";
            lines.push({ tone, text: `It ${problem}.` });
        } else if (contract.term) {
            lines.push({
                tone: "good",
                text: `It can be rented for ${period}, on FINN's ${contract.term.months}-month term${contract.extraMonths ? ` — ${contract.extraMonths} month${contract.extraMonths === 1 ? "" : "s"} longer than you need, and FINN's data doesn't say you can end it early` : ""}.`,
            });

            if (u.rental.startDay && contract.term.deliveryFrom) {
                const start = `${u.rental.from}-${String(u.rental.startDay).padStart(2, "0")}`;
                const early = contract.term.deliveryFrom <= start;

                lines.push({
                    tone: early ? "good" : "note",
                    text: early
                        ? `FINN lists delivery from ${dayLabel(contract.term.deliveryFrom)}, before your ${dayLabel(start)} start.`
                        : `FINN's earliest delivery is ${dayLabel(contract.term.deliveryFrom)}, after the ${dayLabel(start)} you mentioned.`,
                });

                if (!early) tone = "note";
            }
        }

        sections.push({
            key: "rental",
            said: u.rental.said,
            /* "May not" only where FINN's data can't settle it: a term too short is a plain no. */
            title: !problem
                ? `It works for ${period}`
                : contract.status === "doesNotFit"
                  ? `It can't be rented for ${period}`
                  : `It may not work for ${period}`,
            short: period,
            kind: "rental",
            importance: "constraint",
            lines,
            summary: !problem
                ? contract.term ? `${contract.term.months}-month term` : "Dates unconfirmed"
                : contract.status === "doesNotFit" ? "Doesn't fit your dates" : "Dates unconfirmed",
            tone,
        });
    }

    /* -- The needs ------------------------------------------------------- */

    const active = u.needs.filter((need) => need.status === "active");
    /*
     * A need that is nothing but a rule — "Towbar", from "it must tow" — is
     * already answered above, where the rule is. Told again here it read
     * "It helps with towbar" under "It has a towbar".
     */
    const rules = new Set((run.ruledOut?.evidence ?? []).map((rule) => rule.id));
    const onlyARule = (need: (typeof active)[number]) =>
        need.evidence.length > 0 && need.evidence.every((entry) => (entry.mustHave || entry.unwanted) && rules.has(entry.id));

    for (const need of active.filter((item) => !onlyARule(item))) {
        /*
         * Lead with what the car does, then what it doesn't, then what nobody
         * can tell — and within each, the evidence that sets this car apart
         * first. ISOFIX on 22 of 24 cars is true and worth saying, but rear USB
         * ports on 11 of 24 is what actually distinguishes a car for the kids.
         */
        const share = (entry: { id: EvidenceId; unwanted?: boolean }) =>
            cars.filter((car) => evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === true).length;
        const orderOf: Record<Tone, number> = { good: 0, note: 1, missing: 2, unknown: 3 };

        const evidence = need.evidence.filter((entry) => !lessRelevant.includes(entry.id));
        const read = evidence
            .map((entry) => {
                const has = met(winner, entry);
                const rival = has === false ? rivalFor(entry) : undefined;
                const line: StoryLine = { ...evidenceLine(winner, entry, cars), reads: entry.id, met: has, ...(rival ? { rival } : {}) };

                return { entry, line, share: share(entry) };
            })
            .sort((a, b) => orderOf[a.line.tone] - orderOf[b.line.tone] || a.share - b.share);

        /*
         * Equipment nearly every car here has is true of this one and says
         * nothing about choosing it. Listed one by one, emergency braking and
         * lane keeping read as reasons — to someone who said they don't know
         * which safety features matter, the most useful thing Lens can tell
         * them is which ones don't separate the cars. So those go in one line,
         * after what does.
         */
        const common = cars.length >= 4
            ? read.filter(
                  (item) =>
                      item.line.tone === "good" &&
                      item.share / cars.length >= NEARLY_EVERY &&
                      /* A rule's own evidence is on every car left because of the rule. */
                      !item.entry.unwanted &&
                      !item.entry.mustHave &&
                      !EVIDENCE[item.entry.id].undesirable &&
                      !measuredDisplay(winner, item.entry.id),
              )
            : [];
        const lines = read.filter((item) => !common.includes(item)).map((item) => item.line);

        if (common.length) {
            /* "an automatic", "rear doors": each as it reads in a sentence, article and all. */
            const names = joinNames(common.map((item) => asPhrase(item.entry.id)));

            lines.push({
                tone: "note",
                text: lines.some((line) => line.tone === "good")
                    ? `It also has ${names}, but so does nearly every car here, so ${common.length === 1 ? "that doesn't" : "those don't"} set it apart.`
                    : `It has ${names} — as does nearly every car here, so ${common.length === 1 ? "that doesn't" : "those don't"} set it apart.`,
            });
        }

        /*
         * Emissions are a figure, not equipment. A need about them ("emissions
         * matter to me") has no equipment to point at, so the story used to
         * say "Lens has nothing on this car it can check" — while the engine
         * had just scored the car's CO₂ under Environmental Impact and ranked
         * on it. The reader was told the car wasn't judged on the one thing it
         * was judged on. Now the figure is said, against the other cars.
         */
        const emissions = need.priorities.includes("environmental")
            ? emissionsReading(winner, cars)
            : need.priorities.includes("efficiency")
              ? efficiencyReading(winner, cars)
              : null;

        /* Each of the figure's lines by its place, so a figure two needs judge on is said once. */
        const figureKind = need.priorities.includes("environmental") ? "co2" : "efficiency";
        if (emissions) lines.unshift(...emissions.lines.map((line, index) => ({ ...line, reads: `${figureKind}#${index}` })));

        /*
         * Only a bubble's own caveat — boot space, for lots to carry. What the
         * reader of typed words notes Lens can't check stays out of the story:
         * unasked-for lists of gaps were noise.
         */
        /* A bubble's own caveat, as the bubble words it — with this car's own figure, where FINN lists one: its boot size. */
        if (need.notInData && need.id.startsWith("bubble-")) {
            lines.push({ tone: "unknown", text: bubbleById(need.id.slice("bubble-".length))?.cantCheckFor?.(winner) ?? need.notInData });
        }

        if (!lines.length) {
            lines.push({ tone: "note", text: "Lens has nothing on this car it can check for this, so it didn't count toward the ranking." });
        }

        const good = evidence.filter((entry) => met(winner, entry) === true);
        const missing = evidence.filter((entry) => met(winner, entry) === false);

        /*
         * What nearly every car has is true of this one, but it isn't this
         * car helping more than another would: a need met only by that is
         * met at the level of the basics, and the title says so.
         */
        const onlyBasics = good.length > 0 && good.every((entry) => common.some((item) => item.entry.id === entry.id));
        const byEquipment: Tone = onlyBasics && !missing.length ? "note" : good.length && !missing.length ? "good" : good.length ? "note" : missing.length ? "missing" : "unknown";
        /* A need judged only by the figure takes the figure's verdict, and its words, everywhere. */
        const byFigure = emissions && !evidence.length ? emissions : null;
        const tone: Tone = byFigure ? byFigure.tone : byEquipment;
        /* A deal-sealer names one thing: whether the car has it, not "the basics for" it. */
        const sealed = need.id.startsWith("sealer-") && evidence.length === 1 ? evidence[0]! : null;

        sections.push({
            key: need.id,
            said: need.said,
            figure: byFigure ? { kind: figureKind, need: need.label } : undefined,
            title: byFigure
                ? byFigure.label
                : sealed
                  ? good.length
                      ? `It has ${asPhrase(sealed.id)}`
                      : missing.length
                        ? `It doesn't have ${asPhrase(sealed.id)}`
                        : `FINN doesn't say whether it has ${asPhrase(sealed.id)}`
                : tone === "good"
                    ? `It helps with ${lower(need.label)}`
                    : tone === "note" && onlyBasics && !missing.length
                      ? `It has the basics for ${lower(need.label)}`
                      : tone === "note"
                        ? `It partly covers ${lower(need.label)}`
                      : tone === "missing"
                        ? `It's weak on ${lower(need.label)}`
                        : `Lens can't tell much about ${lower(need.label)}`,
            /*
             * The heading on the card. For emissions, the verdict itself —
             * "Around-average emissions" — not the reader's wish, "Low
             * emissions", which read as a claim about the car.
             */
            short: byFigure ? byFigure.label : sealed ? `${need.label} would seal it` : need.label,
            kind: "need",
            importance: need.importance,
            lines,
            summary: good.length
                ? good.map((entry) => EVIDENCE[entry.id].label).join(", ")
                : missing.length
                  ? `No ${missing.map((entry) => lower(EVIDENCE[entry.id].label)).join(", ")}`
                  : emissions
                    ? (assessEnvironment(winner)?.co2?.display ?? "No CO₂ figure")
                    : "Nothing Lens can check",
            tone,
        });
    }

    /* -- The catch ------------------------------------------------------- */

    let catchNote: FitStory["catch"] = null;

    const hardMiss = sections.find((section) => section.kind !== "need" && section.tone === "missing");

    if (hardMiss) {
        catchNote = { text: hardMiss.lines[0]?.text ?? hardMiss.title, alternative: null };
    } else {
        /*
         * The catch worth leading with, among gaps in needs that matter:
         * first one another car within the limits actually solves, then the
         * more important need, then equipment most cars have — a missing
         * blind-spot warning on a car when most list one says more than
         * missing fog lights that few cars have at all.
         */
        const rank = { essential: 3, important: 2, niceToHave: 0 } as const;

        const gaps = active
            .filter((need) => need.importance !== "niceToHave")
            .flatMap((need) =>
                need.evidence
                    .filter(
                        (entry) =>
                            !lessRelevant.includes(entry.id) &&
                            evidenceMet(winner, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === false,
                    )
                    .map((entry) => {
                        const alternative =
                            recommendation.ranked.find(
                                (car) =>
                                    car.id !== winner.id &&
                                    isValid(run, car) &&
                                    evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === true,
                            ) ?? null;
                        const share =
                            cars.filter(
                                (car) => evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === true,
                            ).length / Math.max(cars.length, 1);

                        return { need, entry, alternative, score: (alternative ? 10 : 0) + rank[need.importance] * 2 + share };
                    }),
            )
            .sort((a, b) => b.score - a.score);

        const gap = gaps[0];

        if (gap) {
            const rival = gap.alternative ? rivalFor(gap.entry) : undefined;

            catchNote = {
                /* Named by the need's own label, so the sentence can't inherit a paraphrase's grammar. */
                text: (gap.entry.unwanted ?? EVIDENCE[gap.entry.id].undesirable)
                    ? `${listedOnIt(gap.entry.id, measuredDisplay(winner, gap.entry.id))} — worth weighing for ${lower(gap.need.label)}.`
                    : measuredDisplay(winner, gap.entry.id)
                      ? /*
                         * A figure that falls short is still a figure. "FINN
                         * doesn't list electric range" over a car FINN gives
                         * 320 km was false, and it hid the one comparison that
                         * mattered: that range against the trip they described.
                         */
                        `${MEASURED_LEAD[gap.entry.id] ?? "It's"} ${measuredDisplay(winner, gap.entry.id)} — worth weighing for ${lower(gap.need.label)}.`
                      : `${absent(gap.entry.id)} — worth weighing for ${lower(gap.need.label)}.`,
                alternative: rival
                    ? rival.text
                    : single
                      ? null
                      : measuredDisplay(winner, gap.entry.id)
                        ? "None of the other cars that fit your constraints does better on it."
                        : "None of the other cars that fit your constraints lists it either.",
                car: rival ? { id: rival.id, name: rival.name, ...(rival.winner ? { winner: true } : {}) } : null,
            };
        }

        /* The engine's trade-offs are the match's: another car's drawer doesn't borrow them. */
        if (!catchNote && !other && narrative.tradeoffs[0]) {
            const [tradeoff] = narrative.tradeoffs;
            catchNote = { text: tradeoff.sentences[0] ?? tradeoff.evidence, alternative: null, car: tradeoff.rival ? { id: tradeoff.rival.vehicleId, name: tradeoff.rival.name } : null };
        }
    }

    /* -- The label ------------------------------------------------------- */

    /* A target is a line too, so the eyebrow names it — in the words the reader used. */
    const hardBudget = u.budget?.kind === "hardMax" ? u.budget.monthly : null;
    const nearBudget = u.budget?.kind === "target" ? u.budget.monthly : null;

    /*
     * Two words, because the card underneath says the rest. This used to
     * carry the whole verdict — "Strongest match within your €450 limit" —
     * shouted in capitals above the car's own name, which read as a banner
     * rather than as an answer. Where nothing fits, that is worth the extra
     * clause; where something does, the sentence below says so.
     */
    const missed =
        recommendation.gearboxFallback === "noneFit"
            ? "nothing here is an automatic"
            : recommendation.rentalFallback === "noneFit"
              ? "nothing here fits your dates"
              : recommendation.isFallback && hardBudget != null
                ? `nothing here stays within ${formatEUR(hardBudget)}`
                : recommendation.isFallback && nearBudget != null
                  ? `nothing here comes near ${formatEUR(nearBudget)}`
                  : null;

    /*
     * "Best match" over a car the next line calls €457 too expensive reads as
     * a contradiction. The engine's fallback flag doesn't catch every way that
     * happens — a cost it can't complete is not "over budget" to it — so the
     * label follows what this card is about to say about the money.
     */
    /* A little over a figure they called a target is not "nothing fits": the card says by how much. */
    const overBudget = sections.some((section) => section.kind === "budget" && (section.tone === "missing" || section.tone === "unknown"));

    const eyebrow = other
        ? "Compared with your match"
        : single
        ? "How this car fits you"
        : missed
          ? `Closest match — ${missed}`
          : overBudget
            ? "Closest match"
            : "Best match";

    return {
        eyebrow,
        carName: name(winner),
        band,
        bandLabel: FIT_BANDS[band].label,
        bandMeaning:
            band === "unknown"
                ? `${BAND_MEANING.unknown.charAt(0).toUpperCase()}${BAND_MEANING.unknown.slice(1)}.`
                : `Lens rates it a ${FIT_BANDS[band].label.toLowerCase()}: ${BAND_MEANING[band]}, ${bandBasis(run)}.`,
        sections,
        catch: catchNote,
        stillToKnow,
    };
}

const STRENGTH: Record<StorySection["importance"], number> = { constraint: 3, essential: 2, important: 1, niceToHave: 0 };

/**
 * The story with each reading said once.
 *
 * Two needs can be answered by the same thing: "a greener car" and "using
 * little fuel" both by the fuel-use figure, "long distances" and "time in
 * traffic" both by Level 2 driver assistance. Told under each, the same
 * figure was drawn twice and the same line read twice, saying nothing new
 * the second time. So it's said under the first need that reads it, and
 * marked as counting for the others; a need left with nothing of its own is
 * named there instead of being a row of its own.
 */
export function sayOnce(story: FitStory): FitStory {
    const sections: StorySection[] = [];
    /* Each reading, with the line that says it and the row that line is in. */
    const said = new Map<string, { line: StoryLine; section: StorySection }>();

    const credit = (kept: { line: StoryLine; section: StorySection }, need: string) => {
        /* A figure's row is drawn as the figure, not as its lines: the row carries who else it counts for. */
        const target = kept.section.figure ? kept.section : kept.line;
        if (target.alsoFor?.includes(need) || (kept.section.figure?.need ?? kept.section.short) === need) return;
        target.alsoFor = [...(target.alsoFor ?? []), need];
    };

    for (const section of story.sections) {
        if (section.kind !== "need") {
            sections.push(section);
            continue;
        }

        const need = section.figure?.need ?? section.short;
        const lines: StoryLine[] = [];
        /* Named once in each row it shares with: a figure's three lines are one reading. */
        const credited = new Set<StorySection>();

        for (const line of section.lines) {
            const kept = line.reads ? said.get(line.reads) : undefined;

            if (kept) {
                if (!credited.has(kept.section)) credit(kept, need);
                credited.add(kept.section);
                /* What matters more to the reader, in either need, is how much the reading counts. */
                if (STRENGTH[section.importance] > STRENGTH[kept.section.importance]) kept.section.importance = section.importance;
                continue;
            }

            lines.push({ ...line });
        }

        /* A figure's row is the figure: once any of it has been said, all of it has. */
        if (!lines.length || (section.figure && lines.length < section.lines.length)) continue;

        const kept: StorySection = { ...section, lines };
        for (const line of lines) if (line.reads) said.set(line.reads, { line, section: kept });
        sections.push(kept);
    }

    return { ...story, sections };
}

/** For the model: what each ranked car has for each of the person's needs. */
export function evidenceForNeeds(run: LensRun, u: Understanding) {
    const ids = [...new Set(u.needs.filter((need) => need.status === "active").flatMap((need) => need.evidence.map((entry) => entry.id)))];

    if (!ids.length) return null;

    return run.recommendation.ranked.slice(0, 12).map((car) => ({
        car: carLabel(car, run.recommendation.context.vehicles),
        withinYourConstraints: isValid(run, car),
        /* A figure is sent as the figure: "listed" would read as an answer FINN's number can't give. */
        evidence: Object.fromEntries(
            ids.map((id) => [EVIDENCE[id].label, AMBIGUOUS_FIGURES.has(id) ? (measuredDisplay(car, id) ?? "unknown") : readEvidence(car, id)]),
        ),
    }));
}
