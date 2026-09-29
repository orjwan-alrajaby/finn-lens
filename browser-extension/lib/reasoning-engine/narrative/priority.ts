import type { PinnedFinnCar } from "@/lib/types";
import type { PriorityBreakdown } from "../types";
import type {
  FeatureEvidence,
  FeatureFact,
  MeasurementFact,
  PriorityReasoning,
  PriorityStanding,
  RivalDifference,
  TraitFact,
} from "./types";

import {
  featureEvidence,
  leaderDifference,
  measurementFacts,
  priorityStanding,
  rivalDifference,
  traitFacts,
} from "./facts";

import {
  classifyMeasurementGap,
  classifyScoreGap,
  comparableMeasurements,
  isEffectivelyLevel,
} from "./magnitude";

import { describeEnvironment } from "../environmental";
import { formatNumber } from "../format";
import { DC_CHARGING, LOAD_VOLUME } from "./facts";
import {
  absentList,
  absentPronounClause,
  emphasisSubject,
  unassessedPhrase,
  unknownPhrase,
} from "./evidence-phrases";

import {
  coverage,
  inSentence,
  joinCapped,
  joinList,
  paragraph,
  phraseLabel,
  sentence,
} from "./phrase";

/**
 * One priority, explained.
 *
 * The contract for every sentence in this file:
 *
 * - **Name the thing.** "It has a 360° camera", never "a strong equipment
 *   package". If the data doesn't say, the sentence says the data doesn't say.
 * - **Never grade a feature.** The user said which ones they care about and
 *   nothing more; "essential" and "luxury extra" were words Lens put in their
 *   mouth, and no sentence here may reintroduce them under another name.
 * - **Quote the figure.** "1,726 L against 491 L", never "substantially more
 *   practical" on its own and never "practicality: 48/100".
 * - **Don't parade other cars.** The recommendation is explained on its own
 *   merits. Where an alternative is genuinely better belongs in *what you're
 *   giving up*, said once with the evidence and the reason it matters — not
 *   scattered across five headings as five separate comparisons.
 * - **Say nothing when there is nothing to say.** A category where the cars
 *   are level gets the evidence and no commentary; filler is what made the
 *   old copy read like a mail merge.
 */

/* -------------------------------------------------------------------------- */
/* Feature evidence                                                           */
/* -------------------------------------------------------------------------- */

const labelsOf = (facts: FeatureFact[]): string[] =>
  facts.map((fact) => fact.phrase);

/** A selection is at most five, so it is always named in full. */
const joinSelection = (facts: FeatureFact[]): string =>
  joinCapped(labelsOf(facts), 5);

/**
 * What the user picked out, and whether they got it.
 *
 * Leads the section, because it is the part the reader wrote themselves.
 *
 * The influence level is mentioned only where it changes what the sentence
 * means — missing something the reader said should count highly is worth
 * flagging, where the middle level counts silently. Appending "which you
 * marked very important" to every clause would be the mail-merge voice this
 * layer exists to avoid.
 */
function describeSelection(
  features: FeatureEvidence,
  rival: RivalDifference | null,
): string | null {
  const { present, missing } = features.picked;
  const total = present.length + missing.length;

  if (total === 0) return null;

  const subject = emphasisSubject([...present, ...missing].map((fact) => fact.source));

  if (total === 1) {
    const only = (present[0] ?? missing[0]) as FeatureFact;

    if (present.length) {
      return sentence(`${subject} ${only.phrase} here, and this car has it`);
    }

    return sentence(
      `${subject} ${only.phrase} here`,
      only.importance === "high" ? "as counting highly" : "",
      `, but ${absentPronounClause(only.key)}`,
    );
  }

  const opener = `${subject} ${joinSelection([...present, ...missing])}.`;

  if (!missing.length) {
    return sentence(opener, `This car has ${coverage(total, total)}`);
  }

  if (!present.length) {
    return sentence(opener, `This car has ${coverage(0, total)}: ${absentList(missing.map((fact) => fact.key))}`);
  }

  /* Naming the car that does have it turns a gap into a choice. */
  const rivalHasIt = rival?.onlyRivalHas.some((fact) =>
    missing.some((item) => item.key === fact.key),
  );

  if (present.length < missing.length) {
    return sentence(
      opener,
      `This car has ${coverage(present.length, total)}:`,
      joinSelection(present),
    );
  }

  const highMisses = features.highMisses;

  return sentence(
    opener,
    `This car has ${coverage(present.length, total)} —`,
    absentList(missing.map((fact) => fact.key)),
    highMisses.length && highMisses.length < missing.length
      ? `, including ${joinSelection(highMisses)}, which counts highly`
      : "",
    rivalHasIt && rival ? `, which ${rival.name} has` : "",
  );
}

