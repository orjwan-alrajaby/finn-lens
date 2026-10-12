/**
 * What Lens sends a model, and what it accepts back.
 *
 * Deliberately free of imports: nothing in here may pull the reasoning
 * engine — or anything else that decides — into what the model sees. Ids are plain strings on purpose: on the
 * way back they are *claims* by a language model, and `proposal.ts` is where
 * they are checked against the real vocabulary before anything uses them.
 *
 * The split the whole experiment rests on:
 *
 *   natural language ─► model      ─► ProposedChange ─► validate ─► Answers ─► engine
 *   engine result    ─► LensFacts  ─► model          ─► prose
 *
 * The model never sees a scoring function and never returns a score.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary: what Lens can represent                                        */
/* -------------------------------------------------------------------------- */

export interface VocabularyFeature {
    id: string;
    label: string;
    explanation: string;
    /** Counts only once raised — a towbar, roof rails. */
    niche: boolean;
}

export interface VocabularyCategory {
    id: string;
    label: string;
    question: string;
    description: string;
    /** The measured figure this priority reads, when it has one. */
    measured: string | null;
    /** The only features that may be raised under this priority. */
    features: VocabularyFeature[];
}

export interface VocabularyProfile {
    id: string;
    label: string;
    forWhom: string;
    priorities: string[];
}

export interface LensVocabulary {
    categories: VocabularyCategory[];
    profiles: VocabularyProfile[];
    importance: { id: "high" | "medium" | "low"; label: string; meaning: string }[];
    rules: string[];
    /** Things people ask about that Lens has no data or setting for. */
    notModelled: string[];
}

/** The reader's answers as they stand, in the vocabulary above. */
export interface CurrentAnswers {
    priorities: { id: string; label: string; rank: number; weightPercent: number }[];
    raised: { category: string; feature: string; label: string; importance: string }[];
    /** Null when no budget is set. */
    monthlyBudget: number | null;
    monthlyKm: number;
    contractType: "private" | "business";
    /** The period the reader needs the car for, months as "YYYY-MM", or null. */
    rentalPeriod: { from: string; to: string; months: number } | null;
    basedOnProfile: string | null;
    /** Today's date, "YYYY-MM-DD", so "this October" can be placed in a year. */
    today: string;
}

/* -------------------------------------------------------------------------- */
/* A proposed change — untrusted until validated                              */
/* -------------------------------------------------------------------------- */

export type ProposedImportance = "high" | "medium" | "low" | "standard";

export interface ProposedChange {
    /** Start from a profile's order and emphasis, before the edits below. */
    startFromProfile: string | null;
    /**
     * The priorities the reader's words put first, most important first. Lens
     * keeps their other current priorities after these. Null leaves the order
     * alone.
     */
    priorityOrder: { category: string; reason: string }[] | null;
    /** Priorities the reader explicitly said no longer matter to them. */
    removePriorities: { category: string; reason: string }[];
    /** Features to raise, re-level, or put back to standard. */
    raise: {
        category: string;
        feature: string;
        importance: ProposedImportance;
        reason: string;
    }[];
    budget: {
        action: "set" | "increaseBy" | "decreaseBy" | "remove";
        amount: number | null;
        reason: string;
    } | null;
    /** The reader talked about cost without giving a figure Lens could use. */
    budgetWithoutFigure: string | null;
    monthlyKm: { value: number; reason: string } | null;
    contractType: { value: "private" | "business"; reason: string } | null;
    /** From and until which month the reader needs the car, both "YYYY-MM". */
    rentalPeriod: {
        action: "set" | "remove";
        from: string | null;
        to: string | null;
        reason: string;
    } | null;
    /** What the reader said that no Lens setting can express. */
    notRepresentable: { said: string; explanation: string }[];
}

/* -------------------------------------------------------------------------- */
/* Facts: what Lens concluded, for grounding an answer                        */
/* -------------------------------------------------------------------------- */

/**
 * Built by `context.ts` from the engine's own output. Loosely typed here
 * because the server only forwards it; its exact shape is the extension's
 * business and is documented where it is built.
 */
export type LensFacts = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Requests and responses                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Which cars a conversation can be about.
 *
 * - `page` — the configurations on the finn.com page whose data Lens holds.
 * - `pinned` — the cars the reader explicitly pinned.
 * - `thisCar` — the one configuration the reader is looking at.
 */
export type ScopeKind = "page" | "pinned" | "thisCar";

export interface ScopeOption {
    kind: ScopeKind;
    /** "the 12 configurations on this finn.com page Lens has data for". */
    description: string;
    count: number;
}

/** The scopes on offer where the reader is, and which one is in use. */
export interface ConversationScope {
    current: ScopeKind | null;
    available: ScopeOption[];
}

export interface InterpretRequest {
    text: string;
    vocabulary: LensVocabulary;
    current: CurrentAnswers;
    /** Present when the conversation happens on finn.com, where scope can change. */
    scope?: ConversationScope;
}

export interface InterpretResult {
    /** One or two sentences, in the reader's terms, of what was understood. */
    summary: string;
    change: ProposedChange;
    /** The set of cars the reader's words point at, when they point at one. */
    scope?: ScopeKind | null;
}

export interface AskRequest {
    question: string;
    vocabulary: LensVocabulary;
    current: CurrentAnswers;
    facts: LensFacts;
    /** The last few exchanges, oldest first. Short-lived by design. */
    history: { question: string; answer: string }[];
    scope?: ConversationScope;
}

