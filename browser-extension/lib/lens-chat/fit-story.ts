import { describeRentalProblem, formatEUR, monthLabel } from "@/lib/reasoning-engine";
import { bandForScore } from "@/lib/reasoning-engine/bands";
import { FIT_BANDS, type FitLevel } from "@/lib/reasoning-engine/fit";
import { totalFor } from "@/lib/reasoning-engine/scoring";
import type { WireQuestion } from "@/lib/lens-ai/contract";
import { carLabel } from "@/lib/lens-ai/outcome";
import type { PinnedFinnCar } from "@/lib/types";

import { asPhrase, barePhrase, EVIDENCE, evidenceMet, measuredDisplay, readEvidence, type EvidenceId } from "./evidence";
import { lengthAmong, lengthGap, parkingContext, widthContext } from "./dimensions";

/** How a measured figure is introduced, and what to say when FINN has none. */
const MEASURED_LEAD: Partial<Record<EvidenceId, string>> = {
    compactLength: "It's",
    compactWidth: "It's",
    bootVolume: "It has",
    electricRange: "It has",
    suvBody: "FINN files it as",
    winterReadyTyres: "It comes on",
};

/** Said next to the figure, because FINN's own field is ambiguous. */
const MEASURED_CAVEAT: Partial<Record<EvidenceId, string>> = {
    bootVolume: "FINN doesn't say whether that's with the rear seats up or folded.",
};

const MEASURED_UNKNOWN: Partial<Record<EvidenceId, string>> = {
    bootVolume: "FINN doesn't publish a boot figure for this car.",
    winterReadyTyres: "FINN doesn't say which tyres this one comes on.",
    suvBody: "FINN doesn't say what body type this one is.",
    electricRange: "It isn't electric, so FINN publishes no range for it.",
};
import type { LensRun } from "./run";
import { budgetCeiling } from "./understanding";
import type { Need, Understanding } from "./understanding";

/**
 * "Why this car fits the situation you described", from the engine's result.
 *
 * Organised around what the person told Lens, not around priority weights:
 * their hard constraints first, then each of their needs with what FINN
 * actually lists on this car and what that could mean for them, then the one
 * compromise most worth knowing. Every fact is read off the car. The only
 * words a model contributed are a need's label and each evidence's `use` —
 * the implication — and those are only shown next to a fact that holds.
 */

export type Tone = "good" | "missing" | "unknown" | "note";

export interface StoryLine {
    tone: Tone;
    text: string;
}

export interface StorySection {
    key: string;
    title: string;
    /** The reader's own words for this need, for an explanation that answers them. */
    said: string;
    /** The need or constraint in the person's terms, for "You needed". */
    short: string;
    kind: "budget" | "rental" | "need";
    importance: Need["importance"] | "constraint";
    lines: StoryLine[];
    /** One line for the compact "Lens found" summary. */
    summary: string;
    tone: Tone;
}

export interface FitStory {
    eyebrow: string;
    carName: string;
    band: FitLevel;
    bandLabel: string;
    /** What the band means, in human terms. */
    bandMeaning: string;
    sections: StorySection[];
    catch: { text: string; alternative: string | null } | null;
    /** What Lens still needs to know, if the conversation left something open. */
    stillToKnow: WireQuestion | null;
}

const BAND_MEANING: Record<FitLevel, string> = {
    strong: "it covers what Lens could check for you well",
    good: "it covers most of what Lens could check for you, with some gaps",
    partial: "it covers some of what Lens could check for you, with clear gaps",
    limited: "it misses much of what Lens could check for you",
    unknown: "FINN's data on it is too thin for Lens to judge it confidently",
};

/* "Blind spot warning" → "blind spot warning", but never "I" → "i" or "ISOFIX" → "iSOFIX". */
const lower = (value: string) =>
    /^(I\b|[A-Z]{2,})/.test(value) ? value : value.charAt(0).toLowerCase() + value.slice(1);