/**
 * How the car does across the whole priority.
 *
 * Always said, because this is what the score actually counted — the picks
 * above it are evidence the reader supplied, not the measurement. Stating the
 * two separately is what stops "it has two of the three things you wanted"
 * from being mistaken for "it is two-thirds of a safe car".
 *
 * Phrased as a count rather than a percentage on purpose. "12 of the 15
 * features this priority covers" is a fact the reader can check; "80/100 for
 * safety" is a grade the data doesn't support.
 */
function describeCoverage(
  features: FeatureEvidence,
  label: string,
  hasPicks: boolean,
): string | null {
  if (features.basis !== "category") return null;

  const { present, missing } = features.coverage;
  const total = present.length + missing.length;

  if (total === 0) return null;

  const figure = `it has ${present.length} of the ${total} things this priority checks that FINN answers for it`;

  /*
   * A car with none of the category's equipment is a real finding, and
   * "it has 0 of the 14 systems" says it plainly. What must not happen is the
   * standing line calling that "the best of the close alternatives" because
   * every other car has none either — see `describeStanding`.
   */
  if (hasPicks) {
    return sentence(`Taking the whole priority together, ${figure}`);
  }

  return sentence(
    `Nothing is raised under ${phraseLabel(label)}, so everything it checks`,
    `counts the same: ${figure}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Measurements                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Reads a supporting measurement as a phrase rather than a label-value pair,
 * so several can be listed in one natural sentence.
 */
function measurementPhrase(fact: MeasurementFact): string {
  switch (fact.label) {
    case "Seats":
      return `${fact.display} seats`;
    case "Length":
      return `a length of ${fact.display}`;
    case LOAD_VOLUME:
      return `a load volume of ${fact.display} as FINN lists it, without saying whether that's with the rear seats folded`;
    case DC_CHARGING:
      return `DC charging from 10 to 80% in ${formatNumber(fact.value, 0)} minutes`;
    case "Doors":
      return `${fact.display} doors`;
    case "Boot space":
      return `${fact.display} of boot space`;
    case "Consumption":
      return `a combined ${fact.display}`;
    case "Electric range":
      return `an electric range of ${fact.display}`;
    case "CO\u2082 emissions":
      return `CO\u2082 emissions of ${fact.display}`;
    default:
      return `${inSentence(fact.label)} of ${fact.display}`;
  }
}

/**
 * The figure the engine actually weighed, quoted against the rival's own.
 *
 * When the two are level that is stated in one clause and dropped — a
 * paragraph explaining that two numbers are the same is filler.
 */
function describeScoredMeasurement(fact: MeasurementFact | null): string | null {
  if (!fact?.scored) return null;

  if (!fact.rival) {
    return sentence(`Its ${inSentence(fact.label)} is ${fact.display}`);
  }

  const { rival } = fact;

  if (isEffectivelyLevel(rival.magnitude)) {
    return sentence(
      `${fact.label} is effectively the same on both:`,
      `${fact.display} against ${rival.name}'s ${rival.display}`,
    );
  }

  return sentence(
    `Its ${inSentence(fact.label)} is ${fact.display}, against`,
    `${rival.name}'s ${rival.display}`,
  );
}

/** The figures we report for context but never score. */
function describeSupportingMeasurements(
  facts: MeasurementFact[],
): string | null {
  const supporting = facts.filter((fact) => !fact.scored);

  if (!supporting.length) return null;

  return sentence(`It has ${joinList(supporting.map(measurementPhrase))}`);
}

/**
 * What the car runs on.
 *
 * A categorical fact, and for an emissions or long-distance question a more
 * useful one than any figure — "it's electric" answers more than a CO₂ score
 * does. Named against the rival only when the two genuinely differ.
 */
function describeDrivetrain(traits: TraitFact[]): string | null {
  const tyres = traits.find((trait) => trait.label === "Tyres");

  if (tyres) {
    return tyres.rival
      ? sentence(`FINN fits it with ${tyres.value}, and ${tyres.rival.name} with ${tyres.rival.value} — Lens shows this but doesn't score it`)
      : sentence(`FINN fits it with ${tyres.value}, which Lens shows but doesn't score`);
  }

  const drivetrain = traits.find((trait) => trait.label === "Drivetrain");
  if (!drivetrain) return null;

  const value = drivetrain.value.toLowerCase();

  return drivetrain.rival
    ? sentence(
        `It's ${article(value)} ${value} car;`,
        `${drivetrain.rival.name} is`,
        `${article(drivetrain.rival.value.toLowerCase())} ${drivetrain.rival.value.toLowerCase()}`,
      )
    : sentence(`It's ${article(value)} ${value} car`);
}

