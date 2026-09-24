import { create } from "zustand";

import {
    DEFAULT_CATEGORY_FEATURES,
    DEFAULT_DEFAULT_PROFILE_ID,
    DEFAULT_PREFERENCES,
    DEFAULT_PRIORITIES,
    DEFAULT_PRIORITY_DEFINITIONS,
    DEFAULT_PROFILES,
} from "@/lib/reasoning-engine/constants";

import { loadLensSettings, saveLensSettings } from "@/lib/reasoning-engine";

import type {
    CategoryId,
    FeatureSelection,
    LensPreferences,
    PriorityDefinition,
    Profile,
    SettingsBasis,
} from "@/lib/reasoning-engine/types";

/**
 * The answers behind one comparison, and nothing about where the reader is.
 *
 * There used to be a four-step wizard in front of the advice, and this store
 * carried its position, its history and the rules for walking it. All of that
 * is gone: the page opens on the answer, and the questions live in a drawer
 * beside it.
 *
 * Every field below is an input to the recommendation. Nothing that is only
 * about editing lives here — which drawer section is open, which feature card
 * is expanded, and above all the half-finished answer a reader is in the
 * middle of typing. The drawer holds its own draft and hands the whole set
 * over when they save it, and that boundary is what stops the page re-reasoning
 * under their hands on every keystroke.
 */

/** The three answers a reader can change without leaving the compare page. */
export interface Answers {
    priorities: CategoryId[];
    preferences: LensPreferences;
    /**
     * For every category rather than only the chosen priorities — so a
     * priority dropped from the order and picked up again still carries the
     * picks the reader made for it.
     */
    features: Record<CategoryId, FeatureSelection>;
    /** The profile these answers started from, or null once there is none. */
    basedOn: SettingsBasis;
}

interface CompareState extends Answers {
    /* ---------------------------------------------------------------- */
    /* The saved settings                                               */
    /* ---------------------------------------------------------------- */

    settingsLoaded: boolean;

    /** What the reader has saved, which is what "my saved values" restores. */
    savedPreferences: LensPreferences;

    /** The saved feature picks, and the starting point for a run. */
    savedCategoryFeatures: Record<CategoryId, FeatureSelection>;

    /**
     * The label, icon and on/off state of every priority, as Settings has
     * them. The drawer draws its list from these, so a priority switched
     * off there is not offered here.
     */
    priorityDefinitions: PriorityDefinition[];

    profiles: Profile[];

    /** Which profile is selected automatically when nothing else is. */
    defaultProfileId: string;

    /* ---------------------------------------------------------------- */
    /* What the reader is looking at                                    */
    /* ---------------------------------------------------------------- */

    /** On the page: the car in the hot seat. Null means the winner. */
    challengerId: number | null;

    /**
     * Bumped whenever answers arrive from somewhere other than the drawer —
     * Lens AI, today. The drawer seeds its draft once and keeps it across
     * closes, so without this it would go on holding the answers from before
     * and its Save would quietly put them back. Keying the drawer on this
     * re-seeds it from what the page is actually reasoning from.
     */
    answersRevision: number;

    /**
     * Whose answers the page is running: the reader's saved settings, or a
     * search — the chat's, or one they kept — by name.
     *
     * It decides whether a change made here is a change to the reader's
     * settings. Adjusting a search used to write its priority order into
     * their saved settings, because every change went through the same
     * `applyAnswers` that persists the order — so talking to Lens, then
     * tweaking what it found, quietly rewrote the settings the badges and
     * everything else judge by.
     */
    answersFrom: { kind: "settings" } | { kind: "search"; name: string };

    /* ---------------------------------------------------------------- */
    /* Actions                                                          */
    /* ---------------------------------------------------------------- */

    loadSettings: () => Promise<void>;

    /**
     * Take a new set of answers for this run: a drawer's saved draft, or a
     * change the reader accepted from Lens AI.
     */
    applyAnswers: (answers: Answers, from?: "drawer" | "lensAi" | "session") => void;

    setChallengerId: (id: number | null) => void;

    setAnswersFrom: (from: CompareState["answersFrom"]) => void;
}

/** A copy deep enough that editing this run can't reach the saved picks. */
export function copyFeatures(
    source: Record<CategoryId, FeatureSelection>,
): Record<CategoryId, FeatureSelection> {
    return Object.fromEntries(
        Object.entries(source).map(([categoryId, features]) => [
            categoryId,
            [...(features ?? [])],
        ]),
    ) as Record<CategoryId, FeatureSelection>;
}

/**
 * The reader's own priority order is the one thing the compare flow owns,
 * and saving it is what stops a profile reasserting itself over a
 * customised order on the next run. Preferences and feature picks made here
 * are deliberately not written back — those belong to Settings.
 */
function persistPriorities(priorities: CategoryId[], basedOn: SettingsBasis) {
    void saveLensSettings({ priorities, basedOn }).catch((error: unknown) => {
        console.error("Finn Lens: could not save priority order", error);
    });
}

export const useCompareStore = create<CompareState>((set, get) => ({
    settingsLoaded: false,
    savedPreferences: DEFAULT_PREFERENCES,
    savedCategoryFeatures: DEFAULT_CATEGORY_FEATURES,
    priorityDefinitions: DEFAULT_PRIORITY_DEFINITIONS,
    profiles: DEFAULT_PROFILES,
    defaultProfileId: DEFAULT_DEFAULT_PROFILE_ID,

    priorities: DEFAULT_PRIORITIES,
    preferences: DEFAULT_PREFERENCES,
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: DEFAULT_DEFAULT_PROFILE_ID,

    challengerId: null,
    answersRevision: 0,
    answersFrom: { kind: "settings" },

    /**
     * Read the saved settings in, once. Later calls are ignored on purpose:
     * this run's copies are the reader's answers, and a second read would
     * overwrite them with the stored values.
     */
    async loadSettings() {
        if (get().settingsLoaded) return;

        const settings = await loadLensSettings();

        set({
            settingsLoaded: true,
            savedPreferences: settings.preferences,
            savedCategoryFeatures: settings.categoryFeatures,
            priorityDefinitions: settings.priorityDefinitions,
            profiles: settings.profiles,
            defaultProfileId: settings.defaultProfileId,
            priorities: settings.priorities,
            preferences: settings.preferences,
            features: copyFeatures(settings.categoryFeatures),
            basedOn: settings.basedOn,
        });
    },

    /**
     * The whole set at once, because that is what a Save means.
     *
     * The order is persisted here and the rest is not, which is the same
     * split as before: there is one priority order and it belongs to the
     * reader, while what they tried out on today's shortlist belongs to
     * today's shortlist. The profile the order came from travels with it.
     *
     * The challenger is cleared because it names a car by id against the old
     * reasoning, and the new answers may not rank it anywhere near where it
     * was.
     */
    applyAnswers({ priorities, preferences, features, basedOn }, from = "drawer") {
        /*
         * A session is the conversation's own profile, carried onto this page
         * for this visit. Writing it to the reader's saved priorities would be
         * Lens changing their settings because they talked to it.
         */
        if (from !== "session" && get().answersFrom.kind === "settings") persistPriorities(priorities, basedOn);

        set((state) => ({
            priorities,
            preferences,
            features: copyFeatures(features),
            basedOn,
            challengerId: null,
            answersRevision:
                from === "drawer" ? state.answersRevision : state.answersRevision + 1,
        }));
    },

    setChallengerId(challengerId) {
        set({ challengerId });
    },

    setAnswersFrom(answersFrom) {
        set({ answersFrom });
    },
}));
