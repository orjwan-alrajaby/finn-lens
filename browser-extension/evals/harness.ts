import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { copyFeatures, type Answers } from "@/entrypoints/compare/store";

import { KeyRotation, readKeys } from "./keys";
import { buildLensFacts } from "@/lib/lens-ai/context";
import type { ConverseRequest, ConverseResult, WireQuestion } from "@/lib/lens-ai/contract";
import { buildVocabulary } from "@/lib/lens-ai/vocabulary";
import { evidenceCatalogue } from "@/lib/lens-chat/evidence";
import { evidenceForNeeds, finnsOwnWords, quotesAreFinns, tellFitStory } from "@/lib/lens-chat/fit-story";
import { heardLines, matchSentence } from "@/lib/lens-chat/plain";
import { alternativesWithinLimits, runLens, summariseMatch, type LensRun } from "@/lib/lens-chat/run";
import {
    EMPTY_UNDERSTANDING,
    groundInWhatWasSaid,
    missingEssentials,
    readQuestion,
    readSuggestions,
    readUnderstanding,
    ruledOut,
    toAnswers,
    toWire,
    waiveEssential,
    type Understanding,
} from "@/lib/lens-chat/understanding";
import {
    DEFAULT_CATEGORY_FEATURES,
    DEFAULT_PREFERENCES,
    DEFAULT_PRIORITIES,
} from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";
import type { PinnedFinnCar } from "@/lib/types";

/**
 * A conversation with Lens, outside the browser.
 *
 * Runs the same steps `LensChat.talk` does — the same request, the same model,
 * the same checks on what comes back — over FINN's committed fleet snapshot,
 * and writes down everything a reader would see and everything the engine was
 * given. Model replies are cached by request, so the deterministic half can be
 * changed and re-read without spending the key's free quota; set
 * LENS_EVAL_FRESH=1 to ask the model again.
 */

/* gemini.ts remembers resting models in extension storage; here, in memory. */
const memory: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).browser ??= {
    storage: {
        local: {
            get: async (key: string) => ({ [key]: memory[key] }),
            set: async (items: Record<string, unknown>) => Object.assign(memory, items),
        },
    },
};

const here = dirname(fileURLToPath(import.meta.url));

const MODELS = (process.env.LENS_EVAL_MODELS ?? "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview").split(",");

/* One rotation for the whole run, so a key spent in one conversation stays spent in the next. */
let rotation: KeyRotation | null = null;
const keys = () => (rotation ??= new KeyRotation(readKeys(join(here, "../../lens-ai-server/.env")), MODELS));

const CACHE = process.env.LENS_EVAL_CACHE ?? join(here, ".cache");
const FRESH = process.env.LENS_EVAL_FRESH === "1";

async function converse(request: ConverseRequest): Promise<{ result: ConverseResult; model: string | null }> {
    /* The built-in stand-in: no key, no quota, no cache needed. */
    if (process.env.LENS_EVAL_MOCK === "1") {
        const { createMockAdapter } = await import("@/lib/lens-ai/mock");
        return createMockAdapter().converse(request);
    }

    const { createGeminiAdapter } = await import("@/lib/lens-ai/gemini");
    const { CONVERSE_INSTRUCTIONS } = await import("@/lib/lens-ai/prompts");

    /* The prompt is part of the key: a changed instruction is a new question. */
    const key = createHash("sha256")
        .update(CONVERSE_INSTRUCTIONS)
        .update(JSON.stringify({ ...request, today: undefined }))
        .digest("hex")
        .slice(0, 24);
    const file = join(CACHE, `${key}.json`);

    if (!FRESH && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));

    /*
     * One model at a time, with no per-model time limit: the extension's
     * 30-second hand-off is right for a reader waiting, and wrong for a
     * harness whose only job is to get the answer the model gives.
     */
    const answered = await keys().run((apiKey, model) => createGeminiAdapter({ apiKey, models: [model] }).converse(request));

    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(answered, null, 2));

    return answered;
}

/**
 * The page a reader might be on: a spread of FINN's fleet across price and
 * body type, the size of one finn.com listing page. Fixed, so a change in a
 * reading is a change in Lens and not in the cars.
 */
export function pageOfCars(size = 48): PinnedFinnCar[] {
    const all = fleet().sort((a, b) => a.id - b.id);
    const step = all.length / size;

    return Array.from({ length: size }, (_, index) => all[Math.floor(index * step)]!);
}

const base = (): Answers => ({
    priorities: [...DEFAULT_PRIORITIES],
    preferences: { ...DEFAULT_PREFERENCES },
    features: copyFeatures(DEFAULT_CATEGORY_FEATURES),
    basedOn: null,
});

