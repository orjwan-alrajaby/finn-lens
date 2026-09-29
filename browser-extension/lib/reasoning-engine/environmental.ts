import type { FinnCar, FuelType } from "@/lib/types";

import { formatNumber } from "./format";
import { GOOD_FROM, STRONG_FROM } from "./bands";
import { piecewise, type Anchors } from "./evidence";

/**
 * What a car emits, how efficiently it uses what it burns, and what neither
 * figure can say on its own.
 *
 * This replaces a model that scored four things and averaged them: CO₂ g/km,
 * CO₂ class, consumption, and fuel type. Three of those four were not
 * independent of the first, and the research says so plainly.
 *
 * **The CO₂ class is the CO₂ figure.** Since the Pkw-EnVKV was amended in
 * February 2024 the German class is a pure function of WLTP combined CO₂ in
 * g/km — A at 0, B to 95, C to 115, D to 135, E to 155, F to 175, G above
 * that — and the amendment's own summary of what changed is that the reference
 * to vehicle weight was dropped. Scoring the figure and the class as two votes
 * counted one measurement twice.
 *
 * **Consumption is the CO₂ figure too, for anything that burns fuel.** The
 * Commission's real-world monitoring puts 1.2 L/100 km of petrol at 28 g
 * CO₂/km, which is the carbon in a litre of petrol and nothing else. A petrol
 * car's CO₂ per kilometre is its litres per kilometre times a constant.
 *
 * **Fuel type is not a measurement at all.** It is what tells you how to read
 * the other two — that a zero is a tailpipe zero, that a plug-in hybrid's
 * figure assumes charging — and giving it its own score marked a petrol car
 * down twice for being petrol: once in its CO₂ and again for the fuel that
 * produced it.
 *
 * So there is one score here, not four:
 *
 * - **Environmental impact** is tailpipe CO₂, placed on the EU's own class
 *   scale. The boundaries are the regulation's, not ours.
 *
 * - **Efficiency** is a separate, cohort-relative reading of consumption —
 *   "frugal for a petrol car" — because a litre and a kilowatt-hour are not
 *   comparable quantities, and because a reader who wants a petrol car is
 *   entitled to know which petrol car is the frugal one rather than being told
 *   again that petrol cars burn petrol.
 *
 * - **Powertrain** is context, and carries the caveats.
 *
 * The two answers are allowed to disagree, and that disagreement is the useful
 * part: a frugal petrol car is genuinely efficient *and* genuinely a worse
 * emitter than an electric one, and a reader deciding between petrol cars
 * needs the first while a reader deciding between powertrains needs the second.
 *
 * Sources: Pkw-EnVKV §3a and ADAC's summary of the 2024 amendment; the
 * European Commission's report on real-world CO₂ from on-board monitoring;
 * ICCT's analysis of the EEA's 2024 registration data (research brief ID 482),
 * its 2025 life-cycle report, its battery-size report, and its work on
 * plug-in hybrid utility factors.
 */

/* -------------------------------------------------------------------------- */
/* Reference points, all of them published                                    */
/* -------------------------------------------------------------------------- */

/**
 * The EU CO₂ classes, as the upper bound of each band in g/km.
 *
 * Straight out of the regulation. `G` has no upper bound in law; the figure
 * here is where this stops distinguishing, one band-width past where G starts.
 */
const CO2_CLASS_BANDS: { letter: string; upTo: number }[] = [
  { letter: "A", upTo: 0 },
  { letter: "B", upTo: 95 },
  { letter: "C", upTo: 115 },
  { letter: "D", upTo: 135 },
  { letter: "E", upTo: 155 },
  { letter: "F", upTo: 175 },
  { letter: "G", upTo: 195 },
];

/**
 * The same classes, read-only, for surfaces that draw the scale.
 *
 * Exported as a copy of the table rather than restated at the call site: the
 * settings editor draws A to G with each class's range, and a second list of
 * boundaries there would be a second regulation to keep in step with this one.
 */
export const CO2_CLASSES: readonly { letter: string; from: number; upTo: number }[] =
  CO2_CLASS_BANDS.map((band, index) => ({
    letter: band.letter,
    from: index === 0 ? 0 : (CO2_CLASS_BANDS[index - 1]?.upTo ?? 0) + 1,
    upTo: band.upTo,
  }));

/**
 * Where a CO₂ figure lands on the 0–100 the rest of the engine speaks in.
 *
 * The one product judgement in this file. The anchors sit on the official
 * class boundaries and the score runs in straight lines between them, so every
 * class still reads as its band — A and B strong, C good, D and E partial, F
 * and G limited — while one gram either side of a boundary moves the score by
 * about a point rather than the eight a stepped table used to.
 *
 * The step from 0 to 1 g/km is kept on purpose: no tailpipe at all is a
 * different kind of result from a very low one.
 */
export const CO2_SCORE_ANCHORS: Anchors = [
  [1, 88],
  [95, 65],
  [115, 45],
  [135, 35],
  [155, 25],
  [175, 12],
  [195, 0],
];

/** The top of the plug-in hybrid scale: one below Strong. See `phevScore`. */
const PHEV_CEILING = STRONG_FROM - 1;

/** The highest a non-zero official figure can score, where the PHEV scale starts. */
const TOP_NON_ZERO_SCORE = CO2_SCORE_ANCHORS[0]?.[1] ?? 88;