export interface AskResult {
    /**
     * `answer` — explained from the facts.
     * `whatIf` — a hypothetical, returned as a change for Lens to run.
     */
    kind: "answer" | "whatIf";
    answer: string;
    change: ProposedChange | null;
    /** The set of cars the question is about, when that differs from the one in use. */
    scope?: ScopeKind | null;
}

/* -------------------------------------------------------------------------- */
/* Conversation: understanding a person, not extracting priorities            */
/* -------------------------------------------------------------------------- */

/**
 * What a person has told Lens, kept as the kinds of thing it actually is.
 *
 * Not a priority list. A budget someone "can't exceed" is a constraint; two
 * children are context that creates needs; "I'm confident keeping my
 * distance" is a capability that makes some equipment matter less; "young"
 * is an unknown worth one question. Priorities are derived from this by the
 * extension, deterministically — the model never ranks or scores.
 *
 * The model returns the whole understanding on every turn, merged with the
 * one it was given. Everything in it is a claim until `understanding.ts`
 * checks it against Lens's vocabulary and evidence.
 */
export type NeedImportance = "essential" | "important" | "niceToHave";

export interface WireNeed {
    /** Stable across turns: "kids-entertained". */
    id: string;
    /** A short heading in the person's terms: "Keeping the kids occupied". */
    label: string;
    importance: NeedImportance;
    /** What they said that this comes from, quoted or closely paraphrased. */
    said: string;
    /** Lens priorities this need legitimately bears on. */
    priorities: string[];
    /**
     * Evidence Lens can check that would serve the need, each with how it
     * helps — a plain implication, never a spec: "could keep their tablets
     * charged on long drives".
     */
    evidence: { id: string; use: string; unwanted?: boolean; mustHave?: boolean }[];
    /** What the person would ideally want that FINN's data can't show: "a built-in rear entertainment system". */
    notInData: string | null;
    status: "active" | "dropped";
}

export interface WireUnderstanding {
    budget: { kind: "hardMax" | "target"; monthly: number; stretchTo?: number | null; said: string } | null;
    rental: { from: string; to: string; startDay: number | null; said: string } | null;
    monthlyKm: { value: number; said: string } | null;
    needs: WireNeed[];
    /** Facts about their situation that explain needs: "Two children". */
    context: { label: string; said: string }[];
    /** What they say they're already good at, and the evidence that therefore matters less. */
    capabilities: { label: string; said: string; lessRelevant: string[] }[];
    /** Priorities they said they don't care about. */
    droppedPriorities: string[];
    /** Things they said that Lens can't use, and why. */
    /** Where the choice will really be made, when needs pull against each other. Empty otherwise. */
    tension: string;
    /** "doesntCare" items are read and discarded: nothing to set aside when Lens never weighed it. */
    notModelled: { said: string; stance?: "wants" | "doesntCare"; explanation: string }[];
    /** Evidence Lens offered and the reader turned down; never suggest it again. */
    declined?: string[];
    /** What they explicitly withdrew this turn, so it isn't carried over: "budget", "rental", "monthlyKm". */
    cleared: string[];
}

export interface WireQuestion {
    ask: string;
    /** One clause on why the answer matters to the recommendation. */
    why: string;
    /** Up to four short tap-to-answer options. */
    options: string[];
    /** Evidence ids whose use depends on the answer; empty when it bears on something else. */
    affects: string[];
}

export interface ConverseRequest {
    message: string;
    vocabulary: LensVocabulary;
    /** What Lens understood before this message. */
    understanding: WireUnderstanding;
    /** The question Lens last asked, if unanswered. */
    openQuestion: WireQuestion | null;
    /** Questions already asked and answered — never ask these again. */
    answered: { question: string; answer: string }[];
    /** Every piece of evidence Lens can check, and how common each is in scope. */
    evidence: { id: string; label: string; explanation: string; scoredBy: string; listedOn: string }[];
    /** Present once Lens has compared cars: the result, and each car's evidence for the reader's needs. */
    facts: LensFacts | null;
    /** The last few exchanges, oldest first. */
    history: { role: "reader" | "lens"; text: string }[];
    scope?: ConversationScope;
    today: string;
}

export interface ConverseResult {
    /**
     * `understanding` — the person told Lens about themselves; show what changed.
     * `answer` — a question about the result, answered from the facts.
     * `whatIf` — a hypothetical; `understanding` holds the proposed version.
     */
    kind: "understanding" | "answer" | "whatIf";
    /** Short. Shows Lens listened: what it took from this message, or the answer. */
    reply: string;
    understanding: WireUnderstanding | null;
    question: WireQuestion | null;
    /** Equipment worth offering the reader, which Lens shows but never applies. */
    suggestions?: { id: string; why: string; needId?: string }[];
    scope?: ScopeKind | null;
}


/* -------------------------------------------------------------------------- */
/* The reader                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whatever reads what a person typed. Today that is the built-in keyword
 * reader (`createMockAdapter`); a model can stand behind the same three calls
 * later without anything past them changing.
 */
export interface LensAiAdapter {
    interpret(request: InterpretRequest): Promise<Answered<InterpretResult>>;
    ask(request: AskRequest): Promise<Answered<AskResult>>;
    converse(request: ConverseRequest): Promise<Answered<ConverseResult>>;
}

/** A result, and which reader produced it. */
export interface Answered<T> {
    result: T;
    model: string | null;
}
