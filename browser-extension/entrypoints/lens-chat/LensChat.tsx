import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Save, X } from "lucide-react";

import { loadLensSettings, monthLabel, saveLensSettings } from "@/lib/reasoning-engine";
import type { LensSettings } from "@/lib/reasoning-engine/types";
import { isPersonalised } from "@/lib/personalisation";
import { converse } from "@/lib/lens-ai/client";
import { openBrowserTab } from "@/lib/utils";
import { buildLensFacts } from "@/lib/lens-ai/context";
import type { ScopeKind, WireQuestion } from "@/lib/lens-ai/contract";
import { carLabel, compareOutcomes, type Outcome } from "@/lib/lens-ai/outcome";
import { buildVocabulary } from "@/lib/lens-ai/vocabulary";
import type { PageContext } from "@/lib/lens-chat/messages";
import type { EvidenceId } from "@/lib/lens-chat/evidence";
import { nameFor, saveSearch, saveSession, type LensSession } from "@/lib/lens-chat/session";
import { asPhrase, barePhrase, evidenceCatalogue, plainly } from "@/lib/lens-chat/evidence";
import { evidenceForNeeds, finnsOwnWords, quotesAreFinns, tellFitStory } from "@/lib/lens-chat/fit-story";
import { matchSentence } from "@/lib/lens-chat/plain";
import { compareRows, runLens, summariseMatch, type LensRun } from "@/lib/lens-chat/run";
import {
    diffUnderstanding,
    EMPTY_UNDERSTANDING,
    isEmptyUnderstanding,
    missingEssentials,
    readQuestion,
    groundInWhatWasSaid,
    readSuggestions,
    readUnderstanding,
    ruledOut,
    waiveEssential,
    withBudget,
    withRental,
    withoutSuggestion,
    withSuggestion,
    toAnswers,
    toWire,
    type Translation,
    type Understanding,
} from "@/lib/lens-chat/understanding";
import { copyFeatures, type Answers } from "@/entrypoints/compare/store";
import { OutcomeCard } from "@/entrypoints/compare/lens-ai/OutcomeCard";
import { useLensAiStatus } from "@/entrypoints/compare/lens-ai/hooks";
import { AiError, PrimaryButton, SecondaryButton, Thinking } from "@/entrypoints/compare/lens-ai/parts";

import { SmallButton, type CarActions } from "./cards";
import {
    BudgetAsk,
    Composer,
    ConfirmAsk,
    FeatureAsk,
    LensStatus,
    PeriodAsk,
    QuestionAsk,
    Said,
    Says,
    WhatIfAsk,
} from "./chat-parts";
import { Inspector, type InspectorView } from "./inspector";
import { PickCard } from "./pick";
import { onPageChanged, requestClose, requestPageContext, requestPin, requestShowCar } from "./page";
import {
    buildScopes,
    conversationScope,
    defaultScope,
    readStoredCars,
    type Scope,
    type StoredCars,
} from "./scopes";

/**
 * Ask Lens, on finn.com.
 *
 * The conversation is about understanding a person, and only then about cars:
 *
 * - **Each message updates what Lens understands** — constraints, needs,
 *   context, what they're already confident with, what Lens can't use — and
 *   Lens may ask one question when the answer would change the recommendation.
 *   The understanding carries across messages; nothing is re-asked.
 * - **Nothing changes the comparison until the person says so.** "Compare
 *   cars" turns the understanding into Lens's own answers, deterministically,
 *   and the engine ranks the chosen set.
 * - **The result is explained in their terms**: what they told Lens, what Lens
 *   found on this car, and the catch — every fact read off the car.
 * - **Questions and what-ifs use the same understanding.** A what-if is a
 *   proposed version of it that the engine runs before anything is kept.
 *
 * Preferences confirmed here belong to this conversation; saved settings and
 * pinned cars change only when the person presses the button that says so.
 */

/**
 * One thing Lens wants from the reader, asked as part of the conversation.
 *
 * Budget and dates Lens asks for itself; a question and an offer of equipment
 * come from the model. None of them is a form: each is a line of Lens's own
 * speech with something to tap, and answering one adds the reader's answer to
 * the conversation like anything else they said.
 */
type Ask =
    | { of: "budget" }
    | { of: "period" }
    | { of: "question"; question: WireQuestion }
    | { of: "feature"; id: EvidenceId; why: string; needId: string };

/**
 * The conversation holds what was said and what was asked — and nothing else.
 *
 * What Lens understands, how it is judging and what it found are state, not
 * messages: they live in the strip above the conversation, in the one pick at
 * the foot of it, and in the inspector behind both. A transcript that prints
 * the whole of Lens after every turn stops reading as a conversation, and a
 * reader scrolling back through four recommendations can't tell which is
 * current.
 */
type Entry = { id: number } & (
    | { kind: "user"; text: string }
    | { kind: "lens"; text: string; tone?: "note" }
    | { kind: "thinking"; text: string }
    | { kind: "error"; text: string; retry: (() => void) | null }
    | { kind: "ask"; ask: Ask; answered: boolean }
    | { kind: "confirm"; isUpdate: boolean; done: boolean }
    | {
          kind: "whatIf";
          reply: string;
          after: Understanding;
          lines: { label: string; from: string; to: string }[];
          status: "pending" | "ran" | "used" | "cancelled";
          ran?: { outcome: Outcome; run: LensRun; translation: Translation };
      }
);

