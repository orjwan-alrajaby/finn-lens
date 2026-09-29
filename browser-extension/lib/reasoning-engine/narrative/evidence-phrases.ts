import type {
  CategoryId,
  DependsOnGap,
  EmphasisSource,
  SignalId,
} from "../types";

import { CATEGORIES } from "../constants";
import { isStatedFact } from "../evidence";
import { featureLabel, featurePhrase } from "../scoring";
import { joinCapped, phraseLabel } from "./phrase";

/**
 * How the explanation says what FINN's data does and doesn't show.
 *
 * One rule runs through all of it: an entry FINN's equipment list says no to
 * is "not listed", never "doesn't have". FINN's lists leave things out —
 * every BMW is legally required to carry eCall, and FINN lists it on fewer
 * than a fifth of them — so the honest claim is about the listing. The derived
 * signals are different: the number of doors is a structured field, and a
 * three-door car genuinely has no rear doors. So are the gearbox and the drive
 * type — a car FINN lists as manual has a manual gearbox.
 */

const lowerFirst = (text: string): string =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** One absent item as a clause: "FINN doesn't list a towbar", "it has no rear doors". */
export function absentClause(key: SignalId, subject = "it"): string {
  switch (key) {
    case "rearDoors":
      return `${subject} has no rear doors`;
    case "seatsFivePlus":
      return `${subject} has fewer than five seats`;
    case "seatsSixPlus":
      return `${subject} has fewer than six seats`;
    case "towingCapacity1500":
      return `${subject} is rated to tow less than 1,500 kg`;
    case "hasAutomaticTransmission":
      return `${subject} has a manual gearbox`;
    case "hasAllWheelDrive":
      return `${subject} doesn't have all-wheel drive`;
    case "driverAssistLevel2":
      return `FINN lists only level 1 driver assistance for ${subject}`;
    default:
      return `FINN doesn't list ${featurePhrase(key)} for ${subject}`;
  }
}

/**
 * One absent item, after a sentence that has already named it: "FINN doesn't
 * list it for this car" rather than naming it twice.
 */
export function absentPronounClause(key: SignalId): string {
  switch (key) {
    case "rearDoors":
      return "this car has no rear doors";
    case "seatsFivePlus":
      return "this car has fewer than five seats";
    case "seatsSixPlus":
      return "this car has fewer than six seats";
    case "towingCapacity1500":
      return "this car is rated to tow less";
    case "hasAutomaticTransmission":
      return "this car has a manual gearbox";
    case "hasAllWheelDrive":
      return "this car doesn't have it";
    case "driverAssistLevel2":
      return "FINN lists only level 1 for this car";
    default:
      return "FINN doesn't list it for this car";
  }
}

/**
 * Several absent items as one clause, equipment grouped so the sentence
 * doesn't say "FINN doesn't list" three times.
 */
export function absentList(keys: SignalId[], max = 5, subject = "it"): string {
  const listed = keys.filter((key) => !isStatedFact(key));
  const derived = keys.filter((key) => isStatedFact(key));

  const parts = [
    ...(listed.length
      ? [`FINN doesn't list ${joinCapped(listed.map(featurePhrase), max)} for ${subject}`]
      : []),
    ...derived.map((key) => absentClause(key, subject)),
  ];

  return parts.join(", and ");
}

/** What FINN didn't say about one item: "its driver assistance level". */
export function unknownPhrase(key: SignalId): string {
  switch (key) {
    case "rearDoors":
      return "how many doors it has";
    case "seatsFivePlus":
    case "seatsSixPlus":
      return "how many seats it has";
    case "towingCapacity1500":
      return "how much it can tow";
    case "hasAutomaticTransmission":
      return "which gearbox it has";
    case "hasAllWheelDrive":
      return "which wheels it drives";
    case "compactWidth":
      return "its width";
    case "driverAssistLevel2":
      return "its driver assistance level";
    case "compactLength":
      return "its length";
    case "bootVolume":
      return "its boot space";
    default:
      return `whether it has ${featurePhrase(key)}`;
  }
}

/** What an unassessed priority is missing, for a sentence about one car. */
export function unassessedPhrase(priority: CategoryId, isElectric: boolean): string {
  if (priority === "environmental") return "its CO₂ figure";
  if (priority === "longDistance" && isElectric) return "its electric range";

  const label = (CATEGORIES as Record<string, { label: string } | undefined>)[priority]?.label ?? priority;

  return `enough of what ${phraseLabel(label)} looks at`;
}

/** One gap on one named car, for "this could change depending on …". */
export function gapPhrase(gap: DependsOnGap, isElectric: boolean): string {
  const owner = `the ${gap.name}`;

  switch (gap.kind) {
    case "equipmentList":
      return `${owner}'s equipment list`;
    case "item":
      return `${lowerFirst(unknownPhrase(gap.key)).replace(/^its /, `${owner}'s `).replace(/ it /, ` ${owner} `)}`;
    case "priority":
      return unassessedPhrase(gap.priority, isElectric).replace(/^its /, `${owner}'s `);
  }
}

/**
 * Who a raise belongs to, said as a subject: "You raised" for the reader's
 * own, "Your starting profile emphasises" for one they never touched.
 */
export function emphasisSubject(sources: (EmphasisSource | undefined | null)[]): string {
  return sources.length && sources.every((source) => source === "profile")
    ? "Your starting profile emphasises"
    : "You raised";
}

/** The same, mid-sentence: "you raised", "your starting profile emphasised". */
export function emphasisClause(sources: (EmphasisSource | undefined | null)[]): string {
  return sources.length && sources.every((source) => source === "profile")
    ? "your starting profile emphasises"
    : "you raised";
}

export { featureLabel };
