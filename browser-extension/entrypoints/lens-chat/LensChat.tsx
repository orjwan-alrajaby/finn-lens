import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Baby, CircleCheck, CircleParking, MessageCircle, Route, Rows3, Save, SlidersHorizontal, SquarePen, X, Zap } from "lucide-react";

import { formatEUR, loadLensSettings, monthLabel, saveLensSettings } from "@/lib/reasoning-engine";
import type { LensSettings } from "@/lib/reasoning-engine/types";
import { isPersonalised } from "@/lib/personalisation";
import { converse } from "@/lib/lens-ai/client";
import { openBrowserTab } from "@/lib/utils";
import { buildLensFacts } from "@/lib/lens-ai/context";
import type { ScopeKind, WireQuestion } from "@/lib/lens-ai/contract";
import { carLabel, compareOutcomes, type Outcome } from "@/lib/lens-ai/outcome";
import { buildVocabulary } from "@/lib/lens-ai/vocabulary";
import type { PageContext } from "@/lib/lens-chat/messages";
import type { FinnSearch } from "@/lib/finn-search";
import type { EvidenceId } from "@/lib/lens-chat/evidence";
import { clearSession, markHandOff, nameFor, saveSearch, saveSession, type LensSession } from "@/lib/lens-chat/session";
import { asPhrase, barePhrase, EVIDENCE, evidenceCatalogue, plainly } from "@/lib/lens-chat/evidence";
import { applyChoices, guideSteps, offersFor, whatIfs, type GuideStep, type GuideStepId } from "@/lib/lens-chat/guide";
import {
    changedDecisions,
    describeFilterChange,
    FILTER_SAID,
    heardFromSearch,
    readerSaidAnything,
    isFromFilters,
    rentalDates,
    searchSentence,
    searchStart,
    searchTerm,
    startDate,
    termEnd,
    withSearch,
    type SearchStart,
} from "@/lib/lens-chat/search";
import { evidenceForNeeds, finnsOwnWords, quotesAreFinns, tellFitStory } from "@/lib/lens-chat/fit-story";
import { matchSentence } from "@/lib/lens-chat/plain";
import { compareRows, runLens, summariseMatch, type CarLine, type LensRun } from "@/lib/lens-chat/run";
import { loadTranscript, saveTranscript, TRANSCRIPT_KEY, type SavedRun, type SavedTranscript } from "@/lib/lens-chat/transcript";
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
import { useLensAiStatus } from "@/entrypoints/compare/lens-ai/hooks";
import { AiError, SecondaryButton } from "@/entrypoints/compare/lens-ai/parts";

import { BandChip, SmallButton, type CarActions } from "./cards";
import { carNamed, whyNot } from "@/lib/lens-chat/why-not";
import {
    AskGroup,
    BudgetAsk,
    ChoiceAsk,
    Composer,
    periodTitle,
    ScratchedAsk,
    ConfirmAsk,
    FeatureAsk,
    LensStatus,
    PeriodAsk,
    QuestionAsk,
    LensThinking,
    Said,
    Says,
    TypingOffer,
    WhatIfAsk,
    type AskAnswer,
} from "./chat-parts";
import { Inspector, type InspectorView } from "./inspector";
import { PickCard } from "./pick";
import { onPageChanged, requestClose, requestPageContext, requestPin, requestShowCar } from "./page";
import {
    buildScopes,
    carsById,
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
 * Budget, dates and the guide's steps Lens asks for itself; a question comes
 * from the model, and an offer of equipment from either. None of them is a
 * form: each is a line of Lens's own speech with something to tap, and
 * answering one adds the reader's answer to the conversation like anything
 * else they said.
 */
type Ask =
    /* `prefill` and `keep`: asking again after the price filter changed — the new top, and what they said before. */
    | { of: "budget"; prefill?: number | null; keep?: number | null; title?: string }
    /*
     * `term` and `start`: halves of the period the reader's filters already
     * fixed — a contract length, an availability date — so only the other
     * half is asked.
     */
    | {
          of: "period";
          term?: number | null;
          start?: SearchStart | null;
          /* The dates to fill in when asking again: the ones they gave, moved to the new filter. */
          prefill?: { from: string | null; to: string | null } | null;
          title?: string;
      }
    | { of: "choices"; step: GuideStep }
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
type Entry = {
    id: number;
    /** When it was said or done — kept with the conversation, so it can be read back later. */
    at?: string;
} & (
    | { kind: "user"; text: string }
    | { kind: "lens"; text: string; tone?: "note" }
    | { kind: "thinking"; text: string }
    | { kind: "error"; text: string; retry: (() => void) | null }
    | {
          kind: "ask";
          ask: Ask;
          answered: boolean;
          answer: AskAnswer | null;
          /**
           * Why it no longer stands: the reader changed the filter it was
           * about before answering. Kept, struck through, with the new
           * question below it.
           */
          superseded?: string;
          /** Asked again because a filter changed — dropped outright if the next change makes it stale too. */
          again?: boolean;
      }
    | { kind: "confirm"; isUpdate: boolean; done: false | "compared" | "correcting" | "closed" }
    /*
     * Where a comparison landed. Only the latest one draws the card, so there
     * is still one answer on screen — but it sits where it happened, and what
     * Lens says after it follows it instead of hiding above it.
     */
    | {
          kind: "pick";
          /*
           * What it recommended, in a line. The latest comparison draws the
           * whole card; every earlier one keeps this, so scrolling back shows
           * what Lens said then — not a gap where a card used to be.
           */
          summary?: PickSummary;
      }
    /** An answer about one car the reader named, with a way into the whole comparison. */
    | { kind: "carAnswer"; text: string; carId: number }
    | {
          kind: "whatIf";
          reply: string;
          after: Understanding;
          lines: { label: string; from: string; to: string }[];
          status: "pending" | "ran" | "used" | "cancelled";
          /* The scope, not the run: a run is too large to keep, and running it again is what "Use this" does. */
          ran?: { outcome: Outcome; scope: ScopeKind; translation: Translation };
      }
    /**
     * The reader changed their filters on finn.com: what Lens used before,
     * and what it uses now. One entry for a burst of changes — FINN's sidebar
     * is clicked several times in a row — kept up to date, not one per click.
     */
    | { kind: "filters"; was: string[]; now: string[]; cleared: boolean }
    /** Something the reader did — pinned a car, kept a search — so the record shows their choices too. */
    | { kind: "action"; text: string }
    /**
     * A break in the conversation: picked up again on another page or
     * another day ("resumed"), or started over ("fresh"). Everything before
     * it stays.
     */
    | { kind: "divider"; text: string; fresh: boolean }
);

interface PickSummary {
    name: string;
    bandLabel: string;
    band: CarLine["band"];
    total: number;
    monthly: number;
    scope: string;
}

type EntryInput = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

/**
 * Situations to start from, for anyone facing an empty box. Each is a whole
 * first message, the way a person would put it, so tapping one shows what
 * Lens does with a real description rather than with a keyword.
 */
const STARTERS: { title: string; icon: React.ReactNode; message: string }[] = [
    { title: "Two kids and a buggy", icon: <Baby aria-hidden="true" className="h-4 w-4" />, message: "I have two young kids and a buggy, and parking stresses me out. Around €500 a month." },
    { title: "A long motorway commute", icon: <Route aria-hidden="true" className="h-4 w-4" />, message: "I drive about 70 km a day, mostly motorway. I'd like something comfortable and efficient, under €550 a month." },
    { title: "Nervous behind the wheel", icon: <CircleParking aria-hidden="true" className="h-4 w-4" />, message: "I'm a nervous driver, especially changing lanes and parking. I can't spend more than €450 a month." },
    { title: "Electric, but far trips", icon: <Zap aria-hidden="true" className="h-4 w-4" />, message: "I want an electric car and can charge at home, but once a month I drive 300 km to see family. Up to €600 a month." },
];

/** "23 Sep, 22:40": when something happened, in a divider or beside an action. */
const stamp = (date: Date): string =>
    date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * An entry as it is kept. A retry is a function and can't be; an answered
 * question doesn't need the options nobody picked — it shows the question and
 * the answer — and those lists are most of what a long conversation weighs.
 */
function forKeeping(entry: Entry): Entry {
    if (entry.kind === "error") return { ...entry, retry: null };

    if (entry.kind === "ask" && entry.answered && entry.ask.of === "choices") {
        return { ...entry, ask: { ...entry.ask, step: { ...entry.ask.step, choices: [] } } };
    }

    return entry;
}

/** The model's prose, or nothing: a reply is not guaranteed to come back. */
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const WHY = /^\s*why\s+(this|that|the)\s+(car|one)\s*\??\s*$|^\s*why\s*\??\s*$/i;

/** "Why not the MG 4?", "why didn't you pick the Puma", "what about the Qashqai?" */
const WHY_NOT = /\bwhy\s+(not|didn'?t|did\s+you\s+not)\b|\bwhat\s+about\b|\binstead\s+of\b/i;

/**
 * The conversation, with every run of asks side by side drawn as one card:
 * Lens waits for all of them, so they're one moment of the conversation.
 */
function withAskGroups(entries: Entry[], render: (entry: Entry, index: number) => React.ReactNode): React.ReactNode[] {
    const out: React.ReactNode[] = [];

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]!;

        if (entry.kind !== "ask") {
            out.push(render(entry, index));
            continue;
        }

        const run: Extract<Entry, { kind: "ask" }>[] = [];
        while (entries[index]?.kind === "ask") run.push(entries[index++] as Extract<Entry, { kind: "ask" }>);
        index -= 1;

        out.push(
            run.length === 1 ? (
                render(run[0]!, index)
            ) : (
                <AskGroup key={`asks-${run[0]!.id}`} total={run.length} answered={run.filter((item) => item.answered || item.superseded).length}>
                    {run.map((item) => render(item, entries.indexOf(item)))}
                </AskGroup>
            ),
        );
    }

    return out;
}

