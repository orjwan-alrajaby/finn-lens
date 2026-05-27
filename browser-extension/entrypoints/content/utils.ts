import { PeriodType } from "@/types";

export function parseEuroPrice(text?: string | null): number | null {
  if (!text) return null;

  const match = text.replace(",", ".").match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
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

export function determinePricingPeriod(text: string) {
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