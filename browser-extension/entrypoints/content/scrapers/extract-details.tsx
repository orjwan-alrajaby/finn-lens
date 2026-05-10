import { normalizeString, parseEuroPrice } from "../utils";
import { calculateDiscount, removeDuplicateImages } from "./utils";

export function extractPriceInfo(node: Element) {
    const priceWrapper = node.querySelector(
        ".row-y-2.flex.flex-wrap.items-center"
    );

    if (!priceWrapper) {
        return {
            rawPrice: null,
            oldPrice: null,
            base: null,
            discount: null,
            period: null,
        };
    }

    const rawOldPrice = (priceWrapper.querySelector(".line-through"))?.textContent?.replace(/\s+/g, " ")
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

    const rawPrice =
        matches.at(-1)?.[0] ?? null;

    const price = parseEuroPrice(rawPrice);
    const oldPrice = parseEuroPrice(rawOldPrice);

    const discount = calculateDiscount(price, oldPrice);

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
        textValue: rawPrice,
        baseValue: price,
        oldValue: oldPrice,
        discount,
        period,
    };
}

export function extractCarDescription(root: Element) {
    const carName = root.querySelector("h1")?.textContent;

    const normalized = normalizeString(carName);

    const titleEl = Array.from(
        root.querySelectorAll("h2")
    ).find((el) => {
        const text = normalizeString(el.textContent);

        return (
            text.includes(normalized) ||
            normalized.includes(text)
        );
    });

    if (!titleEl) {
        return {
            description: null,
        };
    }

    let description: string | null = null;

    let el = titleEl.nextElementSibling;

    while (el) {
        if (el.tagName === "P") {
            description =
                el.textContent?.trim() ?? null;

            break;
        }

        el = el.nextElementSibling;
    }

    return {
        description,
    };
}

export function extractStrengthsAndWeaknesses(
    root: Element
) {
    const strengths = new Set<string>();
    const weaknesses = new Set<string>();

    root.querySelectorAll("div").forEach((section) => {
        const heading =
            section
                .querySelector("p")
                ?.textContent?.toLowerCase() ?? "";

        const list = section.querySelector("ul");

        if (!list) {
            return;
        }

        const items = Array.from(
            list.querySelectorAll("li")
        )
            .map((li) => {
                const clone = li.cloneNode(
                    true
                ) as HTMLElement;

                clone
                    .querySelectorAll("svg")
                    .forEach((el) => el.remove());

                return clone.textContent?.trim();
            })
            .filter(Boolean) as string[];

        if (
            heading.includes("stärke") ||
            heading.includes("strength")
        ) {
            items.forEach((item) =>
                strengths.add(item)
            );
        }

        if (
            heading.includes("schwäche") ||
            heading.includes("weak")
        ) {
            items.forEach((item) =>
                weaknesses.add(item)
            );
        }
    });

    return {
        strengths: [...strengths],
        weaknesses: [...weaknesses],
    };
}

export function extractImages(root: Element) {
    const imageCarousel =
        root.querySelector(".slick-slider");

    const imageContainers =
        imageCarousel?.querySelectorAll(
            ".slick-slide"
        );

    if (!imageContainers?.length) {
        return [];
    }

    const extractedImages = Array.from(imageContainers)
        .map((container) => container.querySelector("img")?.src || "")
        .filter(Boolean);

    const images = removeDuplicateImages(extractedImages);

    return images;
}

export function extractFinnAutoScore(root: Element) {
    const sections = [...root.querySelectorAll("section")];

    const finnAutoScoreSection = sections.find((section) => {
        const headingText = section.querySelector("h2")?.textContent;

        return normalizeString(headingText)?.includes(normalizeString("FINN Auto-Score"));
    });

    if (!finnAutoScoreSection) {
        return null;
    }

    const scoreRows = [
        ...finnAutoScoreSection.querySelectorAll(
            ".flex.items-center.justify-between.gap-32"
        ),
    ];

    const scores = scoreRows.map((row) => {
        const label =
            row.querySelector("p")?.textContent?.trim() ?? "";

        const value =
            row.querySelector("span.body-16-semibold")
                ?.textContent?.trim() ?? "";

        return {
            label,
            value: Number(value),
        };
    });
    return scores;
}