/** The conversation as something the rest of Lens can pick up. */
/**
 * The comparison on the card, as a search the rest of Lens can pick up.
 *
 * Built from the run itself and the cars it ran over — not from whichever
 * page the chat happens to be open on. The reader may have compared "76 cars
 * matching your filters" and then walked on to a car page; keeping the
 * search, or opening the recommendation page, is about the comparison they
 * were shown.
 */
function sessionFrom(
    applied: { understanding: Understanding; translation: Translation },
    run: LensRun,
    carIds: number[],
): LensSession {
    const { understanding, translation } = applied;

    return {
        at: new Date().toISOString(),
        scope: run.scope,
        headline: run.scopeHeadline,
        summary:
            understanding.tension ||
            understanding.needs.filter((need) => need.status === "active").map((need) => need.label).join(" · "),
        focus: translation.profile.focus,
        rules: translation.profile.rules,
        understanding,
        answers: translation.answers,
        carIds,
        winnerId: run.recommendation.winner.id,
        basis: readerSaidAnything(understanding) ? "chat" : "settings",
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
    /** The kept conversation has been read (`lib/lens-chat/transcript.ts`); nothing is shown before. */
    const [restored, setRestored] = useState(false);
    /** Bumped each time a kept conversation is taken on, so the card is run again for it. */
    const [restoreCount, setRestoreCount] = useState(0);

    /* What the conversation has established. */
    const [understanding, setUnderstanding] = useState<Understanding>(EMPTY_UNDERSTANDING);
    const [openQuestion, setOpenQuestion] = useState<WireQuestion | null>(null);
    const [applied, setApplied] = useState<{ understanding: Understanding; translation: Translation } | null>(null);
    const [run, setRun] = useState<LensRun | null>(null);
    /** Which of the four things behind the conversation the reader has open. */
    const [inspector, setInspector] = useState<InspectorView | null>(null);
    /** The car the "How it compares" view is about, and the view it was opened from. */
    const [inspectCar, setInspectCar] = useState<number | null>(null);
    const [inspectorFrom, setInspectorFrom] = useState<InspectorView | null>(null);

    const openCar = (carId: number, from: InspectorView | null) => {
        setInspectCar(carId);
        setInspectorFrom(from);
        setInspector("car");
    };

    /* Back goes where the reader came from: the view they opened this one from, or the conversation. */
    const backFrom = (view: InspectorView): InspectorView | null => (view === "judging" ? "needs" : view === "car" ? inspectorFrom : null);
    const goBack = () => setInspector((view) => (view ? backFrom(view) : null));
    const backLabel = (view: InspectorView) => {
        const to = backFrom(view);

        return to === "alternatives" ? "Other options" : to === "needs" ? "What Lens understood" : "Back to chat";
    };

    const answered = useRef<{ question: string; answer: string }[]>([]);
    const history = useRef<{ role: "reader" | "lens"; text: string }[]>([]);
    const nextId = useRef(1);
    const pinQueue = useRef<Promise<unknown>>(Promise.resolve());
    /** Said once, after the first comparison, and never again. */
    const carriedOver = useRef(false);
    /** The comparison on the card, as the cars it ran over: what's kept, and run again on return. */
    const lastRun = useRef<SavedRun | null>(null);
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
    const latest = useRef({ base, scopes, kind, run, vocabulary, enabled, understanding, openQuestion, applied, page, entries });
    latest.current = { base, scopes, kind, run, vocabulary, enabled, understanding, openQuestion, applied, page, entries };

    /* -- The conversation --------------------------------------------------- */

    const push = useCallback((entry: EntryInput): number => {
        const id = nextId.current++;
        setEntries((all) => [...all, { ...entry, id, at: new Date().toISOString() } as Entry]);
        return id;
    }, []);

    /** Something the reader did, written into the conversation's record. */
    const record = useCallback((text: string) => push({ kind: "action", text }), [push]);

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
        /* Still the listing, with other filters: the note about the search says what changed. */
        if (page.kind === "listing" && new URL(previous).pathname.includes("/subscribe")) return;

        push({
            kind: "lens",
            tone: "note",
            text: `You've moved to another page. ${scopes.thisCar.cars.length ? `${scopes.thisCar.headline}; ` : ""}${scopes.page.headline.toLowerCase()}. Earlier results are about the cars they named.`,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page?.url]);

    /*
     * The reader's finn.com filters, folded into what Lens understands.
     *
     * Read on arrival and again whenever the page's address changes, so the
     * conversation starts from what they already told FINN — a budget, a
     * mileage package, a towbar — and keeps up when they change a filter. A
     * filter never overrides what they said here (`withSearch`).
     */
    const lastSearch = useRef<{ key: string; search: FinnSearch | null } | null>(null);
    const searchKey = page ? JSON.stringify(page.search) : null;

    useEffect(() => {
        /*
         * Not before the kept conversation is read: it holds whatever the last
         * page's filters said, and this page's have to be folded in after it,
         * not overwritten by it.
         */
        if (!restored || !page || searchKey == null || searchKey === lastSearch.current?.key) return;

        const before = lastSearch.current;
        lastSearch.current = { key: searchKey, search: page.search };

        /* Picked up on a new page: the divider goes before anything this adds. */
        payResumeDivider();

        const previous = latest.current.understanding;
        const next = withSearch(previous, page.search);
        setUnderstanding(next);
        latest.current.understanding = next;

        if (!before || !entries.length) return;

        /*
         * A car page opened without filters hasn't cleared anything: the
         * reader just came to it some other way. Nothing to say or ask again.
         */
        if (!page.search && page.kind === "details") return;

        noteFilterChange(heardFromSearch(previous, before.search).used, heardFromSearch(next, page.search).used, !page.search);
        reconsider(before.search, page.search, next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchKey, restored, restoreCount]);

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
            lastRun.current = { scope: nextKind, headline: target.headline, carIds: target.cars.map((car) => car.id) };

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
                basis: readerSaidAnything(u) ? "chat" : "settings",
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

            const picked = summariseMatch(result).car;

            push({
                kind: "pick",
                summary: {
                    name: picked.name,
                    bandLabel: picked.bandLabel,
                    band: picked.band,
                    total: picked.total,
                    monthly: picked.monthly,
                    scope: target.headline,
                },
            });

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

            /* Shown under the question it answers (see `closeAsk`); the model reads it here. */
            history.current.push({ role: "reader", text });
        },
        [],
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
        (ask: Ask, again = false) => {
            asksOpen.current += 1;
            push({ kind: "ask", ask, answered: false, answer: null, again });
        },
        [push],
    );

    /**
     * An ask is done with: it stays in the conversation as it was, options and
     * all, with the one chosen marked and the answer written under it.
     */
    const closeAsk = useCallback((entryId: number, text: string, choice: string | null = null) => {
        asksOpen.current = Math.max(0, asksOpen.current - 1);
        const answer = { text: `${text.charAt(0).toUpperCase()}${text.slice(1)}`, choice };

        setEntries((all) => all.map((entry) => (entry.id === entryId && entry.kind === "ask" ? { ...entry, answered: true, answer } : entry)));
    }, []);

    /**
     * The reader talked past what Lens asked, and this turn asks again.
     *
     * Nothing used to retire an unanswered ask, so typing rather than tapping
     * left it open for ever: the next turn re-asked for the same budget, and
     * the count of things Lens was waiting for went up by one every time. Two
     * turns of that and `settleAsks` could never reach zero again — so tapping
     * the answers produced no comparison at all, under a conversation showing
     * the same question three times with live buttons on each.
     *
     * Retiring them here is what makes re-asking safe: they lose their buttons
     * the moment this turn takes over asking, and the count starts from what
     * this turn actually wants.
     */
    const retireAsks = useCallback(() => {
        asksOpen.current = 0;
        setEntries((all) =>
            all.map((entry) => (entry.kind === "ask" && !entry.answered ? { ...entry, answered: true } : entry)),
        );
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

    /* -- The conversation Lens holds on its own ------------------------------ */

    /**
     * Lens Chat: the same conversation, asked rather than read.
     *
     * With Lens AI off there is nothing to read a sentence, but everything
     * else is still here — the priorities, the evidence, the cars on the page.
     * So Lens asks its own questions, in its own words, and the taps build the
     * same understanding a model's replies build. Past that point the two are
     * the same code: the same translation, the same ranking, the same story.
     */
    const guide = useRef<GuideStep[]>([]);
    /**
     * True while the reader is going through the questions again after a
     * comparison. The money is the thing most likely to have moved, and
     * "everything I still need" doesn't include a budget already given — so
     * without this, "change my answers" could change anything except that.
     */
    const askingAgain = useRef(false);

    /**
     * Dates the filters worked out on their own — a start from the
     * availability filter and a contract length — are shown for the reader to
     * check, never taken silently: "within 14 days" is a window, not a day, and
     * the reader is the one who knows which day.
     */
    const datesToConfirm = (u: Understanding): boolean => Boolean(u.rental && isFromFilters(u.rental.said));

    /** The date question, filled in with everything Lens already knows. */
    const periodAsk = (u: Understanding): Ask => {
        const search = latest.current.page?.search ?? null;

        return {
            of: "period",
            term: searchTerm(search),
            start: searchStart(search),
            prefill: u.rental ? rentalDates(u.rental) : null,
        };
    };

    /**
     * The guide has been through; what's left is what Lens always needs.
     *
     * Budget and dates, and any equipment these cars differ on that one of
     * their needs would score — the deterministic half of what the model
     * offers, read off the page instead of off the person.
     */
    const finishGuide = useCallback(
        (u: Understanding) => {
            const current = latest.current;
            const missing = missingEssentials(u);
            const again = askingAgain.current;
            askingAgain.current = false;
            const budget = missing.budget || again;
            const period = missing.period || again || datesToConfirm(u);
            const offers = offersFor(u, current.scopes[current.kind].cars);

            /* Asking again: what they said before is filled in, and keeping it is one tap. */
            if (budget) openAsk({ of: "budget", prefill: again ? (u.budget?.monthly ?? null) : null, keep: again ? (u.budget?.monthly ?? null) : null });
            if (period) openAsk(periodAsk(u));

            for (const offer of offers) openAsk({ of: "feature", id: offer.id, why: offer.why, needId: offer.needId });

            if (!budget && !period && !offers.length) offerCompare(u);
        },
        [offerCompare, openAsk],
    );

    /* One question at a time: this is a conversation, not a form. */
    const askNextStep = useCallback(
        (u: Understanding) => {
            const step = guide.current.shift();

            if (step) {
                openAsk({ of: "choices", step });
                return;
            }

            finishGuide(u);
        },
        [finishGuide, openAsk],
    );

    const startGuide = useCallback(() => {
        const current = latest.current;

        /* How far they drive is answered by a mileage package they picked on finn.com. */
        const skip: GuideStepId[] = current.understanding.monthlyKm?.said.includes(FILTER_SAID) ? ["distance"] : [];

        guide.current = guideSteps(current.scopes[current.kind].cars, current.enabled, skip);
        askingAgain.current = Boolean(current.run);
        retireAsks();

        const fromFilters = current.run ? "" : searchSentence(current.understanding, current.page?.search ?? null);

        say(
            current.run
                ? "Tell me what's changed and I'll run it again."
                : `Let's work it out together. I'll ask a few things — only what I can actually check on these cars.${fromFilters ? ` ${fromFilters}` : ""}`,
        );
        askNextStep(current.understanding);
    }, [askNextStep, retireAsks, say]);

    const answerChoices = useCallback(
        (entryId: number, step: GuideStep, chosen: string[], said: string) => {
            const next = applyChoices(latest.current.understanding, step, chosen);

            setUnderstanding(next);
            latest.current.understanding = next;
            closeAsk(entryId, said);
            recordAnswer(said);
            askNextStep(next);
        },
        [askNextStep, closeAsk, recordAnswer],
    );

    /**
     * A what-if Lens thought of itself, put to the reader exactly as the
     * model's are: the change, what it would do, and their decision at the end.
     */
    const proposeWhatIf = useCallback(
        (item: { label: string; reply: string; after: Understanding }) => {
            const before = latest.current.applied?.understanding ?? latest.current.understanding;

            push({ kind: "whatIf", reply: item.reply, after: item.after, lines: diffUnderstanding(before, item.after), status: "pending" });
            history.current.push({ role: "lens", text: item.reply });
        },
        [push],
    );

    /* -- Keeping the conversation ------------------------------------------ */

    /**
     * The whole conversation, kept across page loads, tabs and days
     * (`lib/lens-chat/transcript.ts`). Nothing is shown until what was kept
     * has been read, so a reopened chat never flashes empty and then fills.
     */
    const frameId = useRef(crypto.randomUUID());
    /** The newest save this frame has made or taken on. */
    const rev = useRef(0);
    /** A "picked up again" divider is owed once the page is known. */
    const resumeOwed = useRef(false);

    const takeOn = useCallback((saved: SavedTranscript<Entry>) => {
        const kept = saved.entries.filter((entry) => entry.kind !== "thinking");

        nextId.current = Math.max(0, ...kept.map((entry) => entry.id)) + 1;
        rev.current = saved.rev;
        setEntries(kept);
        setUnderstanding(saved.understanding);
        latest.current.understanding = saved.understanding;
        setApplied(saved.applied);
        setOpenQuestion(saved.openQuestion);
        setRun(null);
        answered.current = saved.answered;
        history.current = saved.history;
        guide.current = saved.guide;
        askingAgain.current = saved.askingAgain;
        pendingAnswer.current = saved.pendingAnswer;
        carriedOver.current = saved.carriedOver;
        lastRun.current = saved.lastRun;
        /*
         * The filters the conversation last knew, so this page's are compared
         * with them: changed while away, they're reconsidered like a change
         * made with the chat open. The key can't match any real search, so
         * the comparison always runs.
         */
        lastSearch.current = saved.search === undefined ? null : { key: "(kept)", search: saved.search };
        /* What was still waiting for an answer is still waiting. */
        asksOpen.current = kept.filter((entry) => entry.kind === "ask" && !entry.answered && !entry.superseded).length;
        setRestoreCount((count) => count + 1);
    }, []);

    useEffect(() => {
        void loadTranscript<Entry>().then((saved) => {
            if (saved?.entries.length) {
                takeOn(saved);
                resumeOwed.current = true;
            }

            setRestored(true);
        });

        /*
         * Another tab moved the conversation on. A tab in the background takes
         * that on at once; the one being used keeps what's on its screen, and
         * catches up when the reader comes back to it.
         */
        const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
            if (area !== "local" || !(TRANSCRIPT_KEY in changes)) return;

            const saved = changes[TRANSCRIPT_KEY]!.newValue as SavedTranscript<Entry> | undefined;

            if (saved && saved.by !== frameId.current && saved.rev > rev.current && document.visibilityState === "hidden") takeOn(saved);
        };

        const onVisible = () => {
            if (document.visibilityState !== "visible") return;

            void loadTranscript<Entry>().then((saved) => {
                if (saved && saved.by !== frameId.current && saved.rev > rev.current) takeOn(saved);
            });
        };

        browser.storage.onChanged.addListener(onChange);
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            browser.storage.onChanged.removeListener(onChange);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [takeOn]);

    /* Kept as it changes, by the tab the reader is using, and never as an empty copy. */
    useEffect(() => {
        if (!restored || !entries.length) return;

        const timer = window.setTimeout(() => {
            if (document.visibilityState !== "visible") return;

            rev.current += 1;

            void saveTranscript<Entry>({
                version: 1,
                savedAt: new Date().toISOString(),
                rev: rev.current,
                by: frameId.current,
                entries: entries.filter((entry) => entry.kind !== "thinking").map(forKeeping),
                understanding,
                applied,
                lastRun: lastRun.current,
                openQuestion,
                answered: answered.current,
                history: history.current,
                guide: guide.current,
                askingAgain: askingAgain.current,
                pendingAnswer: pendingAnswer.current,
                carriedOver: carriedOver.current,
                search: lastSearch.current?.search ?? null,
            });
        }, 400);

        return () => window.clearTimeout(timer);
    }, [restored, entries, understanding, applied, openQuestion, run]);

    /*
     * The card, ranked again for today. What was kept is the search and the
     * cars it covered, not the old ranking: prices and availability move, and
     * a card that quietly showed last week's numbers would be wrong.
     */
    useEffect(() => {
        if (!restoreCount || !pageLoaded || !base) return;

        const saved = lastRun.current;
        const current = latest.current;

        if (!saved || !current.applied) return;

        const cars = carsById(saved.carIds, stored, page);

        if (!cars.length) {
            say("The cars from your last comparison aren't available any more, so there's no card to show — everything we said is still here above.", "note");
            return;
        }

        const result = runLens(cars, current.applied.translation.answers, saved.scope, saved.headline, ruledOut(current.applied.understanding));

        if (result) setRun(result);

        if (cars.length < saved.carIds.length) {
            say(`${saved.carIds.length - cars.length} of the cars from that comparison aren't available any more; the card ranks the ${cars.length} that are.`, "note");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restoreCount, pageLoaded, base]);

    /**
     * Where and when the conversation was picked up again, once the page is
     * known. Called first by anything that adds to the conversation on
     * arrival — the filter check can ask a question the moment the page is
     * read — so the divider always comes before what happened after it.
     */
    const payResumeDivider = () => {
        const current = latest.current;

        if (!resumeOwed.current || !current.page) return;

        resumeOwed.current = false;

        const car = current.scopes.thisCar.cars[0];
        const where =
            current.page.kind === "details" ? (car ? `the ${car.name} page` : "a car page") : current.page.search ? "a filtered listing" : "a listing";
        const divider = { id: nextId.current++, at: new Date().toISOString(), kind: "divider", text: `Picked up again ${stamp(new Date())} on ${where}`, fresh: false } as Entry;

        /* Opened and closed without a word: one divider, not a stack of them. */
        setEntries((all) => {
            const last = all.at(-1);

            return last?.kind === "divider" && !last.fresh ? [...all.slice(0, -1), divider] : [...all, divider];
        });
    };

    useEffect(() => {
        if (restored && page) payResumeDivider();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restored, page]);

    /**
     * Starting over, without losing anything.
     *
     * What Lens understands, the card and anything still waiting for an answer
     * are set down; the conversation stays, above a divider, for the reader to
     * scroll back through. The filters on this page are read in again, since
     * they're still what the reader is looking at.
     */
    const startOver = useCallback(() => {
        retireAsks();
        setEntries((all) =>
            all.map((entry) =>
                entry.kind === "confirm" && !entry.done
                    ? { ...entry, done: "closed" as const }
                    : entry.kind === "whatIf" && (entry.status === "pending" || entry.status === "ran")
                      ? { ...entry, status: "cancelled" as const }
                      : entry,
            ),
        );

        const fresh = withSearch(EMPTY_UNDERSTANDING, latest.current.page?.search ?? null);

        setUnderstanding(fresh);
        latest.current.understanding = fresh;
        setApplied(null);
        setRun(null);
        setOpenQuestion(null);
        setInspector(null);
        answered.current = [];
        history.current = [];
        guide.current = [];
        askingAgain.current = false;
        pendingAnswer.current = null;
        carriedOver.current = false;
        lastRun.current = null;
        /* The rest of Lens stops judging by the old conversation: badges and pages go back to the settings. */
        void clearSession();
        push({ kind: "divider", text: `New conversation ${stamp(new Date())}`, fresh: true });
    }, [push, retireAsks]);

    /* -- When the reader changes a filter mid-conversation ------------------ */

    /**
     * Says what the filters changed, once per burst.
     *
     * FINN's sidebar gets clicked several times in a row, and a note per click
     * — six of them, two saying nothing had changed — buried the conversation.
     * While nothing but this note and the questions it asked again has
     * happened since, the same note is brought up to date instead: it always
     * says what changed since the reader last did anything here.
     */
    const noteFilterChange = useCallback((was: string[], now: string[], cleared: boolean) => {
        setEntries((all) => {
            let at = all.length - 1;

            while (at >= 0 && all[at]!.kind === "ask" && (all[at] as { again?: boolean }).again && !(all[at] as { answered: boolean }).answered) at -= 1;

            const note = all[at];

            if (note?.kind === "filters") {
                const merged = { ...note, now, cleared };
                const unchanged = !cleared && !describeFilterChange(merged.was, now);

                return unchanged ? all.filter((entry) => entry.id !== note.id) : all.map((entry) => (entry.id === note.id ? merged : entry));
            }

            if (!cleared && !describeFilterChange(was, now)) return all;

            return [...all, { id: nextId.current++, at: new Date().toISOString(), kind: "filters", was, now, cleared } as Entry];
        });
    }, []);

    /**
     * Asks again about whatever a filter change made out of date.
     *
     * The dates, the budget and how far they drive are each both a filter and
     * a question. Changed on the page:
     *
     * - a question about it still waiting for an answer is struck through,
     *   with the reason, and asked again below with the new filter filled in —
     *   answering the old one would answer something the reader has since
     *   changed. One Lens asked only because of an earlier change in the same
     *   burst is simply dropped: nobody saw it long enough to answer it;
     * - an answer the reader already gave is asked about again, filled in
     *   from the new filter, with what they said before one tap away. Their
     *   answer stands until they choose — the filter doesn't overwrite it;
     * - where the filters now answer it outright (a start date and a contract
     *   length, a price range, a mileage package), there's nothing to ask.
     */
    const reconsider = useCallback(
        (before: FinnSearch | null, after: FinnSearch | null, next: Understanding) => {
            const current = latest.current;
            const changed = changedDecisions(before, after);
            const open = (test: (ask: Ask) => boolean) =>
                current.entries.filter(
                    (entry): entry is Extract<Entry, { kind: "ask" }> => entry.kind === "ask" && !entry.answered && !entry.superseded && test(entry.ask),
                );
            const setAside = (items: Extract<Entry, { kind: "ask" }>[], reason: string) => {
                if (!items.length) return;

                const drop = new Set(items.filter((item) => item.again).map((item) => item.id));
                const strike = new Set(items.filter((item) => !item.again).map((item) => item.id));

                asksOpen.current = Math.max(0, asksOpen.current - items.length);
                setEntries((all) =>
                    all
                        .filter((entry) => !drop.has(entry.id))
                        .map((entry) => (entry.kind === "ask" && strike.has(entry.id) ? { ...entry, superseded: reason } : entry)),
                );
            };

            const asked: Ask[] = [];
            const CHANGED = "You changed this filter before answering, so I've asked again below.";

            if (changed.period) {
                const waiting = open((ask) => ask.of === "period");
                const term = searchTerm(after);
                const start = searchStart(after);
                const whole = Boolean(next.rental && isFromFilters(next.rental.said));
                const own = next.rental && !isFromFilters(next.rental.said) ? next.rental : null;

                setAside(waiting, whole ? "Your filters now say when, so there's nothing left to ask." : CHANGED);

                if (own) {
                    const kept = rentalDates(own);
                    const from = start ? startDate(start) : kept.from;

                    asked.push({
                        of: "period",
                        term,
                        start,
                        prefill: { from, to: term ? termEnd(from, term) : kept.to },
                        title: `${
                            start
                                ? `Your filters now say you need it ${start.phrase}.`
                                : term
                                  ? `Your filters now say a ${term}-month contract.`
                                  : "You took the date filters off."
                        } Do these dates still work?`,
                    });
                } else if (waiting.length && !whole) {
                    asked.push({ of: "period", term, start });
                }
            }

            if (changed.budget) {
                const waiting = open((ask) => ask.of === "budget");
                const top = after?.maxPrice ?? null;
                const fromFilter = Boolean(next.budget && isFromFilters(next.budget.said));
                const own = next.budget && !fromFilter ? next.budget : null;
                const noLimit = next.waived.includes("budget");

                setAside(waiting, fromFilter ? "Your price filter answers this now." : CHANGED);

                if ((own || noLimit) && top) {
                    asked.push({
                        of: "budget",
                        prefill: top,
                        keep: own?.monthly ?? null,
                        title: `Your price filter now goes up to ${formatEUR(top)}. Is that your limit now?`,
                    });
                } else if (waiting.length && !fromFilter) {
                    asked.push({ of: "budget", prefill: top });
                }
            }

            if (changed.distance) {
                const waiting = open((ask) => ask.of === "choices" && ask.step.id === "distance");
                const fromFilter = Boolean(next.monthlyKm && isFromFilters(next.monthlyKm.said));
                const own = next.monthlyKm && !fromFilter ? next.monthlyKm : null;
                const pack = after?.mileagePackage ?? null;

                setAside(waiting, fromFilter ? "Your mileage package answers this now." : CHANGED);

                /* A question still to come in Lens Chat's run is one the filter just answered. */
                if (fromFilter) guide.current = guide.current.filter((step) => step.id !== "distance");

                const step = guideSteps(current.scopes[current.kind].cars, current.enabled).find((item) => item.id === "distance");

                if (step && own && pack) {
                    asked.push({
                        of: "choices",
                        step: {
                            ...step,
                            ask: `Your filters now show prices for the ${pack.toLocaleString("en-GB")} km package. How far do you drive in a month?`,
                            hint: `You said about ${own.value.toLocaleString("en-GB")} km before. FINN charges for what you drive beyond the package.`,
                        },
                    });
                } else if (step && waiting.length && !fromFilter) {
                    asked.push({ of: "choices", step });
                }
            }

            if (!asked.length) return;

            /* Something to answer first: a "ready to compare" still waiting is no longer ready. */
            setEntries((all) => all.map((entry) => (entry.kind === "confirm" && !entry.done ? { ...entry, done: "closed" as const } : entry)));

            for (const ask of asked) openAsk(ask, true);
        },
        [openAsk],
    );

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
                    /*
                     * No message guard here: a what-if is a proposal the reader
                     * has to accept, so its budget may move on a turn that
                     * never mentioned money.
                     */
                    readUnderstanding(result.understanding, before, enabledIds, undefined, null),
                    said,
                );

                history.current.push({ role: "lens", text: reply });
                push({ kind: "whatIf", reply, after, lines: diffUnderstanding(before, after), status: "pending" });
                return;
            }

            const { reply, understanding: next } = groundInWhatWasSaid(
                result.reply,
                readUnderstanding(result.understanding, current.understanding, enabledIds, undefined, message),
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

            /* This turn is asking now; whatever the last one left open is stale. */
            retireAsks();

            const missing = missingEssentials(next);

            if (missing.budget) openAsk({ of: "budget" });
            if (missing.period || datesToConfirm(next)) openAsk(periodAsk(next));
            if (question) openAsk({ of: "question", question });

            for (const item of suggestions) openAsk({ of: "feature", id: item.id, why: item.why, needId: item.needId });

            /* "Compare my cars" with nothing new to understand: just compare. */
            if (suggested && current.run) {
                compareWith(next, suggested);
                return;
            }

            if (!missing.budget && !missing.period && !datesToConfirm(next) && !question && !suggestions.length) offerCompare(next);
        },
        [compareWith, offerCompare, openAsk, push, remove, retireAsks, say, switchScope],
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

        /*
         * "Why not that one?" is a question about two cars, and Lens holds
         * every reason: the two scores, the priority each one wins, the
         * equipment only one lists, and the money. Answered here rather than
         * by the model, which can only repeat the winner's own summary — the
         * sentence that says "this car" and names neither of them.
         */
        if (currentRun && WHY_NOT.test(text)) {
            const asked = carNamed(currentRun, text);
            const answer = asked ? whyNot(currentRun, asked.id) : null;

            if (answer) {
                const said = answer.sentences.join(" ");

                push({ kind: "carAnswer", text: said, carId: answer.carId });
                history.current.push({ role: "lens", text: said });
                return;
            }
        }

        /*
         * Lens Chat can't read a sentence — that is what Lens AI adds — so
         * rather than refuse, it asks. The questions cover the same ground the
         * typed message would have.
         */
        if (!aiReady) {
            say("I can't read what you typed unless Lens AI is on — but I can ask instead, and my questions cover the same ground.", "note");
            startGuide();
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
        (entryId: number, next: Understanding, said: string, choice: string | null = null) => {
            setUnderstanding(next);
            latest.current.understanding = next;
            closeAsk(entryId, said, choice);
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
            const said = take ? `Yes, count ${barePhrase(id)}.` : `${asPhrase(id)} isn't important to me.`;

            closeAsk(entryId, said, take ? "yes" : "no");
            recordAnswer(said);
            settleAsks();
        },
        [closeAsk, recordAnswer, settleAsks],
    );

    /** The model asked; only the model can make anything of the answer. */
    const answerQuestion = useCallback(
        (entryId: number, answer: string) => {
            pendingAnswer.current = answer;
            closeAsk(entryId, answer, answer);
            recordAnswer(answer);
            settleAsks();
        },
        [closeAsk, recordAnswer, settleAsks],
    );

    /**
     * "Not quite": the reader wants to change something before Lens compares.
     *
     * It used to only move the cursor into the message box, which looked like
     * nothing happening. Now Lens asks what to change, points at the full list
     * of what it has, and the next message goes through the model as a
     * correction — after which Lens offers to compare again.
     */
    const correctIt = (entryId: number) => {
        setEntries((all) => all.map((item) => (item.id === entryId && item.kind === "confirm" ? { ...item, done: "correcting" as const } : item)));
        say("What should I change? Tell me in your own words — anything from the budget to what the car has to do. Everything I've understood so far is under “Your needs” at the top.");
        setInput("");
        inputRef.current?.focus();
    };

    const confirmCompare = (entryId: number) => {
        const shown = compareWith(latest.current.understanding, latest.current.kind);

        if (!shown) return;

        setEntries((all) => all.map((item) => (item.id === entryId && item.kind === "confirm" ? { ...item, done: "compared" as const } : item)));

        if (!carriedOver.current) {
            carriedOver.current = true;
            say("Your saved settings haven't changed. Open the recommendation page from the card to see this search there in full.", "note");
        }
    };

    /* -- Acting on cars ----------------------------------------------------- */

    /** A car's name for the record, from whatever Lens holds of it. */
    const nameOf = (carId: number): string => {
        const car = stored.pinned[carId] ?? stored.loaded[carId];

        return car ? `the ${car.name}` : "a car";
    };

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
                    return;
                }

                record(pinned ? `You pinned ${nameOf(carId)}.` : `You unpinned ${nameOf(carId)}.`);
            });
        },
        canShow: (carId) => Boolean(page?.pageCarIds.includes(carId)),
        onShow: (carId) => {
            void requestShowCar(carId);
            record(`You looked at ${nameOf(carId)} on the page.`);
        },
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

        update(entry.id, (item) => (item.kind === "whatIf" ? { ...item, status: "ran", ran: { outcome, scope: after.scope, translation } } : item));
    };

    const useWhatIf = (entry: Extract<Entry, { kind: "whatIf" }>) => {
        if (!entry.ran) return;

        setUnderstanding(entry.after);
        update(entry.id, (item) => (item.kind === "whatIf" ? { ...item, status: "used" } : item));
        latest.current.understanding = entry.after;
        record(`You took the change: ${entry.lines.map((line) => `${line.label.toLowerCase()} ${line.from} → ${line.to}`).join("; ") || "the new situation"}.`);
        compareWith(entry.after, entry.ran.scope);
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

    /** The cars the card's comparison ran over, rules and all — kept with the run, or read off it. */
    const comparedIds = (target: LensRun): number[] =>
        lastRun.current?.carIds.length ? lastRun.current.carIds : target.recommendation.context.vehicles.map((car) => car.id);

    /**
     * "Open the full recommendation": the page opens on exactly this search.
     *
     * Saved again at the press, not left from when it was first compared. The
     * card may have come back from a kept conversation days later, long after
     * the session it was saved with expired, or another conversation may have
     * saved over it since — either way the page would have opened on
     * something other than the card the reader just pressed.
     */
    const handOver = async () => {
        const current = latest.current;

        if (current.applied && current.run) await saveSession(sessionFrom(current.applied, current.run, comparedIds(current.run)));

        await markHandOff();
        await openBrowserTab("OPEN_COMPARE_PAGE");
    };

    const keepSearch = () => {
        const current = latest.current;
        if (!current.applied || !current.run) return;

        const session = sessionFrom(current.applied, current.run, comparedIds(current.run));

        void saveSearch({
            ...session,
            id: `search-${Date.now()}`,
            name: nameFor(session),
            /* What it's about, each thing once, and not just its name again. */
            note: [...new Set([session.summary, ...session.focus.map((item) => item.label)])]
                .filter((part) => part && part !== nameFor(session))
                .join(" · "),
        });

        record(`You kept this search as “${nameFor(session)}”.`);
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

        record("You saved this search as your Lens settings.");
    };

    /* The conversation so far has ended at a "New conversation" divider, or never began. */
    const fresh = (() => {
        /* Only filter notes since the last "New conversation" (or since nothing at all): still at the start. */
        const since = entries.findLastIndex((entry) => entry.kind === "divider" && entry.fresh);
        const begun = entries.findLastIndex((entry) => entry.kind !== "filters");

        return begun === -1 || begun === since;
    })();

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
              /*
               * With Lens AI on, a change of mind is something the reader says.
               * Without it, Lens offers the changes this comparison actually
               * turned on — a budget that kept the best match out, a rule that
               * set cars aside — and asking again is a tap.
               */
              ...(aiReady
                  ? [{ label: "My budget changed", act: () => void send("My budget changed.") }]
                  : /* One, and the foot of the panel owns "change my answers". */
                    whatIfs(run, applied?.understanding ?? understanding)
                        .slice(0, 1)
                        .map((item) => ({ label: item.label, act: () => proposeWhatIf(item) }))),
          ].slice(0, 3)
        : fresh
          ? aiReady
              ? STARTERS.map((starter) => ({ label: starter.title, act: () => void send(starter.message) }))
              : []
          : [];

    /* -- Rendering ----------------------------------------------------------- */

    const ready = Boolean(base && pageLoaded && restored);
    const lastPick = entries.map((entry) => entry.kind).lastIndexOf("pick");
    /* "Comparing 3 cars on this page" is a header; "3 cars on this page" is a sentence. */
    const scopeLabel = scope.headline.replace(/^Comparing /, "").replace(/^Looking at /, "");

    return (
        <div className="relative flex h-screen flex-col bg-white font-sans text-finn-black">
            <Header
                scope={scope}
                scopes={scopes}
                kind={kind}
                name={status.state === "checking" ? "Lens" : aiReady ? "Lens AI Chat" : "Lens Chat"}
                onScope={(next) => switchScope(next)}
                onNew={ready && !fresh ? startOver : undefined}
            />

            {/* What Lens is working with — a glance, and a way into the whole of it. */}
            <LensStatus understanding={understanding} onOpen={() => setInspector("needs")} />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-finn-snow px-3 py-3">
                {!ready ? (
                    <div className="py-10">
                        <LensThinking>Reading this page…</LensThinking>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {withAskGroups(entries, (entry, index) => {
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
                                    return <LensThinking key={entry.id}>{entry.text}</LensThinking>;

                                case "error":
                                    return <AiError key={entry.id} message={entry.text} onRetry={entry.retry ?? undefined} />;

                                case "ask":
                                    if (entry.superseded) {
                                        const ask = entry.ask;
                                        const [look, title] =
                                            ask.of === "budget"
                                                ? (["budget", ask.title ?? "What’s the most you’d spend a month, all in?"] as const)
                                                : ask.of === "period"
                                                  ? (["dates", ask.title ?? periodTitle(ask.term ?? null, ask.start ?? null)] as const)
                                                  : ask.of === "choices"
                                                    ? (["about", ask.step.ask] as const)
                                                    : ask.of === "question"
                                                      ? (["question", ask.question.ask] as const)
                                                      : (["offer", EVIDENCE[ask.id].label] as const);

                                        return <ScratchedAsk key={entry.id} kind={look} title={title} reason={entry.superseded} />;
                                    }

                                    switch (entry.ask.of) {
                                        case "budget":
                                            return (
                                                <BudgetAsk
                                                    key={entry.id}
                                                    busy={busy}
                                                    prefill={entry.ask.prefill ?? null}
                                                    keep={entry.ask.keep ?? null}
                                                    title={entry.ask.title}
                                                    answered={entry.answered ? (entry.answer ?? { text: null, choice: null }) : null}
                                                    onAnswer={(monthly, choice) =>
                                                        answerEssential(
                                                            entry.id,
                                                            monthly
                                                                ? withBudget(latest.current.understanding, monthly, `you said up to €${monthly} a month`)
                                                                : waiveEssential(latest.current.understanding, "budget"),
                                                            monthly ? `My maximum is €${monthly} a month.` : "I don't have a fixed budget.",
                                                            choice,
                                                        )
                                                    }
                                                />
                                            );

                                        case "period":
                                            return (
                                                <PeriodAsk
                                                    key={entry.id}
                                                    busy={busy}
                                                    termMonths={entry.ask.term ?? null}
                                                    start={entry.ask.start ?? null}
                                                    prefill={entry.ask.prefill ?? null}
                                                    title={entry.ask.title}
                                                    answered={entry.answered ? (entry.answer ?? { text: null, choice: null }) : null}
                                                    onAnswer={(from, to, startDay, said) => {
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
                                                            said,
                                                        );
                                                    }}
                                                />
                                            );

                                        case "choices":
                                            return (
                                                <ChoiceAsk
                                                    key={entry.id}
                                                    step={entry.ask.step}
                                                    busy={busy}
                                                    answered={entry.answered ? (entry.answer ?? { text: null, choice: null }) : null}
                                                    onAnswer={(chosen, said) =>
                                                        answerChoices(entry.id, (entry.ask as { step: GuideStep }).step, chosen, said)
                                                    }
                                                />
                                            );

                                        case "question":
                                            return (
                                                <QuestionAsk
                                                    key={entry.id}
                                                    question={entry.ask.question}
                                                    busy={busy}
                                                    answered={entry.answered ? (entry.answer ?? { text: null, choice: null }) : null}
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
                                                    answered={entry.answered ? (entry.answer ?? { text: null, choice: null }) : null}
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
                                            count={scope.cars.length}
                                            isUpdate={entry.isUpdate}
                                            busy={busy}
                                            done={entry.done}
                                            onCompare={() => confirmCompare(entry.id)}
                                            onCorrect={() => correctIt(entry.id)}
                                        />
                                    );

                                case "carAnswer":
                                    return (
                                        <div key={entry.id} className="space-y-1.5">
                                            <Says>{entry.text}</Says>
                                            <SmallButton onClick={() => openCar(entry.carId, null)}>
                                                <Rows3 aria-hidden="true" className="h-3.5 w-3.5" />
                                                See them side by side
                                            </SmallButton>
                                        </div>
                                    );

                                case "action":
                                    return <ActionLine key={entry.id} text={entry.text} at={entry.at} />;

                                case "filters": {
                                    const change = describeFilterChange(entry.was, entry.now);

                                    return (
                                        <Says key={entry.id} tone="note">
                                            {entry.cleared
                                                ? "You've cleared your filters, so I've let go of what they told me."
                                                : `Your filters changed — ${change.charAt(0).toLowerCase()}${change.slice(1)}${run ? " Compare again to see what that does." : ""}`}
                                        </Says>
                                    );
                                }

                                case "divider":
                                    return <Divider key={entry.id} text={entry.text} />;

                                case "pick":
                                    /*
                                     * The latest comparison draws the card; every earlier one
                                     * keeps its line, so the record shows what Lens said then.
                                     */
                                    if (index !== lastPick || !run || !story || !match) {
                                        return entry.summary ? <EarlierPick key={entry.id} summary={entry.summary} /> : null;
                                    }

                                    return index === lastPick && run && story && match ? (
                                        <PickCard
                                            key={entry.id}
                                            basis={applied && readerSaidAnything(applied.understanding) ? "chat" : "settings"}
                                            story={story}
                                            level={run.level}
                                            car={match.car}
                                            alternative={others[0] ?? null}
                                            alternatives={others.slice(0, 4)}
                                            actions={actions}
                                            onWhy={() => setInspector("why")}
                                            onAlternatives={() => setInspector("alternatives")}
                                            onCar={(carId) => openCar(carId, null)}
                                            onOpenPage={() => {
                                                /* The press is the answer: the page opens on this search and asks nothing. */
                                                record("You opened the full recommendation page.");
                                                void handOver();
                                            }}
                                        />
                                    ) : null;

                                case "whatIf":
                                    return (
                                        <WhatIfAsk
                                            key={entry.id}
                                            reply={entry.reply}
                                            lines={entry.lines}
                                            status={entry.status}
                                            busy={busy}
                                            onRun={() => runWhatIf(entry)}
                                            onCancel={() => {
                                                update(entry.id, (item) => (item.kind === "whatIf" ? { ...item, status: "cancelled" } : item));
                                                record("You kept what you had.");
                                            }}
                                            outcome={entry.ran?.outcome ?? null}
                                            onUse={() => useWhatIf(entry)}
                                        />
                                    );
                            }
                        })}

                        {/* Nothing said yet, or a new conversation just begun: the ways in. */}
                        {fresh && (
    <EmptyState
                            scope={scope}
                            aiState={status.state}
                            heard={heardFromSearch(understanding, page?.search ?? null)}
                            personalised={personalised}
                            onOpenSettings={() => void openBrowserTab("OPEN_SETTINGS_PAGE")}
                            onUseSettings={() =>
                                compareWith(
                                    latest.current.understanding,
                                    kind,
                                    `Using your ${personalised ? "" : "default "}Lens settings${heardFromSearch(latest.current.understanding).used.length ? ", with your filters" : ""}.`,
                                )
                            }
                            onStart={(message) => void send(message)}
                            onAsk={startGuide}
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

                {aiReady ? (
                    <Composer
                        value={input}
                        busy={busy}
                        ready={ready}
                        inputRef={inputRef}
                        onChange={setInput}
                        onSend={() => void send(input)}
                        placeholder={run ? "Ask about this car, or tell me more…" : "Tell me about your life with the car…"}
                    />
                ) : (
                    <TypingOffer
                        askLabel={run ? "Change my answers" : "Ask me questions"}
                        onAsk={startGuide}
                        onOpenSettings={() => void openBrowserTab("OPEN_SETTINGS_PAGE")}
                    />
                )}
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
                    onBack={goBack}
                    backLabel={backLabel(inspector)}
                    run={run}
                    carId={inspectCar}
                    onCar={(carId) => openCar(carId, "alternatives")}
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
                    onBack={goBack}
                    backLabel={backLabel(inspector)}
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
                This search belongs to this conversation. Take it to the recommendation page from the card below; your saved Lens
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
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/** Something the reader did, with when: "You pinned the Opel Corsa · 22:40". */
function ActionLine({ text, at }: { text: string; at?: string }) {
    const time = at ? new Date(at) : null;

    return (
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-finn-iron">
            <CircleCheck aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-finn-accent-blue" />
            <span>
                {text}
                {time && !Number.isNaN(time.getTime()) && (
                    <time dateTime={at} className="ml-1 tabular-nums text-finn-iron/70">
                        · {time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                )}
            </span>
        </p>
    );
}

/** Where the conversation broke off and began again: another page, another day, or starting over. */
function Divider({ text }: { text: string }) {
    return (
        /* Not upper case: it names cars, and "BMW IX1" isn't what FINN sells. */
        <div role="separator" className="flex items-center gap-2 py-1 text-center text-[11px] font-bold text-finn-iron">
            <span className="h-px flex-1 bg-finn-cotton" />
            {text}
            <span className="h-px flex-1 bg-finn-cotton" />
        </div>
    );
}

/**
 * A comparison the conversation has moved past, as the line it deserves:
 * what Lens picked then, how well it fitted and what it cost. The card itself
 * belongs to the latest comparison only.
 */
function EarlierPick({ summary }: { summary: PickSummary }) {
    return (
        <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-finn-cotton">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-finn-iron">Lens's match then · {summary.scope.replace(/^Comparing /, "")}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-black text-finn-black">
                {summary.name}
                <BandChip car={{ band: summary.band, bandLabel: summary.bandLabel }} score={summary.total} />
                <span className="font-bold text-finn-iron">~{formatEUR(summary.monthly)}/month</span>
            </p>
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function Header({
    scope,
    scopes,
    kind,
    name,
    onScope,
    onNew,
}: {
    scope: Scope;
    scopes: Record<ScopeKind, Scope>;
    kind: ScopeKind;
    /**
     * Which chat this is: "Lens Chat", or "Lens AI Chat" where the reader has
     * switched the model on. The panel behaves differently enough — one asks,
     * the other reads — that it has to say which it is without being asked.
     */
    name: string;
    onScope: (kind: ScopeKind) => void;
    /** Starts over under a divider, keeping everything said so far. Absent when there's nothing to start over from. */
    onNew?: () => void;
}) {
    const options: ScopeKind[] = ["page", "pinned", "thisCar"];

    return (
        <header className="border-b border-finn-cotton bg-white px-3 pb-2.5 pt-3">
            <div className="flex items-center gap-2 pl-3">
                <img src="/icon/48.png" alt="" className="h-7 w-7 rounded-full bg-white" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black leading-4">{name}</p>
                    <p className="truncate text-[11px] leading-4 text-finn-iron" aria-live="polite">
                        {scope.headline}
                        {scope.kind === "page" && scope.missing > 0 ? ` · ${scope.missing} not loaded yet` : ""}
                    </p>
                </div>
                {onNew && (
                    <button
                        type="button"
                        onClick={onNew}
                        title="Start a new conversation. Everything so far stays above it."
                        className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-black text-finn-iron transition hover:bg-finn-snow hover:text-finn-black"
                    >
                        <SquarePen aria-hidden="true" className="h-3.5 w-3.5" />
                        New
                    </button>
                )}
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
                                "flex flex-1 items-center justify-center gap-1 truncate rounded-full px-2 py-1.5 text-[11px] font-black transition",
                                selected ? "bg-white text-finn-black shadow-sm" : "text-finn-iron hover:text-finn-black",
                                "disabled:cursor-not-allowed disabled:opacity-40",
                            ].join(" ")}
                        >
                            {option === "page" ? "This page" : option === "pinned" ? "Pinned" : "This car"}
                            {option !== "thisCar" && (
                                <span className="text-finn-iron">{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </header>
    );
}

/**
 * What the reader already told FINN, said back before Lens asks anything.
 *
 * The filters are answers, and seeing them here is how the reader knows they
 * won't be asked again — and can see at once if Lens read one wrong. What Lens
 * uses comes first; what it only noted (brands, colours, offers) is quieter,
 * because it changes nothing about the ranking.
 */
function FromFilters({ heard }: { heard: { used: string[]; noted: string[] } }) {
    return (
        <div className="mt-4 rounded-2xl bg-white px-3 py-3 ring-1 ring-finn-cotton">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">
                <SlidersHorizontal aria-hidden="true" className="h-3 w-3" />
                From your filters
            </p>

            {heard.used.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {heard.used.map((item) => (
                        <span key={item} className="rounded-full bg-finn-pale-blue px-2 py-0.5 text-[11px] font-bold text-finn-accent-blue">
                            {item}
                        </span>
                    ))}
                </div>
            )}

            {heard.noted.length > 0 && <p className="mt-2 text-[11px] leading-4 text-finn-iron">Also noted: {heard.noted.join(" · ")}</p>}

            <p className="mt-2 text-[11px] leading-4 text-finn-iron">
                {heard.used.length
                    ? heard.used.some((item) => /^(By|From) |-month contract$| – /.test(item))
                        ? "Lens fills the dates in for you to check, and won't ask about the rest again. Change a filter on the page and it keeps up."
                        : "Lens won't ask about these again. Change a filter on the page and it keeps up."
                    : "Lens notes these, but they don't change how it ranks."}
            </p>
        </div>
    );
}

/**
 * The way in, for whichever chat this is.
 *
 * Lens Chat asks; Lens AI Chat also reads. So the first thing on screen is
 * the thing this version can actually do — the questions where the model is
 * off, an empty box and a real example where it's on — and the other way in is
 * offered below it rather than explained as something missing. The old screen
 * led with "tell Lens in your own words" whether or not anything could read
 * them, and then apologised underneath.
 */
function EmptyState({
    scope,
    aiState,
    heard,
    personalised,
    onOpenSettings,
    onUseSettings,
    onStart,
    onAsk,
}: {
    scope: Scope;
    aiState: "checking" | "off" | "ready";
    /** What Lens took from the reader's finn.com filters: what it will use, and what it only noted. */
    heard: { used: string[]; noted: string[] };
    personalised: boolean;
    onOpenSettings: () => void;
    onUseSettings: () => void;
    onStart: (message: string) => void;
    onAsk: () => void;
}) {
    const ai = aiState === "ready";

    return (
        <div className="px-2 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-finn-accent-blue">{ai ? "Lens AI Chat" : "Lens Chat"}</p>
            <h2 className="mt-1 text-xl font-black tracking-tight">What are you looking for?</h2>
            <p className="mt-1 text-sm leading-6 text-finn-iron">
                {ai
                    ? "Tell Lens in your own words. You’ll see how it understood you before anything changes."
                    : "Lens will ask a few questions about your life with the car, then compare what’s here against your answers."}
            </p>

            {ai ? (
                <button
                    type="button"
                    onClick={() => onStart(STARTERS[0]!.message)}
                    className="mt-3 w-full rounded-2xl bg-white px-3 py-2.5 text-left text-xs italic leading-5 text-finn-iron transition hover:text-finn-accent-blue"
                >
                    &ldquo;{STARTERS[0]!.message}&rdquo;
                </button>
            ) : (
                <button
                    type="button"
                    onClick={onAsk}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-finn-accent-blue px-4 text-sm font-black text-white transition hover:bg-finn-highlight-navy"
                >
                    <MessageCircle aria-hidden="true" className="h-4 w-4" />
                    Ask me a few questions
                </button>
            )}

            {heard.used.length + heard.noted.length > 0 && <FromFilters heard={heard} />}

            <p className="mt-4 text-[11px] leading-4 text-finn-iron">
                {scope.cars.length ? `Lens can compare ${scope.description}.` : "Lens doesn't have data for any cars in this set yet."}
            </p>

            {scope.cars.length > 0 && (
                <div className="mt-4 space-y-2">
                    {ai && <SecondaryButton onClick={onAsk}>Or let Lens ask me questions instead</SecondaryButton>}
                    <SecondaryButton onClick={onUseSettings}>
                        Or get a match from my {personalised ? "" : "default "}Lens settings{heard.used.length ? " and these filters" : ""}
                    </SecondaryButton>
                </div>
            )}

            {aiState === "off" && (
                <div className="mt-4 rounded-2xl bg-white px-3 py-3">
                    <p className="text-xs leading-5 text-finn-iron">
                        Turn Lens AI on and this same chat reads what you type instead: your own words, your own order, and questions
                        back about what it can&rsquo;t tell from them.
                    </p>
                    <button type="button" onClick={onOpenSettings} className="mt-1 text-xs font-black text-finn-accent-blue hover:underline">
                        Turn on Lens AI
                    </button>
                </div>
            )}
        </div>
    );
}

