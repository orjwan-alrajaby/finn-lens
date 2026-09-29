import { GOOD_FROM, STRONG_FROM } from "./bands";
import { describe, expect, it } from "vitest";

import {
  assessEfficiency,
  assessEnvironment,
  assessEnvironmentOrGaps,
  co2ClassFor,
  describeEnvironment,
  efficiencyReferenceFor,
  ENVIRONMENTAL_METHOD,
  positionForCo2,
} from "./environmental";
import { buildFitAnalysis } from "./fit";
import { makeCar, prefs } from "./test-fixtures";
import type { FuelType } from "@/lib/types";

/**
 * Emissions, efficiency, and the difference between them.
 *
 * The model these protect is the one the research forced: CO₂ decides the
 * result, consumption answers a separate question inside the car's own
 * powertrain, and the CO₂ class and the fuel type are shown rather than
 * counted. Most of what is asserted here is an absence — that the same fact is
 * not counted twice.
 */

const car = (over: Record<string, unknown> = {}) =>
  makeCar({ id: 1, ...over } as never);

const petrol = (co2: number, consumption: number) =>
  car({ fuelType: "Petrol", co2, consumption });

const diesel = (co2: number, consumption: number) =>
  car({ fuelType: "Diesel", co2, consumption });

const electric = (consumption: number | null) =>
  car({ fuelType: "Electric", co2: 0, consumption, range: 400 });

const phev = (co2: number, consumption: number) =>
  car({ fuelType: "Plug-in Hybrid", co2, consumption });

/* -------------------------------------------------------------------------- */

/**
 * A battery-electric car whose CO₂ figure FINN simply doesn't state.
 *
 * The bug these pin: `co2emission` comes back empty for some electric cars,
 * and every empty figure was read the same way — as data we don't have. So a
 * car emitting nothing at all was reported as unscorable, showing "Not enough
 * data" in the one place it should have shown the strongest result the
 * priority can give, next to a FINN page saying Class A.
 *
 * The line these draw is between filling a gap and guessing a number. Tailpipe
 * CO₂ for a car with no combustion engine is zero by definition, so there is
 * nothing to guess. For anything that burns something there is, and the
 * refusal stands.
 */
