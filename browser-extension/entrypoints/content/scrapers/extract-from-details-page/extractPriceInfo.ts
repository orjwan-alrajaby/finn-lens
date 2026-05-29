import { parseEuroPrice, determinePricingPeriod } from "../../utils";
import { calculateDiscount } from "../utils";

export default function extractPriceInfo(root: Element) {
    const priceArea = root.querySelector('div[data-cy="price-area"]');
    const priceValues = priceArea?.querySelector("div.flex");
    const priceSpans = priceValues?.querySelectorAll("span");
    const hasPriceLoaded = priceArea && priceSpans && Array.from(priceSpans).length > 0;

    if (!hasPriceLoaded) {
        return {
            baseValue: null,
            discount: null,
            oldValue: null,
            period: null,
        };
    }

    const oldPrice = [...priceSpans].find(span => span.classList.contains("line-through"))?.textContent;

    const currentPriceSpan = oldPrice ? priceSpans[2] : priceSpans[1];
    const currentPrice = currentPriceSpan?.textContent ?? null;
    
    if (!currentPrice) {
        return {
            baseValue: null,
            discount: null,
            oldValue: parseEuroPrice(oldPrice),
            period: null,
        };
    }

    const price = parseEuroPrice(currentPrice);
    const oldValue = parseEuroPrice(oldPrice);
    const discount = calculateDiscount(price, oldValue);
    const priceAreaText = priceArea.textContent.toLowerCase();
    const pricingPeriod = determinePricingPeriod(priceAreaText);

    return {
        baseValue: price,
        discount: discount,
        oldValue,
        period: pricingPeriod,
    };
}