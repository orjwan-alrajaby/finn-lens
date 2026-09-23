import { GeminiKeyField } from "@/components/GeminiKeyField";
import type { LensAiSettings as Settings } from "@/lib/lens-ai/settings";

import { Section, Toggle } from "../components/primitives";

interface LensAiSettingsProps {
    settings: Settings;
    onChange: (settings: Settings) => void;
}

/**
 * Lens AI, switched on or off, and the reader's own Gemini key.
 *
 * Off is a complete product. Ask Lens is there on finn.com either way: Lens
 * asks its own questions, ranks with its own engine and explains in its own
 * words. What the model adds is reading — the reader types what they need
 * instead of tapping it, and Lens can ask back about what a sentence left out.
 * The switch can't be turned on without a key, and the key is checked with
 * Google as soon as it's entered (`GeminiKeyField`).
 */
export function LensAiSettings({ settings, onChange }: LensAiSettingsProps) {
    const key = settings.apiKey.trim();
    /* The stand-in needs no key, so it can switch Lens AI on by itself. */
    const usable = key.length > 0 || settings.simulated;

    return (
        <Section
            title="Lens AI"
            description="Optional, and off unless you turn it on. Ask Lens works without it — Lens asks the questions and you tap the answers. Switch it on and the same chat reads what you type instead. Either way the recommendations, scores and explanations come from Lens's own engine."
        >
            <div className="flex items-start justify-between gap-4 rounded-2xl bg-finn-snow p-4">
                <div>
                    <p className="text-sm font-black text-finn-black">Use Lens AI</p>
                    <p className="mt-1 text-xs leading-5 text-finn-iron">
                        {settings.enabled && usable
                            ? settings.simulated
                                ? "On, simulated: Lens AI Chat answers with Lens's built-in stand-in, not Gemini."
                                : "On: Ask Lens becomes Lens AI Chat, and you can describe what you need here and on the recommendation page."
                            : usable
                              ? "Off: Ask Lens stays Lens Chat — it asks, you tap."
                              : "Add a Gemini API key below to turn it on. Ask Lens works without one."}
                    </p>
                </div>
                <Toggle
                    checked={settings.enabled && usable}
                    disabled={!usable}
                    label={settings.enabled ? "Turn Lens AI off" : "Turn Lens AI on"}
                    onChange={(enabled) => onChange({ ...settings, enabled })}
                />
            </div>

            <div className="mt-5">
                <GeminiKeyField
                    apiKey={settings.apiKey}
                    onChange={(apiKey) => onChange({ ...settings, enabled: apiKey || settings.simulated ? settings.enabled : false, apiKey })}
                />
            </div>

            <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl bg-finn-snow p-4">
                <div>
                    <p className="text-sm font-black text-finn-black">Simulate Lens AI (for testing)</p>
                    <p className="mt-1 text-xs leading-5 text-finn-iron">
                        Answers with a built-in stand-in instead of Gemini — keyword rules that behave the way the model does,
                        so you can try the chat without using your key's free requests. Nothing is sent anywhere while it's on.
                        Type <code>mock:bad-quote</code>, <code>mock:invented-age</code>, <code>mock:empty</code> or{" "}
                        <code>mock:slow</code> into a message to check how Lens handles a model misbehaving.
                    </p>
                </div>
                <Toggle
                    checked={settings.simulated}
                    label={settings.simulated ? "Stop simulating Lens AI" : "Simulate Lens AI"}
                    onChange={(simulated) =>
                        onChange({ ...settings, simulated, enabled: simulated ? true : key ? settings.enabled : false })
                    }
                />
            </div>

            <div className="mt-5 space-y-2 rounded-2xl bg-finn-cotton/70 p-4 text-xs leading-5 text-finn-iron">
                <p>
                    <strong className="text-finn-black">What's sent, and where.</strong> With Lens AI on, what you type to Lens,
                    and the facts Lens shows you about the cars being discussed, go to Google's Gemini API using your key.
                    Nothing is sent while it's off.
                </p>
                <p>
                    On Gemini's free tier, Google may use that content to improve its products. Don't type anything into Lens
                    you wouldn't want shared that way.
                </p>
                <p>
                    Your key is stored in this browser's extension storage, where websites can't read it, and is only ever sent
                    to Google. You can remove it here or on the Data tab.
                </p>
                <p>
                    The free tier allows a small number of requests a day for each model. When they run out, Lens AI says so
                    and everything else keeps working.
                </p>
            </div>
        </Section>
    );
}
