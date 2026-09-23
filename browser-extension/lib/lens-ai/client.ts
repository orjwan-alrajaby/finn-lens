import type {
    AskRequest,
    AskResult,
    ConverseRequest,
    ConverseResult,
    InterpretRequest,
    InterpretResult,
} from "./contract";
import { AdapterError, createGeminiAdapter, type Answered, type LensAiAdapter } from "./gemini";
import { createMockAdapter } from "./mock";
import { lensAiUsable, loadLensAiSettings } from "./settings";

/**
 * The extension's only door to a model.
 *
 * Nothing is called unless the reader turned Lens AI on in Settings and gave
 * it their own Gemini key. Every call resolves — to a result or to a reason —
 * so a missing key, a slow model or a malformed reply degrades one card on
 * the page and nothing else.
 */

export type AiCall<T> =
    | { ok: true; result: T; model: string | null; ms: number }
    | { ok: false; error: string };

/* Never a real key's value, so switching back to Gemini builds a real adapter. */
const SIMULATED = "\u0000simulated";

/* One adapter per key, so the models it learned are out of quota stay resting. */
let cached: { apiKey: string; adapter: LensAiAdapter } | null = null;

async function adapter(): Promise<LensAiAdapter | null> {
    const settings = await loadLensAiSettings();

    if (!lensAiUsable(settings)) return null;

    /* The stand-in has no key and no quota: one per page is plenty. */
    if (settings.simulated) {
        if (cached?.apiKey !== SIMULATED) cached = { apiKey: SIMULATED, adapter: createMockAdapter() };
        return cached.adapter;
    }

    if (cached?.apiKey !== settings.apiKey) {
        cached = { apiKey: settings.apiKey, adapter: createGeminiAdapter({ apiKey: settings.apiKey }) };
    }

    return cached.adapter;
}

/* Dev-only tracing, so a session with the experiment can be read back. */
function trace(label: string, payload: unknown) {
    if (import.meta.env?.DEV) {
        console.debug(`[Lens AI] ${label}`, payload);
    }
}

async function call<T>(
    route: string,
    request: unknown,
    run: (adapter: LensAiAdapter) => Promise<Answered<T>>,
): Promise<AiCall<T>> {
    const started = performance.now();
    const current = await adapter();

    if (!current) return { ok: false, error: "Lens AI is turned off. You can turn it on in Settings." };

    trace(`→ ${route}`, request);

    try {
        const { result, model } = await run(current);
        const ms = Math.round(performance.now() - started);

        trace(`← ${route} (${ms} ms, ${model})`, result);

        return { ok: true, result, model, ms };
    } catch (error) {
        trace(`✕ ${route}`, error);

        if (error instanceof AdapterError) return { ok: false, error: error.message };

        return {
            ok: false,
            error:
                error instanceof Error && /timeout|abort/i.test(`${error.name} ${error.message}`)
                    ? "Lens AI took too long to answer."
                    : "Lens AI couldn't reach Google right now.",
        };
    }
}

export const interpret = (request: InterpretRequest) =>
    call<InterpretResult>("interpret", request, (ai) => ai.interpret(request));

export const ask = (request: AskRequest) => call<AskResult>("ask", request, (ai) => ai.ask(request));

export const converse = (request: ConverseRequest) =>
    call<ConverseResult>("converse", request, (ai) => ai.converse(request));
