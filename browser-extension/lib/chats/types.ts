import type { FitLevel } from "@/lib/reasoning-engine/fit";
import type { GuideStep } from "@/lib/lens-chat/guide";
import type { Understanding } from "@/lib/lens-chat/understanding";

/**
 * A conversation with Lens, kept.
 *
 * The chat is the whole product: it is where the reader says what they need,
 * where Lens says what it will judge by, and where the judgement is made. The
 * chips on FINN's cards and the drawers behind them are readings of a chat's
 * judgement, never judgements of their own — so a chat carries everything
 * they need to agree with it.
 *
 * Messages are stored as they were said. A result message keeps a snapshot of
 * what Lens said about the cars at the time, so scrolling back through an old
 * chat shows what it actually said then, whatever FINN's data says now.
 */

export type StepId = GuideStep["id"] | "budget" | "period" | "start" | "keep";

/** One thing the reader can tap. */
export interface Choice {
    id: string;
    label: string;
    /** Recorded as the reader's own words when tapped. */
    said: string;
}

/**
 * A question Lens asks with pre-made answers.
 *
 * The guided steps carry the guide's own data (needs, rules, kilometres) so
 * applying an answer never has to look the step up again: the page it was
 * asked on may be long gone by the time a chat is reopened.
 */
export interface ChatStep {
    id: StepId;
    ask: string;
    hint?: string;
    multiple: boolean;
    choices: Choice[];
    /** The answer for someone none of the choices fit. */
    none?: string;
    /** Choices preselected: what the reader said last time, when they're changing an answer. */
    selected?: string[];
    /** The guide's step, for `applyChoices`. Absent on Lens's own steps (budget, period, start). */
    guide?: GuideStep;
}

/** What a chip on a card says about one car. */
export interface Verdict {
    band: FitLevel;
    label: string;
    /** 1-based place in the ranking; null when the car was set aside. */
    rank: number | null;
    winner: boolean;
    /** Why the car wasn't ranked, when the reader's rules set it aside. */
    setAside: string | null;
}

/** A car as a result message shows it. */
export interface CarSnapshot {
    id: number;
    name: string;
    configuration: string;
    image: string | null;
    monthly: number | null;
    band: FitLevel;
    bandLabel: string;
    url: string | null;
}

/**
 * A judgement: the reader's answers, applied to a set of cars.
 *
 * Only the ids of the cars and the understanding it was made with are the
 * judgement; the verdicts are its reading, stored so a card can wear its chip
 * without the page running the engine.
 */
export interface Judgement {
    at: string;
    carIds: number[];
    winnerId: number | null;
    verdicts: Record<number, Verdict>;
    /** "24 cars matching your filters". */
    headline: string;
    /** Where it was made, so the chat can say so when opened elsewhere. */
    pageUrl: string;
    /**
     * Each car's own page on FINN, where the page drew a card for it. FINN's
     * data carries no link, and a "View on FINN" button that reloads the page
     * is worse than none, so a car without one simply has no link.
     */
    urls: Record<number, string>;
    /** The understanding it was made with — a later change doesn't rewrite a past judgement. */
    understanding: Understanding;
}

export type ChatMessage =
    | { id: string; at: string; from: "lens"; kind: "text"; text: string }
    | { id: string; at: string; from: "reader"; kind: "text"; text: string }
    | { id: string; at: string; from: "lens"; kind: "ask"; step: ChatStep; answered: boolean }
    | {
          id: string;
          at: string;
          from: "lens";
          kind: "summary";
          /** What Lens will judge by, in plain lines. */
          lines: { label: string; value: string }[];
          /** The priorities those answers came to, with how much each counts. */
          priorities: { label: string; share: number }[];
      }
    | {
          id: string;
          at: string;
          from: "lens";
          kind: "result";
          headline: string;
          count: number;
          winner: CarSnapshot | null;
          reason: string | null;
          note: string | null;
          runnersUp: CarSnapshot[];
          setAside: number;
      };

export type ChatPhase =
    /** Lens is asking its questions. */
    | "asking"
    /** The answers are in; Lens asked whether to keep them as settings. */
    | "keep"
    /** Ready to judge the cars on the page. */
    | "ready"
    /** A judgement exists. */
    | "judged";

export interface Chat {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
    understanding: Understanding;
    /** Steps still to ask, in order. */
    queue: StepId[];
    phase: ChatPhase;
    /**
     * Where these answers live: saved as the reader's settings, or in this
     * chat only. Null until the reader has said.
     */
    kept: "settings" | "chat" | null;
    /**
     * The reader is changing answers they already gave: each question comes
     * with what they said last time already picked, and asks even what they
     * have answered.
     */
    revising: boolean;
    judgement: Judgement | null;
}

/**
 * The reader's settings: the answers they asked Lens to keep.
 *
 * The rental period is kept as a length rather than dates, because "a year
 * from now" said in September means something else in March. It is turned back
 * into months from the day each new chat starts.
 */
export interface SavedSettings {
    savedAt: string;
    fromChatId: string;
    understanding: Understanding;
    rentalMonths: number | null;
}
