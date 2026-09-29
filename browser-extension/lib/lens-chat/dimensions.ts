import { lengthMm, widthMm } from "@/lib/reasoning-engine/evidence";
import type { FinnCar } from "@/lib/types";

/**
 * What a car's measurements mean next to the spaces it has to fit into.
 *
 * Lens can say how long a car is. It cannot say whether a car is easy to
 * park — that depends on the street, the driver and the day. What it can do
 * is put the measurement beside a space the reader can picture, and beside
 * the other cars in front of them, and leave the judgement to them.
 *
 * The figures below are the typical German ones, and they are typical rather
 * than universal:
 *
 * - A perpendicular bay is commonly 2.50 m × 5.00 m. State garage ordinances
 *   (Garagenverordnungen) set the minimum nearer 2.30 m × 5.00 m, and older
 *   multi-storey car parks are often at that minimum.
 * - A parallel bay on the street is longer, commonly 5.70–6.70 m, because a
 *   car has to steer into it.
 * - A residential lane is around 2.75–3.25 m wide.
 *
 * Nothing here is scored. `cityParking` already scores measured length on its
 * own curve; this is only how the number is said out loud.
 */

export const TYPICAL_BAY = {
    /** Perpendicular bay, the common German size. */
    lengthM: 5,
    widthM: 2.5,
    /** The narrower minimum many garages are built to. */
    narrowWidthM: 2.3,
    /** Parallel parking on the street needs room to steer in. */
    parallelLengthM: 6,
} as const;

const metres = (mm: number): number => mm / 1000;
const round = (value: number): string => value.toFixed(value < 1 ? 2 : 1).replace(/\.0+$/, "");

/** "1 m shorter than a typical 5 m bay", or null when FINN gives no length. */
export function parkingContext(car: FinnCar): string | null {
    const mm = lengthMm(car);

    if (!mm) return null;

    const spare = TYPICAL_BAY.lengthM - metres(mm);

    if (spare >= 0.15) return `about ${round(spare)} m shorter than a typical ${TYPICAL_BAY.lengthM} m parking bay`;
    if (spare <= -0.05) return `about ${round(Math.abs(spare))} m longer than a typical ${TYPICAL_BAY.lengthM} m parking bay`;

    return `within a few centimetres of a typical ${TYPICAL_BAY.lengthM} m parking bay`;
}

/** What the width leaves either side of the car in a common bay. */
export function widthContext(car: FinnCar): string | null {
    const mm = widthMm(car);

    if (!mm) return null;

    const spare = (TYPICAL_BAY.widthM - metres(mm)) / 2;

    if (spare <= 0) return `wider than a ${TYPICAL_BAY.widthM} m bay before the mirrors are counted`;

    return `about ${Math.round(spare * 100)} cm either side in a ${TYPICAL_BAY.widthM} m bay, before the mirrors`;
}

/** Where this car sits among the ones in front of the reader, by length. */
export function lengthAmong(car: FinnCar, cars: FinnCar[]): { shorterThan: number; total: number } | null {
    const mine = lengthMm(car);
    const others = cars.filter((item) => item.id !== car.id).map(lengthMm).filter((value): value is number => Boolean(value));

    if (!mine || others.length < 2) return null;

    return { shorterThan: others.filter((value) => value > mine).length, total: others.length };
}

/**
 * "43 cm shorter than the Qashqai", for two cars the reader is weighing.
 *
 * Null below 15 cm: a difference nobody would notice in a parking space is
 * not worth a sentence, and saying "about the same length" where the reader
 * asked about something else is noise.
 */
export function lengthGap(car: FinnCar, other: FinnCar, otherName: string): string | null {
    const mine = lengthMm(car);
    const theirs = lengthMm(other);

    if (!mine || !theirs) return null;

    const centimetres = Math.round(Math.abs(mine - theirs) / 10);

    if (centimetres < 15) return null;

    return `${centimetres} cm ${mine < theirs ? "shorter" : "longer"} than ${otherName}`;
}
