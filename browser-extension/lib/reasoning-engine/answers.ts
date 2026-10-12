import type { CategoryId, FeatureSelection, LensPreferences, SettingsBasis } from "./types";

/**
 * The answers behind one judgement: everything the engine is given that came
 * from the reader rather than from FINN.
 *
 * A chat builds these from what the reader told it (`toAnswers`), and so do
 * the reader's saved settings. The engine never needs to know which.
 */
export interface Answers {
    priorities: CategoryId[];
    preferences: LensPreferences;
    /**
     * For every category rather than only the chosen priorities — so a
     * priority dropped from the order and picked up again still carries the
     * picks made for it.
     */
    features: Record<CategoryId, FeatureSelection>;
    /** The profile these answers started from, or null once there is none. */
    basedOn: SettingsBasis;
}

/** A copy deep enough that editing one set of answers can't reach another. */
export function copyFeatures(
    source: Record<CategoryId, FeatureSelection>,
): Record<CategoryId, FeatureSelection> {
    return Object.fromEntries(
        Object.entries(source).map(([categoryId, features]) => [categoryId, [...(features ?? [])]]),
    ) as Record<CategoryId, FeatureSelection>;
}