export interface Turn {
    message: string;
    reply: string;
    kind: ConverseResult["kind"];
    model: string | null;
    question: WireQuestion | null;
    suggestions: { id: string; why: string; needId: string }[];
    asks: string[];
    raw: ConverseResult;
}

export interface Conversation {
    turns: Turn[];
    understanding: Understanding;
    run: LensRun | null;
    report: string;
}

/**
 * Plays a conversation the way a reader would: each message in turn, the
 * rental period waived when Lens asks for it (none of these people gave one),
 * and a comparison once every message is sent. After the comparison, any
 * `afterCompare` message is sent as a question about the result.
 */
export async function converseWith(
    messages: string[],
    {
        cars = pageOfCars(),
        afterCompare = [] as string[],
        /* What the reader taps when Lens asks one of its own questions, in order. */
        answers = [] as string[],
        /* Model replies recorded earlier, played back in order instead of asking the model. */
        replay = null as ConverseResult[] | null,
    } = {},
): Promise<Conversation> {
    const vocabulary = buildVocabulary();
    const scope = {
        current: "page" as const,
        available: [{ kind: "page" as const, description: `the ${cars.length} configurations on this finn.com page that Lens has data for — not every car FINN offers`, count: cars.length }],
    };
    const history: { role: "reader" | "lens"; text: string }[] = [];
    const answered: { question: string; answer: string }[] = [];
    let understanding: Understanding = EMPTY_UNDERSTANDING;
    let openQuestion: WireQuestion | null = null;
    let run: LensRun | null = null;
    const turns: Turn[] = [];

    const send = async (message: string) => {
        history.push({ role: "reader", text: message });

        const recorded = replay?.[turns.length];
        const { result, model } = recorded
            ? { result: structuredClone(recorded), model: "replayed" }
            : await converse({
            message,
            vocabulary,
            understanding: toWire(understanding),
            openQuestion,
            answered,
            evidence: evidenceCatalogue(cars),
            facts: run
                ? {
                      ...buildLensFacts(run.recommendation, run.narrative),
                      yourSituation: toWire(understanding),
                      evidenceForYourNeeds: evidenceForNeeds(run, understanding),
                      finnsOwnEquipmentText: finnsOwnWords(run),
                  }
                : null,
            history: history.slice(-9, -1),
            scope,
            today: "2026-09-22",
        });

        const said = history.filter((line) => line.role === "reader").map((line) => line.text);

        if (openQuestion) answered.push({ question: openQuestion.ask, answer: message });
        if (result.kind === "answer" && !run && result.understanding) result.kind = "understanding";

        const turn: Turn = { message, reply: "", kind: result.kind, model, question: null, suggestions: [], asks: [], raw: result };

        if (result.kind === "answer" || !result.understanding) {
            const sources = run
                ? finnsOwnWords(run).map((item) => ({ car: item.car, text: item.finnWrites.map((entry) => `${entry.group} ${entry.text}`).join(" ") }))
                : [];
            turn.reply = quotesAreFinns(typeof result.reply === "string" ? result.reply : "", sources).reply || "I couldn't answer that from FINN's data.";
            history.push({ role: "lens", text: turn.reply });
            turns.push(turn);
            return;
        }

        const grounded = groundInWhatWasSaid(result.reply, readUnderstanding(result.understanding, understanding, undefined, "2026-09", message), said, new Date("2026-09-22"));

        if (result.kind === "whatIf") {
            turn.reply = grounded.reply;
            history.push({ role: "lens", text: turn.reply });
            turns.push(turn);
            return;
        }

        understanding = grounded.understanding;
        turn.reply = grounded.reply;
        turn.question = readQuestion(result.question, answered, cars);
        turn.suggestions = readSuggestions(result.suggestions, understanding, cars);
        openQuestion = turn.question;

        const missing = missingEssentials(understanding);
        if (missing.budget) turn.asks.push("budget");
        if (missing.period) turn.asks.push("period");
        if (turn.question) turn.asks.push(`question: ${turn.question.ask}`);
        for (const item of turn.suggestions) turn.asks.push(`offer: ${item.id}`);

        history.push({ role: "lens", text: [turn.reply, turn.question?.ask].filter(Boolean).join(" ") });
        turns.push(turn);
    };

    const toAnswer = [...answers];

    for (const message of messages) {
        await send(message);

        /* A question holds the comparison until it's answered, so the reader answers it. */
        while (turns.at(-1)?.question && toAnswer.length) await send(toAnswer.shift()!);
    }

    /*
     * None of these readers gave dates, and some gave no budget: those asks
     * are answered the way a tap on "No fixed dates" and "No limit" would.
     */
    understanding = waiveEssential(understanding, "rental");
    if (!understanding.budget) understanding = waiveEssential(understanding, "budget");

    const translation = toAnswers(base(), understanding);
    run = runLens(cars, translation.answers, "page", `Comparing ${cars.length} cars on this page`, ruledOut(understanding));

    for (const message of afterCompare) await send(message);

    return { turns, understanding, run, report: describe(messages, turns, understanding, run, translation) };
}

