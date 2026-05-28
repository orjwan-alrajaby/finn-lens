export const HOME_PAGE_SELECTOR = 'div[data-testid="hero2"]';
export const LISTINGS_PAGE_SELECTOR = 'div[data-testid="product-listing"]';
export const DETAILS_PAGE_SELECTOR = 'div[data-appid="product-details"]';
export const REGEXES = {
    // 'euroAmountPattern' matches euro price strings that may use localized formatting:
    //   - Thousand separators: dot (1.299 €), space (1 299 €), or comma
    //   - Decimal separators: comma (1.299,99 €) or dot (1299.99 €)
    // Captures everything between the first digit and the € symbol,
    // leaving full normalization (comma→dot, thousand-sep removal) to parseEuroPrice.
    // Examples matched: "299 €", "1.299 €", "1 299,00 €", "1.299,99 €"
    euroAmountPattern: /(\d[\d\s.,]*)\s*€/g,
}