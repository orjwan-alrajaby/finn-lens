import type { FinnCar } from "./types";
import type {
  EfficiencyAssessment,
  EnvironmentalAssessment,
} from "./reasoning-engine/environmental";
import type { ComparisonReading, EnvironmentRow } from "./environment-copy";

import { assessEnvironment } from "./reasoning-engine/environmental";
import { relationBetween, USE_TONE } from "./environment-copy";

/**
 * How much energy a car uses, decided once for every surface that says it.
 *
 * Ported from the playground branch. Here the drawer asks it twice — in the
 * efficiency need's row, and in "How much it uses" for a reader who didn't
 * ask — and the two must not differ on which of the three answers a car
 * gets, or the words it gets them in.
 *
 * The three are genuinely different answers rather than one answer with
 * missing parts:
 *
 * - **graded** — a figure, and a cohort to read it against.
 * - **ungradable** — a plug-in hybrid. One blended figure over an assumed
 *   pattern of charging belongs to no cohort, so grading it would be inventing
 *   a comparison rather than reporting one.
 * - **unpublished** — FINN supplied no consumption at all. Said out loud,
 *   because a section that quietly disappears reads as a section that failed
 *   to load.
 *
 * Sits beside `cost-copy` and `car-labels`, for the same reason: anything that
 * decides what a reader is told belongs outside the thing that draws it.
 */
export type UsageReading =
  | {
      kind: "graded";
      /**
       * What it runs on — the fact that decides the cohort below. Drawn as
       * the pill on the table's row rather than above it.
       */
      fuel: string | null;
      efficiency: EfficiencyAssessment;
      /**
       * The figure and its benchmark, in the environmental result's own
       * colourful table. The same shape and the same colours whether a reader
       * met this car's consumption here or in that section.
       */
      table: ComparisonReading;
    }
  | {
      kind: "ungradable" | "unpublished";
      fuel: string | null;
      /** The chip, standing in for a verdict there is no honest way to give. */
      verdict: string;
      body: string;
    };

const UNGRADABLE =
  "FINN publishes a plug-in hybrid's official fuel figure, which the EU's test " +
  "rules work out over a set mix of electric and fuel driving, and not the " +
  "electricity half. There is no petrol car or electric car it can fairly be " +
  "measured against, so we would rather say that than invent a comparison. " +
  "What it actually uses depends on how you drive and charge it, which no official figure can know.";

const UNPUBLISHED =
  "FINN doesn't publish a consumption figure for this car, so there is " +
  "nothing to measure it against and we won't guess. Everything else here " +
  "still stands — how much it uses is the one thing we can't tell you.";

export function readUsage(vehicle: FinnCar): UsageReading {
  const environment = assessEnvironment(vehicle);
  const fuel = vehicle.fuelType ?? null;
  const efficiency = environment?.efficiency;

  if (efficiency)
    return {
      kind: "graded",
      fuel,
      efficiency,
      table: {
        rows: [usageRow(efficiency, environment?.powertrain ?? null)],
        /* Nothing to put beside the row's name: the A–G class is emissions, not use. */
        rating: null,
        source: efficiency.disclaimer,
      },
    };

  if (environment?.powertrain === "Plug-in Hybrid") {
    return {
      kind: "ungradable",
      fuel,
      verdict: "Can't be graded fairly",
      body: UNGRADABLE,
    };
  }

  return {
    kind: "unpublished",
    fuel,
    verdict: "Not published",
    body: UNPUBLISHED,
  };
}

/**
 * The one row that table draws: what this car uses, against the FINN Lens
 * benchmark for what it runs on.
 *
 * The twin of `energyRow` in `environment-copy`, and deliberately not a call
 * into it: that row sits under the CO₂ row that decides the match, so it is
 * labelled as context and its benchmark is described in the words of a section
 * that has just explained where 136 g/km comes from. Here the row *is* the
 * section, so it names the unit in words under its title and says whose
 * comparison point the second figure is.
 */
function usageRow(
  efficiency: EfficiencyAssessment,
  powertrain: EnvironmentalAssessment["powertrain"],
): EnvironmentRow {
  const electric = powertrain === "Electric";

  return {
    id: "energy",
    icon: electric ? "electricity" : "fuel",
    label: electric ? "Electricity use" : powertrain ? "Fuel use" : "Energy use",
    /* What the unit is, in words, for a reader who has never bought a car on it. */
    note: efficiency.measure,
    car: {
      value: efficiency.display,
      meaning: efficiency.consumes,
      info: efficiency.meaning,
    },
    reference: {
      value: efficiency.reference,
      meaning: efficiency.referenceNote,
      info: efficiency.provenance,
    },
    comparison: efficiency.label,
    /* Beside the row's name, as the environmental table's fuel-use row has it. */
    fuel: powertrain,
    /* The same bar the environmental table draws, from the same two figures. */
    relation: relationBetween(efficiency.value, efficiency.referenceValue),
    tone: USE_TONE[efficiency.step],
  };
}
