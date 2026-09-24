import type { Answers } from "@/entrypoints/compare/store";
import type { ScopeKind } from "@/lib/lens-ai/contract";
import type { FinnCar, PinnedFinnCar } from "@/lib/types";

import { allowedByRules } from "./run";
import type { Rule, SessionProfile, Understanding } from "./understanding";

/**
 * The search a conversation built, kept where the rest of Lens can find it.
 *
 * Without this the chat on finn.com and the recommendation page are two
 * products: a reader explains their life to one of them and then meets the
 * other still running last month's saved settings. The session is the bridge —
 * the temporary profile, what it was built from, and enough of the
 * conversation to recognise it later.
 *
 * It is never Lens's saved settings. Carrying it over applies it to the page
 * in front of the reader; saving it keeps a copy they can come back to. Both
 * leave their saved priorities and profiles exactly as they were.
 */

export const SESSION_KEY = "finnLensSession";

/**
 * The reader asked for this search on the recommendation page.
 *
 * A session sitting in storage means "this is what they were just doing"; it
 * doesn't mean they want the recommendation page to be about it. Pressing
 * "Open the recommendation page" in the chat does, and this is how that
 * intent travels the one hop between them — read once, by the page, then
 * cleared, so a tab opened tomorrow doesn't inherit it.
 */
export const HANDOFF_KEY = "finnLensSessionHandOff";
export const SAVED_SEARCHES_KEY = "finnLensSavedSearches";

/** How long a carried-over session still counts as "what I was just doing". */
const FRESH_FOR_MS = 12 * 60 * 60 * 1000;

export interface LensSession {
    /** When the conversation last compared cars. */
    at: string;
    /** Which set of cars it was about, in the chat's own words. */
    scope: ScopeKind;
    headline: string;
    /** What Lens said it understood, for showing the reader what they're continuing. */
    summary: string;
    focus: SessionProfile["focus"];
    rules: Rule[];
    /** The whole understanding, so a later turn can carry on from it. */
    understanding: Understanding;
    /** What the engine was given. Applied on the recommendation page as-is. */
    answers: Answers;
    /** The cars the chat was comparing, so the page can say what changed. */
    carIds: number[];
    /** The car it recommended, for continuity of the answer itself. */
    winnerId: number | null;
}

export interface SavedSearch extends LensSession {
    id: string;
    name: string;
    /** The reader's own words, kept so a search is recognisable months later. */
    note: string;
}

const read = async <T>(key: string, fallback: T): Promise<T> => {
    try {
        return ((await browser.storage.local.get(key))[key] as T) ?? fallback;
    } catch {
        return fallback;
    }
};

/** The session the chat last compared with, if it's recent enough to mean anything. */
export async function loadSession(): Promise<LensSession | null> {
    const session = await read<LensSession | null>(SESSION_KEY, null);

    if (!session?.at || !session.answers) return null;

    return Date.now() - new Date(session.at).getTime() < FRESH_FOR_MS ? session : null;
}

export async function saveSession(session: LensSession): Promise<void> {
    try {
        await browser.storage.local.set({ [SESSION_KEY]: session });
    } catch (error) {
        console.error("Finn Lens: could not carry this conversation over", error);
    }
}

export async function clearSession(): Promise<void> {
    try {
        await browser.storage.local.remove(SESSION_KEY);
    } catch {
        /* Nothing to do: the banner simply stays until the tab is reloaded. */
    }
}

/** How long a hand-off from the chat still counts as this journey. */
const HANDOFF_FOR_MS = 5 * 60 * 1000;

/** The chat is opening the page for this search. */
export async function markHandOff(): Promise<void> {
    try {
        await browser.storage.local.set({ [HANDOFF_KEY]: { at: new Date().toISOString() } });
    } catch {
        /* Without it the page simply asks, which is the behaviour anywhere else. */
    }
}

/** Was this page opened from the chat? Answers once: the flag is cleared here. */
export async function takeHandOff(): Promise<boolean> {
    const flag = await read<{ at?: string } | null>(HANDOFF_KEY, null);

    if (!flag?.at) return false;

    try {
        await browser.storage.local.remove(HANDOFF_KEY);
    } catch {
        /* Nothing to do: at worst the next visit reads a stale flag it then clears. */
    }

    return Date.now() - new Date(flag.at).getTime() < HANDOFF_FOR_MS;
}

export const loadSavedSearches = (): Promise<SavedSearch[]> => read<SavedSearch[]>(SAVED_SEARCHES_KEY, []);

/**
 * Keep a search the reader asked to keep.
 *
 * Newest first, and capped: these are shortcuts back into a conversation, not
 * an archive, and a list nobody can read is a list nobody uses.
 */
export async function saveSearch(search: SavedSearch): Promise<SavedSearch[]> {
    const kept = [search, ...(await loadSavedSearches()).filter((item) => item.id !== search.id)].slice(0, 12);

    await browser.storage.local.set({ [SAVED_SEARCHES_KEY]: kept });

    return kept;
}

export async function deleteSearch(id: string): Promise<SavedSearch[]> {
    const kept = (await loadSavedSearches()).filter((item) => item.id !== id);

    await browser.storage.local.set({ [SAVED_SEARCHES_KEY]: kept });

    return kept;
}

/** A name a reader will recognise: what they were looking for, not when. */
export function nameFor(session: LensSession): string {
    const focus = session.focus.slice(0, 2).map((item) => item.label);

    if (focus.length) return focus.join(" · ");

    return session.summary.split(/[.;—]/)[0]?.trim() || "A search with Lens";
}


/** The cars a search was about, as the recommendation page ranks them. */
export interface SearchCars {
    cars: PinnedFinnCar[];
    /** Cars the chat compared that Lens no longer holds (sold, withdrawn, cleared from its cache). */
    missing: number;
    /** Cars the reader's own rules set aside, as the chat did. */
    setAside: number;
}

/**
 * The cars a conversation actually compared, for the recommendation page.
 *
 * The page used to rank the reader's pinned cars whatever it was opened for.
 * The chat, meanwhile, had compared the page's cars — "76 cars matching your
 * filters" — so "Open the full recommendation" landed on a different answer
 * about different cars, or, with nothing pinned, on "Nothing to compare yet".
 * These are the chat's own cars: the reader's pinned copy where there is one,
 * otherwise the copy Lens holds from FINN, with the same rules applied the
 * chat applied. Where the rules leave nothing, every car comes back, as in the
 * chat.
 */
export async function carsForSearch(search: LensSession): Promise<SearchCars> {
    const stored = await browser.storage.local.get(["pinnedCars", "loadedCarsFromFinnApi"]);
    const pinned = (stored.pinnedCars ?? {}) as Record<number, PinnedFinnCar>;
    const loaded = ((stored.loadedCarsFromFinnApi as { cars?: Record<number, FinnCar> } | undefined)?.cars ?? {}) as Record<number, FinnCar>;

    const cars = search.carIds
        .map((id) => pinned[id] ?? (loaded[id] ? ({ ...loaded[id], url: "", pinnedAt: "" } as PinnedFinnCar) : null))
        .filter((car): car is PinnedFinnCar => car != null);
    const allowed = allowedByRules(cars, search.rules ?? []);

    return {
        cars: allowed.length ? allowed : cars,
        missing: search.carIds.length - cars.length,
        setAside: allowed.length ? cars.length - allowed.length : 0,
    };
}
