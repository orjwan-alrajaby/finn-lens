import type { Answers } from "@/entrypoints/compare/store";
import { loadLensSettings } from "@/lib/reasoning-engine";
import type { CategoryId, FeatureSelection } from "@/lib/reasoning-engine/types";
import type { PinnedFinnCar } from "@/lib/types";

import { allowedByRules } from "./run";
import { loadSession, nameFor, SESSION_KEY, type LensSession } from "./session";

/**
 * Whose answers Lens is judging cars by, outside the chat.
 *
 * Before the chat, there was one answer: the reader's saved settings, used by
 * the fit badges on FINN's cards, the panel on a car, the pinned cars page and
 * the recommendation. The chat builds a second — what the reader told it,
 * with their filters — and for a while the two lived side by side without
 * saying which was which: a car could be the chat's strong match and wear a
 * "partial match" badge on the same page.
 *
 * So there is one rule, read by every surface from here:
 *
 * - while the chat has a result, the reader's cars are judged by it, and
 *   every surface says "by your chat";
 * - with no conversation, or after "New conversation", they're judged by the
 *   saved settings, and every surface says "by your settings";
 * - the reader can switch between the two in one tap, and that choice holds
 *   until the chat produces its next result.
 *
 * The chat's answers never become the reader's settings here. Saving them is
 * something the reader does on purpose ("Save as my settings").
 */

export const JUDGE_BY_KEY = "finnLensJudgeBy";

/** The saved settings' keys: a change to any of them changes the settings answer. */
const SETTINGS_KEYS = ["finnLensPreferences", "finnLensPriorities", "finnLensCategoryFeatures", "finnLensBasedOn"];

export type Judging =
    | {
          by: "chat";
          answers: Answers;
          session: LensSession;
      }
    | {
          by: "settings";
          answers: Answers;
          /** The chat's search, when there is one to switch to. */
          chat: LensSession | null;
      };

const copy = (features: Record<CategoryId, FeatureSelection>): Record<CategoryId, FeatureSelection> =>
    Object.fromEntries(Object.entries(features).map(([id, list]) => [id, [...(list ?? [])]])) as Record<CategoryId, FeatureSelection>;

export async function currentJudging(): Promise<Judging> {
    const [settings, session, preferred] = await Promise.all([
        loadLensSettings(),
        loadSession(),
        browser.storage.local
            .get(JUDGE_BY_KEY)
            .then((stored) => stored[JUDGE_BY_KEY] as "chat" | "settings" | undefined)
            .catch(() => undefined),
    ]);

    if (session && preferred !== "settings") return { by: "chat", answers: session.answers, session };

    return {
        by: "settings",
        answers: {
            priorities: settings.priorities,
            preferences: settings.preferences,
            features: copy(settings.categoryFeatures),
            basedOn: settings.basedOn,
        },
        chat: session,
    };
}

/** The reader's one-tap switch. Held until the chat's next result. */
export async function judgeBy(by: "chat" | "settings"): Promise<void> {
    try {
        await browser.storage.local.set({ [JUDGE_BY_KEY]: by });
    } catch {
        /* The switch simply doesn't hold; nothing else depends on it. */
    }
}

/** Calls back whenever the answer to "judged by what?" may have changed. Returns the unsubscribe. */
export function watchJudging(onChange: () => void): () => void {
    const keys = [SESSION_KEY, JUDGE_BY_KEY, ...SETTINGS_KEYS];
    const listener = (changes: Record<string, unknown>, area: string) => {
        if (area === "local" && keys.some((key) => key in changes)) onChange();
    };

    browser.storage.onChanged.addListener(listener);

    return () => browser.storage.onChanged.removeListener(listener);
}

/** What a surface says about where its verdicts come from. */
export function judgingLabel(judging: Judging): { short: string; long: string; switchTo: string | null } {
    if (judging.by === "chat") {
        return {
            short: "By your chat",
            /*
             * A chat search built from "get a match from my Lens settings"
             * is the settings plus the page's filters, and says so: calling
             * it "your chat" alone would claim a conversation that didn't
             * happen.
             */
            long:
                judging.session.basis === "settings"
                    ? `Judged by your chat's search: ${nameFor(judging.session)} — your saved settings plus the filters you used`
                    : `Judged by your chat with Lens: ${nameFor(judging.session)}`,
            switchTo: "Use my settings instead",
        };
    }

    return {
        short: "By your settings",
        long: "Judged by your saved Lens settings",
        switchTo: judging.chat ? "Use my chat instead" : null,
    };
}

/**
 * Whether the chat's own rules set this car aside — "not an SUV", "electric
 * only". The chat never ranks such a car, so a badge judging by the chat says
 * so rather than grading it as if the rule weren't there.
 */
export function setAsideByChat(judging: Judging, car: PinnedFinnCar): boolean {
    if (judging.by !== "chat" || !judging.session.rules?.length) return false;

    return allowedByRules([car], judging.session.rules).length === 0;
}