/**
 * Grams of CO₂ per litre burned.
 *
 * Physical constants, not estimates: the Commission's monitoring report gives
 * 1.2 L/100 km of petrol as 28 g CO₂/km, which is the petrol number, and its
 * diesel figures (1.0–1.1 L/100 km as 26–28 g CO₂/km) agree with the diesel
 * one within their rounding. They turn the emissions reference into a
 * consumption one, so the efficiency reference is derived from published data
 * rather than set by hand.
 */
const CARBON_PER_LITRE: Partial<Record<FuelType, number>> = {
  Petrol: 2330,
  Diesel: 2640,
};

/**
 * What new cars with a combustion engine emit on average, in WLTP CO₂ g/km.
 *
 * An observation, not a target. ICCT's analysis of the EEA's registration data
 * (research brief ID 482, December 2025) finds combustion cars including
 * hybrids "have only declined by 3 g/km since 2021, remaining at about
 * 134 g/km" — about 137 in 2021, about 134 in 2024. 136 sits on that plateau.
 * Moving it to 134 would change no score, since scores come from the class,
 * and would move the efficiency bands by under 0.1 L/100 km; revisit it when
 * the final 2025 data is published.
 *
 * Not the Pocketbook's headline figure, which is 108 g/km for every new car,
 * electric ones included.
 */
export const COMBUSTION_FLEET_CO2 = 136;

/**
 * The reference an electric car is read against, in WLTP kWh/100 km.
 *
 * A rounded reference, not a measured average. ICCT's 2025 life-cycle report
 * (Table 4, from EEA data) gives 16.2 kWh/100 km as the sales-weighted official
 * consumption of medium-segment electric cars sold in the EU in 2023, and 17
 * sits a little above it. There is no CO₂ figure to derive an electric
 * reference from — every electric car is 0 g/km — so consumption is the only
 * thing separating one from another.
 *
 * This used to be derived from "real-world ≈ 19 kWh/100 km running ~12% above
 * type-approval". ICCT's battery-size report says neither: its real-world
 * estimates run 29–44% above type-approval, and its 12% is a charger-loss
 * parameter. The number holds up; that derivation didn't.
 */
const ELECTRIC_FLEET_KWH = 17;

/** ICCT's medium-segment electric figure that `ELECTRIC_FLEET_KWH` rounds up from. */
const ELECTRIC_MEDIUM_SEGMENT_KWH = 16.2;

/**
 * How far from typical a car has to be before the word changes.
 *
 * One CO₂ class is 20 g/km wide, which is 15% of the combustion fleet average.
 * Using that proportion for every cohort makes "highly efficient" the same
 * distance from ordinary whether it is measured in litres or kilowatt-hours,
 * and it is a width the label already uses rather than one chosen to make cars
 * look good.
 */
export const EFFICIENCY_BAND = 20 / COMBUSTION_FLEET_CO2;

/**
 * The short line that closes a section built on these figures.
 *
 * The full version, with what the unit means and why real driving uses more,
 * sits behind the "i" on the car's own figure. This is the part worth saying
 * even to a reader who never opens it.
 */
export const TEST_DISCLAIMER =
  "Official EU test figures. Real-world use is usually higher.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How this car's emissions read against everything else on the road.
 *
 * The mirror of `EfficiencyLevel`, and it exists for the same reason: a number
 * on its own is not an answer. 140 g/km means nothing to a reader who doesn't
 * already know what a car emits, and the UI should never be the thing deciding
 * what it means.
 */
export type EmissionsLevel = "none" | "low" | "moderate" | "high";

export interface EmissionsAssessment {
  level: EmissionsLevel;
  /** "Lower emissions" — the headline for the figure. */
  label: string;
  /** What the figure means, in one sentence. */
  explanation: string;
  /** "140 g/km · Class D". */
  display: string;
  gPerKm: number;
  className: string;
}

export type EfficiencyLevel = "high" | "moderate" | "low";

/**
 * How much it uses, on the five-step scale its label names.
 *
 * The level's own edges, `EFFICIENCY_BAND` either side of the reference, with
 * "very" at twice that distance. The band is one CO₂ class wide, so for petrol
 * and diesel the steps fall where the classes do: very low up to where B ends,
 * low across C, moderate across D and E, high across F, very high from G.
 */
export type EfficiencyStep = "veryLow" | "low" | "moderate" | "high" | "veryHigh";

export interface EfficiencyAssessment {
  level: EfficiencyLevel;
  /** "Low fuel use", "Very high electricity use": the step, in words. */
  label: string;
  step: EfficiencyStep;
  /** What that means, naming the reference it is relative to. */
  explanation: string;
  /** The figure it was read from: "5.5 L/100km". */
  display: string;
  /**
   * The unit in words: "litres of petrol per 100 km".
   *
   * "L/100km" means nothing to somebody who has never bought a car on it, and
   * it is the figure the whole reading rests on.
   */
  measure: string;
  /**
   * The figure as a sentence, under the number itself: "This car consumes 4.7
   * litres of petrol per 100 km". The unit spelled out on its own still didn't
   * say that the number is how much the car consumes.
   */
  consumes: string;

