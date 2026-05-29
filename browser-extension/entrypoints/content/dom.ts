import { FINN_BASE_URL } from "@/constants";
import { DETAILS_PAGE_SELECTOR } from "./constants";

export function getCarUrlFromDetailsPageHead() {
    const isDetailsPage = document.querySelector(DETAILS_PAGE_SELECTOR);
    if (isDetailsPage) {
        const canonicalLinks =
            document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]');
        const canonicalLink = [...canonicalLinks].find(link => link.href.includes(FINN_BASE_URL));
        // TODO: check whether using `window.location.href` would suffice where this function is used.
        return canonicalLink?.href || window.location.href;
    }
    // TODO: explore handling this better or removing it entirely (in relation to previous TODO).
    throw new Error("'getCarUrlFromHead' function can only be called within a car's details page.")
}