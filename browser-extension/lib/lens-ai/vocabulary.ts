import {
    CATEGORIES,
    CATEGORY_IDS,
    FEATURE_IMPORTANCE,
    MAX_PRIORITIES,
    MIN_PRIORITIES,
    PROFILES,
    SIGNALS,
} from "@/lib/reasoning-engine/constants";
import type {
    CategoryDef,
    CategoryId,
    ProfileId,
    SignalId,
} from "@/lib/reasoning-engine/types";
import type { LensVocabulary } from "./contract";

/**
 * Lens's own vocabulary, written out for a language model to map onto.
 *
 * Everything here is read from the engine's constants rather than restated,
 * so a priority added, renamed or re-scoped there reaches the model without
 * anyone remembering to update a prompt. The server holds instructions; the
 * extension holds what the words mean.
 */
export function buildVocabulary(enabled: CategoryId[] = CATEGORY_IDS): LensVocabulary {
    return {
        categories: enabled.map((id) => {
            const def = CATEGORIES[id] as CategoryDef;
            const niche = new Set(def.niche ?? []);

            return {
                id,
                label: def.label,
                question: def.question,
                description: def.description,
                measured: def.measured ?? null,
                features: def.features.map((key: SignalId) => ({
                    id: key,
                    label: SIGNALS[key].label,
                    explanation: SIGNALS[key].explanation,
                    niche: niche.has(key),
                })),
            };
        }),

        profiles: (Object.keys(PROFILES) as ProfileId[]).map((id) => ({
            id,
            label: PROFILES[id].label,
            forWhom: PROFILES[id].forWhom,
            priorities: [...PROFILES[id].priorities],
        })),

        importance: (["low", "medium", "high"] as const).map((id) => ({
            id,
            label: FEATURE_IMPORTANCE[id].label,
            meaning: FEATURE_IMPORTANCE[id].meaning,
        })),

        rules: [
            `Priorities are ranked, not rated. Pick ${MIN_PRIORITIES} to ${MAX_PRIORITIES} and order them; position alone decides how much each counts (for five: 33/27/20/13/7 percent). There is no "high" or "low" setting for a priority.`,
            "Inside a priority, up to five of that priority's own features may be raised to Somewhat, Moderately or Highly. A feature can only be raised under the priority listed as its home.",
            "Price is never a priority. The monthly budget is a single hard figure in euros per month (subscription + estimated energy + excess mileage) that decides which cars may win; it never adds points.",
            "Monthly mileage (km per month) feeds the cost estimate only. FINN includes 500 km per month.",
            "Contract type is private or business, and only selects which advertised price is used.",
            "A rental period is a start month and an end month (both included, as YYYY-MM). FINN rents on fixed terms (typically 6, 12, 18 or 24 months) and Lens prices each car on the shortest term that covers the period, with nothing paid upfront. Like the budget it decides which cars can win and never adds points: a car with no long-enough term, or that FINN can't deliver in the start month, only wins if nothing else fits. Lens has no day-level dates and can't model ending a contract early.",
            "Applying a profile replaces the order and the raised features with the profile's own.",
        ],

        notModelled: [
            "Crash-test results or crash protection",
            "Rear legroom, number of child seats that fit across the back",
            "Boot space (FINN's figure is ambiguous, so it is not scored)",
            "Fast-charging speed, charging network access, real-world winter range",
            "How a car drives, handles, rides or accelerates",
            "Reliability, resale value, brand reputation",
            "Insurance, maintenance, tyres and registration costs",
            "Exact delivery days (Lens works in months), colours",
            "Towing capacity (only whether a towbar is listed)",
        ],
    };
}
