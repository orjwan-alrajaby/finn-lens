import { ACTIVE_CHAT_KEY, CHATS_KEY, OPEN_BUBBLE_KEY, SETTINGS_KEY } from "./store";

/**
 * Everything Lens keeps, in the reader's terms, and how to let each part go.
 *
 * All of it lives in this browser's extension storage and nowhere else: there
 * is no server. A key written anywhere in Lens and missing here is a key the
 * reader can't delete — `data.test.ts` holds this list to the keys the code
 * uses.
 *
 * Deleting removes keys rather than writing empty values over them: an absent
 * key is what "never answered" means to the rest of Lens.
 */

export const CAR_CACHE_KEY = "loadedCarsFromFinnApi";
export const CHAT_SIZE_KEY = "finnLensChatSize";

export type DataGroupId = "chats" | "settings" | "cars" | "preferences" | "leftovers";

export interface DataGroup {
    id: DataGroupId;
    title: string;
    description: string;
    keys: string[];
    /** What deleting it means for the reader, said before they confirm. */
    consequence: string;
}

export const DATA_GROUPS: DataGroup[] = [
    {
        id: "chats",
        title: "Your chats",
        description: "Every conversation with Lens, and the judgement each one made. The chips on finn.com come from these.",
        keys: [CHATS_KEY, ACTIVE_CHAT_KEY],
        consequence: "Every chat goes, and the chips come off finn.com's cards.",
    },
    {
        id: "settings",
        title: "Your saved answers",
        description: "The answers you asked Lens to keep, so new chats start from them.",
        keys: [SETTINGS_KEY],
        consequence: "New chats will ask you everything again. Existing chats keep their own answers.",
    },
    {
        id: "cars",
        title: "Cars Lens has read",
        description: "FINN's details for the cars you've browsed past — prices, equipment, emissions — kept so Lens doesn't ask FINN twice.",
        keys: [CAR_CACHE_KEY],
        consequence: "Lens reads the cars again from FINN as you browse. Chats judged on cars it no longer holds will say so.",
    },
    {
        id: "preferences",
        title: "Small things Lens remembers",
        description: "The size you dragged the chat to, and a pending request to open the bubble.",
        keys: [CHAT_SIZE_KEY, OPEN_BUBBLE_KEY],
        consequence: "The chat opens at its usual size.",
    },
    {
        id: "leftovers",
        title: "From an earlier version of Lens",
        description: "Pinned cars, priorities, profiles and conversations kept by the version of Lens before the chat. Nothing reads them any more.",
        /* Everything the playground build wrote that this one doesn't. */
        keys: [
            "pinnedCars",
            "finnLensPreferences",
            "finnLensPriorities",
            "finnLensPriorityDefinitions",
            "finnLensProfiles",
            "finnLensCategoryFeatures",
            "finnLensDefaultProfileId",
            "finnLensBasedOn",
            "finnLensSession",
            "finnLensSessionHandOff",
            "finnLensSavedSearches",
            "finnLensJudgeBy",
            "finnLensChatTranscript",
            "finnLensOnboarding",
            "finnLensAi",
            "finnLensAiResting",
            "lensAi",
        ],
        consequence: "Nothing changes in how Lens works; this is only clearing out.",
    },
];

export interface DataSummary {
    /** Groups with anything stored in them. */
    present: DataGroupId[];
    chats: number;
    judged: number;
    hasSettings: boolean;
    cars: number;
    /** Roughly how much space the whole of it takes, in kB. */
    kilobytes: number;
}

export async function summarise(): Promise<DataSummary> {
    const stored = await browser.storage.local.get(null);
    const chats = Object.values((stored[CHATS_KEY] as Record<string, { judgement?: unknown }> | undefined) ?? {});
    const cars = (stored[CAR_CACHE_KEY] as { cars?: Record<string, unknown> } | undefined)?.cars ?? {};

    return {
        present: DATA_GROUPS.filter((group) => group.keys.some((key) => key in stored)).map((group) => group.id),
        chats: chats.length,
        judged: chats.filter((chat) => chat.judgement).length,
        hasSettings: Boolean(stored[SETTINGS_KEY]),
        cars: Object.keys(cars).length,
        kilobytes: Math.round(new Blob([JSON.stringify(stored)]).size / 1024),
    };
}

export async function clearGroups(ids: DataGroupId[]): Promise<void> {
    const keys = DATA_GROUPS.filter((group) => ids.includes(group.id)).flatMap((group) => group.keys);

    await browser.storage.local.remove(keys);
}
