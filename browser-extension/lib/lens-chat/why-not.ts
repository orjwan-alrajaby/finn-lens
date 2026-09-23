import { formatEUR } from "@/lib/reasoning-engine";
import { CATEGORIES, SIGNALS } from "@/lib/reasoning-engine/constants";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import type { CategoryId, SignalId } from "@/lib/reasoning-engine/types";
import { carLabel } from "@/lib/lens-ai/outcome";
import type { PinnedFinnCar } from "@/lib/types";

import type { LensRun } from "./run";

/**
 * "Why not that one?", answered by Lens rather than by a model.
 *
 * The reader names a car; the engine already holds every reason it isn't the
 * match — the two scores, the priority each one wins, the equipment only one
 * lists, the money, and whether it was eligible at all. A model asked the same
 * question answers from the winner's own summary sentence, which says "this
 * car" and never names either of them, so the reader is told what the card
 * already said and nothing about the car they asked about.
 *
 * Every sentence here is read off the result: no scoring, no ranking, and
 * nothing said about a car that FINN's data doesn't carry.
 */

export interface WhyNot {
    carId: number;
    /** What the reader asked about, and what it lost to. */
    car: string;
    match: string;
    sentences: string[];
}

/** The car a question like "why not the MG 4?" is about, if it is about one. */
export function carNamed(run: LensRun, text: string): PinnedFinnCar | null {
    const cars = run.recommendation.context.vehicles;
    const asked = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    if (!asked) return null;

    const named = run.recommendation.ranked
        .filter((car) => car.id !== run.recommendation.winner.id)
        .map((car) => ({ car, name: carLabel(car, cars).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() }))
        .filter((item) => item.name.length > 2 && asked.includes(item.name));

    /* The longest name that fits: "MG 4 Urban" over "MG 4" where both are here. */
    return named.sort((a, b) => b.name.length - a.name.length)[0]?.car ?? null;
}

/* "Rear USB ports" belongs in a sentence as "rear USB ports", never "rear usb ports". */
const lower = (value: string) => (/^(I\b|[A-Z]{2,})/.test(value) ? value : `${value.charAt(0).toLowerCase()}${value.slice(1)}`);

const names = (keys: SignalId[], limit = 3): string =>
    keys
        .map((key) => (SIGNALS[key]?.label ? lower(SIGNALS[key].label) : ""))
        .filter(Boolean)
        .slice(0, limit)
        .join(", ");

const joined = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

export function whyNot(run: LensRun, carId: number): WhyNot | null {
    const { recommendation } = run;
    const { context } = recommendation;
    const match = recommendation.winner;
    const car = recommendation.ranked.find((item) => item.id === carId);

    if (!car || car.id === match.id) return null;

    const name = (vehicle: PinnedFinnCar) => carLabel(vehicle, context.vehicles);
    const score = (vehicle: PinnedFinnCar) => totalFor(context.scores, vehicle.id);
    const detail = (vehicle: PinnedFinnCar, category: CategoryId) =>
        context.scores.find((item) => item.vehicleId === vehicle.id)?.details[category];
    const cost = (vehicle: PinnedFinnCar) => context.costs[vehicle.id];

    const sentences: string[] = [];

    /* -- What ruled it out, where something did ---------------------------- */

    const theirs = cost(car);
    const mine = cost(match);
    const difference = theirs?.complete && mine?.complete ? Math.round(theirs.totalMonthly - mine.totalMonthly) : null;

    if (theirs?.budgetStatus === "over" && theirs.budget != null) {
        sentences.push(
            `The ${name(car)} comes to about ${formatEUR(theirs.totalMonthly)} a month, over the ${formatEUR(theirs.budget)} you gave me, so it couldn't win whatever it carries.`,
        );
    } else if (theirs?.contract.status === "doesNotFit") {
        sentences.push(`The ${name(car)} doesn't fit the dates you gave me, so it couldn't win.`);
    }

    /* -- The two scores, in the reader's own terms -------------------------- */

    const level = score(car) === score(match);

    if (level && difference != null && difference > 0) {
        sentences.push(
            `Lens can't tell them apart on what it checks — the ${name(match)} and the ${name(car)} both come out at ${score(match)} out of 100 — so it took the cheaper: ${formatEUR(mine!.totalMonthly)} a month against ${formatEUR(theirs!.totalMonthly)}.`,
        );
    } else if (level) {
        sentences.push(`Both come out at ${score(match)} out of 100 on what Lens checks, so there's little in it.`);
    } else if (!sentences.length) {
        sentences.push(`Lens took the ${name(match)} at ${score(match)} out of 100 against the ${name(car)}'s ${score(car)}.`);
    }

    /* -- Where the match is ahead, and what carries it ---------------------- */

    const ahead: string[] = [];
    const behind: string[] = [];

    for (const category of context.priorities) {
        const ours = detail(match, category);
        const other = detail(car, category);

        if (!ours?.assessed || !other?.assessed) continue;

        const rank = context.weights.find((item) => item.priority === category)?.rank;
        const where = `${CATEGORIES[category].label.toLowerCase()}${rank ? ` (your #${rank})` : ""}`;

        if (ours.exactScore > other.exactScore) {
            /* Only what FINN confirms the other car hasn't: an unknown is not a gap. */
            const only = ours.matched.filter((key) => other.missing.includes(key));

            /* "it" rather than the name again: the sentence has just said whose side this is. */
            ahead.push(only.length ? `${where}, where it lists ${names(only)} and the ${name(car)} doesn't` : where);
        } else if (other.exactScore > ours.exactScore) {
            const only = other.matched.filter((key) => ours.missing.includes(key));

            behind.push(only.length ? `${where}, where it has ${names(only, 2)}` : where);
        }
    }

    if (ahead.length) {
        sentences.push(`The ${name(match)} is ahead on ${joined(ahead.slice(0, 2))}.`);
    } else if (!level) {
        sentences.push(`Nothing you ranked separates them by much; the ${name(match)} simply covers a little more of it.`);
    }

    /* -- What the reader would gain by taking it anyway --------------------- */

    const gains: string[] = [];

    if (behind.length) gains.push(`it's ahead on ${joined(behind.slice(0, 2))}`);
    if (difference != null && difference < 0) gains.push(`it's ${formatEUR(Math.abs(difference))} a month cheaper`);

    if (gains.length) sentences.push(`The ${name(car)} isn't beaten everywhere: ${joined(gains)}.`);

    return { carId: car.id, car: name(car), match: name(match), sentences };
}
