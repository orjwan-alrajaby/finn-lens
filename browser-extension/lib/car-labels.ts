
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
    /* FINN's own words, spaced once: "141 FWD  Center-Line" arrives with two. */
    const named = [car.trim, car.equipmentLine].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    return named || car.engine?.replace(/\s+/g, " ").trim() || `Configuration ${car.id}`;
}

/** The model a car is, for a heading that shows its configuration on the line below. */
export const modelName = (car: FinnCar): string => (car as FinnCar & { modelName?: string }).modelName ?? car.name;
