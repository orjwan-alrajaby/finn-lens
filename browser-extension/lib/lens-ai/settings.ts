/**
 * Whether Lens AI is on, and the Gemini key it uses.
 *
 * Off by default. Lens is a deterministic engine first: every recommendation,
 * score and explanation works without a model, and the AI only adds a way to
 * say things in your own words. Turning it on takes a key the reader creates
 * themselves, so there is never a shared or shipped credential.
 *
 * Stored in `storage.local` — this browser's extension storage, readable by
 * Finn Lens and not by websites — and listed on the Data tab so it can be
 * deleted like everything else Lens keeps.
 */

export const LENS_AI_KEY = "finnLensAi";

export interface LensAiSettings {
    enabled: boolean;
    apiKey: string;
    /**
     * Answer with Lens's built-in stand-in instead of Gemini: keyword rules
     * that produce the same shapes, for trying the chat without spending a
     * key's quota. Nothing leaves the browser while it's on.
     */
    simulated: boolean;
}

export const DEFAULT_LENS_AI_SETTINGS: LensAiSettings = { enabled: false, apiKey: "", simulated: false };

function read(value: unknown): LensAiSettings {
    const raw = (value ?? {}) as Partial<LensAiSettings>;

    return {
        enabled: raw.enabled === true,
        /*
         * The first token, not the whole field. A key copied out of a notes
         * file or an .env line arrives with a trailing comment attached, and
         * sending that gets a 401 the reader can only read as "my key is
         * wrong". Keys have no spaces in them.
         */
        apiKey: typeof raw.apiKey === "string" ? (raw.apiKey.trim().split(/\s+/)[0] ?? "") : "",
        simulated: raw.simulated === true,
    };
}

export async function loadLensAiSettings(): Promise<LensAiSettings> {
    try {
        return read((await browser.storage.local.get(LENS_AI_KEY))[LENS_AI_KEY]);
    } catch {
        return DEFAULT_LENS_AI_SETTINGS;
    }
}

export async function saveLensAiSettings(settings: LensAiSettings): Promise<void> {
    await browser.storage.local.set({ [LENS_AI_KEY]: read(settings) });
}

/** On, with a key to use. The only state in which anything calls a model. */
export const lensAiUsable = (settings: LensAiSettings): boolean =>
    settings.enabled && (settings.simulated || settings.apiKey.length > 0);

/** Calls back whenever the setting changes, from any page. Returns the unsubscribe. */
export function watchLensAiSettings(onChange: (settings: LensAiSettings) => void): () => void {
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
        if (area === "local" && LENS_AI_KEY in changes) onChange(read(changes[LENS_AI_KEY]?.newValue));
    };

    browser.storage.onChanged.addListener(listener);

    return () => browser.storage.onChanged.removeListener(listener);
}
