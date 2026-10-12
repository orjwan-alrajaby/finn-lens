import { assessEfficiency, assessEnvironment } from "@/lib/reasoning-engine/environmental";
import type { FinnCar } from "@/lib/types";

/**
 * A car at a glance, as tags under its name in the drawer: what it runs on,
 * how much it uses, and how much CO₂ it puts out.
 *
 * Each is the engine's own reading of what FINN lists, with the figure it
 * rests on — "Efficient · 4.7 L/100km", "Low emissions · Class B" — so a tag
 * never says more than the figure does. How much it uses is against cars
 * that run on the same thing, as the engine judges it; a plug-in hybrid gets
 * no such tag, since FINN's one figure for it mixes fuel and electricity. A
 * figure FINN doesn't list gives no tag at all.
 */

export type CarTagTone = "neutral" | "good" | "middling" | "poor";

export interface CarTag {
    id: "fuel" | "use" | "co2";
    label: string;
    /** The figure it rests on: "4.7 L/100km", "Class B". */
    figure?: string;
    tone: CarTagTone;
}

const FUEL: Record<NonNullable<FinnCar["fuelType"]>, string> = {
    Petrol: "Petrol",
    Diesel: "Diesel",
    Electric: "Electric",
    "Plug-in Hybrid": "Plug-in hybrid",
};

export function carTags(car: FinnCar): CarTag[] {
    const tags: CarTag[] = [];

    if (car.fuelType && FUEL[car.fuelType]) tags.push({ id: "fuel", label: FUEL[car.fuelType], tone: "neutral" });

    const use = assessEfficiency(car);
    if (use) {
        const electric = car.fuelType === "Electric";
        tags.push(
            use.level === "high"
                ? { id: "use", label: "Efficient", figure: use.display, tone: "good" }
                : use.level === "moderate"
                  ? { id: "use", label: "Moderate use", figure: use.display, tone: "middling" }
                  : { id: "use", label: electric ? "Power-hungry" : "Thirsty", figure: use.display, tone: "poor" },
        );
    }

    const co2 = assessEnvironment(car)?.co2;
    if (co2) {
        const figure = `Class ${co2.className}`;
        tags.push(
            co2.level === "none"
                ? { id: "co2", label: "No tailpipe CO₂", figure, tone: "good" }
                : co2.level === "low"
                  ? { id: "co2", label: "Low emissions", figure, tone: "good" }
                  : co2.level === "moderate"
                    ? { id: "co2", label: "Moderate emissions", figure, tone: "middling" }
                    : { id: "co2", label: "High emissions", figure, tone: "poor" },
        );
    }

    return tags;
}
