import type { FinnCar, PinnedFinnCar } from "@/lib/types";

/**
 * Everything Finn Lens has put in browser storage, and how to take it back
 * out.
 *
 * The extension could only ever accumulate. Settings could be restored to
 * their defaults, but a pinned car was permanent, the browsing cache grew
 * for as long as the reader used finn.com, and nothing anywhere said what
 * was being kept. For a tool that reads a shopping site and stores what you
 * looked at, "you cannot see it and you cannot delete it" is the wrong
 * answer twice over.
 *
 * So this file is the single list of what is stored, in the reader's terms
 * rather than in storage keys — and clearing works the way clearing browsing
 * data works, by category, with a plain count of what each one holds so the
 * decision is informed rather than brave.
 *
 * Anything added to storage anywhere in the extension belongs in `GROUPS`.
 * A key that isn't here is a key the reader has no way to delete.
 */

export type StoredDataGroupId =
    | "settings"
    | "pinnedCars"
    | "browsingCache"
    | "setup"
    | "lensAi"
    | "lensChat"
    | "searches";

export interface StoredDataGroup {
    id: StoredDataGroupId;
    label: string;
    /** What it is, and what deleting it actually costs the reader. */
    description: string;
    /** The consequence, stated plainly. Shown when it is selected. */
    consequence: string;
    keys: string[];
}

export const STORED_DATA_GROUPS: StoredDataGroup[] = [
    {
        id: "settings",
        label: "Your settings",
        description:
            "Your priority order, the features you raised inside each one, which profiles are switched on, and your driving assumptions.",
        consequence:
            "Lens goes back to its defaults and stops scoring cars on finn.com until you answer again.",
        keys: [
            "finnLensPreferences",
            "finnLensPriorities",
            "finnLensPriorityDefinitions",
            "finnLensProfiles",
            "finnLensCategoryFeatures",
            "finnLensDefaultProfileId",
            "finnLensBasedOn",
        ],
    },
    {
        id: "pinnedCars",
        label: "Pinned cars",
        description:
            "The cars you pinned to compare, with the full details FINN published for each at the time you pinned it.",
        consequence:
            "There is nothing left to compare until you pin something again.",
        keys: ["pinnedCars"],
    },
    {
        id: "browsingCache",
        label: "Browsing cache",
        description:
            "Cars FINN's own pages loaded while you browsed. Lens keeps them so the side panel and the card badges don't have to ask FINN again for a car the page already fetched.",
        consequence:
            "Nothing is lost that finn.com won't hand back — the cache refills as you browse.",
        keys: ["loadedCarsFromFinnApi"],
    },
    {
        id: "setup",
        label: "Setup progress",
        description:
            "Whether you have been through the setup flow, and which getting-started steps you have finished.",
        consequence:
            "The getting-started checklist comes back in the popup. The setup flow itself is always available from this page.",
        keys: ["finnLensOnboarding"],
    },
    {
        id: "lensAi",
        label: "Lens AI key",
        description:
            "Whether Lens AI is switched on, the Gemini API key you gave it, and which models are out of free requests for now.",
        consequence:
            "Lens AI turns off and forgets your key. Everything else in Lens keeps working; you can add the key again in Settings.",
        keys: ["finnLensAi", "finnLensAiResting"],
    },
    {
        id: "lensChat",
        label: "Your conversation with Lens",
        description:
            "Everything you and Lens said in Ask Lens, from the first message: what you told it, the questions it asked and your answers, the cars it recommended, and what you did — pins, kept searches, changes you tried. Also the search its latest result was built from, which badges and pages judge by while it lasts, your choice between judging by the chat or your settings, and the size you gave the chat window.",
        consequence:
            "Ask Lens starts with an empty conversation next time, and badges and pages go back to judging by your saved settings. Your pinned cars, kept searches and settings stay as they are.",
        keys: ["finnLensChatTranscript", "finnLensSession", "finnLensSessionHandOff", "finnLensJudgeBy", "finnLensChatSize"],
    },
    {
        id: "searches",
        label: "Your kept searches",
        description:
            "The searches you chose to keep from conversations with Lens: what you told it, its answers and the cars it compared. They're listed under Searches in Settings.",
        consequence: "They're gone from Settings and from the recommendation page. Your conversation and your settings stay as they are.",
        keys: ["finnLensSavedSearches"],
    },
];

/** What one group currently holds, in the reader's terms. */
export interface StoredDataCount {
    id: StoredDataGroupId;
    /** True when there is anything at all to delete. */
    present: boolean;
    /** "3 cars", "Saved", "Nothing stored" — never a byte count. */
    summary: string;
}

/**
 * How many entries a record-shaped value holds, tolerating whatever is
 * actually there. Storage is shared with earlier builds and can be edited by
 * hand, so a malformed value counts as empty rather than throwing.
 */
