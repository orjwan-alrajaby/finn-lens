import {
    normalizeString,
} from "../utils";
import { queryFirst } from "./dom";
import {
    extractCarDescription,
    extractStrengthsAndWeaknesses,
    extractImages,
    extractFinnAutoScore,
    extractPriceInfo,
} from "./extract-details";
import { FINN_BASE_URL } from "@/constants"

export function extractCarFromNode(
    node: Element
) {
    const linkEl = queryFirst(node, [
        "h3 a",
        "a[href*='/']",
    ]);

    const title =
        linkEl
            ?.getAttribute("title")
            ?.trim() ??
        linkEl?.textContent?.trim() ??
        null;

    const link =
        linkEl?.getAttribute("href");

    const img = queryFirst(node, [
        "img[alt]",
        "img",
    ]);

    const imageUrl =
        img?.getAttribute("src") ||
        img?.getAttribute("data-src") ||
        null;

    const price = extractPriceInfo(node);

    return {
        id: link
            ? normalizeString(link)
            : `car-${normalizeString(title)}`,
        title,
        price,
        imageUrl,
        url: link
            ? new URL(
                link,
                location.origin
            ).href
            : null,
    };
}

export function extractCarsFromListingsPage() {
    const nodes = document.querySelectorAll(
        '[data-testid="product-card"]'
    );

    return Array.from(nodes).map((node) =>
        extractCarFromNode(node)
    );
}

async function fetchCarDocument(
    carUrl: string
) {
    const res = await fetch(
        `${FINN_BASE_URL}${carUrl}`
    );

    const html = await res.text();

    return new DOMParser().parseFromString(
        html,
        "text/html"
    );
}

export async function extractFullCarDetails(
    carUrl: string,
    currentCarCardElement: HTMLElement
) {
    const {
        id,
        title,
        imageUrl: mainImageUrl,
        price,
    } = extractCarFromNode(
        currentCarCardElement
    );

    const doc = await fetchCarDocument(
        carUrl
    );

    const body = doc.querySelector(
        'div[data-appid="product-details"]'
    );

    if (!body) {
        return null;
    }

    const name =
        body
            .querySelector("h1")
            ?.textContent?.trim() ?? null;

    const { description } =
        extractCarDescription(body);

    const {
        strengths,
        weaknesses,
    } =
        extractStrengthsAndWeaknesses(
            body
        );

    const images =
        extractImages(body);

    const scores = extractFinnAutoScore(body);

    return {
        id,
        title: title || name,
        description,
        strengths,
        weaknesses,
        mainImageUrl,
        images,
        price,
        scores,
    };
}