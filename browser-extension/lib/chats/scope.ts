import type { PageContext } from "@/lib/lens-chat/messages";
import type { FinnCar, PinnedFinnCar } from "@/lib/types";

/**
 * The cars a chat judges: the ones on the finn.com page it is open on.
 *
 * On a filtered listing that is the search rather than the cards drawn so far —
 * FINN draws a couple of dozen model cards at a time, one configuration each,
 * while the filters describe every configuration that matches. The drawn cards
 * come first so a car the reader can see is never the one left out.
 *
 * A card whose data hasn't reached Lens is counted and said, never scored on
 * a guess.
 */

export interface PageCars {
    cars: PinnedFinnCar[];
    /** "24 cars matching your filters". */
    headline: string;
    /** Cards drawn here that Lens has no data for. */
    missing: number;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function withConfig(url: string, id: number): string {
    try {
        const next = new URL(url);
        next.searchParams.set("selected_config", String(id));
        return next.toString();
    } catch {
        return url;
    }
}

/**
 * A car as the engine takes it. The engine's vehicle type still carries a URL
 * and a pinned date from when pinned cars were all it ranked; nothing that
 * scores reads the date.
 */
export function asJudgeable(car: FinnCar, page: PageContext | null): PinnedFinnCar {
    return {
        ...car,
        url: page?.carUrls[car.id] ?? (page && page.kind === "details" ? withConfig(page.url, car.id) : ""),
        pinnedAt: "",
    };
}

export function pageCars(page: PageContext | null, loaded: Record<number, FinnCar>): PageCars {
    const searched = page?.kind === "listing" && page.searchCars?.ids.length ? page.searchCars : null;
    const ids = [...new Set([...(page?.pageCarIds ?? []), ...(searched?.ids ?? [])])];
    const cars = ids.map((id) => loaded[id]).filter((car): car is FinnCar => car != null).map((car) => asJudgeable(car, page));

    return {
        cars,
        headline: searched ? `${plural(cars.length, "car")} matching your filters` : `${plural(cars.length, "car")} on this page`,
        missing: ids.length - cars.length,
    };
}

/**
 * A judgement with this page's cars added: this page's first, then the
 * ones judged before that aren't here. Judging the page alone dropped every
 * car judged on another page, and their chips with them.
 */
export function addedToJudgement(judged: PinnedFinnCar[], here: PinnedFinnCar[], hereHeadline: string): { cars: PinnedFinnCar[]; headline: string } {
    const onPage = new Set(here.map((car) => car.id));
    const before = judged.filter((car) => !onPage.has(car.id));

    if (!before.length) return { cars: here, headline: hereHeadline };

    return {
        cars: [...here, ...before],
        headline: `${plural(here.length + before.length, "car")}: ${here.length} from this page and ${before.length} judged before`,
    };
}

/** The cars a past judgement was about, as Lens holds them now. */
export function judgedCars(ids: number[], loaded: Record<number, FinnCar>): { cars: PinnedFinnCar[]; missing: number } {
    const cars = ids.map((id) => loaded[id]).filter((car): car is FinnCar => car != null).map((car) => asJudgeable(car, null));

    return { cars, missing: ids.length - cars.length };
}

export async function loadedCars(): Promise<Record<number, FinnCar>> {
    try {
        const stored = await browser.storage.local.get("loadedCarsFromFinnApi");
        const cars = (stored.loadedCarsFromFinnApi as { cars?: Record<number, FinnCar> } | undefined)?.cars;

        return cars && typeof cars === "object" ? cars : {};
    } catch {
        return {};
    }
}
