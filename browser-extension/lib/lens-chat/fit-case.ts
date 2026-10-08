import type { Tradeoff } from "@/lib/reasoning-engine/narrative/types";

import { EVIDENCE, type EvidenceId } from "./evidence";
import type { FitStory, StoryLine, StoryRival, StorySection } from "./fit-story";
import type { LensRun } from "./run";

/**
 * The winner's fit, sorted by how well it fits.
 *
 * The story tells each thing the reader said in the order they said it, with
 * what the car has and lacks for it mixed in one row. The winner's drawer
 * sorts the same rows by how they came out: what it meets in full, what it
 * meets in part, what Lens couldn't check — and then, in one place, where it
 * falls short, with what's worth considering on the things the reader said
 * matter most. Nothing is said twice: a row's gaps move out of it into where
 * it falls short, and the engine's trade-offs join them only where they say
 * something the rows don't.
 */

export interface Shortfall {
    key: string;
    /** The thing the reader said this answers to — a need, or a limit — or null for a comparison the engine raised. */
    about: string | null;
    /** How much that counts: a need's importance, a limit, or nothing for a comparison. */
    importance: StorySection["importance"] | null;
    /**
     * A whole row it falls short on — weak on a need, over the limit, a high
     * CO₂ figure — drawn as the row. Otherwise `title` and `lines` say it.
     */
    section?: StorySection;
    title?: string;
    lines: StoryLine[];
    /** The car a comparison is with, so the reader can find it. Lines name their own. */
    rival?: StoryRival;
}

export interface FitCase {
    complete: StorySection[];
    partial: StorySection[];
    /** Rows FINN's data couldn't settle either way. */
    unclear: StorySection[];
    /** Where it falls short on things that count for less, and comparisons with the other cars. */
    shortfalls: Shortfall[];
    /** Where it falls short on what the reader said matters most, or on a limit they set. */
    worth: Shortfall[];
}

/** How much a shortfall should weigh with the reader: a limit they set, then their own importance. */
const STRENGTH: Record<StorySection["importance"], number> = { constraint: 3, essential: 2, important: 1, niceToHave: 0 };

/** What the reader said matters most, and their limits: where falling short is worth considering. */
const worthConsidering = (item: Shortfall) => item.importance != null && STRENGTH[item.importance] >= STRENGTH.important;

/**
 * Whether a trade-off the engine raised is already said by the rows: the
 * budget by the budget's row, a feature they picked out by its need's row, a
 * measurement by the row's own gap on it.
 */
function alreadySaid(tradeoff: Tradeoff, story: FitStory, gaps: StoryLine[]): boolean {
    switch (tradeoff.kind) {
        case "budget":
            return story.sections.some((section) => section.key === "budget");
        case "missingSelected":
            return story.sections.some((section) => section.kind === "need");
        case "measurementDeficit":
        case "priorityDeficit":
            return gaps.some((line) => line.reads && EVIDENCE[line.reads as EvidenceId]?.scoredIn === tradeoff.priority);
        default:
            return false;
    }
}

export function fitCase(run: LensRun, story: FitStory): FitCase {
    const result: FitCase = { complete: [], partial: [], unclear: [], shortfalls: [], worth: [] };
    const found: Shortfall[] = [];

    for (const section of story.sections) {
        /* What the mileage adds to the price is a line of the cost table, said there. */
        if (section.key === "mileage") continue;

        const about = section.figure?.need ?? section.short;
        /* No car here has every deal-breaker: the pick misses one, whatever its tone. */
        const short = section.tone === "missing" || (section.key === "ruled-out" && run.ruledOut?.nothingLeft);

        if (short) {
            found.push({ key: section.key, about, importance: section.importance, section, lines: [] });
            continue;
        }

        const gaps = section.figure ? [] : section.lines.filter((line) => line.met === false);
        const rest = gaps.length ? { ...section, lines: section.lines.filter((line) => !gaps.includes(line)) } : section;

        if (gaps.length) found.push({ key: section.key, about, importance: section.importance, lines: gaps });

        if (section.tone === "unknown") result.unclear.push(rest);
        /* "It has the basics for …": everything asked for, though nearly every car has it too — met in full. */
        else if (section.tone === "good" || (section.kind === "need" && !section.figure && !gaps.length)) result.complete.push(rest);
        else result.partial.push(rest);
    }

    const gaps = found.flatMap((item) => item.lines);

    for (const [index, tradeoff] of run.narrative.tradeoffs.entries()) {
        if (alreadySaid(tradeoff, story, gaps)) continue;

        found.push({
            key: `tradeoff-${index}`,
            about: null,
            importance: null,
            title: tradeoff.headline,
            lines: [
                { tone: "missing", text: tradeoff.evidence },
                { tone: "note", text: tradeoff.relevance },
            ],
            ...(tradeoff.rival ? { rival: { id: tradeoff.rival.vehicleId, name: tradeoff.rival.name, text: "" } } : {}),
        });
    }

    /* The limits first, then what counts most; comparisons last, in the engine's order. */
    const ordered = [...found].sort((a, b) => (b.importance ? STRENGTH[b.importance] : -1) - (a.importance ? STRENGTH[a.importance] : -1));

    result.worth = ordered.filter(worthConsidering);
    result.shortfalls = ordered.filter((item) => !worthConsidering(item));

    return result;
}
