import type { NeedImportance } from "@/lib/lens-ai/contract";
import { BUBBLE_GROUPS, bubbleById, groupOf } from "@/lib/lens-chat/bubbles";
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
 *
 * The needs are grouped as the chat asked about them — who rides with you,
 * where and how you drive, … — each group with the needs' shares added up,
 * so the reader sees which part of what they told Lens took most of the
 * decision. Something two needs both looked at is listed under the first and
 * named as shared under the other, not listed twice.
 */

type Summary = Extract<ChatMessage, { kind: "summary" }>;

export interface WeighedNeed {
    id: string;
    label: string;
    importance: NeedImportance;
    /** Its part of the decision, 0–1. All of them add up to 1. */
    share: number;
    /** The same, as a whole percentage; all of them add up to exactly 100. */
    percent: number;
    /** What Lens looked at for it, by name. */
    looksAt: string[];
    /** The question it answers, as the chat asked it. */
    group: { id: string; title: string };
}

/** A need as "How I weighed it" shows it in its group: what it looked at that no need above did, and what it shares with one. */
export interface GroupedNeed extends WeighedNeed {
    sharedWith: { need: string; items: string[] }[];
}

export interface WeighedGroup {
    id: string;
    title: string;
    /** Its needs' shares added up; all the groups add up to 1, and their percentages to exactly 100. */
    share: number;
    percent: number;
    needs: GroupedNeed[];
}

export interface Weighing {
    needs: WeighedNeed[];
    /** The same needs by the question they answer, the group with the biggest part of the decision first. */
    groups: WeighedGroup[];
    /** What set cars aside before anything was scored: "Runs on — Electric or plug-in hybrid". Empty when nothing did. */
    setAside: { label: string; value: string }[];
    /** The money and the dates, as the summary says them. */
    terms: { label: string; value: string }[];
}

/**
 * Shares as whole percentages that add up to exactly 100: each rounded down,
 * then the points left over go to the largest remainders — so three equal
 * needs read 34 / 33 / 33, never 33 / 33 / 33.
 */
export function wholePercents(shares: number[]): number[] {
    if (!shares.length) return [];

    const raw = shares.map((share) => share * 100);
    const floors = raw.map(Math.floor);
    let left = 100 - floors.reduce((sum, value) => sum + value, 0);
    const order = raw.map((value, index) => ({ index, rest: value - floors[index]! })).sort((a, b) => b.rest - a.rest || a.index - b.index);

    for (const { index } of order) {
        if (left <= 0) break;
        floors[index]! += 1;
        left -= 1;
    }

    return floors;
}

/** Where a need that didn't come from a bubble sits: what the reader typed, and the deal-sealers. */
const OWN_WORDS = { id: "own", title: "In your own words" };
const SEALERS = { id: "sealers", title: "Deal-sealers" };
/* The order the chat asks in, for groups that count the same. */
const ASKED = [...BUBBLE_GROUPS.map((group) => group.id as string), OWN_WORDS.id, SEALERS.id];

function questionOf(bubbleId: string): { id: string; title: string } {
    const bubble = bubbleById(bubbleId);
    const group = bubble ? BUBBLE_GROUPS.find((item) => item.id === groupOf(bubble.id)) : undefined;

    return group ? { id: group.id, title: group.title } : OWN_WORDS;
}

export function weighingOf(u: Understanding, summary: Summary): Weighing {
    const counted: Omit<WeighedNeed, "share" | "percent">[] = [
        ...(summary.bubbles ?? [])
            .filter((bubble) => bubble.counting !== false)
            .map((bubble) => ({
                id: bubble.id,
                label: bubble.heading,
                importance: bubble.importance,
                looksAt: [...(bubble.figure ? [bubble.figure] : []), ...bubble.counts.map((item) => item.label), ...(bubble.shared ?? []).map((item) => item.label)],
                group: questionOf(bubble.id),
            })),
        ...(summary.needs ?? []).map((need) => ({ id: need.id, label: need.label, importance: need.importance, looksAt: need.looksFor, group: OWN_WORDS })),
        /* Deal-sealers: a top priority each, counting the one thing that seals it. */
        ...u.needs
            .filter((need) => need.status === "active" && need.id.startsWith("sealer-"))
            .map((need) => ({ id: need.id, label: `${need.label} would seal it`, importance: need.importance, looksAt: [need.label], group: SEALERS })),
    ];
    const total = counted.reduce((sum, need) => sum + NEED_WEIGHT[need.importance], 0);

    const shared = counted.map((need) => ({ ...need, share: total ? NEED_WEIGHT[need.importance] / total : 0 })).sort((a, b) => b.share - a.share);
    const percents = wholePercents(shared.map((need) => need.share));
    const needs = shared.map((need, index) => ({ ...need, percent: percents[index]! }));

    const line = (label: string) => summary.lines.find((item) => item.label === label);
    const setAside = [
        line("Runs on"),
        line("Deal-breakers"),
        u.budget?.firm ? line("Monthly limit") : undefined,
        u.rental?.firm ? line("For") : undefined,
    ].filter((item): item is NonNullable<typeof item> => item != null && item.value !== "Any" && item.value !== "None");

    const terms = summary.lines.filter(
        (item) => ["budget", "period", "from", "distance"].includes(item.step ?? "") && !(u.budget?.firm && item.label === "Monthly limit") && !(u.rental?.firm && item.label === "For"),
    );

    return { needs, groups: grouped(needs), setAside: setAside.map(({ label, value }) => ({ label, value })), terms: terms.map(({ label, value }) => ({ label, value })) };
}

/**
 * The needs by the question they answer, each group's share the sum of its
 * needs' — so its percentage is theirs added up, and the groups' come to 100
 * as the needs' do. Biggest first; groups that count the same, in the order
 * the chat asks them.
 */
function grouped(needs: WeighedNeed[]): WeighedGroup[] {
    const groups = new Map<string, WeighedGroup>();

    for (const need of needs) {
        const group = groups.get(need.group.id) ?? { ...need.group, share: 0, percent: 0, needs: [] };

        group.share += need.share;
        group.percent += need.percent;
        group.needs.push({ ...need, sharedWith: [] });
        groups.set(need.group.id, group);
    }

    const ordered = [...groups.values()].sort((a, b) => b.share - a.share || ASKED.indexOf(a.id) - ASKED.indexOf(b.id));

    /* Each thing looked at under the first need to look at it, in the order they're shown; later ones say they share it. */
    const firstLooked = new Map<string, string>();

    for (const need of ordered.flatMap((group) => group.needs)) {
        const own: string[] = [];

        for (const item of need.looksAt) {
            const first = firstLooked.get(item);

            if (!first) {
                firstLooked.set(item, need.label);
                own.push(item);
                continue;
            }

            const shared = need.sharedWith.find((entry) => entry.need === first);
            if (shared) shared.items.push(item);
            else need.sharedWith.push({ need: first, items: [item] });
        }

        need.looksAt = own;
    }

    return ordered;
}
