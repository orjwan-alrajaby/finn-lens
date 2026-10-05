import type { FitLevel } from "@/lib/reasoning-engine/fit";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import type { EvidenceId } from "@/lib/lens-chat/evidence";
import type { GuideStep, NeedGroup } from "@/lib/lens-chat/guide";

import type { FollowUp } from "./follow-ups";
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

/**
 * Lens's questions. `bubbles` asks about the reader's life, one screen of
 * bubbles with chips under them; `often-long` and `often-traffic` ask how
 * often, which sets how much a bubble counts.
 *
 * The rest are from chats before the bubbles, kept so a question still open
 * in one can be answered: `life-…` asked the needs a group at a time,
 * `focus` which mattered most, `offer-…` equipment worth a look, and
 * `follow-…` the second question about one need.
 */
export type StepId =
    | GuideStep["id"]
    | "bubbles"
    | `often-${string}`
    | "budget"
    | "period"
    | "start"
    | "keep"
    /** The summary looked over: the reader says it's right before anything is saved or judged. */
    | "confirm"
    | "focus"
    | "offers"
    | "noNeeds"
    /** Change all the answers, or pick which. */
    | "changeHow"
    /** Which answers to change. */
    | "changeWhich"
    | `life-${NeedGroup}`
    | `follow-${string}`
    | `offer-${string}`
    /** Typed words gave more people than the count, enough to change the seats: which is right? The number is how many they gave. */
    | `check-passengers-${number}`;

/** One thing the reader can tap. */
export interface Choice {
    id: string;
    label: string;
    /** Recorded as the reader's own words when tapped. */
    said: string;
    /** What choosing it means, shown before and after it's picked. */
    description?: string;
    /** What the answer itself means, before what Lens checks for it. */
    means?: string;
    group?: NeedGroup;
    /** The equipment Lens will check for it, by name. */
    looksFor?: string[];
    /** The same equipment, each with what it does — for the "i" on the chip. */
    features?: { label: string; does: string }[];
}

/** The chips a bubble opens under itself: "Where do you park most often?". */
export interface BubbleChips {
    ask: string;
    multiple: boolean;
    max?: number;
    /** At least one has to be picked: "What's it like?" for the weather. */
    required: boolean;
    exclusive?: string[][];
    options: { id: string; label: string }[];
}

/** One bubble on the summary: what Lens understood, for the reader to correct. */
export interface SummaryBubble {
    id: string;
    /** "You have kids · a baby or toddler seat". */
    heading: string;
    importance: NeedImportance;
    /** How much it counts was said by the reader — a chip, how often, or the summary — not assumed. */
    importanceSaid: boolean;
    /** Whether it weighs anything: false once everything it counted was taken out. */
    counting?: boolean;
    /** What it counts; each can be taken out. Each item once, under the first bubble to name it. */
    counts: { id: EvidenceId; label: string }[];
    /** What it counts that a bubble above already shows. */
    shared?: { id: EvidenceId; label: string }[];
    /** Standard equipment it checks; nearly every car has it. */
    checks: { id: EvidenceId; label: string }[];
    /** Suggestions the cars here differ on; each can be added. */
    worth: { id: EvidenceId; label: string }[];
    /** A figure it's judged on, with no equipment: "each car's CO₂ per km". */
    figure?: string;
    /** What matters for this life that FINN's data can't tell Lens. */
    cantCheck: string;
    /** Said when it counts nothing yet: "Tell me which, and I'll count them." */
    empty?: string;
    /** What a deal-breaker already settles, so it isn't checked: "Six or more seats is a deal-breaker, so every car left has it." */
    settled?: string;
}

