import { configurationName } from "@/lib/car-labels";
import type { PinnedFinnCar } from "@/lib/types";

/** A car's name, with its configuration where two pinned cars share one. */
export function carLabel(car: PinnedFinnCar, cars: PinnedFinnCar[]): string {
    const shared = cars.some((other) => other.id !== car.id && other.name === car.name);

    return shared ? `${car.name} ${configurationName(car)}` : car.name;
}