/* -------------------------------------------------------------------------- */
/* What a person reading the transcript needs to see                          */
/* -------------------------------------------------------------------------- */

function describe(
    messages: string[],
    turns: Turn[],
    u: Understanding,
    run: LensRun | null,
    translation: ReturnType<typeof toAnswers>,
): string {
    const out: string[] = [];
    const line = (value = "") => out.push(value);

    for (const turn of turns) {
        line(`READER: ${turn.message}`);
        line(`LENS [${turn.kind}, ${turn.model}]: ${turn.reply}`);
        if (turn.question) line(`  ? ${turn.question.ask}  (${turn.question.why}) [${turn.question.options.join(" | ")}] affects=${turn.question.affects.join(",")}`);
        for (const item of turn.suggestions) line(`  + offer ${item.id}: ${item.why}`);
        const rawQuestion = (turn.raw.question as WireQuestion | null)?.ask;
        if (rawQuestion && !turn.question) line(`  (question dropped by Lens: ${rawQuestion})`);
        line(`  asks: ${turn.asks.join("; ") || "none"}`);
        line();
    }

    line("UNDERSTANDING");
    line(`  budget: ${JSON.stringify(u.budget)}`);
    line(`  monthlyKm: ${JSON.stringify(u.monthlyKm)}`);
    line(`  tension: ${u.tension}`);
    for (const item of u.context) line(`  context: ${item.label} — ${item.said}`);
    for (const item of u.capabilities) line(`  capability: ${item.label} — less relevant: ${item.lessRelevant.join(", ")}`);
    for (const need of u.needs) {
        line(`  need [${need.status}/${need.importance}] ${need.label} — "${need.said}" → ${need.priorities.join(", ")}${need.notInData ? ` | not in data: ${need.notInData}` : ""}`);
        for (const entry of need.evidence) line(`      ${entry.unwanted ? "NOT " : ""}${entry.mustHave ? "MUST " : ""}${entry.id}: ${entry.use}`);
    }
    for (const item of u.notModelled) line(`  notModelled [${item.stance}] ${item.said} — ${item.explanation}`);
    line(`  dropped priorities: ${u.droppedPriorities.join(", ") || "none"}; declined: ${u.declined.join(", ") || "none"}`);

    const heard = heardLines(u);
    line();
    line("HEARD (as shown to the reader)");
    for (const [key, value] of Object.entries(heard)) if (value) line(`  ${key}: ${value}`);

    line();
    line("ENGINE GIVEN");
    line(`  priorities: ${translation.profile.priorities.map((item) => `${item.id} ${item.sharePercent}%${item.filler ? " (filler)" : ""}`).join(", ")}`);
    line(`  budget ceiling: ${translation.answers.preferences.monthlyBudget}  km/month: ${translation.answers.preferences.monthlyKm}`);
    line(`  raised: ${Object.entries(translation.answers.features).flatMap(([cat, items]) => items.map((item) => `${cat}.${item.key}=${item.importance}`)).join(", ")}`);
    line(`  rules: ${translation.profile.rules.map((rule) => `${rule.mode} ${rule.id}`).join(", ") || "none"}`);

    if (!run) return out.join("\n");

    const story = tellFitStory(run, u, translation.lessRelevant, null);
    const match = summariseMatch(run);

    line();
    line(`RESULT — ${story.eyebrow}: ${story.carName} (${match.car.configuration}) ~€${Math.round(match.car.monthly)}/mo, ${story.bandLabel}, budget ${match.car.budget}`);
    if (run.ruledOut) line(`  ruled out: ${run.ruledOut.setAside} cars set aside${run.ruledOut.nothingLeft ? " — NOTHING LEFT" : ""}`);
    line(`  says: ${matchSentence(story)}`);
    for (const section of story.sections) {
        line(`  [${section.tone}] ${section.title}`);
        for (const item of section.lines) line(`      ${item.tone}: ${item.text}`);
    }
    if (story.catch) line(`  CATCH: ${story.catch.text} ${story.catch.alternative ?? ""}`);
    line(`  alternatives: ${alternativesWithinLimits(run).map((car) => `${car.name} ~€${Math.round(car.monthly)} (${car.budget})`).join("; ")}`);
    line(`  top scorer: ${run.recommendation.topScorer.name ?? ""} — budget changed the answer: ${run.recommendation.budgetChangedTheAnswer}`);

    return out.join("\n");
}