const sentence = (value: string) => {
    const trimmed = value.trim().replace(/[.;,]+$/, "");
    return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.` : "";
};

const dayLabel = (iso: string) => {
    const date = new Date(`${iso}T00:00:00Z`);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
};

/** Within the reader's hard constraints, as far as Lens can confirm. */
function isValid(run: LensRun, car: PinnedFinnCar): boolean {
    const cost = run.recommendation.context.costs[car.id];
    if (!cost) return false;

    const budgetOk = cost.budget == null || cost.budgetStatus === "within";
    const rentalOk = cost.contract.status === "notSet" || cost.contract.status === "fits";

    return budgetOk && rentalOk;
}

function evidenceLine(
    car: PinnedFinnCar,
    entry: { id: EvidenceId; use: string; unwanted?: boolean },
    cars: PinnedFinnCar[] = [],
): StoryLine {
    const def = { ...EVIDENCE[entry.id], undesirable: entry.unwanted ?? EVIDENCE[entry.id].undesirable };
    const state = readEvidence(car, entry.id);
    const met = evidenceMet(car, entry.id, def.undesirable === true);
    const measured = measuredDisplay(car, entry.id);

    /*
     * A figure FINN publishes is worth quoting whichever way it falls: "4.68 m
     * long" is the honest answer for a car that isn't small, where "FINN
     * doesn't list compact length" would read as missing data.
     */
    /*
     * A use clause describes the thing the reader asked about. Where they
     * asked for it to be absent, that clause describes what they didn't want,
     * so appending it to good news reads as nonsense: "FINN files it as a
     * small or compact car — is classified as an SUV."
     */
    const useClause = def.undesirable ? "" : entry.use;

    if (measured) {
        /*
         * A measurement says more beside something the reader can picture. It
         * is context, not a verdict: Lens never says a car is easy to park,
         * only how it compares with a typical bay.
         */
        const context = entry.id === "compactLength" ? parkingContext(car) : entry.id === "compactWidth" ? widthContext(car) : null;

        return {
            tone: met === false && def.undesirable ? "missing" : met ? "good" : "note",
            text:
                sentence(`${MEASURED_LEAD[entry.id] ?? "It's"} ${measured}${context ? `, ${context}` : ""}${met && useClause ? ` — ${useClause}` : ""}`) +
                (MEASURED_CAVEAT[entry.id] ? ` ${MEASURED_CAVEAT[entry.id]}` : ""),
        };
    }

    /*
     * A body style is a category, not a size. Where FINN files a car as an
     * SUV and its own measurements say it is shorter than most of the cars
     * here, both belong in the same sentence.
     */
    if (entry.id === "suvBody" && state === "listed") {
        const among = lengthAmong(car, cars);
        const measuredSize = among && among.shorterThan > among.total / 2 ? ` — though at ${measuredDisplay(car, "compactLength") ?? "its length"} it is shorter than ${among.shorterThan} of the ${among.total} other cars here` : "";

        return {
            tone: def.undesirable && !measuredSize ? "missing" : def.undesirable ? "note" : "good",
            text: `FINN files it as an SUV${measuredSize}.`,
        };
    }

    if (state === "unknown" && MEASURED_LEAD[entry.id]) {
        return { tone: "unknown", text: MEASURED_UNKNOWN[entry.id]! };
    }

    if (state === "listed") {
        return def.undesirable
            ? { tone: "missing", text: `FINN lists this one as ${asPhrase(entry.id)}, which you'd rather avoid.` }
            : { tone: "good", text: sentence(`${def.label} ${useClause ? `— ${useClause}` : "is listed"}`) };
    }

    if (state === "notListed") {
        return def.undesirable
            ? { tone: "good", text: `It isn't ${asPhrase(entry.id)}.` }
            : { tone: "missing", text: `FINN doesn't list ${lower(def.label)} for this car.` };
    }

    return { tone: "unknown", text: `FINN doesn't say whether it has ${lower(def.label)}.` };
}