  /**
   * What it is compared with: "5.8 L/100km".
   *
   * FINN Lens's own reference, derived from an emissions observation — not an
   * average anybody measured for petrol or diesel cars, and not an official
   * figure. It never travels without `referenceLabel` and `referenceNote`,
   * which say so, and `provenance`, which says where it came from.
   */
  reference: string;
  /** "FINN Lens benchmark" — the powertrain chip beside it says which one. */
  referenceLabel: string;
  /** "FINN Lens's comparison point, not an official average". */
  referenceNote: string;
  /** "Where does the FINN Lens benchmark come from?", and the answer. */
  provenance: { title: string; body: string };
  /**
   * How the reference is reached, without repeating where the 136 g/km
   * comparison point comes from: for a surface that has already said so.
   */
  referenceDerivation: string[];

  /**
   * The same judgement with its working shown: the reference and how far
   * the car is from it, after `consumes` has said what the car uses. "Low fuel use" on its
   * own is a verdict the reader has no way to check, and this one is a
   * comparison against a reference rather than a property of the car.
   */
  reasoning: string;

  /**
   * "What does 5.5 L/100km mean?", behind the "i" on the car's own figure:
   * the unit said in words, then where the figure comes from and that real
   * driving uses more. One explanation about one number, rather than half of
   * it behind the "i" and half of it at the bottom of the section. The title
   * names the figure so it can be read away from the row it belongs to.
   */
  meaning: { title: string; body: string };

  /** `TEST_DISCLAIMER`, the short line that closes the section. */
  disclaimer: string;
  /** The car's own figure and the reference, for a side-by-side readout. */
  value: number;
  referenceValue: number;
  unit: string;
}

/**
 * How far the emissions figure can be trusted as a description of the car.
 *
 * `optimistic` is the plug-in hybrid case: the number is real, but it measures
 * an assumed pattern of use as much as it measures the car.
 */
export type EmissionsConfidence = "measured" | "optimistic" | "unknown";

export interface EnvironmentalAssessment {
  /** 0–100 on the class scale. Null when FINN supplied no CO₂ figure. */
  score: number | null;

  /**
   * The primary signal, interpreted — the figure, the class that is its
   * published shorthand, and what the number actually means.
   */
  co2: EmissionsAssessment | null;

  /** The separate question: how well it uses what it burns. */
  efficiency: EfficiencyAssessment | null;

  powertrain: FuelType | null;
  confidence: EmissionsConfidence;

  /** What the figures can't say for themselves. */
  caveats: string[];

  /** Measurements FINN didn't supply, named in plain English. */
  missing: string[];
}

/* -------------------------------------------------------------------------- */
/* Reading the figures                                                        */
/* -------------------------------------------------------------------------- */

const isMeasured = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * A figure as FINN published it, or NaN where FINN left it empty.
 *
 * FINN's API sends `null` for a figure it doesn't have, and `Number(null)` is
 * 0, so reading figures with `Number()` turned a car with no published CO₂
 * into a car that emits none: Class A, "Very low emissions", a strong match.
 * A missing figure has to stay missing, so that the reader is told there is
 * no data rather than shown a value nobody measured.
 */
const published = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);

  return Number.NaN;
};

/** The official class for a CO₂ figure, computed rather than trusted. */
export function co2ClassFor(gPerKm: number): string {
  for (const band of CO2_CLASS_BANDS) {
    if (gPerKm <= band.upTo) return band.letter;
  }

  return "G";
}

/**
 * Where a CO₂ figure sits on the 0–100 scale.
 *
 * The class decides which stretch of the scale; the figure's position inside
 * its own class decides where in that stretch. So the answer moves smoothly
 * with the emissions while never letting a car cross into a band its class
 * doesn't belong to.
 */
export function positionForCo2(gPerKm: number): number {
  if (gPerKm <= 0) return 100;

  return piecewise(CO2_SCORE_ANCHORS, gPerKm);
}

/**
 * A plug-in hybrid's score: its official figure, refused the Strong rating.
 *
 * A policy about which word Lens will use, not a claim about real-world
 * emissions. The official figure assumes the car is charged often, and FINN's
 * data can't say whether it will be, so Lens won't call a plug-in hybrid a
 * strong environmental match on that figure — and doesn't pretend to know how
 * much worse real use is either, so it goes no lower than that.
 *
 * Compressed, not clipped: a score above the Good threshold is scaled into the
 * Good band, so two plug-in hybrids keep their order; a score at or below it
 * is left alone. Never above a non-plug-in car with the same official figure.
 */
export function phevScore(normal: number): number {
  if (normal <= GOOD_FROM) return normal;

  const scaled =
    GOOD_FROM +
    ((normal - GOOD_FROM) * (PHEV_CEILING - GOOD_FROM)) /
      (TOP_NON_ZERO_SCORE - GOOD_FROM);

  return Math.min(PHEV_CEILING, scaled);
}

/**
 * What a CO₂ figure means, said once so no surface has to decide for itself.
 *
 * The boundaries are the official class boundaries, grouped: A–B is the low
 * end, C–D the middle, E and worse the high end. That keeps every word here
 * traceable to the same regulation the score comes from, and it means the
 * sentence and the band can never drift apart.
 *
 * Deliberately plain. "Lower emissions" and "higher emissions" describe a
 * measurement; "clean" and "green" describe a car, and this data does not
 * support describing a car.
 */