/** An answer of the reader's own, where the pre-made ones don't fit. */
export interface CustomAnswer {
    /** Words, read by Lens's reader, or a number with a unit. */
    kind: "text" | "amount" | "months" | "km";
    /** On the chip that opens it. */
    label: string;
    placeholder: string;
    min?: number;
    max?: number;
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
    /** With several answers: how many at most, when picking all of them would say nothing. */
    max?: number;
    /** Answers that can't both be true — "Electric only" and "Not electric": picking one takes back the other. */
    exclusive?: string[][];
    /**
     * Answers another one mostly covers, by what Lens checks for them: once
     * the key is picked, each listed answer is set aside, with what the two
     * share as the reason.
     */
    covers?: Record<string, { id: string; shared: string[] }[]>;
    choices: Choice[];
    /** The answer for someone none of the choices fit. */
    none?: string;
    /** Why Lens is asking: what the answer changes. Said with every question. */
    why?: string;
    custom?: CustomAnswer;
    /** Headings for the choices' groups, in order. */
    groups?: { id: NeedGroup; title: string }[];
    followUp?: FollowUp;
    /** Equipment offered for a need the reader gave. */
    offer?: { id: EvidenceId; needId: string };
    /** Choices preselected: what the reader said last time, when they're changing an answer. */
    selected?: string[];
    /**
     * The bubbles question: the chips each bubble opens under itself once
     * tapped. Answered as the bubble's id, and `bubble:chip` for each chip.
     */
    bubbleChips?: Record<string, BubbleChips>;
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
    /** Ranked, but past one of the reader's limits: said on the chip beside the verdict. */
    over: "budget" | "period" | null;
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
    /** Over the reader's monthly limit, or on no FINN term that covers their period. */
    overLimit: boolean;
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
          /** What the reader said matters, and how much. Absent on chats from before it was kept. */
          needs?: {
              id: string;
              label: string;
              importance: NeedImportance;
              /** Equipment this need is the first on the card to name. */
              looksFor: string[];
              /** How many more it counts that a need above already listed: each item is shown once. */
              also?: number;
          }[];
          /** What Lens understood from each bubble the reader tapped. Absent on chats from before them. */
          bubbles?: SummaryBubble[];
          /** What Lens will judge by, in plain lines, each with the question that sets it. */
          lines: { label: string; value: string; step?: StepId }[];
          /** The priorities those answers came to, with how much each counts. Only on summaries from before the bubbles: that's the drawer's now. */
          priorities?: { label: string; share: number; from?: string[] }[];
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
          /**
           * What the pick has for the reader's life, bubble by bubble, the
           * strongest first: "You have kids → rear doors". Only what it has.
           * Absent on results from before the bubbles.
           */
          why?: { said: string; has: string[] }[];
          /** Every reason the engine gave, the first being `reason`. */
          reasons?: string[];
          /** What the reader gives up by choosing it. */
          tradeoffs?: { headline: string; text: string }[];
          /** One thing to know, short: a limit note, else the biggest trade-off, else the engine's note. */
          know?: string | null;
          /** Which bubbles put weight where: "You have kids — must have → Practicality". */
          because?: { said: string; importance: NeedImportance; into: string[] }[];
          note: string | null;
          runnersUp: CarSnapshot[];
          setAside: number;
          /**
           * The judgement this result came from, by when it was made, so its
           * drawer opens on it rather than on a later one. Absent on results
           * from before this was kept: they open on the latest.
           */
          judgement?: string;
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
    /** What was tapped for each question, so asking it again starts from it. */
    picks?: Record<string, string[]>;
    judgement: Judgement | null;
    /**
     * Judgements made before the latest, oldest first, so an earlier result
     * in the chat still opens on what it said. The chips on the page follow
     * the latest only.
     */
    earlier?: Judgement[];
    /**
     * How the chat stood before each answer, newest last, so the last one can
     * be taken back and the question asked again. Emptied once the answers
     * are kept and judged — "Change my answers" is the way back from there.
     * Chats saved before this come back without it.
     */
    history?: Rewind[];
    /** Results the reader opened "See why" on. */
    opened?: string[];
    /** Results open with everything shown: the reader opened "See why" on two in a row, until "Keep it short". */
    longResults?: boolean;
}

/** One answer, and everything it changed, as it was just before it was given. */
export interface Rewind {
    /** The question it answered. */
    askId: string;
    /** The reader's words for it: where "Edit" sits. */
    readerId: string | null;
    /** What they picked, so the question comes back with it picked. */
    chosen: string[];
    /** How many messages there were before it. */
    messageCount: number;
    understanding: Understanding;
    queue: StepId[];
    phase: ChatPhase;
    picks: Record<string, string[]>;
    revising: boolean;
    kept: "settings" | "chat" | null;
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
    /** What was tapped for each question, so changing them starts from it. */
    picks?: Record<string, string[]>;
}
