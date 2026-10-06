import type { NeedImportance } from "@/lib/lens-ai/contract";
import { NEED_WEIGHT, type Understanding } from "@/lib/lens-chat/understanding";

import type { ChatMessage } from "./types";

/**
 * "How I weighed it", in the reader's own terms.
 *
 * It used to show the engine's workings: priorities the reader never chose
 * ("Climate Suitability counts 23%"), a second importance scale on items
 * ("Highly", "Somewhat"), and paragraphs of the engine's sentences — three
 * vocabularies for one answer. This is the same weighing said once: each
 * thing the reader said, how much it counted on the one scale they set it
 * on, its share of the decision as a bar, and what Lens looked at for it;
 * then what set cars aside; then the money and the dates.
 *
 * A need's share is its weight (Top priority 4, Important 2, Nice to have 1 —
 * NEED_WEIGHT) over the weights of everything that counted: exactly what the
 * engine is given (`priorityShares`), summed per need rather than per
 * priority.
 */

type Summary = Extract<ChatMessage, { kind: "summary" }>;

export interface WeighedNeed {
    id: string;
    label: string;
    importance: NeedImportance;
    /** Its part of the decision, 0–1. All of them add up to 1. */
    share: number;
    /** What Lens looked at for it, by name. */
    looksAt: string[];
}

export interface Weighing {
    needs: WeighedNeed[];
    /** What set cars aside before anything was scored: "Runs on — Electric or plug-in hybrid". Empty when nothing did. */
    setAside: { label: string; value: string }[];
    /** The money and the dates, as the summary says them. */
    terms: { label: string; value: string }[];
}

export function weighingOf(u: Understanding, summary: Summary): Weighing {
    const counted: Omit<WeighedNeed, "share">[] = [
        ...(summary.bubbles ?? [])
            .filter((bubble) => bubble.counting !== false)
            .map((bubble) => ({
                id: bubble.id,
                label: bubble.heading,
                importance: bubble.importance,
                looksAt: [...(bubble.figure ? [bubble.figure] : []), ...bubble.counts.map((item) => item.label), ...(bubble.shared ?? []).map((item) => item.label)],
            })),
        ...(summary.needs ?? []).map((need) => ({ id: need.id, label: need.label, importance: need.importance, looksAt: need.looksFor })),
        /* Deal-sealers: a top priority each, counting the one thing that seals it. */
        ...u.needs
            .filter((need) => need.status === "active" && need.id.startsWith("sealer-"))
            .map((need) => ({ id: need.id, label: `${need.label} would seal it`, importance: need.importance, looksAt: [need.label] })),
    ];
    const total = counted.reduce((sum, need) => sum + NEED_WEIGHT[need.importance], 0);

    const needs = counted
        .map((need) => ({ ...need, share: total ? NEED_WEIGHT[need.importance] / total : 0 }))
        .sort((a, b) => b.share - a.share);

    const line = (label: string) => summary.lines.find((item) => item.label === label);
    const setAside = [
        line("Runs on"),
        line("Deal-breakers"),
        u.budget?.firm ? line("Monthly limit") : undefined,
    ].filter((item): item is NonNullable<typeof item> => item != null && item.value !== "Any" && item.value !== "None");

    const terms = summary.lines.filter((item) => ["budget", "period", "from", "distance"].includes(item.step ?? "") && !(u.budget?.firm && item.label === "Monthly limit"));

    return { needs, setAside: setAside.map(({ label, value }) => ({ label, value })), terms: terms.map(({ label, value }) => ({ label, value })) };
}