export function tellFitStory(
    run: LensRun,
    u: Understanding,
    lessRelevant: EvidenceId[],
    stillToKnow: WireQuestion | null,
): FitStory {
    const { recommendation, narrative } = run;
    const { winner, context } = recommendation;
    const cars = context.vehicles;
    const name = (car: PinnedFinnCar) => carLabel(car, cars);
    const cost = context.costs[winner.id];
    const score = recommendation.scores.find((item) => item.vehicleId === winner.id);
    const total = totalFor(recommendation.scores, winner.id);
    const band: FitLevel = score?.judgeable ? bandForScore(total) : "unknown";
    const single = cars.length === 1;

    const sections: StorySection[] = [];

    /* -- The budget ------------------------------------------------------ */

    if (u.budget && cost) {
        const monthly = cost.totalMonthly;
        const lines: StoryLine[] = [];
        let tone: Tone = "good";
        let title: string;

        if (u.budget.kind === "hardMax") {
            if (cost.budgetStatus === "within") {
                title = `It stays within your ${formatEUR(u.budget.monthly)} limit`;
                lines.push({ tone: "good", text: `At about ${formatEUR(monthly)}/month, it respects the maximum you gave me.` });
            } else if (cost.budgetStatus === "unknown") {
                tone = "unknown";
                title = `It may fit your ${formatEUR(u.budget.monthly)} limit`;
                lines.push({ tone: "unknown", text: `What Lens can estimate comes to ${formatEUR(monthly)}/month, but part of the cost is missing, so it can't confirm the car stays under your maximum.` });
            } else {
                tone = "missing";
                title = `Nothing here stays within ${formatEUR(u.budget.monthly)}`;
                lines.push({ tone: "missing", text: `This is the closest match, at about ${formatEUR(monthly)}/month — ${formatEUR(monthly - u.budget.monthly)} over the maximum you gave me.` });
            }

            const top = recommendation.topScorer;
            const topCost = context.costs[top.id];

            if (recommendation.budgetChangedTheAnswer && top.id !== winner.id && topCost?.budgetStatus === "over") {
                lines.push({
                    tone: "note",
                    text: `${name(top)} scores higher overall, but at about ${formatEUR(topCost.totalMonthly)}/month it breaks your maximum, so I treated it as outside your options.`,
                });
            }
        } else {
            /*
             * A soft figure still draws a line — see `budgetCeiling`. Saying
             * where it was drawn is the difference between "you said around
             * €600" and a €1,353 car turning up as the answer.
             */
            const gap = monthly - u.budget.monthly;
            const ceiling = budgetCeiling(u.budget);
            const beyond = monthly > ceiling;

            tone = beyond ? "missing" : gap > 0 ? "note" : "good";
            title = beyond
                ? `Nothing here comes near the ${formatEUR(u.budget.monthly)} you mentioned`
                : gap > 0
                  ? `A little above the ${formatEUR(u.budget.monthly)} you mentioned`
                  : `Within the ${formatEUR(u.budget.monthly)} you mentioned`;
            lines.push({
                tone,
                text: beyond
                    ? `The closest match costs about ${formatEUR(monthly)}/month — ${formatEUR(gap)} above it. Lens stretched to ${formatEUR(ceiling)} for a figure you called a target, and nothing here fits even that.`
                    : `About ${formatEUR(monthly)}/month${Math.abs(gap) >= 1 ? ` — ${formatEUR(Math.abs(gap))} ${gap > 0 ? "above" : "below"} it` : ""}. ${
                          u.budget.stretchTo
                              ? `You said you could stretch to ${formatEUR(u.budget.stretchTo)}, so Lens looked no further than that.`
                              : `You called it a figure to aim at rather than a limit, so Lens looked at cars up to about ${formatEUR(ceiling)} and no further.`
                      }`,
            });
        }

        sections.push({
            key: "budget",
            said: u.budget.said,
            title,
            short: u.budget.kind === "hardMax" ? `${formatEUR(u.budget.monthly)}/month maximum` : `Around ${formatEUR(u.budget.monthly)}/month`,
            kind: "budget",
            importance: "constraint",
            lines,
            summary: `About ${formatEUR(monthly)}/month`,
            tone,
        });
    }

    /* -- What they ruled out --------------------------------------------- */

    if (run.ruledOut) {
        const { evidence: rules, setAside, nothingLeft } = run.ruledOut;
        const total = cars.length + (nothingLeft ? 0 : setAside);
        const asked = rules
            .map((rule) => (rule.mode === "without" ? `no ${barePhrase(rule.id)}` : asPhrase(rule.id)))
            .join(" and ");
        const kept = rules.every((rule) => rule.mode === "without");

        sections.push({
            key: "ruled-out",
            said: rules.map((rule) => rule.said).filter(Boolean)[0] ?? "",
            title: nothingLeft
                ? `Nothing here is ${asked}`
                : kept
                  ? `It isn't ${rules.map((rule) => asPhrase(rule.id)).join(" or ")}`
                  : `It is ${rules.filter((rule) => rule.mode === "must").map((rule) => asPhrase(rule.id)).join(" and ")}`,
            short: asked,
            kind: "budget",
            importance: "constraint",
            tone: nothingLeft ? "missing" : "good",
            lines: [
                {
                    tone: nothingLeft ? "missing" : "good",
                    text: nothingLeft
                        ? `You asked for ${asked}, and nothing here matches that, so Lens ranked them all and this is the closest.`
                        : `You asked for ${asked}, so Lens set aside ${setAside} of ${total} cars here before ranking the rest.`,
                },
            ],
            summary: nothingLeft ? `No car here is ${asked}` : asked,
        });
    }

    /* -- The rental period ----------------------------------------------- */

    if (u.rental && cost) {
        const contract = cost.contract;
        const problem = describeRentalProblem(contract);
        const lines: StoryLine[] = [];
        const period = `${monthLabel(u.rental.from)} to ${monthLabel(u.rental.to)}`;
        let tone: Tone = "good";

        if (problem) {
            tone = contract.status === "doesNotFit" ? "missing" : "unknown";
            lines.push({ tone, text: `It ${problem}.` });
        } else if (contract.term) {
            lines.push({
                tone: "good",
                text: `It can be rented for ${period}, on FINN's ${contract.term.months}-month term${contract.extraMonths ? ` — ${contract.extraMonths} month${contract.extraMonths === 1 ? "" : "s"} longer than you need, and FINN's data doesn't say you can end it early` : ""}.`,
            });

            if (u.rental.startDay && contract.term.deliveryFrom) {
                const start = `${u.rental.from}-${String(u.rental.startDay).padStart(2, "0")}`;
                const early = contract.term.deliveryFrom <= start;

                lines.push({
                    tone: early ? "good" : "note",
                    text: early
                        ? `FINN lists delivery from ${dayLabel(contract.term.deliveryFrom)}, before your ${dayLabel(start)} start.`
                        : `FINN's earliest delivery is ${dayLabel(contract.term.deliveryFrom)}, after the ${dayLabel(start)} you mentioned.`,
                });

                if (!early) tone = "note";
            }
        }

        sections.push({
            key: "rental",
            said: u.rental.said,
            title: problem ? `It may not work for ${period}` : `It works for ${period}`,
            short: period,
            kind: "rental",
            importance: "constraint",
            lines,
            summary: problem ? "Doesn't fit your dates" : contract.term ? `${contract.term.months}-month term` : "Dates unconfirmed",
            tone,
        });
    }

    /* -- The needs ------------------------------------------------------- */

    const active = u.needs.filter((need) => need.status === "active");

    for (const need of active) {
        /*
         * Lead with what the car does, then what it doesn't, then what nobody
         * can tell — and within each, the evidence that sets this car apart
         * first. ISOFIX on 22 of 24 cars is true and worth saying, but rear USB
         * ports on 11 of 24 is what actually distinguishes a car for the kids.
         */
        const share = (entry: { id: EvidenceId; unwanted?: boolean }) =>
            cars.filter((car) => evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === true).length;
        const orderOf: Record<Tone, number> = { good: 0, note: 1, missing: 2, unknown: 3 };

        const evidence = need.evidence.filter((entry) => !lessRelevant.includes(entry.id));
        const lines = evidence
            .map((entry) => ({ line: evidenceLine(winner, entry, cars), share: share(entry) }))
            .sort((a, b) => orderOf[a.line.tone] - orderOf[b.line.tone] || a.share - b.share)
            .map((item) => item.line);

        if (need.notInData) {
            const related = lines.some((line) => line.tone === "good");
            lines.push({
                tone: "unknown",
                text: related
                    ? `FINN doesn't publish ${need.notInData}, so Lens can't check that part — what's above is what it can.`
                    : `FINN doesn't publish ${need.notInData}, so Lens has no way to tell you about that part.`,
            });
        }

        if (!lines.length) {
            lines.push({ tone: "note", text: "Lens has nothing on this car it can check for this, so it didn't count toward the ranking." });
        }

        const met = (car: PinnedFinnCar, entry: { id: EvidenceId; unwanted?: boolean }) =>
            evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true);
        const good = evidence.filter((entry) => met(winner, entry) === true);
        const missing = evidence.filter((entry) => met(winner, entry) === false);

        const tone: Tone = good.length && !missing.length ? "good" : good.length ? "note" : missing.length ? "missing" : "unknown";

        sections.push({
            key: need.id,
            said: need.said,
            title:
                tone === "good"
                    ? `It helps with ${lower(need.label)}`
                    : tone === "note"
                      ? `It partly covers ${lower(need.label)}`
                      : tone === "missing"
                        ? `It's weak on ${lower(need.label)}`
                        : `Lens can't tell much about ${lower(need.label)}`,
            short: need.label,
            kind: "need",
            importance: need.importance,
            lines,
            summary: good.length
                ? good.map((entry) => EVIDENCE[entry.id].label).join(", ")
                : missing.length
                  ? `No ${missing.map((entry) => lower(EVIDENCE[entry.id].label)).join(", ")}`
                  : "Nothing Lens can check",
            tone,
        });
    }

    /* -- The catch ------------------------------------------------------- */

    let catchNote: FitStory["catch"] = null;

    const hardMiss = sections.find((section) => section.kind !== "need" && section.tone === "missing");

    if (hardMiss) {
        catchNote = { text: hardMiss.lines[0]?.text ?? hardMiss.title, alternative: null };
    } else {
        /*
         * The catch worth leading with, among gaps in needs that matter:
         * first one another car within the limits actually solves, then the
         * more important need, then equipment most cars have — a missing
         * blind-spot warning on a car when most list one says more than
         * missing fog lights that few cars have at all.
         */
        const rank = { essential: 3, important: 2, niceToHave: 0 } as const;

        const gaps = active
            .filter((need) => need.importance !== "niceToHave")
            .flatMap((need) =>
                need.evidence
                    .filter(
                        (entry) =>
                            !lessRelevant.includes(entry.id) &&
                            evidenceMet(winner, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === false,
                    )
                    .map((entry) => {
                        const alternative =
                            recommendation.ranked.find(
                                (car) =>
                                    car.id !== winner.id &&
                                    isValid(run, car) &&
                                    evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === true,
                            ) ?? null;
                        const share =
                            cars.filter(
                                (car) => evidenceMet(car, entry.id, entry.unwanted ?? EVIDENCE[entry.id].undesirable === true) === true,
                            ).length / Math.max(cars.length, 1);

                        return { need, entry, alternative, score: (alternative ? 10 : 0) + rank[need.importance] * 2 + share };
                    }),
            )
            .sort((a, b) => b.score - a.score);

        const gap = gaps[0];

        if (gap) {
            const altCost = gap.alternative ? context.costs[gap.alternative.id] : null;

            catchNote = {
                /* Named by the need's own label, so the sentence can't inherit a paraphrase's grammar. */
                text: (gap.entry.unwanted ?? EVIDENCE[gap.entry.id].undesirable)
                    ? `FINN lists this one as ${measuredDisplay(winner, gap.entry.id) ?? asPhrase(gap.entry.id)} — worth weighing for ${lower(gap.need.label)}.`
                    : `FINN doesn't list ${lower(EVIDENCE[gap.entry.id].label)} for this car — worth weighing for ${lower(gap.need.label)}.`,
                alternative: gap.alternative
                    ? `${name(gap.alternative)} ${gap.entry.unwanted ?? EVIDENCE[gap.entry.id].undesirable ? "isn't one" : "has it"}${altCost ? `, at about ${formatEUR(altCost.totalMonthly)}/month` : ""}${u.budget?.kind === "hardMax" ? " — still within your maximum" : ""}${
                          lengthGap(gap.alternative, winner, "this one") ? `, and it's ${lengthGap(gap.alternative, winner, "this one")}` : ""
                      }.`
                    : single
                      ? null
                      : "None of the other cars that fit your constraints lists it either.",
            };
        }

        if (!catchNote && narrative.tradeoffs[0]) {
            catchNote = { text: narrative.tradeoffs[0].sentences[0] ?? narrative.tradeoffs[0].evidence, alternative: null };
        }
    }

    /* -- The label ------------------------------------------------------- */

    /* A target is a line too, so the eyebrow names it — in the words the reader used. */
    const hardBudget = u.budget?.kind === "hardMax" ? u.budget.monthly : null;
    const nearBudget = u.budget?.kind === "target" ? u.budget.monthly : null;

    /*
     * Two words, because the card underneath says the rest. This used to
     * carry the whole verdict — "Strongest match within your €450 limit" —
     * shouted in capitals above the car's own name, which read as a banner
     * rather than as an answer. Where nothing fits, that is worth the extra
     * clause; where something does, the sentence below says so.
     */
    const missed =
        recommendation.gearboxFallback === "noneFit"
            ? "nothing here is an automatic"
            : recommendation.rentalFallback === "noneFit"
              ? "nothing here fits your dates"
              : recommendation.isFallback && hardBudget != null
                ? `nothing here stays within ${formatEUR(hardBudget)}`
                : recommendation.isFallback && nearBudget != null
                  ? `nothing here comes near ${formatEUR(nearBudget)}`
                  : null;

    /*
     * "Best match" over a car the next line calls €457 too expensive reads as
     * a contradiction. The engine's fallback flag doesn't catch every way that
     * happens — a cost it can't complete is not "over budget" to it — so the
     * label follows what this card is about to say about the money.
     */
    const overBudget = sections.some((section) => section.kind === "budget" && section.tone !== "good");

    const eyebrow = single
        ? "How this car fits you"
        : missed
          ? `Closest match — ${missed}`
          : overBudget
            ? "Closest match"
            : "Best match";

    return {
        eyebrow,
        carName: name(winner),
        band,
        bandLabel: FIT_BANDS[band].label,
        bandMeaning: `Lens rates it a ${FIT_BANDS[band].label.toLowerCase()}: ${BAND_MEANING[band]}.`,
        sections,
        catch: catchNote,
        stillToKnow,
    };
}

/** For the model: what each ranked car has for each of the person's needs. */
export function evidenceForNeeds(run: LensRun, u: Understanding) {
    const ids = [...new Set(u.needs.filter((need) => need.status === "active").flatMap((need) => need.evidence.map((entry) => entry.id)))];

    if (!ids.length) return null;

    return run.recommendation.ranked.slice(0, 12).map((car) => ({
        car: carLabel(car, run.recommendation.context.vehicles),
        withinYourConstraints: isValid(run, car),
        evidence: Object.fromEntries(ids.map((id) => [EVIDENCE[id].label, readEvidence(car, id)])),
    }));
}

/* -------------------------------------------------------------------------- */
/* FINN's own words                                                           */
/* -------------------------------------------------------------------------- */

/**
 * How much of FINN's prose is worth sending: the cars an answer is likely
 * about, and a budget in characters, because this rides on every turn.
 */
const WORDS_FOR_CARS = 4;
const WORDS_PER_CAR = 1400;

/**
 * FINN's German equipment prose for the cars in front of the reader.
 *
 * Sent as data, untranslated. The model reads German; Lens doesn't, and
 * guessing at "Winter-Paket: Lenkrad beheizt" with a regex would be Lens
 * inventing facts. What comes back is checked against this same text by
 * `quotesAreFinns`.
 */
export function finnsOwnWords(run: LensRun): { car: string; finnWrites: { group: string; text: string }[] }[] {
    const cars = run.recommendation.context.vehicles;

    return run.recommendation.ranked
        .slice(0, WORDS_FOR_CARS)
        .map((car) => {
            let left = WORDS_PER_CAR;

            const finnWrites = (car.equipmentText ?? [])
                .map((entry) => {
                    const text = entry.text.slice(0, Math.max(left, 0));
                    left -= text.length;

                    return { group: entry.group, text };
                })
                .filter((entry) => entry.text.length > 0);

            return { car: carLabel(car, cars), finnWrites };
        })
        .filter((item) => item.finnWrites.length > 0);
}

/** Every phrase the model put in quotes, in any of the marks it might use. */
const quoted = (reply: string): string[] =>
    [...reply.matchAll(/[„“"«»”]([^„“"«»”]{3,90})[„“"«»”]/g)].map((match) => match[1]!.trim());

const flatten = (value: string): string =>
    value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Whether what the model quoted is really in FINN's text.
 *
 * The model may translate FINN's German and say what it means — that's the
 * work it's here for. What it may not do is invent the German. A quoted
 * phrase that isn't in the text Lens sent is a fabricated source, so the
 * sentence carrying it is dropped rather than shown.
 */
export function quotesAreFinns(
    reply: string,
    sources: { car: string; text: string }[],
): { reply: string; dropped: string[] } {
    const flat = sources.map((source) => ({ car: flatten(source.car), text: flatten(source.text) }));
    const dropped: string[] = [];

    const kept = (reply.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).filter((sentence) => {
        const phrases = quoted(sentence);

        if (!phrases.length) return true;

        /*
         * A sentence about one car is checked against that car's text: FINN's
         * words for the Ford are not evidence about the MG.
         */
        const flatSentence = flatten(sentence);
        const named = flat.filter((source) => source.car && flatSentence.includes(source.car));
        const searched = named.length === 1 ? named : flat;
        const invented = phrases.filter((phrase) => !searched.some((source) => source.text.includes(flatten(phrase))));

        if (invented.length) dropped.push(...invented);

        return invented.length === 0;
    });

    return { reply: kept.join("").trim(), dropped };
}