function assessEmissions(
  gPerKm: number,
  powertrain: FuelType | null,
): EmissionsAssessment {
  const className = co2ClassFor(gPerKm);
  const display = `${formatNumber(gPerKm)} g/km · Class ${className}`;
  const figure = formatNumber(gPerKm);

  if (gPerKm === 0) {
    return {
      level: "none",
      label: "No CO₂ at the tailpipe",
      explanation:
        powertrain === "Electric"
          ? "It emits no CO₂ while you drive it. That is the strongest result this priority can give."
          : "It emits no CO₂ while you drive it, which is the strongest result this priority can give.",
      display,
      gPerKm,
      className,
    };
  }

  /*
   * A plug-in hybrid's figure is labelled for what it is.
   *
   * 30 g/km is a class B number, and calling it "low emissions" alongside a
   * caveat saying it might be several times that is the panel arguing with
   * itself. The condition goes in the label, where the reader meets it, and
   * the band it is drawn in is the neutral one rather than the flattering
   * one. The figure itself is not touched — see `assessEnvironment` for why
   * no corrected number is invented.
   */
  if (powertrain === "Plug-in Hybrid") {
    return {
      level: "moderate",
      label: "Low only if you charge it",
      explanation: `Its published figure is ${figure} g/km, which is low — but for a plug-in hybrid that number assumes the car is plugged in regularly. How much you'd actually emit depends on how often you do.`,
      display,
      gPerKm,
      className,
    };
  }

  /*
   * Every comparison below is to the same published number — the CO₂ average
   * of new cars that burn fuel — rather than to a petrol average or a diesel
   * average, which aren't published separately. Saying "more than a typical
   * petrol car" would be claiming a benchmark this doesn't have.
   */
  const average = `the ${COMBUSTION_FLEET_CO2} g/km average for a new car that burns fuel`;

  /* Class A–B: below the 95 g/km line the EU label treats as low. */
  if (gPerKm <= 95) {
    return {
      level: "low",
      label: "Low emissions",
      explanation: `At ${figure} g of CO₂ per kilometre it emits well under ${average}.`,
      display,
      gPerKm,
      className,
    };
  }

  /* Class C: still under the average, but not by much. */
  if (gPerKm <= 115) {
    return {
      level: "moderate",
      label: "Below-average emissions",
      explanation: `It puts out ${figure} g of CO₂ for every kilometre driven, under ${average}.`,
      display,
      gPerKm,
      className,
    };
  }

  /* Class D: where most new combustion cars sit. */
  if (gPerKm <= 135) {
    return {
      level: "moderate",
      label: "Around-average emissions",
      explanation: `It puts out ${figure} g of CO₂ for every kilometre driven, close to ${average}.`,
      display,
      gPerKm,
      className,
    };
  }

  /*
   * Class E and worse. The band opens just above the average and has no top,
   * so the sentence says how far above rather than treating 140 g/km and
   * 240 g/km as the same statement.
   */
  const margin = gPerKm >= COMBUSTION_FLEET_CO2 * 1.25 ? "well above" : "above";

  return {
    level: "high",
    label: "Above-average emissions",
    explanation: `At ${figure} g of CO₂ per kilometre it emits ${margin} ${average}.`,
    display,
    gPerKm,
    className,
  };
}

/* -------------------------------------------------------------------------- */
/* Efficiency, within the powertrain the reader is looking at                 */
/* -------------------------------------------------------------------------- */

/** The first words of a label: "Low" in "Low fuel use". */
const STEP_WORDS: Record<EfficiencyStep, string> = {
  veryLow: "Very low",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  veryHigh: "Very high",
};

interface Cohort {
  /** The reference figure, in `unit`. */
  reference: number;
  unit: string;
  /** What it uses: "petrol", "diesel", "electricity". */
  noun: string;
  /** The unit's quantity in words: "litres of petrol". */
  quantity: string;
  /** Who the reference is for: "petrol cars". */
  kind: string;
  /** What its consumption is called in a sentence: "fuel use". */
  use: string;
  /** The unit said in words, around this car's own figure. */
  unitMeaning: (amount: string) => string;
  /** Where the reference comes from, in words for someone new to cars. */
  origin: string;
  /**
   * How this reference is reached, for a reader who has already been told
   * where 136 g/km comes from. `origin` stands alone; this doesn't repeat it.
   */
  derivation: string[];
}

/**
 * The reference this powertrain's consumption is read against.
 *
 * For anything that burns fuel it is one emissions observation — what new
 * combustion cars emit — converted into litres of this fuel. That is its
 * strength: petrol and diesel are held to the same CO₂ figure, each in its own
 * unit, which is why the diesel reference is fewer litres than the petrol one.
 * It is also why it must never be called what petrol or diesel cars average:
 * nobody measured it on them.
 */
