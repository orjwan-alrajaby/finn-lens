import { existsSync, readFileSync } from "node:fs";

import { AdapterError } from "@/lib/lens-ai/gemini";

/**
 * Every Gemini key in lens-ai-server/.env, used one after another.
 *
 * The free tier gives each key twenty requests a day per model, and a round
 * of ten conversations needs more than one key's worth. So the harness stays
 * on one key until every model on it has said its day is spent, then moves to
 * the next — commented-out lines included, since that's where spare keys
 * live. A key is never printed: it's named by the note beside it
 * ("# master account") or by its line.
 */

export interface GeminiKey {
    key: string;
    /** "master account", or "line 3". */
    name: string;
}

/** Keys in the order the file lists them, the uncommented one first. */
export function readKeys(envFile: string): GeminiKey[] {
    if (process.env.GEMINI_API_KEY) return [{ key: process.env.GEMINI_API_KEY, name: "GEMINI_API_KEY" }];
    if (!existsSync(envFile)) return [];

    const keys = readFileSync(envFile, "utf8")
        .split("\n")
        .map((row, index) => {
            const match = row.match(/^\s*(#)?\s*GEMINI_API_KEY\s*=\s*["']?([^\s"'#]+)["']?\s*(?:#\s*(.*))?$/);

            return match
                ? { key: match[2]!, name: match[3]?.trim() || `line ${index + 1}`, active: !match[1] }
                : null;
        })
        .filter((item): item is GeminiKey & { active: boolean } => item != null);

    const ordered = [...keys.filter((item) => item.active), ...keys.filter((item) => !item.active)];

    /* The same key twice is one key; it keeps whichever copy carries a note. */
    return ordered
        .filter((item, index) => ordered.findIndex((other) => other.key === item.key) === index)
        .map(({ key, name }) => ({
            key,
            name: ordered.find((other) => other.key === key && !/^line \d+$/.test(other.name))?.name ?? name,
        }));
}

type Outcome = "spent" | "busy" | "fatal";

/** What a failure means for the rotation: this model is done today, try again, or stop. */
function classify(error: unknown): Outcome {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof AdapterError && error.status === 429 && /today's free/.test(message)) return "spent";
    if (/rejected the Gemini API key|None of Lens AI's/.test(message)) return "spent";
    if (error instanceof AdapterError && error.status === 422) return "fatal";

    /* Per-minute limits, overload, time-outs and unreadable replies: worth another go. */
    return "busy";
}

export class KeyRotation {
    private spent = new Set<string>();
    private current = 0;

    constructor(
        private readonly keys: GeminiKey[],
        private readonly models: string[],
        private readonly log: (line: string) => void = (line) => console.log(`[keys] ${line}`),
    ) {
        if (!keys.length) throw new Error("No GEMINI_API_KEY in the environment or lens-ai-server/.env");
    }

    private isSpent(key: GeminiKey) {
        return this.models.every((model) => this.spent.has(`${key.key}:${model}`));
    }

    /**
     * Runs one call, on the current key's first model with quota left.
     *
     * Overloaded models are tried in turn on the same key before anything
     * waits, and a key is only left behind once all its models are spent —
     * trying the next key on every 503 spends its quota on Google's bad
     * minute rather than on the conversation.
     */
    async run<T>(call: (key: string, model: string) => Promise<T>, { rounds = 8, pauseMs = 20_000 } = {}): Promise<T> {
        let last: unknown = null;

        /* Only a wait on an overloaded Google uses up a round; moving to another key doesn't. */
        for (let waited = 0; waited < rounds; ) {
            while (this.current < this.keys.length && this.isSpent(this.keys[this.current]!)) {
                this.log(`${this.keys[this.current]!.name}: every model has used today's quota`);
                this.current += 1;
                if (this.current < this.keys.length) this.log(`switching to ${this.keys[this.current]!.name}`);
            }

            const key = this.keys[this.current];

            if (!key) throw new Error("Every Gemini key in .env has used today's free quota on every model.");

            for (const model of this.models) {
                const pair = `${key.key}:${model}`;
                if (this.spent.has(pair)) continue;

                try {
                    return await call(key.key, model);
                } catch (error) {
                    last = error;

                    const outcome = classify(error);

                    if (outcome === "fatal") throw error;
                    if (outcome === "spent") {
                        this.spent.add(pair);
                        this.log(`${key.name}: ${model} is out for today`);
                    }
                }
            }

            /* Everything on this key was busy rather than spent: give Google a moment. */
            if (!this.isSpent(key)) {
                waited += 1;
                await new Promise((resolve) => setTimeout(resolve, pauseMs));
            }
        }

        throw last;
    }
}
