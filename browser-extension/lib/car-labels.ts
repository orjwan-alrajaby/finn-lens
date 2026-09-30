import {
    advertisedMonthlyPrice,
    formatEUR,
    formatNumber,
} from "@/lib/reasoning-engine";
import type { FitPriority } from "@/lib/reasoning-engine/fit";
import type { ContractType } from "@/lib/reasoning-engine/types";
import type { FinnCar } from "@/lib/types";

/**
 * How a car and its verdict are named, wherever they are shown.
 *
 * These lived in the in-page panel, which was the only surface that showed
 * them. There are now three — the panel, the pinned-cars page, and the
 * analysis on it — and a car labelled two ways is a car the reader has to
 * check is the same car. Moved here rather than exported from the panel
 * because that module reaches for the DOM at import time and an extension
 * page cannot have it.
 */

/**
 * Which configuration this is.
 *
 * FINN sells a Dolphin Surf as a Boost with 88 PS and as a Comfort with 156
 * PS, and the whole analysis changes between them. Every surface labels a
 * configuration with these same two lines, so a reader who picks one and
 * then reads two screens of prose never has to wonder which car it is about.
 */
export function configurationName(car: FinnCar): string {
    const named = [car.trim, car.equipmentLine].filter(Boolean).join(" ");

    return named || car.engine || `Configuration ${car.id}`;
}

/**
 * Names that tell the cars apart.
 *
 * A pinned set rarely held two configurations of one model; a search from the
 * chat routinely does — "70 cars matching your filters" has two Ford
 * Explorers — and every sentence the engine writes names a car by `name`, so
 * the page read "Ford Explorer finishes level with it". Only cars that share
 * a name get their configuration added; everything else is left as it was.
 */
export function distinctNames<T extends FinnCar>(cars: T[]): T[] {
    const counts = new Map<string, number>();

    for (const car of cars) counts.set(car.name, (counts.get(car.name) ?? 0) + 1);

    return cars.map((car) =>
        (counts.get(car.name) ?? 0) > 1 ? { ...car, name: `${car.name} ${configurationName(car)}`, modelName: car.name } : car,
    );
}

/** The model a car is, for a heading that shows its configuration on the line below. */
export const modelName = (car: FinnCar): string => (car as FinnCar & { modelName?: string }).modelName ?? car.name;

/**
 * What follows a monthly price: "/mo", or "/mo · business".
 *
 * FINN advertises two prices for every car and every Lens price is the one
 * for the contract the reader chose. The private price is the one FINN shows
 * by default, so it needs no label; the business one does, or a reader
 * comparing it with the price on FINN's own listing sees two numbers for one
 * car and no reason why.
 */
export function perMonth(contractType: ContractType): string {
    return contractType === "business" ? "/mo · business" : "/mo";
}

/** The figures a reader tells configurations apart by. */
export function configurationDetail(
    car: FinnCar,
    {
        withPrice = true,
        withPower = true,
        withFuel = true,
        contractType = "private",
    }: {
        /**
         * Whose price "from €…/mo" quotes. Pass the reader's own wherever the
         * line sits beside a cost built on it, so the two can't disagree.
         */
        contractType?: ContractType;
        /**
         * Drop the price where the surface already shows it. The pinned list
         * gives every car its price in its own column, and repeating it inside
         * the spec line spends the row's remaining width saying it twice.
         *
         * The in-page panel drops it for a different reason: it is standing on
         * FINN's own listing, where the reader has just read that number. A
         * panel that opens by repeating the page behind it has spent its first
         * line saying nothing.
         */
        withPrice?: boolean;
        /**
         * Same again for PS. It is here at all because two configurations of
         * one model can differ by power alone, and a reader choosing between
         * them needs to see it — but the panel is opened *from* a card, so
         * that choice is already made, and horsepower has no part in anything
         * the panel goes on to say.
         *
         * The cost of dropping it: two configurations distinguished only by
         * power read identically in the panel's subtitle. The photograph, the
         * trim name above it and the analysis below are all still that car's.
         */
        withPower?: boolean;
        /**
         * Drop the fuel type where the surface gives it a place of its own.
         * The panel does: what a car runs on decides which cohort its
         * consumption is judged against, so it belongs beside that judgement
         * rather than buried mid-way through a line of specs.
         */
        withFuel?: boolean;
    } = {},
): string {
    const range =
        car.electric?.range != null && car.electric.range !== "Unknown"
            ? `${formatNumber(Number(car.electric.range))} km range`
            : null;

    const price = advertisedMonthlyPrice(car, contractType);

    return [
        withPower && car.power?.inHp ? `${car.power.inHp} PS` : null,
        withFuel ? car.fuelType : null,
        range,
        withPrice && price
            ? `from ${formatEUR(price)}${perMonth(contractType)}`
            : null,
    ]
        .filter(Boolean)
        .join(" · ");
}

/**
 * What one priority's band was measured on, in one line.
 *
 * Two different counts, kept apart: how many of the reader's own picks the
 * car has, and how much of the category's catalogue it carries. The first is
 * what they asked for and the second is what the score counted.
 */
export function describeCoverage(priority: FitPriority): string {
    /*
     * The environmental line carries the car's own figure rather than a note
     * about how the priority works. Every other priority's subtitle says
     * something about this car — "3 of your 5 picks" — and "judged on
     * emissions, not on equipment" said something about Finn Lens instead,
     * in the one place a reader is scanning for the car.
     */
    if (priority.priority === "environmental") {
        /*
         * The number only: the class sits in its own pill under this header.
         * With no published figure, said as such, rather than falling through
         * to "Equipment not listed", which is about a different priority.
         */
        return priority.impact?.co2
            ? `${formatNumber(priority.impact.co2.gPerKm)} g of CO₂ per km`
            : "No CO₂ figure published";
    }

    /* Efficiency, likewise: the figure it was judged on, or why there isn't one. */
    if (priority.priority === "efficiency") {
        const consumption = priority.measurements.find((item) => item.label === "Consumption");

        return consumption ? `${consumption.display}, against others of its kind` : "No consumption figure to judge";
    }

    if (priority.band.level === "unknown") {
        return "Equipment not listed by FINN";
    }

    const picks = priority.picked.length;

    const held = priority.picked.filter(
        (feature) => feature.state === "present",
    ).length;

    const catalogue = `${priority.covered} of ${priority.catalogueSize} listed for this car`;

    return picks
        ? `${held} of your ${picks} pick${picks === 1 ? "" : "s"} · ${catalogue}`
        : catalogue;
}
