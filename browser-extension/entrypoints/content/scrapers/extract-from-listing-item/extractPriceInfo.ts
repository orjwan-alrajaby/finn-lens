import { parseEuroPrice } from "../../utils";
import { calculateDiscount } from "../utils";

export default function extractPriceInfo(node: Element) {
    const priceWrapper = node.querySelector(
        ".row-y-2.flex.flex-wrap.items-center"
    );

    if (!priceWrapper) {
        return {
            textValue: null,
            oldValue: null,
            baseValue: null,
            discount: null,
            period: null,
        };
    }

    const rawoldValue = (priceWrapper.querySelector(".line-through"))?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "";

    const clone = priceWrapper.cloneNode(
        true
    ) as HTMLElement;

    clone
        .querySelectorAll(".line-through")
        .forEach((el) => el.remove());

    const text =
        clone.textContent
            ?.replace(/\s+/g, " ")
            .trim() ?? "";

    const matches = Array.from(
        text.matchAll(/(\d+(\.\d+)?)\s*€/g)
    );

    const textValue =
        matches.at(-1)?.[0] ?? null;

    const price = parseEuroPrice(textValue);
    const oldValue = parseEuroPrice(rawoldValue);

    const discount = calculateDiscount(price, oldValue);

    const lower = text.toLowerCase();

    let period:
        | "month"
        | "week"
        | "year"
        | null = null;

    if (
        lower.includes("monat") ||
        lower.includes("month")
    ) {
        period = "month";
    } else if (
        lower.includes("woche") ||
        lower.includes("week")
    ) {
        period = "week";
    } else if (
        lower.includes("jahr") ||
        lower.includes("year")
    ) {
        period = "year";
    }

    return {
        textValue: textValue,
        baseValue: price,
        oldValue: oldValue,
        discount,
        period,
    };
}