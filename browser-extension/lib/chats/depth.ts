import type { StepId } from "./types";

/**
 * How much Lens asks, and how much it explains — the reader's choice, made
 * before anything else.
 *
 * Neither changes how the cars are judged. Asking less means Lens proposes
 * more and the reader confirms; explaining less means the result says less
 * of the same reasoning, with more always a tap away. The engine underneath
 * is the same at every depth: complexity hidden, never removed.
 */

export type AskDepth = "quick" | "balanced" | "thorough";
export type ExplainDepth = "quick" | "balanced" | "detailed";

export interface Depth {
    ask: AskDepth;
    explain: ExplainDepth;
}

/** A chat from before depth was asked had every question and every explanation. */
export const FULL: Depth = { ask: "thorough", explain: "detailed" };

export const depthOf = (chat: { depth?: Depth | null }): Depth => chat.depth ?? FULL;

/**
 * The questions a quick chat asks: who rides along, the driving, anything
 * else that matters, and the limit — enough for a recommendation worth
 * having. Everything else Lens proposes or assumes, and says so.
 */
const QUICK = new Set<StepId>(["askDepth", "explainDepth", "life", "life-passengers", "life-people", "life-driving", "life-you", "budget"]);

/** Steps that aren't questions about the reader: how a chat starts, ends, or changes course. */
const ALWAYS = new Set<StepId>(["start", "keep", "confirm", "noNeeds", "changeHow", "changeWhich"]);

/**
 * Whether Lens asks `id` at this depth. Balanced asks every question about
 * the reader and their follow-ups, and leaves out the equipment "worth a
 * look"; thorough asks everything.
 */
export function asksAt(ask: AskDepth, id: StepId): boolean {
    if (ALWAYS.has(id) || id.startsWith("check-passengers-")) return true;
    if (ask === "thorough") return true;
    if (ask === "balanced") return id !== "offers" && !id.startsWith("offer-");

    return QUICK.has(id);
}

export const ASK_LABEL: Record<AskDepth, string> = { quick: "Quick", balanced: "Balanced", thorough: "Thorough" };
export const EXPLAIN_LABEL: Record<ExplainDepth, string> = { quick: "Quick", balanced: "Balanced", detailed: "Detailed" };
