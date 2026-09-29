/**
 * Where finn.com is, with no locale path.
 *
 * It carried `/de-DE`, which did two wrong things: it sent every reader to
 * the German site whatever their own is, and it made the popup's
 * `tab.url.includes(FINN_BASE_URL)` check answer "no" for anyone browsing
 * finn.com in another language — so the extension told them they were not on
 * finn.com while they were looking at it.
 */
export const FINN_BASE_URL = "https://www.finn.com";