function countEntries(value: unknown): number {
    if (!value || typeof value !== "object" || Array.isArray(value)) return 0;

    return Object.keys(value as Record<string, unknown>).length;
}

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/**
 * What is in storage right now, group by group.
 *
 * Read in one call rather than four, so the page can never show a reader a
 * mixture of two different moments.
 */
export async function summariseStoredData(): Promise<StoredDataCount[]> {
    const keys = STORED_DATA_GROUPS.flatMap((group) => group.keys);

    let stored: Record<string, unknown> = {};

    try {
        stored = (await browser.storage.local.get(keys)) as Record<
            string,
            unknown
        >;
    } catch (error) {
        console.error("Finn Lens: could not read what is stored", error);
    }

    const pinned = countEntries(stored.pinnedCars);

    const cached = countEntries(
        (stored.loadedCarsFromFinnApi as { cars?: unknown } | undefined)?.cars,
    );

    const settingsKeys = STORED_DATA_GROUPS.find(
        (group) => group.id === "settings",
    )!.keys.filter((key) => stored[key] !== undefined);

    const setupPresent = stored.finnLensOnboarding !== undefined;

    const ai = stored.finnLensAi as { enabled?: boolean; apiKey?: string } | undefined;

    return [
        {
            id: "settings",
            present: settingsKeys.length > 0,
            summary:
                settingsKeys.length > 0
                    ? "Saved — Lens is using your answers"
                    : "Nothing saved — Lens is using its defaults",
        },
        {
            id: "pinnedCars",
            present: pinned > 0,
            summary:
                pinned > 0 ? plural(pinned, "car", "cars") : "No cars pinned",
        },
        {
            id: "browsingCache",
            present: cached > 0,
            summary:
                cached > 0
                    ? plural(cached, "car cached", "cars cached")
                    : "Nothing cached",
        },
        {
            id: "setup",
            present: setupPresent,
            summary: setupPresent ? "Recorded" : "Nothing recorded",
        },
        {
            id: "lensAi",
            present: ai !== undefined,
            summary: ai?.apiKey
                ? ai.enabled
                    ? "Key saved — Lens AI is on"
                    : "Key saved — Lens AI is off"
                : "No key saved",
        },
    ];
}

/**
 * Delete the chosen groups, and nothing else.
 *
 * `storage.local.remove` rather than writing empty values: an empty record is
 * still a record, and `hasSavedLensSettings` and `needsOnboarding` both read
 * "this key is absent" as "this reader has never answered". Leaving `{}`
 * behind would delete the reader's settings while leaving the product
 * convinced they had configured it.
 */
export async function clearStoredData(
    groups: StoredDataGroupId[],
): Promise<void> {
    const keys = STORED_DATA_GROUPS.filter((group) =>
        groups.includes(group.id),
    ).flatMap((group) => group.keys);

    if (keys.length === 0) return;

    await browser.storage.local.remove(keys);
}

/** Every group, for the "delete everything" path. */
export const ALL_STORED_DATA_GROUPS: StoredDataGroupId[] =
    STORED_DATA_GROUPS.map((group) => group.id);

/* -------------------------------------------------------------------------- */
/* Pinned cars                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reading and unpinning, for the pages that manage the pinned set.
 *
 * The content script has its own copy of this because it may not import
 * anything that touches the DOM, and these two functions are the whole of
 * what an extension page needs.
 */
export async function loadPinnedCars(): Promise<PinnedFinnCar[]> {
    try {
        const stored = await browser.storage.local.get("pinnedCars");

        const value = stored.pinnedCars as
            | Record<number, PinnedFinnCar>
            | undefined;

        return value ? Object.values(value) : [];
    } catch (error) {
        console.error("Finn Lens: could not read your pinned cars", error);

        return [];
    }
}

/**
 * Unpin some cars.
 *
 * Read-modify-write against whatever is in storage at the moment of the
 * write, rather than against a list the page read earlier: a car pinned on
 * finn.com while this page was open must not be dropped by a removal here.
 */
export async function unpinCars(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    const stored = await browser.storage.local.get("pinnedCars");

    const current = (stored.pinnedCars ?? {}) as Record<
        number,
        PinnedFinnCar
    >;

    const next = { ...current };

    for (const id of ids) delete next[id];

    await browser.storage.local.set({ pinnedCars: next });
}

/**
 * The browsing cache, as cars.
 *
 * Used by the page that scores a car the reader has not pinned — the cache
 * already holds everything finn.com showed them, so a car can be examined
 * without asking FINN for it again.
 */
export async function loadCachedCars(): Promise<FinnCar[]> {
    try {
        const stored = await browser.storage.local.get(
            "loadedCarsFromFinnApi",
        );

        const value = stored.loadedCarsFromFinnApi as
            | { cars?: Record<number, FinnCar> }
            | undefined;

        const cars = value?.cars;

        if (!cars || typeof cars !== "object" || Array.isArray(cars)) {
            return [];
        }

        return Object.values(cars);
    } catch (error) {
        console.error("Finn Lens: could not read the browsing cache", error);

        return [];
    }
}
