import type { FinnCar, PinnedFinnCar } from "@/lib/types";
import type {
  BudgetPartition,
  BudgetStatus,
  ContractType,
  CostAnalysis,
  CostBreakdown,
  CostFact,
  CostLine,
  CostUnavailableReason,
  EnergyCost,
  ExcessMileageCost,
  LensPreferences,
  SubscriptionCost,
} from "./types";

import { FINN_INCLUDED_MONTHLY_KM } from "./constants";
import { EU_ELECTRICITY_SOURCE, euElectricityFor } from "./eu-electricity";
import {
  describeRentalProblem,
  fitContract,
  monthLabel,
  addMonths,
  periodLabel,
  type ContractFit,
} from "./contract";
import { formatEUR, formatKm, formatNumber, formatPrice } from "./format";

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

const isPositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * FINN's advertised monthly price for one contract, or null when FINN didn't
 * publish one.
 *
 * There is no per-vehicle contract field in the FINN data, so the reader's
 * `contractType` preference is what decides. Exported because every surface
 * that quotes a car's price — the pinned cards, the popup, a configuration's
 * spec line — has to quote the same one the bill is built on, or the page
 * shows a private price above a business total.
 */
export function advertisedMonthlyPrice(
  vehicle: Pick<FinnCar, "pricing">,
  contractType: ContractType,
): number | null {
  const price =
    contractType === "business"
      ? vehicle.pricing?.businessMonthly?.price
      : vehicle.pricing?.customerMonthly?.price;

  // extractPricing falls back to 0 for an absent price, so 0 means "not supplied".
  return isPositive(price) ? price : null;
}

/**
 * The monthly subscription on the term Lens chose for this car.
 *
 * With FINN's terms in hand that is the fitted term's no-down-payment price;
 * for a car stored before Lens read terms, the single price it was stored
 * with.
 */
function subscriptionPrice(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
  contract: ContractFit,
): number | null {
  if (contract.term) {
    const price =
      preferences.contractType === "business"
        ? contract.term.businessMonthly
        : contract.term.privateMonthly;

    return isPositive(price) ? price : null;
  }

  return advertisedMonthlyPrice(vehicle, preferences.contractType);
}

/**
 * The energy price to apply, taken from the user's own assumptions.
 *
 * The vehicle's `consumption.unit` is hard-coded to litres upstream, so the
 * powertrain is read from `fuelType` instead.
 */
