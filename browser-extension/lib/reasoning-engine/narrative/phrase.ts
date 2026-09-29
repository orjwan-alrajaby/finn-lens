/**
 * Language primitives.
 *
 * Small, dumb, reusable. Nothing in here knows what a car is — it only knows
 * how to turn facts that have already been decided into readable English.
 *
 * The variation helpers exist because the same sentence shape repeated eight
 * times down a page reads like a mail merge. They are deterministic: the same
 * evidence always produces the same words, so the output is testable.
 */

import { joinList } from "../format";

export { joinList };

/* -------------------------------------------------------------------------- */
/* Counting                                                                   */
/* -------------------------------------------------------------------------- */

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** "three" up to ten, then digits. Small counts read better as words. */
export function countWord(value: number): string {
  return WORDS[value] ?? String(value);
}

/**
 * "all three", "two of the three", "neither", "none of the four".
 *
 * Used wherever the sentence is about how much of a set the car covers, which
 * is more useful to a reader than a bare number.
 */
export function coverage(present: number, total: number): string {
  if (total === 0) return "none";
  if (present === 0) return total === 2 ? "neither" : `none of the ${countWord(total)}`;
  if (present === total) {
    if (total === 1) return "it";
    if (total === 2) return "both";
    return `all ${countWord(total)}`;
  }

  return `${countWord(present)} of the ${countWord(total)}`;
}

/* -------------------------------------------------------------------------- */
/* Names and labels                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Lowercases a feature label for mid-sentence use without mangling acronyms
 * or symbols — "Blind spot warning" → "blind spot warning", but "ISOFIX child
 * seat anchors" and "360° camera" are left alone.
 */
export function inSentence(label: string): string {
  const first = label.split(" ")[0] ?? label;

  const isAcronymOrSymbol =
    first.length > 1 && first === first.toUpperCase();

  if (isAcronymOrSymbol || !/^[A-Z]/.test(label)) return label;

  return label.charAt(0).toLowerCase() + label.slice(1);
}

/*
 * There was a `shortName` here, dropping the make so comparative sentences
 * read "Puma" rather than "Ford Puma". It has been removed on purpose, and
 * nothing should reintroduce it.
 *
 * The saving was a few characters and the cost was the reader's certainty
 * about which car a sentence is about. A page comparing four cars refers to
 * them by name dozens of times, in prose, in headings and in the picker, and
 * a name that appears in two forms is a name the reader has to stop and
 * reconcile — worse when two pinned configurations share a model and differ
 * only in the make or the trim. Cars are named in full, everywhere.
 */

/**
 * Lowercases a Title Case category label for mid-sentence use —
 * "Family Friendly" → "family friendly" — leaving acronyms and anything
 * carrying a symbol or digit as the author wrote it.
 */
export function phraseLabel(label: string): string {
  return label
    .split(" ")
    .map((word) =>
      word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase(),
    )
    .join(" ");
}

/**
 * Capitalises a fragment that has ended up at the start of a sentence.
 *
 * Category labels are lowercased for mid-sentence use, and occasionally one
 * has to open a sentence instead. Leaves anything already capitalised — and
 * anything starting with a digit or symbol — exactly as it is.
 */
export function toSentenceStart(text: string): string {
  return /^[a-z]/.test(text)
    ? text.charAt(0).toUpperCase() + text.slice(1)
    : text;
}

/* -------------------------------------------------------------------------- */
/* Sentences                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Joins clauses into one sentence and guarantees exactly one full stop.
 *
 * Callers assemble sentences from optional fragments, so punctuation ends up
 * arriving at the start of a fragment — the space before it is tidied here
 * rather than at every call site.
 */
export function sentence(...parts: (string | null | undefined | false)[]): string {
  const body = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();

  if (!body) return "";

  return /[.!?]$/.test(body) ? body : `${body}.`;
}

/** Drops empty strings so callers can build sentence lists conditionally. */
export function paragraph(...parts: (string | null | undefined | false)[]): string[] {
  return parts.filter((part): part is string => Boolean(part && part.trim()));
}

/**
 * A list that stays readable when the underlying set is long.
 *
 * Six named features in one clause is a spec sheet, not a sentence. Past the
 * cap the remainder is counted rather than enumerated — the full list is
 * always on screen as chips.
 */
export function joinCapped(items: string[], max = 3): string {
  /* Spending a clause to say "and 1 more" costs as much as naming it. */
  if (items.length <= max + 1) return joinList(items);

  const shown = items.slice(0, max);
  const rest = items.length - max;

  return `${shown.join(", ")} and ${rest} more`;
}

/* -------------------------------------------------------------------------- */
/* Deterministic variation                                                    */
/* -------------------------------------------------------------------------- */

function hash(seed: string): number {
  let value = 0;

  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return value;
}

/**
 * Picks one phrasing from a set, keyed on something stable about the subject.
 *
 * The point is that two priorities on the same page don't open with the same
 * five words — not to make the copy feel randomly generated. Same input, same
 * output, every time.
 */
export function vary<T>(variants: readonly T[], seed: string): T {
  if (variants.length === 0) {
    throw new Error("vary() needs at least one variant");
  }

  return variants[hash(seed) % variants.length] as T;
}