const article = (word: string): string =>
  /^[aeiou]/i.test(word) ? "an" : "a";

/* -------------------------------------------------------------------------- */
/* Emissions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The one priority judged on figures rather than on equipment, explained.
 *
 * Everywhere else the reader can check a result against a list of features the
 * car does or doesn't have. Here there is no list, so what stands in its place
 * is the reading itself — see `describeEnvironment`, which says what the car
 * emits and, separately, how frugal it is for the kind of car it is. Those two
 * often disagree, and the disagreement is the useful part.
 */
function describeEmissions(breakdown: PriorityBreakdown): string[] {
  const assessment = breakdown.environmental;

  if (!assessment) return [];

  /*
   * The reading only. The caveats used to be appended here as a second
   * paragraph, which put the limitation between the reader and the figures
   * it limits. They travel on the assessment instead, and each surface places
   * them after the numbers.
   */
  return paragraph(describeEnvironment(assessment));
}

/* -------------------------------------------------------------------------- */
/* Standing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Where this car sits against the alternatives — said without naming them.
 *
 * Introducing a different car under every priority heading is what turns an
 * explanation into a leaderboard: "Compass does safety better, Karoq does
 * practicality better, Puma does comfort better" is five comparisons the
 * reader didn't ask for and can't hold in their head. Where an alternative is
 * genuinely better, that belongs in *what you're giving up*, once, with the
 * evidence and the reason it matters.
 *
 * What stays here is the one thing the reader can't get from the evidence
 * above it: whether anything close does better at all.
 */
function describeStanding(
  standing: PriorityStanding,
  breakdown: PriorityBreakdown,
  hasRival: boolean,
  scoredMeasurement: MeasurementFact | null,
): string | null {
  /* In a head-to-head the two cars in front of the reader are the comparison. */
  if (hasRival) return null;

  if (standing !== "leads") return null;

  const runnerUp = breakdown.runnerUp;

  /*
   * Nothing to have a standing against. One car on its own leads every
   * category it is evaluated in, and "none of the closest alternatives does
   * better here" would be an invented comparison — see `buildFitAnalysis`,
   * which evaluates a single car the reader is looking at on finn.com.
   */
  if (!runnerUp) return null;

  /*
   * Nobody having any of the equipment is not a lead. Saying "none of the
   * closest alternatives does better here" when every car scored zero is
   * technically true and completely misleading — the honest statement is
   * that this priority can't separate these cars.
   */
  if (breakdown.matched.length === 0 && breakdown.numeric == null) {
    return runnerUp && runnerUp.score === breakdown.score
      ? sentence(
          "None of the close alternatives has any of this equipment either, so",
          "this priority isn't separating them",
        )
      : null;
  }

  /*
   * Leading by a hair is still leading, but presenting it as a reason to
   * choose the car would be manufacturing a difference out of noise. For a
   * category decided by one measurement, the measurement is the honest test —
   * three grams of CO₂ apart is a tie however far the normalised scores drift.
   */
  const level = runnerUp
    ? scoredMeasurement != null &&
      runnerUp.numeric != null &&
      comparableMeasurements(scoredMeasurement, runnerUp.numeric)
      ? isEffectivelyLevel(
          classifyMeasurementGap(
            scoredMeasurement.value,
            runnerUp.numeric.value,
          ),
        )
      : isEffectivelyLevel(classifyScoreGap(breakdown.score - runnerUp.score))
    : false;

  /*
   * A hair's-breadth lead is still a lead, and the badge beside the heading
   * says so. Letting that stand unqualified would overstate it, so the
   * caveat is made — without naming the car, which is the tradeoff
   * section's job.
   */
  if (runnerUp && runnerUp.score === breakdown.score) {
    return sentence(
      "It's level with the closest alternatives here, so this priority isn't",
      "separating them",
    );
  }

  if (level) {
    return sentence(
      "It's the best of the close alternatives here, but only just",
    );
  }

  return sentence("None of the closest alternatives does better here");
}

/* -------------------------------------------------------------------------- */
/* Limits and gaps                                                            */
/* -------------------------------------------------------------------------- */

/**
 * An electric car's range under Long Distance: said when it limited the
 * result, and said to make no difference when it didn't.
 */
function describeRangeLimit(breakdown: PriorityBreakdown): string | null {
  const factor = breakdown.tripFactor;
  const range = breakdown.numeric;

  if (factor == null || !range) return null;

  return factor < 1
    ? sentence(
        `Its ${range.display} electric range limits this priority: under 480 km`,
        "Lens reduces the Long Distance result, because stops come round sooner",
      )
    : sentence(
        `Its ${range.display} electric range doesn't limit this priority —`,
        "past 480 km, range makes no further difference here",
      );
}

