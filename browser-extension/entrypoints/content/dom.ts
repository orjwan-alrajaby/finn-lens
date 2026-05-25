import { DETAILS_PAGE_SELECTOR } from "./constants";

export function getCarUrlFromDetailsPageHead() {
    const isDetailsPage = document.querySelector(DETAILS_PAGE_SELECTOR);
    if (isDetailsPage) {
        const linkElement = document.head.querySelector("link");
        if (!linkElement) return "";
        const url = linkElement.href;

        return url;
    }
    throw new Error("'getCarUrlFromHead' function can only be called within a car's details page.")
}