type EntryInput = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

const STARTERS = [
    "I have two young kids and want them safe and entertained.",
    "I'm a nervous driver.",
    "I drive through cold winters.",
    "I can't spend more than €500 a month.",
    "I only care about safety and staying under €500.",
    "I do a lot of motorway driving.",
];

/** The model's prose, or nothing: a reply is not guaranteed to come back. */
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const WHY = /^\s*why\s+(this|that|the)\s+(car|one)\s*\??\s*$|^\s*why\s*\??\s*$/i;

/** The conversation as something the rest of Lens can pick up. */
function sessionFrom(
    applied: { understanding: Understanding; translation: Translation },
    scope: Scope,
    kind: ScopeKind,
    run: LensRun,
): LensSession {
    const { understanding, translation } = applied;

    return {
        at: new Date().toISOString(),
        scope: kind,
        headline: scope.headline,
        summary:
            understanding.tension ||
            understanding.needs.filter((need) => need.status === "active").map((need) => need.label).join(" · "),
        focus: translation.profile.focus,
        rules: translation.profile.rules,
        understanding,
        answers: translation.answers,
        carIds: scope.cars.map((car) => car.id),
        winnerId: run.recommendation.winner.id,
    };
}

export function LensChat() {
    const { status } = useLensAiStatus();
    const aiReady = status.state === "ready";

    const [settings, setSettings] = useState<LensSettings | null>(null);
    const [personalised, setPersonalised] = useState(true);
    const [base, setBase] = useState<Answers | null>(null);
    const [page, setPage] = useState<PageContext | null>(null);
    const [pageLoaded, setPageLoaded] = useState(false);
    const [stored, setStored] = useState<StoredCars>({ pinned: {}, loaded: {} });
    const [scopeKind, setScopeKind] = useState<ScopeKind | null>(null);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);

    /* What the conversation has established. */
    const [understanding, setUnderstanding] = useState<Understanding>(EMPTY_UNDERSTANDING);
    const [openQuestion, setOpenQuestion] = useState<WireQuestion | null>(null);
    const [applied, setApplied] = useState<{ understanding: Understanding; translation: Translation } | null>(null);
    const [run, setRun] = useState<LensRun | null>(null);
    /** Which of the four things behind the conversation the reader has open. */
    const [inspector, setInspector] = useState<InspectorView | null>(null);

    const answered = useRef<{ question: string; answer: string }[]>([]);
    const history = useRef<{ role: "reader" | "lens"; text: string }[]>([]);
    const nextId = useRef(1);
    const pinQueue = useRef<Promise<unknown>>(Promise.resolve());
    /** Said once, after the first comparison, and never again. */
    const carriedOver = useRef(false);
    const endRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);

    /* -- What Lens has ------------------------------------------------------ */

    const refreshPage = useCallback(async () => {
        const [context, cars] = await Promise.all([requestPageContext(), readStoredCars()]);
        setPage(context);
        setStored(cars);
        setPageLoaded(true);
    }, []);

    useEffect(() => {
        void (async () => {
            const loaded = await loadLensSettings();
            setSettings(loaded);
            setBase({
                priorities: loaded.priorities,
                preferences: loaded.preferences,
                features: copyFeatures(loaded.categoryFeatures),
                basedOn: loaded.basedOn,
            });
            setPersonalised(await isPersonalised());
        })();

        void refreshPage();

        const offPage = onPageChanged(() => void refreshPage());

        const onStorage = (changes: Record<string, unknown>, area: string) => {
            if (area !== "local") return;
            if ("pinnedCars" in changes || "loadedCarsFromFinnApi" in changes) {
                void readStoredCars().then(setStored);
            }
        };

        browser.storage.onChanged.addListener(onStorage);

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") void requestClose();
        };
        window.addEventListener("keydown", onKey);

        return () => {
            offPage();
            browser.storage.onChanged.removeListener(onStorage);
            window.removeEventListener("keydown", onKey);
        };
    }, [refreshPage]);

    const scopes = useMemo(() => buildScopes(page, stored), [page, stored]);
    const kind: ScopeKind = scopeKind ?? defaultScope(page, scopes);
    const scope: Scope = scopes[kind];

    const enabled = useMemo(
        () => (settings?.priorityDefinitions ?? []).filter((item) => item.enabled).map((item) => item.id),
        [settings],
    );
    const vocabulary = useMemo(() => buildVocabulary(enabled.length ? enabled : undefined), [enabled]);
    const pinnedIds = useMemo(() => new Set(Object.keys(stored.pinned).map(Number)), [stored]);

    /* Latest values for the async flows below, which outlive a render. */
    const latest = useRef({ base, scopes, kind, run, vocabulary, enabled, understanding, openQuestion, applied });
    latest.current = { base, scopes, kind, run, vocabulary, enabled, understanding, openQuestion, applied };

    /* -- The conversation --------------------------------------------------- */

    const push = useCallback((entry: EntryInput): number => {
        const id = nextId.current++;
        setEntries((all) => [...all, { ...entry, id } as Entry]);
        return id;
    }, []);

    const update = useCallback((id: number, change: (entry: Entry) => Entry) => {
        setEntries((all) => all.map((entry) => (entry.id === id ? change(entry) : entry)));
    }, []);

    const remove = useCallback((id: number) => {
        setEntries((all) => all.filter((entry) => entry.id !== id));
    }, []);

    const say = useCallback(
        (text: string, tone?: "note") => {
            push({ kind: "lens", text, tone });
            history.current.push({ role: "lens", text });
        },
        [push],
    );

    /* The page moved on under an open conversation — say so. */
    const lastUrl = useRef<string | null>(null);

    useEffect(() => {
        if (!page) return;

        const previous = lastUrl.current;
        lastUrl.current = page.url;

        if (previous == null || new URL(previous).pathname === new URL(page.url).pathname) return;
        if (!entries.length) return;

        push({
            kind: "lens",
            tone: "note",
            text: `You've moved to another page. ${scopes.thisCar.cars.length ? `${scopes.thisCar.headline}; ` : ""}${scopes.page.headline.toLowerCase()}. Earlier results are about the cars they named.`,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page?.url]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }, [entries.length, entries.at(-1)]);

    /** Ranks a scope with an understanding and shows why the result fits. */
    const compareWith = useCallback(
        (u: Understanding, nextKind: ScopeKind, intro?: string) => {
            const current = latest.current;
            if (!current.base) return null;

            const target = current.scopes[nextKind];

            if (!target.cars.length) {
                say(
                    nextKind === "pinned"
                        ? "You haven't pinned any cars yet, so there's nothing in that set to compare."
                        : nextKind === "thisCar"
                          ? "There's no single car on this page for Lens to look at."
                          : "None of the cars on this page have reached Lens yet. Scroll the page so FINN loads them, then ask again.",
                    "note",
                );
                return null;
            }

            const translation = toAnswers(current.base, u, current.enabled.length ? current.enabled : undefined);
            const result = runLens(target.cars, translation.answers, nextKind, target.headline, ruledOut(u));

            if (!result) return null;

            setScopeKind(nextKind);
            setRun(result);
            setApplied({ understanding: u, translation });

            /*
             * Left where the rest of Lens can pick it up. A reader who explains
             * their life here and then opens the recommendation page should
             * meet the same search, not their saved settings from last month.
             */
            void saveSession({
                at: new Date().toISOString(),
                scope: nextKind,
                headline: target.headline,
                summary: u.tension || u.needs.filter((need) => need.status === "active").map((need) => need.label).join(" · "),
                focus: translation.profile.focus,
                rules: translation.profile.rules,
                understanding: u,
                answers: translation.answers,
                carIds: target.cars.map((car) => car.id),
                winnerId: result.recommendation.winner.id,
            });

            if (intro) say(intro, "note");

            /*
             * The answer is said once, in a sentence, and shown once, in the
             * card at the foot of the conversation. What changed is worth a
             * line; the whole recommendation is not.
             */
            const winner = carLabel(result.recommendation.winner, result.recommendation.context.vehicles);
            const before = current.run?.recommendation.winner.id ?? null;

            say(
                before == null
                    ? `Here's what I'd look at first.`
                    : before === result.recommendation.winner.id
                      ? `Still the ${winner}, with that taken into account.`
                      : `That changes it — the ${winner} moves ahead.`,
            );

            history.current.push({
                role: "lens",
                text: `Compared ${target.headline.toLowerCase()}; the strongest match is ${winner}.`,
            });

            return result;
        },
        [push, say],
    );

    const switchScope = useCallback(
        (nextKind: ScopeKind) => {
            const current = latest.current;
            if (nextKind === current.kind && !current.run) return;

            setScopeKind(nextKind);

            if (current.run && current.applied) {
                compareWith(current.applied.understanding, nextKind, `${current.scopes[nextKind].headline}.`);
            } else {
                say(`${current.scopes[nextKind].headline}.`, "note");
            }
        },
        [compareWith, say],
    );

    /**
     * "Why this one?" answered as an answer.
     *
     * It used to reprint the recommendation with its evidence attached, which
     * told a reader what they could already see. This says the case in a
     * sentence or two; the evidence behind it is where it always is, under
     * "See why" on the pick.
     */
    const showWhy = useCallback(
        (target: LensRun) => {
            const current = latest.current;
            const u = current.applied?.understanding ?? EMPTY_UNDERSTANDING;
            const translation = current.applied?.translation ?? toAnswers(current.base!, u);
            const story = tellFitStory(target, u, translation.lessRelevant, null);
            const measured = story.sections
                .filter((section) => section.kind === "need" && section.tone === "good")
                .flatMap((section) => section.lines.filter((line) => line.tone === "good").slice(0, 1))
                .slice(0, 2)
                .map((line) => line.text);

            say([matchSentence(story), ...measured].join(" "));
        },
        [say],
    );

    /**
     * What the reader just answered, said back into the conversation.
     *
     * Tapping a chip used to change the understanding silently and take the
     * question away with it, so the reader had no record of what they told
     * Lens. Every answer is a message now — the same bubble a typed one gets —
     * and the model sees it on the next turn like anything else they said.
     */
    const recordAnswer = useCallback(
        (raw: string) => {
            const text = `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;

            push({ kind: "user", text });
            history.current.push({ role: "reader", text });
        },
        [push],
    );

    /**
     * How many things Lens has asked and not had an answer to.
     *
     * Lens waits for all of them before it goes anywhere: a comparison
     * appearing under a half-answered question is what made the rest of them
     * feel lost, and a model turn fired per tap would talk over the reader.
     */
    const asksOpen = useRef(0);
    /** The answer to the model's own question, which only the model can use. */
    const pendingAnswer = useRef<string | null>(null);

    const openAsk = useCallback(
        (ask: Ask) => {
            asksOpen.current += 1;
            push({ kind: "ask", ask, answered: false });
        },
        [push],
    );

    /** An ask is done with: it stays in the conversation, without its buttons. */
    const closeAsk = useCallback((entryId: number) => {
        asksOpen.current = Math.max(0, asksOpen.current - 1);
        setEntries((all) => all.map((entry) => (entry.id === entryId && entry.kind === "ask" ? { ...entry, answered: true } : entry)));
    }, []);

    /** Lens has what it asked for; the reader says when it compares. */
    const offerCompare = useCallback((u: Understanding) => {
        if (isEmptyUnderstanding(u)) return;

        setEntries((all) =>
            all.some((entry) => entry.kind === "confirm" && !entry.done)
                ? all
                : [...all, { id: nextId.current++, kind: "confirm", isUpdate: Boolean(latest.current.run), done: false }],
        );
    }, []);

    const talk = useCallback(
        async (message: string) => {
            const current = latest.current;
            const thinking = push({ kind: "thinking", text: current.run ? "Thinking about that…" : "Listening…" });

            const response = await converse({
                message,
                vocabulary: current.vocabulary,
                understanding: toWire(current.understanding),
                openQuestion: current.openQuestion,
                answered: answered.current,
                evidence: evidenceCatalogue(current.scopes[current.kind].cars),
                facts: current.run
                    ? {
                          ...buildLensFacts(current.run.recommendation, current.run.narrative),
                          yourSituation: toWire(current.applied?.understanding ?? current.understanding),
                          evidenceForYourNeeds: evidenceForNeeds(current.run, current.applied?.understanding ?? current.understanding),
                          finnsOwnEquipmentText: finnsOwnWords(current.run),
                      }
                    : null,
                history: history.current.slice(-8),
                scope: conversationScope(current.kind, current.scopes),
                today: new Date().toISOString().slice(0, 10),
            });

            remove(thinking);

            if (!response.ok) {
                push({ kind: "error", text: response.error, retry: () => void talk(message) });
                return;
            }

            const said = history.current.filter((line) => line.role === "reader").map((line) => line.text);
            const result = response.result;

            /* A question Lens asked is answered by whatever the person said next. */
            if (current.openQuestion) {
                answered.current.push({ question: current.openQuestion.ask, answer: message });
            }

            const enabledIds = current.enabled.length ? current.enabled : undefined;
            const suggested =
                result.scope && result.scope !== current.kind && current.scopes[result.scope]?.cars.length
                    ? result.scope
                    : null;

            /*
             * Before any comparison there are no facts to answer from, so an
             * "answer" that carries an understanding is really one.
             */
            if (result.kind === "answer" && !current.run && result.understanding) result.kind = "understanding";

            if (result.kind === "answer" || !result.understanding) {
                /* An answer may quote FINN's own words; it may not invent them. */
                const sources = current.run
                    ? finnsOwnWords(current.run).map((item) => ({
                          car: item.car,
                          text: item.finnWrites.map((entry) => `${entry.group} ${entry.text}`).join(" "),
                      }))
                    : [];
                const checked = quotesAreFinns(text(result.reply), sources);

                if (checked.dropped.length) console.warn("[Lens AI] dropped a quote FINN didn't write", checked.dropped);

                say(checked.reply || "I couldn't answer that from FINN's data.");
                setOpenQuestion(readQuestion(result.question, answered.current, current.scopes[current.kind].cars) ?? (result.kind === "answer" ? current.openQuestion : null));
                if (suggested) switchScope(suggested);
                return;
            }

            if (result.kind === "whatIf") {
                const before = current.applied?.understanding ?? current.understanding;
                const { reply, understanding: after } = groundInWhatWasSaid(
                    result.reply,
                    readUnderstanding(result.understanding, before, enabledIds),
                    said,
                );

                history.current.push({ role: "lens", text: reply });
                push({ kind: "whatIf", reply, after, lines: diffUnderstanding(before, after), status: "pending" });
                return;
            }

            const { reply, understanding: next } = groundInWhatWasSaid(
                result.reply,
                readUnderstanding(result.understanding, current.understanding, enabledIds),
                said,
            );
            const question = readQuestion(result.question, answered.current, current.scopes[current.kind].cars);
            const suggestions = readSuggestions(result.suggestions, next, current.scopes[current.kind].cars);

            setUnderstanding(next);
            latest.current.understanding = next;
            setOpenQuestion(question);
            history.current.push({ role: "lens", text: [reply, question?.ask].filter(Boolean).join(" ") });

            if (suggested) setScopeKind(suggested);

            /*
             * Lens speaks, and then asks for what it still needs. What it
             * understood doesn't get said back: it's in the strip above, and
             * whole in "Your needs" for anyone who wants to check it.
             */
            say(reply);

            if (isEmptyUnderstanding(next) && !question && !next.notModelled.length) return;

            const missing = missingEssentials(next);

            if (missing.budget) openAsk({ of: "budget" });
            if (missing.period) openAsk({ of: "period" });
            if (question) openAsk({ of: "question", question });

            for (const item of suggestions) openAsk({ of: "feature", id: item.id, why: item.why, needId: item.needId });

            /* "Compare my cars" with nothing new to understand: just compare. */
            if (suggested && current.run) {
                compareWith(next, suggested);
                return;
            }

            if (!missing.budget && !missing.period && !question && !suggestions.length) offerCompare(next);
        },
        [compareWith, offerCompare, openAsk, push, remove, say, switchScope],
    );

    const send = async (raw: string) => {
        const text = raw.trim();
        if (!text || busy || !base) return;

        setInput("");
        push({ kind: "user", text });
        history.current.push({ role: "reader", text });

        const currentRun = latest.current.run;

        if (currentRun && WHY.test(text)) {
            showWhy(currentRun);
            return;
        }

        if (!aiReady) {
            say("Lens AI is turned off, so Lens can't read free text. You can still get a match from your Lens settings, ask why, compare and pin — or turn Lens AI on in Settings.", "note");
            return;
        }

        setBusy(true);

        try {
            await talk(text);
        } finally {
            setBusy(false);
            inputRef.current?.focus();
        }
    };

    /**
     * Everything Lens asked has been answered.
     *
     * If one of them was the model's own question, the whole set goes back in
     * one message — the deterministic answers are already in the history, so
     * the model reads them together and can ask its next question knowing all
     * of it. If not, there's nothing to say: Lens offers to compare.
     */
    const settleAsks = useCallback(() => {
        if (asksOpen.current > 0) return;

        const answer = pendingAnswer.current;
        pendingAnswer.current = null;

        if (!answer) {
            offerCompare(latest.current.understanding);
            return;
        }

        setBusy(true);
        void talk(answer).finally(() => setBusy(false));
    }, [offerCompare, talk]);

    const answerEssential = useCallback(
        (entryId: number, next: Understanding, said: string) => {
            setUnderstanding(next);
            latest.current.understanding = next;
            closeAsk(entryId);
            recordAnswer(said);
            settleAsks();
        },
        [closeAsk, recordAnswer, settleAsks],
    );

    /**
     * Equipment Lens offered and the reader answered.
     *
     * Only the session changes. Someone who says yes to a 360° camera wants to
     * hear that Lens will count it, not to be shown what it mapped.
     */
    const answerFeature = useCallback(
        (entryId: number, id: EvidenceId, why: string, needId: string, take: boolean) => {
            const current = latest.current;
            const next = take ? withSuggestion(current.understanding, id, why, needId) : withoutSuggestion(current.understanding, id);

            setUnderstanding(next);
            latest.current.understanding = next;
            closeAsk(entryId);
            recordAnswer(take ? `Yes, count ${barePhrase(id)}.` : `${asPhrase(id)} isn't important to me.`);
            settleAsks();
        },
        [closeAsk, recordAnswer, settleAsks],
    );

    /** The model asked; only the model can make anything of the answer. */
    const answerQuestion = useCallback(
        (entryId: number, answer: string) => {
            pendingAnswer.current = answer;
            closeAsk(entryId);
            recordAnswer(answer);
            settleAsks();
        },
        [closeAsk, recordAnswer, settleAsks],
    );

    const confirmCompare = (entryId: number) => {
        const shown = compareWith(latest.current.understanding, latest.current.kind);

        if (!shown) return;

        setEntries((all) => all.map((item) => (item.id === entryId && item.kind === "confirm" ? { ...item, done: true } : item)));

        if (!carriedOver.current) {
            carriedOver.current = true;
            say("It carries over to the Lens recommendation page on its own — your saved settings haven't changed.", "note");
        }
    };

    /* -- Acting on cars ----------------------------------------------------- */

    const actions: CarActions = {
        pinnedIds,
        onPin: (carId, pinned) => {
            pinQueue.current = pinQueue.current.then(async () => {
                const result = await requestPin(carId, pinned);

                if (!result || "error" in result) {
                    push({
                        kind: "error",
                        text: result && "error" in result ? result.error : "Couldn't reach the page to pin this car.",
                        retry: null,
                    });
                }
            });
        },
        canShow: (carId) => Boolean(page?.pageCarIds.includes(carId)),
        onShow: (carId) => void requestShowCar(carId),
    };

    const runWhatIf = (entry: Extract<Entry, { kind: "whatIf" }>) => {
        const current = latest.current;
        if (!current.base || !current.run) return;

        const translation = toAnswers(current.base, entry.after, current.enabled.length ? current.enabled : undefined);
        const cars = current.scopes[current.run.scope].cars;
        const after = runLens(cars, translation.answers, current.run.scope, current.run.scopeHeadline, ruledOut(entry.after));

        if (!after) return;

        const outcome = compareOutcomes({
            cars,
            before: current.run.recommendation,
            after: after.recommendation,
            beforeAnswers: current.run.answers,
            afterAnswers: translation.answers,
        });

        update(entry.id, (item) => (item.kind === "whatIf" ? { ...item, status: "ran", ran: { outcome, run: after, translation } } : item));
    };

    const useWhatIf = (entry: Extract<Entry, { kind: "whatIf" }>) => {
        if (!entry.ran) return;

        setUnderstanding(entry.after);
        update(entry.id, (item) => (item.kind === "whatIf" ? { ...item, status: "used" } : item));
        latest.current.understanding = entry.after;
        compareWith(entry.after, entry.ran.run.scope);
    };

    /*
     * The answer, told once. The pick reads the story's headline; the
     * inspector reads the whole of it. Neither is a message.
     */
    const story = useMemo(
        () => (run && applied ? tellFitStory(run, applied.understanding, applied.translation.lessRelevant, null) : null),
        [run, applied],
    );

    const match = useMemo(() => (run ? summariseMatch(run) : null), [run]);
    /* Everything else Lens ranked: the pick is already on screen. */
    const others = useMemo(() => (run ? compareRows(run).filter((row) => row.id !== run.recommendation.winner.id) : []), [run]);

    const keepSearch = () => {
        const current = latest.current;
        if (!current.applied || !current.run) return;

        const session = sessionFrom(current.applied, current.scopes[current.kind], current.kind, current.run);

        void saveSearch({
            ...session,
            id: `search-${Date.now()}`,
            name: nameFor(session),
            note: [session.summary, ...session.focus.map((item) => item.label)].filter(Boolean).join(" · "),
        });
    };

    const saveAsSettings = () => {
        const current = latest.current;
        if (!current.applied) return;

        void saveLensSettings({
            priorities: current.applied.translation.answers.priorities,
            preferences: current.applied.translation.answers.preferences,
            categoryFeatures: current.applied.translation.answers.features,
            basedOn: null,
        });
    };

    /* -- What else you might say -------------------------------------------- */

    /*
     * Three at most, and only things a person would actually say next. A row
     * of prompts is a hint that the conversation can continue, not a menu of
     * everything Lens can do.
     */
    const suggestions: { label: string; act: () => void }[] = run
        ? [
              { label: "Why this car?", act: () => void send("Why this car?") },
              ...(run.recommendation.runnerUp
                  ? [
                        {
                            label: `Why not the ${carLabel(run.recommendation.runnerUp, run.recommendation.context.vehicles)}?`,
                            act: () => void send(`Why didn't you choose the ${carLabel(run.recommendation.runnerUp!, run.recommendation.context.vehicles)}?`),
                        },
                    ]
                  : []),
              { label: "My budget changed", act: () => void send("My budget changed.") },
          ]
              .filter((item) => aiReady || item.label === "Why this car?")
              .slice(0, 3)
        : aiReady && entries.length === 0
          ? STARTERS.map((label) => ({ label, act: () => void send(label) }))
          : [];

    /* -- Rendering ----------------------------------------------------------- */

    const ready = Boolean(base && pageLoaded);
    /* "Comparing 3 cars on this page" is a header; "3 cars on this page" is a sentence. */
    const scopeLabel = scope.headline.replace(/^Comparing /, "").replace(/^Looking at /, "");

    return (
        <div className="relative flex h-screen flex-col bg-white font-sans text-finn-black">
            <Header scope={scope} scopes={scopes} kind={kind} onScope={(next) => switchScope(next)} />

            {/* What Lens is working with — a glance, and a way into the whole of it. */}
            <LensStatus understanding={understanding} onOpen={() => setInspector("needs")} />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-finn-snow px-3 py-3">
                {!ready ? (
                    <div className="py-10">
                        <Thinking>Reading this page…</Thinking>
                    </div>
                ) : entries.length === 0 ? (
                    <EmptyState
                        scope={scope}
                        aiState={status.state}
                        personalised={personalised}
                        onOpenSettings={() => void openBrowserTab("OPEN_SETTINGS_PAGE")}
                        onUseSettings={() => compareWith(EMPTY_UNDERSTANDING, kind, `Using your ${personalised ? "" : "default "}Lens settings.`)}
                    />
                ) : (
                    <div className="space-y-3">
                        {entries.map((entry) => {
                            switch (entry.kind) {
                                case "user":
                                    return <Said key={entry.id}>{entry.text}</Said>;

                                case "lens":
                                    return (
                                        <Says key={entry.id} tone={entry.tone}>
                                            {entry.text}
                                        </Says>
                                    );

                                case "thinking":
                                    return <Thinking key={entry.id}>{entry.text}</Thinking>;

                                case "error":
                                    return <AiError key={entry.id} message={entry.text} onRetry={entry.retry ?? undefined} />;

                                case "ask":
                                    /*
                                     * An answered ask keeps its question and loses
                                     * its buttons: the reader's answer is in the
                                     * conversation right under it.
                                     */
                                    if (entry.answered) {
                                        return (
                                            <Says key={entry.id}>
                                                {entry.ask.of === "budget"
                                                    ? "What's the most you'd spend a month, all in?"
                                                    : entry.ask.of === "period"
                                                      ? "When do you need it, and until when?"
                                                      : entry.ask.of === "question"
                                                        ? entry.ask.question.ask
                                                        : `${plainly(entry.ask.id)} Would that help?`}
                                            </Says>
                                        );
                                    }

                                    switch (entry.ask.of) {
                                        case "budget":
                                            return (
                                                <BudgetAsk
                                                    key={entry.id}
                                                    busy={busy}
                                                    onAnswer={(monthly) =>
                                                        answerEssential(
                                                            entry.id,
                                                            monthly
                                                                ? withBudget(latest.current.understanding, monthly, `you said up to €${monthly} a month`)
                                                                : waiveEssential(latest.current.understanding, "budget"),
                                                            monthly ? `My maximum is €${monthly} a month.` : "I don't have a fixed budget.",
                                                        )
                                                    }
                                                />
                                            );

                                        case "period":
                                            return (
                                                <PeriodAsk
                                                    key={entry.id}
                                                    busy={busy}
                                                    onAnswer={(from, to, startDay) => {
                                                        const dated = from && to;
                                                        const start = dated ? (startDay ? `${startDay} ${monthLabel(from)}` : monthLabel(from)) : "";

                                                        answerEssential(
                                                            entry.id,
                                                            dated
                                                                ? withRental(
                                                                      latest.current.understanding,
                                                                      from,
                                                                      to,
                                                                      `you need it from ${start} to ${monthLabel(to)}`,
                                                                      startDay,
                                                                  )
                                                                : waiveEssential(latest.current.understanding, "rental"),
                                                            dated ? `I need it from ${start} until ${monthLabel(to)}.` : "I don't have fixed dates.",
                                                        );
                                                    }}
                                                />
                                            );

                                        case "question":
                                            return (
                                                <QuestionAsk
                                                    key={entry.id}
                                                    question={entry.ask.question}
                                                    busy={busy}
                                                    onAnswer={(answer) => answerQuestion(entry.id, answer)}
                                                />
                                            );

                                        case "feature":
                                            return (
                                                <FeatureAsk
                                                    key={entry.id}
                                                    id={entry.ask.id}
                                                    why={entry.ask.why}
                                                    busy={busy}
                                                    onAnswer={(take) =>
                                                        answerFeature(
                                                            entry.id,
                                                            (entry.ask as { id: EvidenceId }).id,
                                                            (entry.ask as { why: string }).why,
                                                            (entry.ask as { needId: string }).needId,
                                                            take,
                                                        )
                                                    }
                                                />
                                            );
                                    }

                                    return null;

                                case "confirm":
                                    return (
                                        <ConfirmAsk
                                            key={entry.id}
                                            headline={scopeLabel}
                                            isUpdate={entry.isUpdate}
                                            busy={busy}
                                            done={entry.done}
                                            onCompare={() => confirmCompare(entry.id)}
                                            onCorrect={() => {
                                                setInput("");
                                                inputRef.current?.focus();
                                            }}
                                        />
                                    );

                                case "whatIf":
                                    if (entry.status === "used") {
                                        return (
                                            <Says key={entry.id} tone="note">
                                                Using the changed situation.
                                            </Says>
                                        );
                                    }

                                    return (
                                        <WhatIfAsk
                                            key={entry.id}
                                            reply={entry.reply}
                                            lines={entry.lines}
                                            status={entry.status}
                                            busy={busy}
                                            onRun={() => runWhatIf(entry)}
                                            onCancel={() => update(entry.id, (item) => (item.kind === "whatIf" ? { ...item, status: "cancelled" } : item))}
                                        />
                                    );
                            }
                        })}

                        {/*
                          * One pick, at the foot of the conversation, changed
                          * rather than repeated. Everything behind it opens in
                          * the inspector.
                          */}
                        {run && story && match && (
                            <PickCard
                                story={story}
                                car={match.car}
                                alternative={others[0] ?? null}
                                actions={actions}
                                onWhy={() => setInspector("why")}
                                onAlternatives={() => setInspector("alternatives")}
                            />
                        )}

                        <div ref={endRef} />
                    </div>
                )}
            </div>

            <footer className="border-t border-finn-cotton bg-white px-3 pb-3 pt-2">
                {suggestions.length > 0 && (
                    <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
                        {suggestions.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                disabled={busy || !ready}
                                onClick={item.act}
                                className="shrink-0 rounded-full bg-finn-snow px-3 py-1.5 text-[11px] font-bold text-finn-iron transition hover:bg-finn-pale-blue hover:text-finn-accent-blue disabled:opacity-50"
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}

                <Composer
                    value={input}
                    busy={busy}
                    ready={ready}
                    inputRef={inputRef}
                    onChange={setInput}
                    onSend={() => void send(input)}
                    placeholder={
                        !aiReady
                            ? "Lens AI is off — turn it on in Settings"
                            : run
                              ? "Ask about these cars, or tell Lens something else…"
                              : "Tell Lens what you're looking for…"
                    }
                />
            </footer>

            {inspector && applied && (
                <Inspector
                    view={inspector}
                    understanding={applied.understanding}
                    translation={applied.translation}
                    story={story}
                    rows={others}
                    cars={scope.cars}
                    scopeLabel={scopeLabel}
                    actions={actions}
                    onView={setInspector}
                    onClose={() => setInspector(null)}
                    footer={<KeepSearch onKeep={keepSearch} onSave={saveAsSettings} />}
                />
            )}

            {/* Before any comparison there is still an understanding worth reading. */}
            {inspector && !applied && base && (
                <Inspector
                    view={inspector === "needs" || inspector === "judging" ? inspector : "needs"}
                    understanding={understanding}
                    translation={toAnswers(base, understanding, enabled.length ? enabled : undefined)}
                    story={null}
                    rows={[]}
                    cars={scope.cars}
                    scopeLabel={scopeLabel}
                    actions={actions}
                    onView={setInspector}
                    onClose={() => setInspector(null)}
                />
            )}
        </div>
    );
}

/**
 * What the reader can do with the search this conversation built.
 *
 * Both were a card in the transcript; neither is a thing anyone does twice, so
 * they sit at the end of "Your needs", where someone looking at what Lens
 * understood is already thinking about whether to keep it.
 */
function KeepSearch({ onKeep, onSave }: { onKeep: () => void; onSave: () => void }) {
    const [state, setState] = useState<"offered" | "kept" | "saved">("offered");

    if (state !== "offered") {
        return (
            <p className="border-t border-finn-cotton pt-3 text-[13px] leading-5 text-finn-influence-emerald">
                {state === "kept" ? "Kept. You'll find it on the Lens recommendation page." : "Saved as your Lens settings."}
            </p>
        );
    }

    return (
        <div className="border-t border-finn-cotton pt-3">
            <p className="text-[13px] leading-5 text-finn-iron">
                This search belongs to this conversation. It carries over to the recommendation page on its own; your saved Lens
                settings haven't changed.
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
                <SmallButton
                    onClick={() => {
                        onKeep();
                        setState("kept");
                    }}
                >
                    <Save aria-hidden="true" className="h-3.5 w-3.5" />
                    Keep this search
                </SmallButton>

                <SmallButton
                    onClick={() => {
                        onSave();
                        setState("saved");
                    }}
                >
                    <Save aria-hidden="true" className="h-3.5 w-3.5" />
                    Save as my settings
                </SmallButton>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function Header({
    scope,
    scopes,
    kind,
    onScope,
}: {
    scope: Scope;
    scopes: Record<ScopeKind, Scope>;
    kind: ScopeKind;
    onScope: (kind: ScopeKind) => void;
}) {
    const options: ScopeKind[] = ["page", "pinned", "thisCar"];

    return (
        <header className="border-b border-finn-cotton bg-white px-3 pb-2.5 pt-3">
            <div className="flex items-center gap-2">
                <img src="/icon/48.png" alt="" className="h-7 w-7 rounded-full bg-white" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black leading-4">Lens</p>
                    <p className="truncate text-[11px] leading-4 text-finn-iron" aria-live="polite">
                        {scope.headline}
                        {scope.kind === "page" && scope.missing > 0 ? ` · ${scope.missing} not loaded yet` : ""}
                    </p>
                </div>
                <button
                    type="button"
                    aria-label="Close Lens"
                    onClick={() => void requestClose()}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-finn-iron transition hover:bg-finn-snow hover:text-finn-black"
                >
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            </div>

            <div role="radiogroup" aria-label="Which cars Lens compares" className="mt-2 flex gap-1 rounded-full bg-finn-cotton p-1">
                {options.map((option) => {
                    const count = scopes[option].cars.length;
                    const selected = option === kind;

                    return (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={count === 0}
                            onClick={() => onScope(option)}
                            className={[
                                "flex-1 truncate rounded-full px-2 py-1.5 text-[11px] font-black transition",
                                selected ? "bg-white text-finn-black shadow-sm" : "text-finn-iron hover:text-finn-black",
                                "disabled:cursor-not-allowed disabled:opacity-40",
                            ].join(" ")}
                        >
                            {option === "page" ? "This page" : option === "pinned" ? "Pinned" : "This car"}
                            {option !== "thisCar" && <span className="ml-1 text-finn-iron">{count}</span>}
                        </button>
                    );
                })}
            </div>
        </header>
    );
}

function EmptyState({
    scope,
    aiState,
    personalised,
    onOpenSettings,
    onUseSettings,
}: {
    scope: Scope;
    aiState: "checking" | "off" | "ready";
    personalised: boolean;
    onOpenSettings: () => void;
    onUseSettings: () => void;
}) {
    return (
        <div className="px-2 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">Ask Lens</p>
            <h2 className="mt-1 text-xl font-black tracking-tight">What are you looking for?</h2>
            <p className="mt-1 text-sm leading-6 text-finn-iron">
                Tell Lens in your own words. You'll see how it understood you before anything changes.
            </p>
            <p className="mt-3 rounded-2xl bg-white px-3 py-2.5 text-xs italic leading-5 text-finn-iron">
                "I have two kids, live somewhere really hot, I'm not a confident driver, and I do a lot of motorway driving."
            </p>

            <p className="mt-4 text-[11px] leading-4 text-finn-iron">
                {scope.cars.length
                    ? `Lens can compare ${scope.description}.`
                    : "Lens doesn't have data for any cars in this set yet."}
            </p>

            {aiState === "off" && (
                <div className="mt-4 rounded-2xl bg-white px-3 py-3">
                    <p className="text-xs leading-5 text-finn-iron">
                        Lens AI is turned off, so Lens can't read free text. Everything else still works.
                    </p>
                    <button type="button" onClick={onOpenSettings} className="mt-1 text-xs font-black text-finn-accent-blue hover:underline">
                        Open Settings
                    </button>
                </div>
            )}

            {scope.cars.length > 0 && (
                <div className="mt-4">
                    <SecondaryButton onClick={onUseSettings}>
                        Or get a match from my {personalised ? "" : "default "}Lens settings
                    </SecondaryButton>
                </div>
            )}
        </div>
    );
}