function cohortFor(fuel: FuelType): Cohort | null {
  if (fuel === "Electric") {
    return {
      reference: ELECTRIC_FLEET_KWH,
      unit: "kWh/100km",
      noun: "electricity",
      quantity: "kWh of electricity",
      kind: "electric cars",
      use: "electricity use",
      unitMeaning: (amount) =>
        `kWh/100km tells you how much electricity a car uses to travel 100 kilometres, so ` +
        `${amount} kWh/100km means about ${amount} kWh of electricity per 100 km. A kilowatt-hour ` +
        `(kWh) is the unit your electricity bill uses. A lower kWh/100km figure means the car ` +
        `uses less electricity.`,
      derivation: [
        `Electric cars don't put out any CO₂ while driving, so there's nothing to turn into kWh. ` +
          `Instead, FINN Lens uses ${formatNumber(ELECTRIC_FLEET_KWH)} kWh per 100 km: a round number just above ` +
          `the ${formatNumber(ELECTRIC_MEDIUM_SEGMENT_KWH)} kWh/100km that mid-size electric cars used on average ` +
          `in the official EU test in 2023, according to the ICCT.`,
        `It's FINN Lens's own comparison point, not an official average.`,
      ],
      /* Paragraphs are separated by a blank line; the "i" panels split on it. */
      origin:
        `Electric cars produce no CO₂ while driving, so there's nothing to convert.\n\n` +
        `FINN Lens uses ${formatNumber(ELECTRIC_FLEET_KWH)} kWh/100km instead: a rounded figure a ` +
        `little above the ${formatNumber(ELECTRIC_MEDIUM_SEGMENT_KWH)} kWh/100km that mid-size ` +
        `electric cars sold in the EU in 2023 used on average in the official test, according to ` +
        `the ICCT. It's a comparison point used by Lens, not an official average.`,
    };
  }

  const carbon = CARBON_PER_LITRE[fuel];

  if (!carbon) return null;

  const noun = fuel.toLowerCase();
  const reference = (COMBUSTION_FLEET_CO2 / carbon) * 100;
  const petrol = (COMBUSTION_FLEET_CO2 / (CARBON_PER_LITRE.Petrol as number)) * 100;

  return {
    reference,
    unit: "L/100km",
    noun,
    quantity: `litres of ${noun}`,
    kind: `${noun} cars`,
    use: "fuel use",
    unitMeaning: (amount) =>
      `L/100km tells you how much fuel a car uses to travel 100 kilometres, so ${amount} L/100km ` +
      `means about ${amount} litres of fuel per 100 km. A lower L/100km figure means the car uses less fuel.`,
    derivation: [
      `It's the ${COMBUSTION_FLEET_CO2} g/km from above, turned into ${noun}: a car that puts out ` +
        `${COMBUSTION_FLEET_CO2} g of CO₂ per km burns about ${formatNumber(reference)} litres of ${noun} per 100 km.` +
        (fuel === "Diesel"
          ? ` That's less than the ${formatNumber(petrol)} litres for petrol, because a litre of diesel ` +
            `makes more CO₂ when it burns.`
          : ""),
      `It's FINN Lens's own comparison point, not an official average.`,
    ],
    /*
     * A conversion, said as one, and without the chemistry. The grams per
     * litre that do the converting are `CARBON_PER_LITRE` and the design
     * record; what a reader needs is that this is one CO₂ comparison point
     * turned into litres, and that nobody measured petrol cars using it.
     */
    origin:
      `FINN Lens uses about ${COMBUSTION_FLEET_CO2} g of CO₂ per km as a comparison point, based on ` +
      `European data analysed by the ICCT, an independent research organisation.\n\n` +
      `Lens converts that figure into an equivalent ${noun}-use figure, giving us the ` +
      `${formatNumber(reference)} L/100km benchmark.` +
      (fuel === "Diesel"
        ? ` It's lower than the ${formatNumber(petrol)} L/100km petrol benchmark because ` +
          `burning a litre of diesel produces more CO₂ than burning a litre of petrol.`
        : "") +
      ` It's a comparison point used by Lens, not an official average, legal limit, or target.`,
  };
}

/** The FINN Lens benchmark for one powertrain's fuel or electricity use. */
export interface EfficiencyReference {
  /** "5.8 L/100km". */
  value: string;
  /** Who it is for: "petrol cars". */
  kind: string;
  /** How it is reached: see `Cohort.derivation`. */
  derivation: string[];
}

/**
 * The reference on its own, without a car to compare with it.
 *
 * A constant for each powertrain, so it doesn't depend on FINN publishing the
 * car's own consumption: a car with no figure is still a petrol car, and the
 * table shows what it would be read against rather than "None". Null for a
 * plug-in hybrid, which has no fair reference, and where FINN doesn't say what
 * the car runs on.
 */
export function efficiencyReferenceFor(
  fuel: FuelType | null,
): EfficiencyReference | null {
  if (!fuel || fuel === "Plug-in Hybrid") return null;

  const cohort = cohortFor(fuel);

  return cohort
    ? {
        value: `${formatNumber(cohort.reference)} ${cohort.unit}`,
        kind: cohort.kind,
        derivation: cohort.derivation,
      }
    : null;
}

/** "Uses noticeably less …" → "uses noticeably less …", leaving "FINN Lens" alone. */
const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/** Who a powertrain's reference is for, as the prose names it. */
function kindOf(powertrain: FuelType | null): string {
  return powertrain === "Electric"
    ? "electric cars"
    : `${(powertrain ?? "combustion").toLowerCase()} cars`;
}

