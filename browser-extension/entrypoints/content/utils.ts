import { PeriodType } from "@/types";

export function parseEuroPrice(text?: string | null): number | null {
  if (!text) return null;

  let normalized = text
    .replace(/[€\s]/g, "") // remove euro + spaces
    .trim();

  // CASE 1:
  // German format: 1.089 or 1.089,99
  if (normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "");
  }

  // CASE 2:
  // Decimal comma
  normalized = normalized.replace(",", ".");

  const number = Number(normalized);

  return Number.isNaN(number) ? null : number;
}

export function normalizeString(str?: string | null) {
  if (!str) return "";

  return str
    .normalize("NFD")                 // split accents from letters
    .replace(/[\u0300-\u036f]/g, "")  // remove accents
    .toLowerCase()
    .replace(/\s+/g, "")              // remove spaces
    .replace(/[^a-z0-9]/g, "");       // remove special chars
}

export function determinePricingPeriod(rawText: string) {
  const text = rawText.toLowerCase();

  let period: PeriodType | null = null;

  if (
      text.includes("monat") ||
      text.includes("month")
  ) {
      period = "month";
  } else if (
      text.includes("woche") ||
      text.includes("week")
  ) {
      period = "week";
  } else if (
      text.includes("jahr") ||
      text.includes("year")
  ) {
      period = "year";
  }

  return period;
}