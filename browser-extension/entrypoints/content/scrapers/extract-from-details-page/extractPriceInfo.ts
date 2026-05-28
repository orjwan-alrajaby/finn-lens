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

    let currentPrice;

    const oldPrice = [...priceSpans].find(span => span.classList.contains("line-through"))?.textContent;

    if (oldPrice) {
        currentPrice = priceSpans[2].textContent;
    } else {
        currentPrice = priceSpans[1].textContent;
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