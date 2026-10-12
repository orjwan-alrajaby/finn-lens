import type { HeadToHead, PriorityBreakdown } from "./types";

import { featurePhrase } from "./scoring";
import { absentList } from "./narrative/evidence-phrases";
import {
  classifyTotalGap,
  comparableMeasurements,
  isEffectivelyLevel,
} from "./narrative/magnitude";
import {
  inSentence,
  joinCapped,
  phraseLabel,
  sentence,
} from "./narrative/phrase";

/**
 * The one-paragraph summary of a pairwise comparison.
 *
 * Deliberately narrow. This answers "what separated these two cars on the
 * priorities?" and nothing else — the budget, the cost and the recommendation
 * itself are explained once each, elsewhere, by `narrative/verdict.ts` and
 * `narrative/challenge.ts`. Saying any of it a second time here is how the
 * page ended up making the same point four ways.
 *
 * The rule every sentence obeys: name the thing. A gap is explained by the
 * equipment or the measurement behind it, never by reciting the points it was
 * worth — a reader deciding between two cars needs to know it lacks the
 * blind spot warning, not that it dropped four points somewhere.
 */

/* -------------------------------------------------------------------------- */
/* What separates two cars in one priority                                    */
/* -------------------------------------------------------------------------- */

/**
 * The concrete difference behind a category gap: the equipment one has and
 * the other doesn't, or the measurement that separates them.
 *
 * Returns null when the data supports nothing more specific than the score,
 * so the caller can leave the claim unmade rather than dress it up.
 */
function whatSeparates(
  breakdown: PriorityBreakdown,
  fromSubject: boolean,
  behindName: string,
): string | null {
  const versus = breakdown.versus;
  if (!versus) return null;

  const theirs = fromSubject ? versus.onlySubjectHas : versus.onlyOtherHas;

  if (theirs.length) {
    return `it has ${joinCapped(theirs.map(featurePhrase))}; ${absentList(
      theirs,
      3,
      behindName,
    )}`;
  }

  const mine = breakdown.numeric;
  const other = versus.numeric;

  if (
    mine &&
    other &&
    comparableMeasurements(mine, other) &&
    mine.value !== other.value
  ) {
    const ahead = mine.lowerIsBetter
      ? mine.value < other.value
      : mine.value > other.value;

    /* Only offered as the separator when it points the right way. */
    if (ahead === fromSubject) {
      const [better, worse] = ahead ? [mine, other] : [other, mine];

      return `${inSentence(mine.label)} is ${better?.display} against ${worse?.display}`;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Head to head                                                               */
/* -------------------------------------------------------------------------- */

export function explainHeadToHead(head: Omit<HeadToHead, "summary">): string {
  const { subject, other, totalDifference, decidingAdvantage, biggestConcession } =
    head;

  if (totalDifference === 0) {
    return sentence(
      `${subject.name} and ${other.name} finish level`,
      "under your current priority order",
    );
  }

  const ahead = totalDifference > 0;
  const leadName = ahead ? subject.name : other.name;
  const trailName = ahead ? other.name : subject.name;

  const magnitude = classifyTotalGap(totalDifference);
  const sentences: string[] = [];

  /* The advantage that did the most work, named by what it actually is. */
  const driver = ahead ? decidingAdvantage : biggestConcession;
  const driverEvidence = driver ? whatSeparates(driver, ahead, trailName) : null;

  sentences.push(
    isEffectivelyLevel(magnitude)
      ? sentence(
          `${leadName} and ${trailName} are close to level —`,
          `${Math.abs(totalDifference)} point${
            Math.abs(totalDifference) === 1 ? "" : "s"
          } apart`,
          driver
            ? `— and ${phraseLabel(driver.label)}, your #${driver.rank} priority, is what tips it`
            : "",
        )
      : sentence(
          `${leadName} finishes ahead of ${trailName}, mainly on`,
          driver ? phraseLabel(driver.label) : "your ranked priorities",
          driver ? `, your #${driver.rank} priority` : "",
        ),
  );

  if (driver && driverEvidence) {
    sentences.push(sentence(`There, ${driverEvidence}`));
  }

  /* Where the trailing car is genuinely better, and why it wasn't enough. */
  const counter = ahead ? biggestConcession : decidingAdvantage;
  const counterEvidence = counter ? whatSeparates(counter, !ahead, leadName) : null;

  if (counter?.versus && counter.versus.difference !== 0) {
    /*
     * The deciding advantage is the one that moved the total most, which is
     * not always the higher-ranked priority. Saying "below X" when it sits
     * above X is the kind of error that costs a reader their trust in
     * everything else on the page.
     */
    const rankedLower = driver != null && counter.rank > driver.rank;

    /*
     * Neither "ranked below" nor "narrower" is true of a counter that moved
     * the total more than the driver did — a lead built from several smaller
     * advantages. What closes the gap there is the rest of the order.
     */
    const outweighsDriver =
      driver?.versus != null &&
      Math.abs(counter.versus.weightedDifference) >=
        Math.abs(driver.versus.weightedDifference);

    sentences.push(
      sentence(
        `${trailName} does beat ${leadName} on ${phraseLabel(counter.label)}`,
        counterEvidence ? `— ${counterEvidence}` : "",
        outweighsDriver
          ? `— but ${leadName} is ahead on enough of your other priorities to make up for it`
          : rankedLower && driver
            ? `— but you ranked it #${counter.rank}, below ${phraseLabel(
                driver.label,
              )}, so that isn't enough to close the gap`
            : "— but the gap there is narrower, so that isn't enough to close the gap",
      ),
    );
  }

  return sentences.join(" ");
}