/**
 * An electric car's DC charging time under Long Distance, when FINN lists one:
 * said when it limited the result, and said to make no difference when it
 * didn't.
 */
function describeChargeLimit(breakdown: PriorityBreakdown): string | null {
  const factor = breakdown.chargeFactor;
  const minutes = breakdown.chargeMinutes;

  if (factor == null || minutes == null) return null;

  return factor < 1
    ? sentence(
        `Its ${formatNumber(minutes, 0)}-minute charge from 10 to 80% limits this priority: slower than 30 minutes`,
        "Lens reduces the Long Distance result, because each stop takes longer",
      )
    : sentence(
        `Its ${formatNumber(minutes, 0)}-minute charge from 10 to 80% doesn't limit this priority —`,
        "at 30 minutes or less, charging time makes no difference here",
      );
}

/**
 * What FINN's data didn't answer inside a priority that was still judged.
 *
 * Standard equipment FINN's list leaves out isn't said here: every surface
 * that shows these sentences also shows the standard items, checked one by
 * one, with that follow-up beside them.
 */
function describeGaps(breakdown: PriorityBreakdown): string | null {
  const unknown = breakdown.unknown.filter((key) => key !== "bootVolume");

  return paragraph(
    unknown.length && breakdown.hasEvidence
      ? sentence(
          `FINN doesn't give ${joinList(unknown.map(unknownPhrase))}, so`,
          unknown.length === 1 ? "that isn't counted" : "those aren't counted",
        )
      : null,
  ).join(" ") || null;
}

/* -------------------------------------------------------------------------- */
/* Missing data                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Says plainly that we can't answer, and why.
 *
 * Reached only when the data genuinely can't support a comparison — never
 * because the user singled out no features, which is answered by measuring
 * the category's whole catalogue instead.
 */
function describeMissingData(
  breakdown: PriorityBreakdown,
  vehicle: PinnedFinnCar,
): string[] {
  return paragraph(
    sentence(
      `Lens can't judge this car on ${phraseLabel(breakdown.label)}: FINN doesn't publish`,
      breakdown.unknown.length && breakdown.priority !== "environmental"
        ? breakdown.unknown.length === breakdown.matched.length + breakdown.missing.length + breakdown.unknown.length
          ? "its equipment list"
          : joinList(breakdown.unknown.map(unknownPhrase))
        : unassessedPhrase(breakdown.priority, vehicle.fuelType === "Electric"),
    ),
    sentence(
      "So this priority is left out of the car's result rather than guessed at",
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

export function reasonAboutPriority(
  breakdown: PriorityBreakdown,
  vehicle: PinnedFinnCar,
  rivalVehicle: PinnedFinnCar | null,
): PriorityReasoning {
  const features = featureEvidence(breakdown);
  const measurements = measurementFacts(breakdown, vehicle, rivalVehicle);
  const traits = traitFacts(breakdown, vehicle, rivalVehicle);
  const rival = rivalDifference(breakdown);
  const leader = leaderDifference(breakdown);
  const standing = priorityStanding(breakdown);

  const sentences =
    standing === "unsupported"
      ? describeMissingData(breakdown, vehicle)
      : paragraph(
          describeSelection(features, rival),
          describeCoverage(
            features,
            breakdown.label,
            features.selectedCount > 0,
          ),

          /*
           * Emissions replace the generic measurement lines rather than
           * joining them: all four of its figures are named below, and the
           * drivetrain sentence would say a third time what the fuel type
           * already says.
           */
          ...(breakdown.environmental
            ? describeEmissions(breakdown)
            : paragraph(
                describeScoredMeasurement(
                  measurements.find((fact) => fact.scored) ?? null,
                ),
                describeSupportingMeasurements(measurements),
                describeDrivetrain(traits),
              )),

          describeRangeLimit(breakdown),
          describeChargeLimit(breakdown),
          describeGaps(breakdown),

          describeStanding(
            standing,
            breakdown,
            rival != null,
            measurements.find((fact) => fact.scored) ?? null,
          ),
        );

  return {
    priority: breakdown.priority,
    label: breakdown.label,
    icon: breakdown.icon,
    rank: breakdown.rank,
    weightPercent: breakdown.weightPercent,
    score: breakdown.score,
    standing,
    hasEvidence: breakdown.hasEvidence,
    features,
    measurements,
    traits,
    environmental: breakdown.environmental ?? null,
    rival,
    leader,
    sentences,
  };
}