/**
 * How efficiently this car uses its own kind of energy.
 *
 * Cohort-relative on purpose, and separate from the emissions answer on
 * purpose. There is no honest single number covering litres and kilowatt-hours
 * at once, and a reader who wants a petrol car needs to know which petrol car
 * is the frugal one.
 *
 * Returns null for a plug-in hybrid: its single figure is a blend of two
 * energy sources over an assumed pattern of charging, there is no cohort it
 * can honestly be placed in, and FINN publishes no separate electric
 * consumption to build one from.
 */
export function assessEfficiency(
  vehicle: FinnCar,
): EfficiencyAssessment | null {
  const fuel = vehicle.fuelType;
  const consumption = published(vehicle.consumption?.combined);

  if (!fuel || !isMeasured(consumption) || consumption <= 0) return null;
  if (fuel === "Plug-in Hybrid") return null;

  const cohort = cohortFor(fuel);

  if (!cohort) return null;

  const { reference } = cohort;
  const margin = reference * EFFICIENCY_BAND;

  let level: EfficiencyLevel = "moderate";

  if (consumption <= reference - margin) level = "high";
  else if (consumption >= reference + margin) level = "low";

  let step: EfficiencyStep = "moderate";

  if (consumption <= reference - 2 * margin) step = "veryLow";
  else if (level === "high") step = "low";
  else if (consumption >= reference + 2 * margin) step = "veryHigh";
  else if (level === "low") step = "high";

  const against = `the FINN Lens benchmark for ${cohort.kind}`;

  const explanation = {
    high: `Uses noticeably less ${cohort.noun} than ${against}.`,
    moderate: `Uses about as much ${cohort.noun} as ${against}.`,
    low: `Uses noticeably more ${cohort.noun} than ${against}.`,
  }[level];

  /*
   * How far off the reference it actually is, rounded to whole percent.
   *
   * Quoted rather than kept internal because the band is the whole judgement:
   * a reader told "Low fuel use" has no way to know whether that meant 2%
   * better or 30%, and the difference is the difference between a rounding
   * artefact and a real saving.
   */
  const differencePct = Math.round(
    (Math.abs(consumption - reference) / reference) * 100,
  );

  const mine = `${formatNumber(consumption)} ${cohort.unit}`;
  const theirs = `${formatNumber(reference)} ${cohort.unit}`;

  /*
   * The figure is said in words once, as `consumes`, right under the number:
   * "5.5 L/100km" is an answer only to somebody who already knows what the
   * unit is, and "This car consumes 5.5 litres of petrol per 100 km" is an
   * answer to anyone. This sentence starts from there rather than saying it
   * again.
   */
  const benchmark = `the ${theirs} FINN Lens benchmark`;
  const direction = consumption < reference ? "less" : "more";

  const compared =
    differencePct === 0
      ? `It uses about as much ${cohort.noun} as ${benchmark}`
      : `It uses about ${differencePct}% ${direction} ${cohort.noun} than ${benchmark}`;

  /*
   * Only how it compares. The label beside it already carries the verdict,
   * so the sentence neither repeats it nor editorialises about it — and it
   * doesn't name where the band's edges are.
   */
  const standing = {
    high: "noticeably lower than",
    moderate: "broadly in line with",
    low: "noticeably higher than",
  }[level];

  const reasoning = `${compared}, so its ${cohort.use} is ${standing} the benchmark.`;

  return {
    level,
    label: `${STEP_WORDS[step]} ${cohort.use}`,
    step,
    explanation,
    display: mine,
    measure: `${cohort.quantity} per 100 km`,
    consumes: `This car consumes ${formatNumber(consumption)} ${cohort.quantity} per 100 km`,
    reference: theirs,
    referenceLabel: "FINN Lens benchmark",
    referenceNote: "FINN Lens's comparison point, not an official average",
    provenance: {
      title: "Where does the FINN Lens benchmark come from?",
      body: cohort.origin,
    },
    referenceDerivation: cohort.derivation,
    reasoning,
    meaning: {
      /*
       * The figure, not "this number". The "i" it opens from sits beside the
       * benchmark's own — "Where does 5.8 L/100km come from?" — and a reader
       * who opens both is owed a title saying which of the two numbers each
       * one is about. It also travels: the same explanation is used in "How
       * much it uses" and inside the environmental table, and a title that
       * only works beside its own row breaks the moment it is moved.
       */
      title: `What does ${mine} mean?`,
      body:
        `${cohort.unitMeaning(formatNumber(consumption))}\n\n` +
        `The figure comes from the official EU test, which makes it useful for comparing cars. ` +
        `Real-world use is usually higher, especially on motorways, in cold weather, or with a loaded car.`,
    },
    disclaimer: TEST_DISCLAIMER,
    value: consumption,
    referenceValue: reference,
    unit: cohort.unit,
  };
}

/* -------------------------------------------------------------------------- */
/* Powertrain context                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What the figures can't say about themselves.
 *
 * Each is a limit of the measurement rather than an opinion about the car, and
 * each names something a reader would otherwise read the number wrongly
 * without. Nothing generic is here: "this only counts what comes out of the
 * car, not what building it cost" applies to every car equally, tells nobody
 * anything about the one in front of them, and is the sort of line a reader
 * learns to skip — which then costs the two below their credibility. It lives
 * in the method notes instead, where somebody asking that question will find
 * it.
 *
 * Kept short deliberately. A caveat nobody finishes reading protects nobody.
 */