function energyPriceFor(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
): { price: number | null; label: EnergyCost["energyLabel"] } {
  if (vehicle.fuelType === "Electric") {
    return {
      price: isPositive(preferences.electricityPrice)
        ? preferences.electricityPrice
        : null,
      label: "electricity",
    };
  }

  const price =
    vehicle.fuelType === "Diesel"
      ? preferences.dieselPrice
      : preferences.petrolPrice;

  return {
    price: isPositive(price) ? price : null,
    label: "fuel",
  };
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

function subscriptionComponent(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
  contract: ContractFit,
): SubscriptionCost {
  const amount = subscriptionPrice(vehicle, preferences, contract);

  return {
    amount,
    available: amount != null,
    reason: amount == null ? "missingSubscriptionPrice" : null,
    contractType: preferences.contractType,
    /*
     * FINN advertises private subscription prices with VAT included, so that
     * figure is used as-is. Business pricing is quoted differently and the
     * supplied data carries no VAT flag, so we record "unknown" rather than
     * inventing a rate.
     */
    vatIncluded: preferences.contractType === "private" ? true : null,
  };
}

/**
 * Estimated monthly energy cost at the user's stated mileage.
 *
 * Missing or invalid consumption produces an unavailable component, never a
 * €0 one — a car we can't estimate must not look cheaper than one we can.
 */
function energyComponent(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
): EnergyCost {
  const isElectric = vehicle.fuelType === "Electric";
  const consumptionUnit = isElectric ? "kWh/100km" : "L/100km";
  const { price, label } = energyPriceFor(vehicle, preferences);

  const raw = Number(vehicle.consumption?.combined);
  const consumption = isPositive(raw) ? raw : null;

  const isPlugIn = vehicle.fuelType === "Plug-in Hybrid";
  const monthlyKm = Math.max(0, preferences.monthlyKm);
  const electricityPrice = isPositive(preferences.electricityPrice) ? preferences.electricityPrice : null;

  /*
   * A plug-in hybrid's electricity: FINN lists the fuel half of the official
   * test and not this one, so it's the EU's figure for the same car, from
   * its registration data — or nothing, where FINN's figures match no car
   * there. Both figures assume the EU test's set mix of electric and fuel
   * driving, and say so.
   */
  const eu = isPlugIn ? euElectricityFor(vehicle) : null;
  const plugIn =
    eu && electricityPrice != null
      ? { kWhPer100Km: eu.kWhPer100Km, range: eu.range, price: electricityPrice, amount: (monthlyKm / 100) * eu.kWhPer100Km * electricityPrice }
      : null;

  const caveat = !isPlugIn
    ? null
    : plugIn
      ? `FINN lists only the fuel half of a plug-in hybrid's official figures, so the electricity half — ${formatNumber(plugIn.kWhPer100Km)} kWh/100 km, at an assumed €${plugIn.price.toFixed(2)} per kWh — is the EU's official figure for this car, from its registration data.${
          plugIn.range ? " FINN's figures fit more than one version there, so this is the highest of their electricity figures." : ""
        } Both figures assume the mix of electric and fuel driving set by the EU's test rules; how much of each you'd really use depends on how you drive and charge.`
      : "FINN lists only the fuel half of a plug-in hybrid's official figures, and this car's don't match one in the EU's registration data, so its electricity isn't priced.";

  const base = {
    consumption,
    consumptionUnit,
    energyPrice: price,
    energyLabel: label,
    caveat,
    /* Unmatched, a plug-in's fuel is a floor: the electricity it charges on isn't in it. */
    isFloor: isPlugIn && !plugIn,
    plugIn,
  } as const;

  if (consumption == null) {
    return {
      ...base,
      amount: null,
      available: false,
      reason: "missingConsumption",
      costPer100Km: null,
    };
  }

  if (price == null) {
    return {
      ...base,
      amount: null,
      available: false,
      reason: "missingEnergyPrice",
      costPer100Km: null,
    };
  }

  /* A matched plug-in: its fuel and its electricity, per 100 km, both official figures. */
  const costPer100Km = consumption * price + (plugIn ? plugIn.kWhPer100Km * plugIn.price : 0);

  return {
    ...base,
    amount: (monthlyKm / 100) * costPer100Km,
    available: true,
    reason: null,
    costPer100Km,
  };
}

/**
 * What the reader's distance costs on top of the subscription.
 *
 * FINN sells mileage as packages — 500 km a month is in the price, 1,000 km
 * adds a few euros, and so on up to 5,000 — and charges its per-kilometre
 * price only for kilometres beyond the package booked. So the charge is the
 * cheapest package that covers the reader's distance, plus the per-kilometre
 * price for anything past FINN's largest package.
 *
 * This used to charge every kilometre past 500 at the per-kilometre price,
 * which is what FINN charges for kilometres *outside* any package: 1,000 km a
 * month came out at about €125 extra, where FINN's 1,000 km package costs €9.
 * That remains the fallback only for a car stored before Lens read FINN's
 * packages, and says so.
 *
 * When the distance is inside what's paid for there is genuinely nothing to
 * charge, so the component is €0 and available. When there are kilometres to
 * charge per kilometre and FINN gave no price for them, it is unavailable.
 */
function excessMileageComponent(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
): ExcessMileageCost {
  const monthlyKm = Math.max(0, preferences.monthlyKm);
  const packages = vehicle.pricing?.mileagePackages ?? [];
  /* What the base price includes: FINN's package that adds nothing. */
  const includedMonthlyKm = packages.find((item) => item.monthly === 0)?.km ?? FINN_INCLUDED_MONTHLY_KM;

  const rawPrice = vehicle.pricing?.extraKmPrice;
  const extraKmPrice = isPositive(rawPrice) ? rawPrice : null;

  if (packages.length) {
    const covering = packages.find((item) => item.km >= monthlyKm) ?? null;
    const largest = packages[packages.length - 1]!;
    const mileagePackage = covering ?? largest;
    const excessKm = covering ? 0 : monthlyKm - largest.km;
    const base = { includedMonthlyKm, monthlyKm, excessKm, extraKmPrice, mileagePackage } as const;

    if (excessKm > 0 && extraKmPrice == null) {
      return { ...base, amount: null, available: false, reason: "missingExtraKmPrice" };
    }

    return { ...base, amount: mileagePackage.monthly + excessKm * (extraKmPrice ?? 0), available: true, reason: null };
  }

  const excessKm = Math.max(0, monthlyKm - includedMonthlyKm);

  const base = {
    includedMonthlyKm,
    monthlyKm,
    excessKm,
    extraKmPrice,
    mileagePackage: null,
  } as const;

  if (excessKm === 0) {
    return {
      ...base,
      amount: 0,
      available: true,
      reason: null,
    };
  }

  if (extraKmPrice == null) {
    return {
      ...base,
      amount: null,
      available: false,
      reason: "missingExtraKmPrice",
    };
  }

  return {
    ...base,
    amount: excessKm * extraKmPrice,
    available: true,
    reason: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Total cost                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Estimates what one vehicle costs the user each month:
 *
 *   monthly subscription + estimated energy + estimated excess mileage
 *
 * Nothing else is added. Insurance, maintenance, registration and tyres are
 * not in the supplied data, so they are not invented here.
 *
 * This function answers "what does this car cost?" and nothing more. It has no
 * opinion on whether the car fits the budget or whether it should win —
 * `budgetStatusFor` and `buildRecommendation` own those questions.
 */
export function calculateCost(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
): CostBreakdown {
  const contract = fitContract(vehicle, preferences);
  const subscription = subscriptionComponent(vehicle, preferences, contract);
  const energy = energyComponent(vehicle, preferences);
  const excessMileage = excessMileageComponent(vehicle, preferences);

  const components = [subscription, energy, excessMileage];

  const totalMonthly = components.reduce(
    (sum, component) => sum + (component.amount ?? 0),
    0,
  );

  const missing = components
    .map((component) => component.reason)
    .filter((reason): reason is CostUnavailableReason => reason != null);

  /* A plug-in hybrid's energy is a floor, so its total can't be confirmed. */
  if (energy.available && energy.isFloor) missing.push("plugInElectricityExcluded");

  const budget = isPositive(preferences.monthlyBudget)
    ? preferences.monthlyBudget
    : null;

  const complete = missing.length === 0;
  return {
    vehicleId: vehicle.id,
    currency: "€",
    contractType: preferences.contractType,
    monthlyKm: Math.max(0, preferences.monthlyKm),
    includedMonthlyKm: FINN_INCLUDED_MONTHLY_KM,
    subscription,
    energy,
    excessMileage,
    totalMonthly,
    complete,
    missing,
    budget,
    budgetDifference: budget == null ? null : totalMonthly - budget,
    budgetStatus: resolveBudgetStatus(totalMonthly, budget, complete),
    contract,
  };
}

/**
 * Decides whether an estimated cost fits the budget.
 *
 * Three states, because two would force a dishonest answer:
 *
 * - `within`  — fully calculated and at or under the budget.
 * - `over`    — the costs we *could* calculate already exceed the budget, so
 *               the car is over regardless of what is missing.
 * - `unknown` — the known costs fit, but a component could not be estimated,
 *               so "it fits" cannot be claimed.
 *
 * `unknown` never counts as fitting. A car with missing data does not win
 * ahead of one that is confirmed affordable.
 */
function resolveBudgetStatus(
  totalMonthly: number,
  budget: number | null,
  complete: boolean,
): BudgetStatus {
  if (budget == null) return "within";
  if (totalMonthly > budget) return "over";
  return complete ? "within" : "unknown";
}

/**
 * Splits vehicles by budget eligibility without discarding any of them.
 *
 * Over-budget and unknown-cost vehicles stay in the result so the UI can list
 * and inspect them. They are simply not allowed to win while a confirmed
 * in-budget vehicle exists.
 */
export function partitionByBudget(
  vehicles: PinnedFinnCar[],
  costs: Record<number, CostBreakdown>,
  preferences: LensPreferences,
): BudgetPartition {
  const within: PinnedFinnCar[] = [];
  const over: PinnedFinnCar[] = [];
  const unknown: PinnedFinnCar[] = [];

  for (const vehicle of vehicles) {
    const status = costs[vehicle.id]?.budgetStatus ?? "unknown";

    if (status === "within") within.push(vehicle);
    else if (status === "over") over.push(vehicle);
    else unknown.push(vehicle);
  }

  return {
    budget: isPositive(preferences.monthlyBudget)
      ? preferences.monthlyBudget
      : null,
    within,
    over,
    unknown,
    anyFits: within.length > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Cost analysis                                                              */
/* -------------------------------------------------------------------------- */

const CONTRACT_LABEL: Record<CostBreakdown["contractType"], string> = {
  private: "private",
  business: "business",
};

function subscriptionLine(breakdown: CostBreakdown): CostLine {
  const { subscription, contractType, contract } = breakdown;

  const facts: CostFact[] = [
    {
      label: "Contract",
      value: `${CONTRACT_LABEL[contractType]} subscription`,
      source: "user",
    },
  ];

  if (contract.term) {
    facts.push({
      label: "Term",
      value: `${contract.term.months} months, no down payment`,
      source: contract.period ? "estimate" : "finn",
    });
  }

  if (contract.period) {
    facts.push({
      label: "Your rental",
      value: `${periodLabel(contract.period)} (${contract.period.months} months)`,
      source: "user",
    });
  }

  if (subscription.amount != null) {
    facts.unshift({
      label: "Monthly subscription",
      value: `${formatEUR(subscription.amount)}/month`,
      source: "finn",
    });
  }

  return {
    id: "subscription",
    label: "FINN subscription",
    amount: subscription.amount,
    available: subscription.available,
    source: "finn",
    explanation: subscription.available
      ? `Your ${CONTRACT_LABEL[contractType]} monthly subscription price ${
          contract.term
            ? contract.period
              ? `on the ${contract.term.months}-month term — the shortest FINN offers that covers your rental — with nothing paid upfront`
              : `on FINN's default ${contract.term.months}-month term, with nothing paid upfront`
            : "as FINN advertised it when Lens last read the car"
        }.${
          subscription.vatIncluded === true ? " VAT is included." : ""
        }`
      : `FINN hasn't supplied a ${CONTRACT_LABEL[contractType]} monthly price for this car, so it isn't part of the total below.`,
    facts,
  };
}

function energyLine(breakdown: CostBreakdown): CostLine {
  const { energy, monthlyKm } = breakdown;

  const facts: CostFact[] = [
    {
      label: "Your mileage",
      value: `${formatKm(monthlyKm)}/month`,
      source: "user",
    },
  ];

  if (energy.consumption != null) {
    facts.push({
      label: "Consumption",
      value: `${formatNumber(energy.consumption)} ${energy.consumptionUnit}`,
      source: "finn",
    });
  }

  if (energy.energyPrice != null) {
    facts.push({
      label: energy.energyLabel === "electricity" ? "Electricity price" : "Fuel price",
      value:
        energy.energyLabel === "electricity"
          ? `${formatPrice(energy.energyPrice)}/kWh`
          : `${formatPrice(energy.energyPrice)}/L`,
      source: "user",
    });
  }

  /* A plug-in's electricity: the EU's figure, not FINN's, and tagged so. */
  if (energy.plugIn) {
    facts.push(
      { label: "Electricity use (EU official figure)", value: `${formatNumber(energy.plugIn.kWhPer100Km)} kWh/100km`, source: "eu" },
      { label: "Electricity price", value: `${formatPrice(energy.plugIn.price)}/kWh`, source: "user" },
    );
  }

  if (energy.costPer100Km != null) {
    facts.push({
      label: "Cost per 100 km",
      value: formatEUR(energy.costPer100Km),
      source: "estimate",
    });
  }

  let explanation: string;

  if (energy.available && energy.costPer100Km != null && energy.plugIn) {
    explanation =
      `At ${formatKm(monthlyKm)}/month: FINN's ${formatNumber(energy.consumption ?? 0)} L/100km of fuel at an assumed €${(energy.energyPrice ?? 0).toFixed(2)} per litre, ` +
      `and ${formatNumber(energy.plugIn.kWhPer100Km)} kWh/100km of electricity, about ${formatEUR(energy.costPer100Km)} per 100 km in all.`;
  } else if (energy.available && energy.costPer100Km != null) {
    explanation =
      `At ${formatKm(monthlyKm)}/month and ${formatNumber(energy.consumption ?? 0)} ` +
      `${energy.consumptionUnit}, that's about ${formatEUR(energy.costPer100Km)} per 100 km ` +
      /*
       * Lens's assumed price, named with its figure: nobody sets it any more,
       * and "the price you set" claimed an answer the reader never gave. Not
       * "typical" either — nothing checks it against today's prices.
       */
      `at an assumed ${energy.energyLabel === "electricity" ? "electricity" : "fuel"} price of ` +
      `€${(energy.energyPrice ?? 0).toFixed(2)} per ${energy.energyLabel === "electricity" ? "kWh" : "litre"}.`;
  } else if (energy.reason === "missingConsumption") {
    explanation =
      "FINN hasn't supplied a consumption figure for this car, so we can't estimate what it costs to run. " +
      `The ${energy.energyLabel} line is missing from the total rather than counted as €0.`;
  } else {
    explanation =
      `You haven't set a usable ${energy.energyLabel === "electricity" ? "electricity" : "fuel"} price, ` +
      "so we can't estimate the running cost. " +
      `The ${energy.energyLabel} line is missing from the total rather than counted as €0.`;
  }

  if (energy.caveat) {
    explanation = `${explanation} ${energy.caveat}`;
  }

  return {
    id: "energy",
    label: energy.plugIn ? "Estimated fuel & electricity" : `Estimated ${energy.energyLabel}`,
    amount: energy.amount,
    available: energy.available,
    source: "estimate",
    explanation,
    facts,
    /* The EU's figure, named and linked: Lens says where every number it didn't get from FINN comes from. */
    ...(energy.plugIn ? { sources: [{ name: EU_ELECTRICITY_SOURCE.name, url: EU_ELECTRICITY_SOURCE.url }] } : {}),
  };
}

function excessMileageLine(breakdown: CostBreakdown): CostLine {
  const { excessMileage } = breakdown;

  const facts: CostFact[] = [
    {
      label: "Included mileage",
      value: `${formatKm(excessMileage.includedMonthlyKm)}/month`,
      source: "finn",
    },
    {
      label: "Your mileage",
      value: `${formatKm(excessMileage.monthlyKm)}/month`,
      source: "user",
    },
  ];

  if (excessMileage.extraKmPrice != null) {
    facts.push({
      label: "Extra kilometre price",
      value: `${formatPrice(excessMileage.extraKmPrice)}/km`,
      source: "finn",
    });
  }

  if (excessMileage.excessKm > 0) {
    facts.push({
      label: "Estimated excess",
      value: `${formatKm(excessMileage.excessKm)}/month`,
      source: "estimate",
    });
  }

  const pack = excessMileage.mileagePackage;

  if (pack) {
    facts.push({ label: "Mileage package", value: `${formatKm(pack.km)}/month, +${formatEUR(pack.monthly)}/month`, source: "finn" });
  }

  let explanation: string;

  if (pack && excessMileage.excessKm === 0) {
    explanation =
      pack.monthly === 0
        ? `FINN's price includes ${formatKm(pack.km)} a month, which covers your ${formatKm(excessMileage.monthlyKm)}, so there's nothing extra to pay.`
        : `FINN's price includes ${formatKm(excessMileage.includedMonthlyKm)} a month. For your ${formatKm(excessMileage.monthlyKm)}, FINN's ${formatKm(pack.km)} package adds ${formatEUR(pack.monthly)} a month.`;
  } else if (pack && excessMileage.available && excessMileage.extraKmPrice != null) {
    explanation =
      `FINN's largest mileage package is ${formatKm(pack.km)} a month (+${formatEUR(pack.monthly)}). ` +
      `The ${formatKm(excessMileage.excessKm)} a month beyond it cost ${formatPrice(excessMileage.extraKmPrice)}/km, ` +
      `so about ${formatEUR(excessMileage.amount ?? 0)} a month in all.`;
  } else if (excessMileage.excessKm === 0) {
    explanation =
      `FINN includes ${formatKm(excessMileage.includedMonthlyKm)}/month. ` +
      `At ${formatKm(excessMileage.monthlyKm)}/month you stay inside that allowance, ` +
      "so there's nothing extra to pay.";
  } else if (excessMileage.available && excessMileage.extraKmPrice != null) {
    explanation =
      `Lens doesn't have FINN's mileage packages for this car, so this charges the ` +
      `${formatKm(excessMileage.excessKm)} a month beyond the included ${formatKm(excessMileage.includedMonthlyKm)} ` +
      `at FINN's ${formatPrice(excessMileage.extraKmPrice)}/km: about ${formatEUR(excessMileage.amount ?? 0)}. ` +
      "A mileage package, if FINN offers one for this car, would usually cost less.";
  } else {
    explanation =
      `FINN includes ${formatKm(excessMileage.includedMonthlyKm)}/month and you expect to drive ` +
      `${formatKm(excessMileage.excessKm)} beyond that, but FINN hasn't supplied an ` +
      "extra-kilometre price for this car. We can't estimate the charge, so the extra " +
      "mileage line is missing from the total rather than counted as €0.";
  }

  return {
    id: "excessMileage",
    label: excessMileage.mileagePackage ? "Mileage package" : "Estimated extra mileage",
    amount: excessMileage.amount,
    available: excessMileage.available,
    source: "estimate",
    explanation,
    facts,
  };
}

/**
 * Exactly what's missing, by name — never "part of the estimate". Each says
 * what FINN's data has and what it doesn't, so the reader knows what they'd
 * have to find out.
 */
export function missingPiece(reason: CostUnavailableReason, breakdown: CostBreakdown): string {
  const { energy, contract, contractType, excessMileage } = breakdown;

  switch (reason) {
    case "plugInElectricityExcluded":
      return `how much electricity this plug-in hybrid uses — FINN lists only its fuel figure${energy.consumption != null ? ` (${formatNumber(energy.consumption)} ${energy.consumptionUnit})` : ""}, and its figures don't match a car in the EU's registration data`;
    case "missingSubscriptionPrice":
      return `FINN's ${CONTRACT_LABEL[contractType]} monthly price${contract.term ? ` for the ${contract.term.months}-month term` : ""} — it doesn't list one for this car`;
    case "missingConsumption":
      return `this car's ${energy.energyLabel === "electricity" ? "electricity" : "fuel"} consumption — FINN doesn't list one`;
    case "missingEnergyPrice":
      return `a ${energy.energyLabel === "electricity" ? "electricity" : "fuel"} price to cost it at`;
    case "missingExtraKmPrice":
      return `FINN's price per kilometre beyond ${formatKm(excessMileage.includedMonthlyKm)} a month — it doesn't list one for this car`;
  }
}

function missingCaveat(reason: CostUnavailableReason, breakdown: CostBreakdown): string {
  const piece = missingPiece(reason, breakdown);

  return reason === "plugInElectricityExcluded"
    ? `Missing: ${piece}. So the total is what the fuel costs, and the electricity comes on top.`
    : `Missing: ${piece}. That line is left out of the total rather than counted as €0.`;
}

/**
 * Turns a cost breakdown into the facts a UI needs to explain the number.
 *
 * Works for any vehicle, recommended or not — this deliberately knows nothing
 * about who won.
 */
export function buildCostAnalysis(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
  breakdown: CostBreakdown = calculateCost(vehicle, preferences),
): CostAnalysis {
  const lines = [
    subscriptionLine(breakdown),
    energyLine(breakdown),
    excessMileageLine(breakdown),
  ];

  const caveats = [
    ...rentalCaveats(breakdown.contract),
    ...breakdown.missing.map((reason) => missingCaveat(reason, breakdown)),
  ];

  const headline = breakdown.complete
    ? `We estimate this car will cost you around ${formatEUR(breakdown.totalMonthly)}/month.`
    : `Based on what we could calculate, this car costs at least ${formatEUR(breakdown.totalMonthly)}/month. Missing: ${breakdown.missing.map((reason) => missingPiece(reason, breakdown)).join("; and ")}.`;

  return {
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    breakdown,
    lines,
    headline,
    budgetSentence: budgetSentence(breakdown),
    vatNote:
      breakdown.contractType === "private"
        ? "VAT is included in the advertised monthly subscription price."
        : "FINN's data doesn't tell us how VAT is treated on business contracts, so we're showing the advertised business price as supplied and not adding or removing anything.",
    caveats,
    disclaimer:
      "Every figure in this bill is an estimate, built from the data FINN supplies about the car and the assumptions you've given us. " +
      "Your actual cost may differ if you drive more or less, energy prices change, or the contract terms differ.",
  };
}

/**
 * What the reader's rental period means for this car, said where the money
 * is: the months a longer term commits them to, or why it doesn't fit.
 */
function rentalCaveats(contract: ContractFit): string[] {
  const { period, term, extraMonths } = contract;

  if (!period) return [];

  const problem = describeRentalProblem(contract);

  if (problem) return [`This car ${problem}.`];

  if (term && extraMonths && extraMonths > 0) {
    return [
      `FINN's shortest term that covers ${periodLabel(period)} is ${term.months} months, so the contract would run until the end of ${monthLabel(addMonths(period.from, term.months - 1))} — ${extraMonths} month${extraMonths === 1 ? "" : "s"} past when you need it. FINN's data doesn't say whether it can be ended early.`,
    ];
  }

  return [];
}

function budgetSentence(breakdown: CostBreakdown): string | null {
  const { budget, budgetDifference, budgetStatus, totalMonthly } = breakdown;

  if (budget == null || budgetDifference == null) return null;

  if (budgetStatus === "over") {
    return `Your budget is ${formatEUR(budget)}/month, so this car is about ${formatEUR(
      budgetDifference,
    )} over budget.`;
  }

  if (budgetStatus === "unknown") {
    const pieces = breakdown.missing.map((reason) => missingPiece(reason, breakdown));

    return `Your budget is ${formatEUR(budget)}/month. What Lens can price comes to ${formatEUR(totalMonthly)}/month, but it can't confirm the car fits: missing is ${pieces.join("; and ")}.`;
  }

  const headroom = Math.abs(budgetDifference);

  return headroom < 1
    ? `Your budget is ${formatEUR(budget)}/month, so this car lands right on it.`
    : `Your budget is ${formatEUR(budget)}/month, so this car is about ${formatEUR(
        headroom,
      )} under budget.`;
}
