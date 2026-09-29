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

  const caveat = isPlugIn
    ? "FINN reports one combined consumption figure for plug-in hybrids, so this prices it as fuel and leaves out the electricity the car charges on. The real energy cost is higher, by an amount that depends on how much of your driving is done on electricity."
    : null;

  const base = {
    consumption,
    consumptionUnit,
    energyPrice: price,
    energyLabel: label,
    caveat,
    /*
     * A plug-in hybrid's combined litres figure assumes part of the driving is
     * electric, and that electricity isn't in it — so the fuel it prices is a
     * floor, never an estimate of the whole.
     */
    isFloor: isPlugIn,
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

  const costPer100Km = consumption * price;
  const monthlyKm = Math.max(0, preferences.monthlyKm);

  return {
    ...base,
    amount: (monthlyKm / 100) * costPer100Km,
    available: true,
    reason: null,
    costPer100Km,
  };
}

/**
 * Estimated charge for kilometres beyond FINN's included monthly allowance.
 *
 * When the user drives less than the allowance there is genuinely nothing to
 * charge, so the component is €0 and available. When the vehicle has no
 * `extraKmPrice` and there *are* excess kilometres, the component is
 * unavailable instead.
 */
function excessMileageComponent(
  vehicle: PinnedFinnCar,
  preferences: LensPreferences,
): ExcessMileageCost {
  const monthlyKm = Math.max(0, preferences.monthlyKm);
  const includedMonthlyKm = FINN_INCLUDED_MONTHLY_KM;
  const excessKm = Math.max(0, monthlyKm - includedMonthlyKm);

  const rawPrice = vehicle.pricing?.extraKmPrice;
  const extraKmPrice = isPositive(rawPrice) ? rawPrice : null;

  const base = {
    includedMonthlyKm,
    monthlyKm,
    excessKm,
    extraKmPrice,
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

  if (energy.costPer100Km != null) {
    facts.push({
      label: "Cost per 100 km",
      value: formatEUR(energy.costPer100Km),
      source: "estimate",
    });
  }

  let explanation: string;

  if (energy.available && energy.costPer100Km != null) {
    explanation =
      `At ${formatKm(monthlyKm)}/month and ${formatNumber(energy.consumption ?? 0)} ` +
      `${energy.consumptionUnit}, that's about ${formatEUR(energy.costPer100Km)} per 100 km ` +
      `using the ${energy.energyLabel === "electricity" ? "electricity" : "fuel"} price you set.`;
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
    label: `Estimated ${energy.energyLabel}`,
    amount: energy.amount,
    available: energy.available,
    source: "estimate",
    explanation,
    facts,
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

  let explanation: string;

  if (excessMileage.excessKm === 0) {
    explanation =
      `FINN includes ${formatKm(excessMileage.includedMonthlyKm)}/month. ` +
      `At ${formatKm(excessMileage.monthlyKm)}/month you stay inside that allowance, ` +
      "so there's nothing extra to pay.";
  } else if (excessMileage.available && excessMileage.extraKmPrice != null) {
    explanation =
      `FINN includes ${formatKm(excessMileage.includedMonthlyKm)}/month. ` +
      `At ${formatKm(excessMileage.monthlyKm)}/month you're estimated to drive ` +
      `${formatKm(excessMileage.excessKm)} beyond that. ` +
      `At ${formatPrice(excessMileage.extraKmPrice)}/km, that's about ` +
      `${formatEUR(excessMileage.amount ?? 0)}.`;
  } else {
    explanation =
      `FINN includes ${formatKm(excessMileage.includedMonthlyKm)}/month and you expect to drive ` +
      `${formatKm(excessMileage.excessKm)} beyond that, but FINN hasn't supplied an ` +
      "extra-kilometre price for this car. We can't estimate the charge, so the extra " +
      "mileage line is missing from the total rather than counted as €0.";
  }

  return {
    id: "excessMileage",
    label: "Estimated extra mileage",
    amount: excessMileage.amount,
    available: excessMileage.available,
    source: "estimate",
    explanation,
    facts,
  };
}

const MISSING_CAVEAT: Record<CostUnavailableReason, string> = {
  plugInElectricityExcluded:
    "The energy line leaves out the electricity a plug-in hybrid charges on, so the real cost is higher and Lens can't confirm it fits a budget.",
  missingSubscriptionPrice:
    "We couldn't include the subscription price because FINN hasn't supplied one for this contract type.",
  missingConsumption:
    "We couldn't estimate the running cost because consumption data wasn't available.",
  missingEnergyPrice:
    "We couldn't estimate the running cost because no usable fuel or electricity price is set in your driving settings.",
  missingExtraKmPrice:
    "We couldn't estimate the excess-mileage cost because the extra-kilometre price wasn't available.",
};

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
    ...breakdown.missing.map((reason) => MISSING_CAVEAT[reason]),
  ];

  const headline = breakdown.complete
    ? `We estimate this car will cost you around ${formatEUR(breakdown.totalMonthly)}/month.`
    : `Based on what we could calculate, this car costs at least ${formatEUR(
        breakdown.totalMonthly,
      )}/month. Some parts of the estimate are missing, so the real figure is higher.`;

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
    return `Your budget is ${formatEUR(budget)}/month. What we could calculate comes to ${formatEUR(
      totalMonthly,
    )}/month, but because part of the estimate is missing we can't confirm this car fits.`;
  }

  const headroom = Math.abs(budgetDifference);

  return headroom < 1
    ? `Your budget is ${formatEUR(budget)}/month, so this car lands right on it.`
    : `Your budget is ${formatEUR(budget)}/month, so this car is about ${formatEUR(
        headroom,
      )} under budget.`;
}