describe("an electric car FINN publishes no CO₂ figure for", () => {
  const unstated = (value: unknown, consumption: number | null = 16.5) =>
    car({ fuelType: "Electric", co2: value, consumption, range: 400 });

  it("is scored as the zero-emission car it is, not as a car with no data", () => {
    /* The two shapes an unstated figure actually arrives in: JSON null, and "". */
    for (const empty of [null, ""]) {
      const assessment = assessEnvironment(unstated(empty));

      expect(assessment?.co2?.gPerKm).toBe(0);
      expect(assessment?.co2?.className).toBe("A");
      expect(assessment?.score).toBe(100);

      /* And nothing is reported as missing that isn't. */
      expect(assessment?.missing).not.toContain("its CO₂ figure");
    }
  });

  it("reaches the reader as a strong match rather than as a shrug", () => {
    const priority = buildFitAnalysis(unstated(null), ["environmental"], prefs())
      .priorities[0];

    expect(priority?.hasEvidence).toBe(true);
    expect(priority?.band.label).toBe("Strong match");
  });

  it("still takes FINN's figure wherever FINN states one", () => {
    /* Filling a gap, never overriding: a stated figure wins, electric or not. */
    expect(assessEnvironment(unstated(12))?.co2?.gPerKm).toBe(12);
    expect(assessEnvironment(unstated(0))?.co2?.gPerKm).toBe(0);
  });

  it("does not extend the same courtesy to anything that burns fuel", () => {
    for (const fuelType of ["Petrol", "Diesel", "Plug-in Hybrid"] as const) {
      /*
       * Read through `assessEnvironmentOrGaps`, because a plug-in hybrid with
       * no CO₂ figure has nothing gradable at all — no figure, and a blended
       * consumption that belongs to no cohort — so the plain assessment is
       * null for it and the gaps reading is what a reader actually meets.
       */
      const assessment = assessEnvironmentOrGaps(
        car({ fuelType, co2: null, consumption: 5.5 }),
      );

      expect(assessment.co2).toBeNull();
      expect(assessment.score).toBeNull();
      expect(assessment.missing).toContain("its CO₂ figure");
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("the CO₂ class", () => {
  it("follows the boundaries the regulation sets", () => {
    /* Pkw-EnVKV §3a as amended 2024: A 0, B ≤95, C ≤115, D ≤135, E ≤155, F ≤175. */
    expect(co2ClassFor(0)).toBe("A");
    expect(co2ClassFor(1)).toBe("B");
    expect(co2ClassFor(95)).toBe("B");
    expect(co2ClassFor(96)).toBe("C");
    expect(co2ClassFor(115)).toBe("C");
    expect(co2ClassFor(116)).toBe("D");
    expect(co2ClassFor(135)).toBe("D");
    expect(co2ClassFor(136)).toBe("E");
    expect(co2ClassFor(155)).toBe("E");
    expect(co2ClassFor(156)).toBe("F");
    expect(co2ClassFor(175)).toBe("F");
    expect(co2ClassFor(176)).toBe("G");
    expect(co2ClassFor(400)).toBe("G");
  });

  it("is computed from the figure, not read from FINN's field", () => {
    /*
     * A car predating the 2024 scale can carry a letter that disagrees with
     * its own emissions. The regulation is the better authority on its classes.
     */
    const stale = car({ fuelType: "Petrol", co2: 130, co2Class: "A" });

    expect(assessEnvironment(stale)?.co2?.className).toBe("D");
  });

  it("is never a second vote on top of the figure", () => {
    /* Two cars, same emissions, different stored letters: same result. */
    const honest = assessEnvironment(car({ fuelType: "Petrol", co2: 130, co2Class: "D" }));
    const stale = assessEnvironment(car({ fuelType: "Petrol", co2: 130, co2Class: "A" }));

    expect(honest?.score).toBe(stale?.score);
  });
});

describe("where a CO₂ figure lands", () => {
  it("falls as emissions rise, all the way down", () => {
    const grams = [0, 50, 95, 110, 125, 145, 165, 185, 250];
    const scores = grams.map(positionForCo2);

    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1] as number);
    }
  });

  it("separates two cars inside the same class", () => {
    /* 118 and 134 g/km are both class D and are not the same car. */
    expect(positionForCo2(118)).toBeGreaterThan(positionForCo2(134));
  });

  it("puts each class where the reader's band expects it", () => {
    /* Bands are strong ≥65, good ≥45, partial ≥25, limited below. */
    expect(positionForCo2(0)).toBeGreaterThanOrEqual(65);
    expect(positionForCo2(60)).toBeGreaterThanOrEqual(65);
    expect(positionForCo2(105)).toBeGreaterThanOrEqual(45);
    expect(positionForCo2(105)).toBeLessThan(65);
    expect(positionForCo2(127)).toBeGreaterThanOrEqual(25);
    expect(positionForCo2(127)).toBeLessThan(45);
    expect(positionForCo2(165)).toBeLessThan(25);
  });

  it("stays on the scale for a car far past the last class", () => {
    expect(positionForCo2(400)).toBeGreaterThanOrEqual(0);
    expect(positionForCo2(400)).toBeLessThanOrEqual(100);
  });
});

/* -------------------------------------------------------------------------- */

describe("efficiency", () => {
  it("is judged inside the car's own powertrain", () => {
    /*
     * 5.0 L/100 km is frugal for a petrol car and ordinary for a diesel,
     * because a litre of diesel carries more carbon and diesels use fewer.
     */
    expect(assessEfficiency(petrol(112, 4.8))?.level).toBe("high");
    expect(assessEfficiency(diesel(127, 4.8))?.level).toBe("moderate");
  });

  it("recognises a frugal petrol car as frugal", () => {
    expect(assessEfficiency(petrol(105, 4.5))?.label).toBe("Low fuel use");
  });

  it("recognises a thirsty petrol car as thirsty", () => {
    expect(assessEfficiency(petrol(190, 8.2))?.label).toBe("Very high fuel use");
  });

  it("separates an efficient EV from an inefficient one", () => {
    expect(assessEfficiency(electric(14))?.level).toBe("high");
    expect(assessEfficiency(electric(17))?.level).toBe("moderate");
    expect(assessEfficiency(electric(23))?.level).toBe("low");
  });

  it("says what it is relative to, in the reader's terms", () => {
    /*
     * "the FINN Lens benchmark for petrol cars" — not "a typical petrol car",
     * and not "the average new car that burns fuel", which the copy used to
     * quote at 5.8 L/100km for petrol and 5.2 for diesel: one car, two
     * amounts, neither measured. The reference is derived here, so it is
     * named as ours.
     */
    expect(assessEfficiency(petrol(117, 4.5))?.explanation).toMatch(
      /less petrol than the FINN Lens benchmark for petrol cars/,
    );
    expect(assessEfficiency(diesel(117, 4.5))?.explanation).toMatch(
      /diesel (than|as) the FINN Lens benchmark for diesel cars/,
    );
    expect(assessEfficiency(electric(14))?.explanation).toMatch(
      /less electricity than the FINN Lens benchmark for electric cars/,
    );
  });

  it("refuses to grade a plug-in hybrid's single blended figure", () => {
    /* One weighted number over two energy sources has no cohort. */
    expect(assessEfficiency(phev(32, 1.4))).toBeNull();
  });

  it("says nothing where FINN published no consumption", () => {
    expect(assessEfficiency(electric(null))).toBeNull();
    expect(assessEfficiency(petrol(120, 0))).toBeNull();
  });

  it("uses words a car shopper would use, on five steps", () => {
    const labels = [4.0, 4.5, 5.8, 7.0, 8.5].map((litres) => assessEfficiency(petrol(130, litres))?.label);

    expect(labels).toEqual([
      "Very low fuel use",
      "Low fuel use",
      "Moderate fuel use",
      "High fuel use",
      "Very high fuel use",
    ]);

    expect([12, 14, 17, 20, 22.4].map((kWh) => assessEfficiency(electric(kWh))?.label)).toEqual([
      "Very low electricity use",
      "Low electricity use",
      "Moderate electricity use",
      "High electricity use",
      "Very high electricity use",
    ]);
  });

  it("steps inside the level's own edges, so the level is unchanged", () => {
    const within = { veryLow: "high", low: "high", moderate: "moderate", high: "low", veryHigh: "low" };

    for (let litres = 3; litres <= 10; litres += 0.1) {
      const efficiency = assessEfficiency(petrol(130, Math.round(litres * 10) / 10));

      expect(efficiency && within[efficiency.step]).toBe(efficiency?.level);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("the assessment as a whole", () => {
  it("scores on emissions and nothing else", () => {
    /*
     * The same emissions with wildly different consumption score the same.
     * Efficiency is a separate answer, not a second contribution to this one.
     */
    const a = assessEnvironment(petrol(130, 4.0));
    const b = assessEnvironment(petrol(130, 9.0));

    expect(a?.score).toBe(b?.score);
    expect(a?.efficiency?.level).not.toBe(b?.efficiency?.level);
  });

  it("doesn't mark a car down twice for what it burns", () => {
    /* Two cars at the same g/km score alike whatever the fuel is called. */
    const asPetrol = assessEnvironment(petrol(120, 5.2));
    const asDiesel = assessEnvironment(diesel(120, 4.5));

    expect(asPetrol?.score).toBe(asDiesel?.score);
  });

  it("puts an electric car at the top on tailpipe emissions", () => {
    const ev = assessEnvironment(electric(16));

    expect(ev?.score).toBe(100);
    expect(ev?.co2?.className).toBe("A");
  });

  it("won't claim an electric car has no environmental impact", () => {
    const ev = assessEnvironment(electric(16));

    /* The distinction a zero invites somebody to miss, said on the car. */
    expect(ev?.caveats.join(" ")).toMatch(/zero from the car/i);
    expect(ev?.caveats.join(" ")).toMatch(/isn't free of emissions/i);

    /*
     * The lifecycle limit is stated in the method notes rather than on every
     * car. It is true of all of them equally, so as a per-car line it told
     * the reader nothing about the car in front of them — and a line readers
     * learn to skip costs the caveats beside it their credibility.
     */
    expect(ENVIRONMENTAL_METHOD.map((n) => n.body).join(" ")).toMatch(
      /Building it, making its battery/,
    );
  });

  it("keeps a frugal petrol car ahead of a thirsty one", () => {
    const frugal = assessEnvironment(petrol(105, 4.5));
    const thirsty = assessEnvironment(petrol(180, 7.7));

    expect(frugal?.score).toBeGreaterThan(thirsty?.score as number);
  });

  it("keeps a frugal diesel ahead of a thirsty one", () => {
    const frugal = assessEnvironment(diesel(110, 4.2));
    const thirsty = assessEnvironment(diesel(175, 6.6));

    expect(frugal?.score).toBeGreaterThan(thirsty?.score as number);
  });

  it("still puts an electric car ahead of the cleanest combustion car", () => {
    const ev = assessEnvironment(electric(16));
    const best = assessEnvironment(petrol(96, 4.1));

    expect(ev?.score).toBeGreaterThan(best?.score as number);
  });
});

/* -------------------------------------------------------------------------- */

describe("plug-in hybrids", () => {
  it("won't call one a strong match on its official figure alone", () => {
    /*
     * A 30 g/km official figure would otherwise sit near the top of the scale.
     * Its figure depends on a charging habit FINN's data can't show, so Lens
     * refuses it the Strong rating: the top of Good is as high as it goes.
     */
    const assessment = assessEnvironment(phev(30, 1.4));

    expect(assessment?.score).toBeLessThan(STRONG_FROM);
    expect(assessment?.score).toBeGreaterThanOrEqual(GOOD_FROM);
    expect(assessment?.confidence).toBe("optimistic");
  });

  it("doesn't invent a real-world figure to replace it", () => {
    const assessment = assessEnvironment(phev(30, 1.4));

    /* The number shown is still FINN's own. */
    expect(assessment?.co2?.gPerKm).toBe(30);
    expect(assessment?.co2?.display).toContain("30");
  });

  it("says what the figure actually assumes", () => {
    const caveats = assessEnvironment(phev(30, 1.4))?.caveats.join(" ") ?? "";

    /* Said as a condition the reader controls, not as a property of the car. */
    expect(caveats).toMatch(/assumes the car gets charged/i);
    expect(caveats).toMatch(/several times higher/i);
  });

  it("leaves a high-emitting one where its emissions put it", () => {
    /* The cap is a ceiling, not a floor: a dirty PHEV isn't lifted to it. */
    const dirty = assessEnvironment(phev(140, 5.6));

    expect(dirty?.score).toBeLessThan(60);
  });

  it("keeps two plug-in hybrids apart from each other", () => {
    /*
     * Clipping them to a ceiling made a 26 g/km car and a 75 g/km car
     * identical, which threw away the one distinction between them that the
     * data actually supports.
     */
    const clean = assessEnvironment(phev(26, 1.1));
    const heavy = assessEnvironment(phev(75, 3.3));

    expect(clean?.score).toBeGreaterThan(heavy?.score as number);
  });

  it("is never treated as equivalent to a battery electric car", () => {
    const hybrid = assessEnvironment(phev(28, 1.2));
    const battery = assessEnvironment(electric(16));

    expect(battery?.score).toBeGreaterThan(hybrid?.score as number);
  });
});

/* -------------------------------------------------------------------------- */

describe("missing data", () => {
  it("reports on consumption alone when there is no CO₂ figure", () => {
    const assessment = assessEnvironment(
      car({ fuelType: "Petrol", co2: Number.NaN, consumption: 4.4 }),
    );

    expect(assessment?.score).toBeNull();
    expect(assessment?.efficiency?.level).toBe("high");
    expect(assessment?.missing).toContain("its CO₂ figure");
  });

  it("reports on emissions alone when there is no consumption", () => {
    const assessment = assessEnvironment(
      car({ fuelType: "Petrol", co2: 120, consumption: null }),
    );

    expect(assessment?.score).toBe(positionForCo2(120));
    expect(assessment?.efficiency).toBeNull();
    expect(assessment?.missing).toContain("what it consumes");
  });

  it("never reads a missing consumption as a frugal one", () => {
    const assessment = assessEnvironment(electric(null));

    expect(assessment?.efficiency).toBeNull();

    /* Named as absent, rather than passed over as if it were fine. */
    const line = describeEnvironment(assessment as never);

    expect(line).toMatch(/doesn't publish what it consumes/i);
    expect(line).not.toMatch(
      /noticeably under|in line with the FINN Lens benchmark|fuel use/i,
    );
  });

  it("says nothing at all when there is nothing to say", () => {
    expect(
      assessEnvironment(
        car({ fuelType: "Unknown" as FuelType, co2: Number.NaN, consumption: null }),
      ),
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("what the reader is told", () => {
  it("gives a frugal petrol car both halves of the truth", () => {
    const line = describeEnvironment(assessEnvironment(petrol(117, 4.6)) as never);

    /*
     * Emissions lead, because emissions are what the result is. Efficiency
     * follows as a separate observation. The old copy opened on "Highly
     * efficient for a petrol car", which put the flattering half of a
     * two-part answer where the reader's eye lands first.
     */
    expect(line.indexOf("CO₂")).toBeLessThan(line.indexOf("litres of petrol"));
    expect(line).toMatch(/close to the 136 g\/km average/);
    expect(line).toMatch(
      /4.6 litres of petrol per 100 km, noticeably under the FINN Lens benchmark for petrol cars/,
    );
  });

  it("doesn't tell an electric car's owner about fuel", () => {
    const line = describeEnvironment(assessEnvironment(electric(15)) as never);

    expect(line).toMatch(/emits no CO₂ while you drive it/i);
    expect(line).toMatch(/kWh of electricity per 100 km/);
    expect(line).toMatch(/FINN Lens benchmark for electric cars/);
    expect(line).not.toMatch(/petrol|diesel|fuel/i);
  });

  it("never claims a percentage improvement it can't support", () => {
    for (const vehicle of [petrol(120, 5), diesel(130, 4.8), electric(16), phev(30, 1.4)]) {
      const line = describeEnvironment(assessEnvironment(vehicle) as never);

      expect(line).not.toMatch(/\d+%/);
    }
  });

  it("explains the method without exposing the arithmetic", () => {
    const method = ENVIRONMENTAL_METHOD.map(
      (note) => `${note.heading} ${note.body}`,
    ).join(" ");

    expect(method).toMatch(/don't change it|isn't scored on its own/i);

    /*
     * The lifecycle limit is still stated — in words a reader who has never
     * met the phrase "lifecycle assessment" can act on.
     */
    expect(method).toMatch(/Building it, making its battery/);
    expect(method).not.toMatch(/count equally/i);
  });
});

/* -------------------------------------------------------------------------- */

describe("the priority as the panel sees it", () => {
  const analyse = (vehicle: ReturnType<typeof car>) =>
    buildFitAnalysis(vehicle, ["environmental"], prefs()).priorities[0];

  it("answers for a single car, whatever it runs on", () => {
    for (const vehicle of [petrol(130, 5.6), diesel(120, 4.5), electric(16), phev(30, 1.4)]) {
      expect(analyse(vehicle)?.band.level).not.toBe("unknown");
    }
  });

  it("reads an efficient petrol car as a partial match, honestly", () => {
    /* Efficient for what it is, and still an average emitter overall. */
    const band = analyse(petrol(127, 5.6));

    expect(band?.band.label).toBe("Partial match");
    expect(band?.impact?.efficiency?.label).toBe("Moderate fuel use");
  });

  it("reads an electric car as a strong match", () => {
    expect(analyse(electric(16))?.band.label).toBe("Strong match");
  });

  it("holds up across a large thirsty car and a tiny frugal one", () => {
    /* Nothing here is size-adjusted, and the ordering still makes sense. */
    const cityCar = analyse(petrol(105, 4.5));
    const largeSuv = analyse(petrol(185, 7.9));

    expect(cityCar?.band.level).not.toBe(largeSuv?.band.level);
    expect(cityCar?.impact?.score).toBeGreaterThan(
      largeSuv?.impact?.score as number,
    );
  });
});

/* -------------------------------------------------------------------------- */

/**
 * What the reader meets, and in what order.
 *
 * These pin the information hierarchy rather than the wording. The failure
 * they exist to catch is the one this layer actually had: a correct model
 * explaining itself before it answered, and figures put on the screen with
 * nothing attached to say what they meant.
 */
describe("the shape of the explanation", () => {
  const everyKind = [
    petrol(117, 4.6),
    petrol(185, 8.0),
    diesel(140, 5.4),
    electric(15),
    electric(24),
    phev(30, 1.4),
  ];

  it("never puts a figure on the screen without saying what it means", () => {
    for (const vehicle of everyKind) {
      const assessment = assessEnvironment(vehicle);

      /* The emissions figure carries a plain-language reading of itself. */
      expect(assessment?.co2?.label).toBeTruthy();
      expect(assessment?.co2?.explanation.length ?? 0).toBeGreaterThan(30);

      /*
       * So does the consumption figure, where there is one — its unit in
       * words — and so does the reference it is compared with.
       */
      if (assessment?.efficiency) {
        expect(assessment.efficiency.label).toBeTruthy();
        expect(assessment.efficiency.measure).toMatch(/ per 100 km$/);
        expect(assessment.efficiency.referenceLabel).toBe("FINN Lens benchmark");
        expect(assessment.efficiency.referenceNote).toMatch(/not an official/);
      }
    }
  });

  it("leads with the emissions result, not with the efficiency one", () => {
    /*
     * The regression: "Moderately efficient for a diesel car at 5.4 L/100km,
     * but at 140 g/km…" opened on the supporting metric and buried the
     * result. Emissions decide the score, so emissions go first.
     */
    for (const vehicle of [petrol(117, 4.6), diesel(140, 5.4), electric(15)]) {
      const line = describeEnvironment(assessEnvironment(vehicle) as never);

      expect(line.indexOf("CO₂")).toBeGreaterThanOrEqual(0);
      expect(line.indexOf("CO₂")).toBeLessThan(line.indexOf("It uses"));
    }
  });

  it("keeps every caveat, but short enough to be read", () => {
    for (const vehicle of everyKind) {
      const caveats = assessEnvironment(vehicle)?.caveats ?? [];

      /*
       * Compressed, not deleted. The old plug-in hybrid caveat ran to 300
       * characters of methodology and was the first thing under the heading;
       * shortening it is what let it move below the answer without the
       * answer being swallowed.
       */
      for (const caveat of caveats) {
        expect(caveat.length).toBeLessThan(200);
      }
    }
  });

  it("puts the most car-specific caveat first", () => {
    /* Only one survives on the surfaces that have room for one. */
    expect(assessEnvironment(electric(15))?.caveats[0]).toMatch(
      /zero from the car/i,
    );
    expect(assessEnvironment(phev(30, 1.4))?.caveats[0]).toMatch(
      /charged/i,
    );
    /*
     * A petrol car needs no caveat: nothing about reading "117 g/km" is
     * counter-intuitive the way a zero or a plug-in hybrid's figure is.
     */
    expect(assessEnvironment(petrol(117, 4.6))?.caveats).toEqual([]);
  });

  it("describes measurements, never the car's character", () => {
    /*
     * Words that make a claim about the car rather than about its figures.
     * None of them are supported by a tailpipe measurement, and one of them
     * ("zero-impact") is contradicted by our own caveats.
     */
    const banned =
      /planet-friendly|\bgreen\b|eco.warrior|eco.friendly|good for the planet|\bclean(er|est)?\b|sustainab|zero.impact|environmentally friendly/i;

    const copy = [
      ...everyKind.flatMap((vehicle) => {
        const assessment = assessEnvironment(vehicle);
        const efficiency = assessment?.efficiency;

        return [
          describeEnvironment(assessment as never),
          assessment?.co2?.label ?? "",
          assessment?.co2?.explanation ?? "",
          efficiency?.label ?? "",
          efficiency?.explanation ?? "",
          efficiency?.reasoning ?? "",
          efficiency?.meaning.body ?? "",
          efficiency?.disclaimer ?? "",
          efficiency?.referenceNote ?? "",
          efficiency?.provenance.body ?? "",
          ...(assessment?.caveats ?? []),
        ];
      }),
      ...ENVIRONMENTAL_METHOD.flatMap((note) => [note.heading, note.body]),
    ].join(" ");

    expect(copy).not.toMatch(banned);
  });

  it("opens the method on what it measures, not on what it excludes", () => {
    const [first] = ENVIRONMENTAL_METHOD;
    const last = ENVIRONMENTAL_METHOD[ENVIRONMENTAL_METHOD.length - 1];

    expect(first?.heading).toMatch(/CO₂ per kilometre/);
    expect(last?.heading).toMatch(/isn't the car's full footprint/i);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The number a car's consumption is compared with.
 *
 * 5.8 L/100km for petrol and 5.2 for diesel are one emissions observation —
 * what new combustion cars emit, about 136 g/km — converted into litres of
 * each fuel. They are legitimate references, and they are not what petrol or
 * diesel cars average. The failure these pin is copy that says they are, or
 * that leaves "L/100km" for the reader to decode.
 */
describe("what the efficiency reference is, and isn't", () => {
  const readingOf = (vehicle: ReturnType<typeof car>) =>
    assessEfficiency(vehicle) as NonNullable<
      ReturnType<typeof assessEfficiency>
    >;

  /** Every sentence a reader can meet about one car's environmental result. */
  const copyFor = (vehicle: ReturnType<typeof car>) => {
    const assessment = assessEnvironment(vehicle);
    const efficiency = assessment?.efficiency;

    return [
      describeEnvironment(assessment as never),
      efficiency?.explanation ?? "",
      efficiency?.reasoning ?? "",
      efficiency?.meaning.body ?? "",
      efficiency?.disclaimer ?? "",
      efficiency?.referenceLabel ?? "",
      efficiency?.referenceNote ?? "",
      efficiency?.provenance.title ?? "",
      efficiency?.provenance.body ?? "",
    ].join(" ");
  };

  it("keeps the arithmetic it claims", () => {
    /* 136 g/km ÷ grams of CO₂ in a litre × 100. */
    expect(readingOf(petrol(120, 5.5)).referenceValue).toBeCloseTo(
      (136 / 2330) * 100,
      6,
    );
    expect(readingOf(diesel(120, 4.5)).referenceValue).toBeCloseTo(
      (136 / 2640) * 100,
      6,
    );

    expect(readingOf(petrol(120, 5.5)).reference).toBe("5.8 L/100km");
    expect(readingOf(diesel(120, 4.5)).reference).toBe("5.2 L/100km");
    expect(readingOf(electric(16)).reference).toBe("17 kWh/100km");

    /* A litre of diesel carries more carbon, so the same CO₂ is fewer litres. */
    expect(readingOf(diesel(120, 4.5)).referenceValue).toBeLessThan(
      readingOf(petrol(120, 5.5)).referenceValue,
    );
  });

  it("says what L/100km means before judging it", () => {
    const reading = readingOf(petrol(128, 5.5));

    expect(reading.measure).toBe("litres of petrol per 100 km");
    expect(reading.consumes).toBe("This car consumes 5.5 litres of petrol per 100 km");
    expect(readingOf(diesel(120, 4.5)).consumes).toBe("This car consumes 4.5 litres of diesel per 100 km");
    expect(readingOf(electric(16)).consumes).toBe("This car consumes 16 kWh of electricity per 100 km");

    /* Said once, under the number: the sentence below starts from the comparison. */
    expect(reading.reasoning).not.toContain("5.5 litres");
    expect(readingOf(diesel(120, 4.5)).measure).toBe(
      "litres of diesel per 100 km",
    );
    expect(readingOf(electric(16)).measure).toBe(
      "kWh of electricity per 100 km",
    );
  });

  it("says how it compares with the reference, and leaves the verdict to the label", () => {
    /*
     * The label already carries the classification. The sentence only says
     * how the car compares — no "too close to call", no "especially frugal".
     */
    const below = readingOf(petrol(128, 5.5));

    expect(below.label).toBe("Moderate fuel use");
    expect(below.reasoning).toBe(
      "It uses about 6% less petrol than the 5.8 L/100km FINN Lens benchmark, so its fuel use is broadly in line with the benchmark.",
    );

    const above = readingOf(petrol(141, 6.1));

    expect(above.label).toBe("Moderate fuel use");
    expect(above.reasoning).toBe(
      "It uses about 5% more petrol than the 5.8 L/100km FINN Lens benchmark, so its fuel use is broadly in line with the benchmark.",
    );

    expect(readingOf(petrol(136, 5.84)).reasoning).toBe(
      "It uses about as much petrol as the 5.8 L/100km FINN Lens benchmark, so its fuel use is broadly in line with the benchmark.",
    );

    expect(readingOf(petrol(102, 4.4)).reasoning).toMatch(
      /about 25% less petrol than the 5.8 L\/100km FINN Lens benchmark, so its fuel use is noticeably lower than the benchmark\.$/,
    );
    expect(readingOf(electric(22.4)).reasoning).toMatch(
      /about 32% more electricity than the 17 kWh\/100km FINN Lens benchmark, so its electricity use is noticeably higher than the benchmark\.$/,
    );

    for (const vehicle of [petrol(128, 5.5), petrol(141, 6.1), petrol(102, 4.4), petrol(190, 8.2)]) {
      expect(readingOf(vehicle).reasoning).not.toMatch(
        /too close to call|especially (frugal|thirsty)|genuinely frugal/i,
      );
    }
  });

  it("identifies the reference as FINN Lens's, not an official figure", () => {
    for (const vehicle of [petrol(128, 5.5), diesel(120, 4.5), electric(16)]) {
      const reading = readingOf(vehicle);

      expect(reading.referenceLabel).toBe("FINN Lens benchmark");
      expect(reading.referenceNote).toBe(
        "FINN Lens's comparison point, not an official average",
      );
      expect(reading.provenance.body).toMatch(
        /It's a comparison point used by Lens, not an official average(, legal limit, or target)?\.$/,
      );
      expect(
        `${reading.referenceLabel} ${reading.referenceNote} ${reading.provenance.body} ${reading.reasoning}`,
      ).not.toMatch(/\b(is|as) an official average|\btypical\b/i);
    }
  });

  it("explains where the petrol and diesel references come from, without the chemistry", () => {
    const petrolSource = readingOf(petrol(128, 5.5)).provenance;
    const dieselSource = readingOf(diesel(120, 4.5)).provenance;
    const electricSource = readingOf(electric(16)).provenance;

    expect(petrolSource.title).toBe("Where does the FINN Lens benchmark come from?");
    expect(petrolSource.body).toBe(
      "FINN Lens uses about 136 g of CO₂ per km as a comparison point, based on European data analysed by the ICCT, an independent research organisation.\n\n" +
        "Lens converts that figure into an equivalent petrol-use figure, giving us the 5.8 L/100km benchmark. It's a comparison point used by Lens, not an official average, legal limit, or target.",
    );

    /* Diesel: the same method in its own terms, never a measured diesel average. */
    expect(dieselSource.body).toMatch(/equivalent diesel-use figure, giving us the 5.2 L\/100km benchmark\./);
    expect(dieselSource.body).toMatch(
      /lower than the 5.8 L\/100km petrol benchmark because burning a litre of diesel produces more CO₂ than burning a litre of petrol/,
    );
    expect(dieselSource.body).toMatch(/not an official average, legal limit, or target\.$/);

    /* Electric: nothing to convert, and the ICCT figure it rounds up from. */
    expect(electricSource.body).toMatch(/^Electric cars produce no CO₂ while driving, so there's nothing to convert\.\n\n/);
    expect(electricSource.body).toMatch(/a little above the 16.2 kWh\/100km/);

    /*
     * The chemistry stays in the code and the design record. "Carbon
     * content", "combustion" and kilograms per litre were exactly the words a
     * reader new to cars had to stop and look up.
     */
    expect(`${petrolSource.body} ${dieselSource.body} ${electricSource.body}`).not.toMatch(
      /carbon|combustion|kg of CO₂|fleet/i,
    );
  });

  it("never calls the reference what petrol, diesel or electric cars average", () => {
    const claims =
      /(average|typical)( new)? (petrol|diesel|electric) car|average new car that burns fuel|typical for its kind|for this kind of car|than most( electric)? cars|what new electric cars average|too close to call|especially (frugal|thirsty)/i;

    for (const vehicle of [
      petrol(117, 4.6),
      petrol(128, 5.5),
      petrol(185, 8),
      diesel(140, 5.4),
      diesel(110, 4.2),
      electric(15),
      electric(24),
    ]) {
      expect(copyFor(vehicle)).not.toMatch(claims);
    }
  });

  it("never presents the reference as a legal limit or a target", () => {
    for (const vehicle of [petrol(128, 5.5), diesel(120, 4.5), electric(16)]) {
      const { referenceNote, provenance, reasoning } = readingOf(vehicle);

      /* The one sentence allowed to name a limit is the one denying it is one. */
      expect(
        `${referenceNote} ${provenance.body} ${reasoning}`.replace("not an official average, legal limit, or target.", ""),
      ).not.toMatch(/\b(limit|legal|law|required|regulation|target)\b/i);
    }

    expect(readingOf(petrol(128, 5.5)).provenance.body).toContain("not an official average, legal limit, or target.");
  });

  it("says what the number means and where it comes from as one explanation, with a short line to close", () => {
    const { meaning, disclaimer } = readingOf(petrol(128, 5.5));

    expect(meaning).toEqual({
      title: "What does 5.5 L/100km mean?",
      body:
        "L/100km tells you how much fuel a car uses to travel 100 kilometres, so 5.5 L/100km means about 5.5 litres of fuel per 100 km. A lower L/100km figure means the car uses less fuel.\n\n" +
        "The figure comes from the official EU test, which makes it useful for comparing cars. Real-world use is usually higher, especially on motorways, in cold weather, or with a loaded car.",
    });

    expect(disclaimer).toBe("Official EU test figures. Real-world use is usually higher.");

    const battery = readingOf(electric(16));

    expect(battery.meaning.body).toMatch(
      /^kWh\/100km tells you how much electricity a car uses to travel 100 kilometres, so 16 kWh\/100km means about 16 kWh of electricity per 100 km\. A kilowatt-hour \(kWh\) is the unit your electricity bill uses\./,
    );
    expect(battery.meaning.body).toMatch(/\n\nThe figure comes from the official EU test/);
    expect(battery.disclaimer).toBe("Official EU test figures. Real-world use is usually higher.");

    /* Nothing here a reader new to cars would have to look up. */
    for (const vehicle of [petrol(128, 5.5), diesel(120, 4.5), electric(16)]) {
      const reading = readingOf(vehicle);

      expect(`${reading.meaning.body} ${reading.disclaimer} ${reading.provenance.body}`).not.toMatch(
        /WLTP|combustion|carbon|cohort|fleet|standardised/i,
      );
    }
  });

  it("never reads a missing CO₂ figure as zero emissions", () => {
    const assessment = assessEnvironment(
      car({ fuelType: "Petrol", co2: Number.NaN, consumption: 5.5 }),
    );

    expect(assessment?.co2).toBeNull();
    expect(assessment?.score).toBeNull();
    expect(assessment?.confidence).toBe("unknown");

    const line = describeEnvironment(assessment as never);

    expect(line).toMatch(/doesn't publish a CO₂ figure/);
    expect(line).not.toMatch(/no CO₂ (at the tailpipe|while you drive)/i);
  });

  it("keeps no tailpipe CO₂ and high consumption as two answers", () => {
    /* The EQS SUV case: a strong environmental match, and a less efficient electric car. */
    const thirstyEv = electric(22.4);

    expect(assessEnvironment(thirstyEv)?.score).toBe(100);
    expect(assessEnvironment(thirstyEv)?.efficiency?.label).toBe(
      "Very high electricity use",
    );
    expect(
      buildFitAnalysis(thirstyEv, ["environmental"], prefs()).priorities[0]
        ?.band.label,
    ).toBe("Strong match");

    /* And the Yaris case: low fuel use, and still behind any electric car. */
    const frugalPetrol = assessEnvironment(petrol(102, 4.4));

    expect(frugalPetrol?.efficiency?.label).toBe("Low fuel use");
    expect(frugalPetrol?.score).toBeLessThan(
      assessEnvironment(thirstyEv)?.score as number,
    );
  });

  it("scores on CO₂ whatever the consumption reference makes of the car", () => {
    /* Carrying one car across all three efficiency bands leaves its score alone. */
    const readings = [4.0, 5.8, 8.5].map((litres) =>
      assessEnvironment(petrol(130, litres)),
    );

    expect(new Set(readings.map((reading) => reading?.efficiency?.level)).size).toBe(3);
    expect(new Set(readings.map((reading) => reading?.score)).size).toBe(1);
  });

  it("still grades no plug-in hybrid, and still flags its figure", () => {
    const assessment = assessEnvironment(phev(30, 1.4));

    expect(assessment?.efficiency).toBeNull();
    expect(assessment?.confidence).toBe("optimistic");
    expect(assessment?.co2?.label).toBe("Low only if you charge it");
    expect(copyFor(phev(30, 1.4))).not.toMatch(/FINN Lens benchmark/);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * How each reference is reached, for a surface that has already said where
 * 136 g/km comes from, in the words a friend would use. The standalone
 * `provenance` is unchanged; this is the part that doesn't repeat itself.
 */
describe("the reference's derivation, on its own", () => {
  it("says how the fuel reference is reached, plainly, without repeating where 136 g/km comes from", () => {
    expect(assessEfficiency(petrol(128, 5.5))?.referenceDerivation).toEqual([
      "It's the 136 g/km from above, turned into petrol: a car that puts out 136 g of CO₂ per km burns about 5.8 litres of petrol per 100 km.",
      "It's FINN Lens's own comparison point, not an official average.",
    ]);

    expect(assessEfficiency(diesel(120, 4.5))?.referenceDerivation.join(" ")).toContain(
      "burns about 5.2 litres of diesel per 100 km. That's less than the 5.8 litres for petrol, because a litre of diesel makes more CO₂ when it burns.",
    );

    for (const reading of [assessEfficiency(petrol(128, 5.5)), assessEfficiency(diesel(120, 4.5))]) {
      expect(reading?.referenceDerivation.join(" ")).not.toMatch(
        /ICCT|hybrids included|legal limit|carbon|equivalent|benchmark/,
      );
    }
  });

  it("says the electric reference is its own comparison point", () => {
    const derivation = assessEfficiency(electric(16))?.referenceDerivation ?? [];

    expect(derivation[0]).toMatch(/^Electric cars don't put out any CO₂ while driving, so there's nothing to turn into kWh\./);
    expect(derivation[1]).toBe("It's FINN Lens's own comparison point, not an official average.");
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Figures FINN leaves empty.
 *
 * FINN's API sends `null` for a figure it doesn't have, and `Number(null)` is
 * 0. Read that way, a car with no published CO₂ became a car that emits none:
 * Class A and a strong match, on nothing. These pin that an empty figure stays
 * missing all the way to the priority.
 */
describe("figures FINN leaves empty", () => {
  it("reads an empty CO₂ figure as missing, never as a car that emits nothing", () => {
    for (const value of [null, ""]) {
      const assessment = assessEnvironment(
        car({ fuelType: "Petrol", co2: value, co2Class: "A", consumption: 5.5 }),
      );

      expect(assessment?.co2).toBeNull();
      expect(assessment?.score).toBeNull();
      expect(assessment?.confidence).toBe("unknown");
      expect(assessment?.missing).toContain("its CO₂ figure");
    }
  });

  it("doesn't take the class from FINN's own field when the figure is missing", () => {
    expect(
      assessEnvironment(car({ fuelType: "Petrol", co2: null, co2Class: "B", consumption: 5.5 }))?.co2,
    ).toBeNull();
  });

  it("still reads a genuine zero as zero", () => {
    expect(assessEnvironment(electric(16))?.co2?.gPerKm).toBe(0);
  });

  it("reads an empty consumption figure as missing", () => {
    for (const value of [null, ""]) {
      const assessment = assessEnvironment(car({ fuelType: "Petrol", co2: 130, consumption: value }));

      expect(assessment?.efficiency).toBeNull();
      expect(assessment?.missing).toContain("what it consumes");
    }
  });

  it("never lets a missing CO₂ figure score or match the environmental priority", () => {
    const priority = buildFitAnalysis(
      car({ fuelType: "Petrol", co2: null, consumption: 5.5 }),
      ["environmental"],
      prefs(),
    ).priorities[0];

    expect(priority?.band.level).toBe("unknown");
    expect(priority?.impact?.co2).toBeNull();
    /* The reading is still carried, so what FINN did publish can be shown. */
    expect(priority?.impact?.efficiency?.display).toBe("5.5 L/100km");
  });

  it("keeps what the car runs on when FINN publishes neither figure", () => {
    const vehicle = car({ fuelType: "Diesel", co2: null, consumption: null });

    expect(assessEnvironment(vehicle)).toBeNull();
    expect(assessEnvironmentOrGaps(vehicle)).toEqual({
      score: null,
      co2: null,
      efficiency: null,
      powertrain: "Diesel",
      confidence: "unknown",
      caveats: [],
      missing: ["its CO₂ figure", "what it consumes"],
    });
  });

  it("has each fuel's reference without needing the car's own figure", () => {
    expect(efficiencyReferenceFor("Petrol")?.value).toBe("5.8 L/100km");
    expect(efficiencyReferenceFor("Diesel")?.value).toBe("5.2 L/100km");
    expect(efficiencyReferenceFor("Electric")?.value).toBe("17 kWh/100km");
    expect(efficiencyReferenceFor("Plug-in Hybrid")).toBeNull();
    expect(efficiencyReferenceFor(null)).toBeNull();
  });
});