function caveatsFor(vehicle: FinnCar): string[] {
  if (vehicle.fuelType === "Electric") {
    return [
      "Zero here means zero from the car. Making the electricity it charges on isn't free of emissions, and FINN's data doesn't say where yours would come from.",
    ];
  }

  if (vehicle.fuelType === "Plug-in Hybrid") {
    return [
      "This figure assumes the car gets charged often. Drive it mostly on petrol and the real emissions are several times higher — so it describes a way of driving as much as it describes the car.",
    ];
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* The assessment                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The whole environmental reading of one car.
 *
 * Null only when there is nothing at all to say — no CO₂ figure and no usable
 * consumption. A car with one but not the other is reported on what it has,
 * with the gap named rather than filled in.
 */
export function assessEnvironment(
  vehicle: FinnCar,
): EnvironmentalAssessment | null {
  const fuel = vehicle.fuelType ?? null;
  const raw = published(vehicle.co2?.value);
  const missing: string[] = [];

  /*
   * A battery-electric car emits nothing from a tailpipe it hasn't got.
   *
   * FINN leaves `co2emission` empty for some electric cars — there is no
   * figure to state — and everything here read that the way it reads every
   * other empty figure: as data we don't have. So a car whose emissions are
   * not merely low but definitionally zero came out unscored, with "Not
   * enough data" where its strongest possible result belonged, while FINN's
   * own page beside it showed Class A.
   *
   * Filling this in is not the guessing that `published` exists to prevent.
   * Nothing is being estimated, averaged or inferred from a neighbouring
   * field: tailpipe CO₂ is what this priority measures, and for a car with no
   * combustion engine that quantity is zero by definition — which is also why
   * the regulation's own class A begins and ends at 0 g/km. The refusal to
   * guess stays in force for every powertrain that burns something, plug-in
   * hybrids included: their figure is real, contested, and not ours to invent.
   *
   * A published figure always wins, electric or not, so this only ever fills
   * a gap and never overrides FINN.
   */
  const tailpipe = !isMeasured(raw) && fuel === "Electric" ? 0 : raw;

  /*
   * The class is computed from the figure rather than read from FINN's field.
   * Where a car predates the 2024 scale its stored letter can disagree with
   * its own emissions, and the regulation is the better authority on its own
   * classes.
   */
  const co2 = isMeasured(tailpipe)
    ? assessEmissions(tailpipe, vehicle.fuelType ?? null)
    : null;

  if (!co2) missing.push("its CO₂ figure");

  const efficiency = assessEfficiency(vehicle);
  const consumption = published(vehicle.consumption?.combined);

  if (!isMeasured(consumption) || consumption <= 0) {
    missing.push("what it consumes");
  }

  if (!fuel) missing.push("what it runs on");

  if (!co2 && !efficiency) return null;

  let score = co2 ? positionForCo2(co2.gPerKm) : null;
  let confidence: EmissionsConfidence = co2 ? "measured" : "unknown";

  /* See `phevScore`: refused the Strong rating, order among them kept. */
  if (score != null && fuel === "Plug-in Hybrid") {
    confidence = "optimistic";
    score = phevScore(score);
  }

  return {
    score,
    co2,
    efficiency,
    powertrain: fuel,
    confidence,
    caveats: caveatsFor(vehicle),
    missing,
  };
}

/**
 * `assessEnvironment`, or, where FINN published neither figure, an assessment
 * that says so.
 *
 * `assessEnvironment` returns null there, which also loses what the car runs
 * on, and the environmental result needs that to show the right reference
 * beside the missing figures. Nothing is scored and nothing is filled in.
 */
export function assessEnvironmentOrGaps(
  vehicle: FinnCar,
): EnvironmentalAssessment {
  return (
    assessEnvironment(vehicle) ?? {
      score: null,
      co2: null,
      efficiency: null,
      powertrain: vehicle.fuelType ?? null,
      confidence: "unknown",
      caveats: [],
      missing: [
        "its CO₂ figure",
        "what it consumes",
        ...(vehicle.fuelType ? [] : ["what it runs on"]),
      ],
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Saying it                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The reading in one or two sentences.
 *
 * Where the two answers differ, both are given. That is the whole value of
 * separating them: "efficient for a petrol car, and still a worse emitter than
 * an electric one" is two true things a single score cannot hold.
 */
export function describeEnvironment(
  assessment: EnvironmentalAssessment,
): string {
  const { co2, efficiency, powertrain } = assessment;

  if (!co2) {
    return efficiency
      ? `FINN doesn't publish a CO₂ figure for this car, so there's no emissions result. What it does publish is consumption: it ${lowerFirst(efficiency.explanation)}`
      : "FINN doesn't publish the emissions or consumption figures this priority is judged on, so there's nothing to judge it on.";
  }

  /*
   * The emissions clause always leads, because emissions are what the result
   * is. Efficiency follows as a second, separate observation — joined by
   * "and" where the two agree and "although" where they don't, since a reader
   * meeting "no CO₂ at the tailpipe, although it uses a lot of electricity"
   * needs the turn signposted rather than smuggled in.
   */
  /*
   * A plug-in hybrid stops at the emissions clause. There is no efficiency
   * reading to add — see `assessEfficiency` — and its one blended
   * consumption figure has no cohort to be frugal within.
   */
  if (powertrain === "Plug-in Hybrid") return co2.explanation;

  if (!efficiency) {
    return `${co2.explanation} FINN doesn't publish what it consumes, so how efficiently it uses that ${
      powertrain === "Electric" ? "electricity" : "fuel"
    } isn't something we can say.`;
  }

  /*
   * The two answers only genuinely disagree at the ends: a car that emits
   * little while using a lot, or one that emits a lot while using little.
   * A middling efficiency figure is not a contradiction of anything, and
   * signposting it as one ("no CO₂ at the tailpipe, although it uses an
   * average amount") tells the reader to brace for bad news that isn't there.
   */
  const disagrees =
    ((co2.level === "none" || co2.level === "low") &&
      efficiency.level === "low") ||
    (co2.level === "high" && efficiency.level === "high");

  /*
   * The unit in words and the reference by name. "Around typical for a car
   * that burns fuel" claimed a population the reference was never measured
   * on; "close to the reference FINN Lens uses for petrol cars" claims only
   * what was done.
   */
  const clause = `${formatNumber(efficiency.value)} ${efficiency.measure}, ${efficiencyInWords(efficiency.level)} the FINN Lens benchmark for ${kindOf(powertrain)}`;

  return disagrees
    ? `${co2.explanation} Even so, it uses ${clause}.`
    : `${co2.explanation} It uses ${clause}.`;
}

/** The efficiency level as a comparison with the reference, rather than as a label. */
function efficiencyInWords(level: EfficiencyLevel): string {
  return {
    high: "noticeably under",
    moderate: "broadly in line with",
    low: "noticeably over",
  }[level];
}

/* -------------------------------------------------------------------------- */
/* The method, for a reader who wants it                                      */
/* -------------------------------------------------------------------------- */

export interface EnvironmentalMethodNote {
  /**
   * Which half of the method the note answers: how the result is measured, or
   * where it stops. The two halves are headings inside the one "How this is
   * calculated" fold, so six notes read as two ideas rather than six.
   */
  group: "measures" | "limits";
  /**
   * The mark drawn beside the heading, named by what it is of rather than by
   * a shape — the same bargain `EnvironmentRow.icon` strikes, so the name
   * survives whichever renderer picks the shape.
   *
   * `cloud` and `fuel` are deliberately the marks the comparison table
   * already puts on the CO₂ and energy rows: the note that says what the
   * result is based on should carry the same shape as the figure it is
   * talking about.
   */
  icon: "cloud" | "fuel" | "calculator" | "tag" | "plug" | "factory";
  heading: string;
  body: string;
}

/**
 * What this priority looks at, for a reader deciding whether to rank it.
 *
 * Ordered so the first note answers "what will this actually judge my cars
 * on?" and the rest answer the questions that follow from it. The limits come
 * last — they matter, but they are no use to someone who doesn't yet know
 * what the thing measures.
 */
export const ENVIRONMENTAL_METHOD: EnvironmentalMethodNote[] = [
  {
    group: "measures",
    icon: "cloud",
    heading: "The result is based on CO₂ per kilometre",
    body: "How much carbon dioxide a car puts out over a kilometre, measured under the EU's official test and placed on the A-to-G CO₂ scale used on German car listings. An electric car emits none while driving and sits at the top; the more a car emits, the further down it goes. Nothing else moves the result.",
  },
  {
    group: "measures",
    icon: "fuel",
    heading: "How much it uses is reported separately",
    body: "Fuel and electricity use have their own section, “How much it uses”, and don't change this result. They answer a different question — how a car's use compares with the benchmark FINN Lens sets for cars on the same energy — and a car can be efficient for what it is while still emitting a lot, or emit nothing while using a lot of electricity.",
  },
  {
    group: "measures",
    icon: "calculator",
    heading: "What a car runs on isn't scored on its own",
    body: "For anything that burns fuel, the CO₂ figure is simply how much it uses multiplied by the carbon in a litre. Counting the fuel type as well would mark the same car down twice for the same fact, so the emissions figure is left to speak for it.",
  },
  {
    group: "measures",
    icon: "tag",
    heading: "The A-to-G letter is shown for recognition",
    body: "It's the label you'll see on FINN's own page. Since 2024 it's worked out from the CO₂ figure alone — vehicle weight no longer comes into it — so it tells you nothing the figure doesn't. It's here so the number is recognisable, not as a second opinion.",
  },
  {
    group: "limits",
    icon: "plug",
    heading: "Plug-in hybrids can't be rated Strong",
    body: "Their official CO₂ assumes the car is plugged in regularly, and studies of cars on the road find real emissions several times higher when it isn't. Nobody can tell from FINN's data how often you'd charge, so Lens won't give the Strong rating on that figure — the best a plug-in hybrid can reach is the top of Good. No corrected figure is invented, and among plug-in hybrids a lower official figure still ranks higher.",
  },
  {
    group: "limits",
    icon: "factory",
    heading: "This isn't the car's full footprint",
    body: "It covers what comes out of the car while you drive. Building it, making its battery, generating the electricity it charges on and scrapping it at the end all carry emissions too, and none of that is in FINN's data or estimated here.",
  },
];
