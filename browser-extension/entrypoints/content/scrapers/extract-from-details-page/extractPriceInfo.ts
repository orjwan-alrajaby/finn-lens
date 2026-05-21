export default function extractPriceInfo(root: Element) {
    const priceArea = root.querySelector('div[data-cy="price-area"]');
    const priceSpans = priceArea?.querySelector("div.flex")?.querySelectorAll("span");
    const hasPriceLoaded = priceSpans && Array.from(priceSpans).length > 0;

    console.log("stars", {
        priceArea,
        priceSpans,
        hasPriceLoaded,
    });

    if (!priceArea) {
        return {
            baseValue: null,
            discount: null,
            oldValue: null,
            period: null,
            textValue: null,
        };
    }
}