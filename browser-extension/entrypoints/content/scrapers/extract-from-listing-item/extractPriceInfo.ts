import { REGEXES } from "../../constants";
import { determinePricingPeriod, parseEuroPrice } from "../../utils";
import { calculateDiscount } from "../utils";

export default function extractPriceInfo(node: Element) {
    const priceWrapper = node.querySelector(
        ".row-y-2.flex.flex-wrap.items-center"
    );

    if (!priceWrapper) {
        return {
            oldValue: null,
            baseValue: null,
            discount: null,
            period: null,
        };
    }

    const rawOldValue =
        priceWrapper.querySelector(".line-through")?.textContent
            ?.replace(/\s+/g, " ")
            .trim() ?? "";

    const clone = priceWrapper.cloneNode(true) as HTMLElement;

    clone.querySelectorAll(".line-through").forEach((el) => el.remove());

    const text =
        clone.textContent?.replace(/\s+/g, " ").trim() ?? "";

    const matches = [...text.matchAll(REGEXES.euroAmountPattern)]
        .map((m) => parseEuroPrice(m[0]))
        .filter((value): value is number => value !== null);

    const price = matches.at(-1) ?? null;

    const oldValue = parseEuroPrice(rawOldValue);

    const discount = calculateDiscount(price, oldValue);

    const priceAreaText = text.toLowerCase();

    const pricingPeriod = determinePricingPeriod(priceAreaText);

    return {
        baseValue: price,
        oldValue: oldValue,
        discount,
        period: pricingPeriod,
    };
}