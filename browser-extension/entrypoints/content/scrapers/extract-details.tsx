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

export function getTechnicalSpecs(root: Element) {
    const technicalSpecsTab = root.querySelector(
        'div[role="tabpanel"][id="horizontal_tab_2-panel"]'
    );

    if (!technicalSpecsTab) return [];

    const specsDivs = technicalSpecsTab.querySelectorAll(
        ".border-pearl.border-0.border-b.border-solid"
    );

    return Array.from(specsDivs)
        .map((spec) => {
            const children = spec.querySelectorAll("div");

            const label = children[0]?.textContent?.trim();
            const value = children[1]?.textContent?.trim();

            if (!label || !value) return null;

            return {
                label,
                value,
            };
        })
        .filter(Boolean);
}

export function getMotorAndDriveDetails(root: Element) {
    const targetContainer = Array.from(
        root.querySelectorAll("div.container")
    )
        .find((container) => {
            const title = normalizeString(
                container.querySelector("h3")?.textContent
            );

            return (
                title === "motorantrieb" ||
                title === "motordrive"
            );
        })
        ?.querySelector(".raw-html-global");

    if (!targetContainer) return;

    const paragraphs: string[] = [];

    for (const child of Array.from(targetContainer.children)) {
        const tagName = child.tagName.toLowerCase();

        // skip section's heading
        if (tagName === "h3") {
            continue;
        }

        // stop once structure changes
        if (tagName !== "p") {
            break;
        }

        const text = child.textContent?.trim();

        if (text) {
            paragraphs.push(text);
        }
    }

    return paragraphs.join("\n\n") || "No details available.";
}

export function getDesignDetails(root: Element) {
    const targetContainer = Array.from(
        root.querySelectorAll("div.container")
    )
        .find((container) => {
            const title = normalizeString(
                container.querySelector("h2")?.textContent
            );

            return title === "design";
        })
        ?.querySelector(".raw-html-global");

    if (!targetContainer) return;

    const h2DesignTitleIndex = Array.from(targetContainer.children)
        .findIndex(child => child.nodeName.toLowerCase() === "h2" && normalizeString(child.textContent) === "design");

    const paragraphs: string[] = [];
    const sectionImages: string[] = [];

    for (const child of Array.from(targetContainer.children).slice(h2DesignTitleIndex)) {
        const tagName = child.tagName.toLowerCase();

        // skip section's heading
        if (tagName === "h2") {
            continue;
        }

        // stop once structure changes
        if (tagName !== "p") {
            break;
        }

        const text = child.textContent?.trim();

        if (text) {
            paragraphs.push(text);
        }

        if (child.querySelectorAll("img")) {
            const imageElements = [...child.querySelectorAll("img")];
            const imageUrls = imageElements.map(imgElement => imgElement.src);
            sectionImages.push(...imageUrls)
        }
    }

    const sectionText = paragraphs.join("\n\n") || "No details available.";

    return {
        text: sectionText,
        images: sectionImages
    }
}

export function getSpaceAndTrunkDetails(root: Element) {
    const contentRoot = Array.from(
        root.querySelectorAll("div.container")
    )
        .find((container) => {
            const title = normalizeString(
                container.querySelector("h2")?.textContent
            );

            return (
                title === "ausstattung" ||
                title === "equipment"
            );
        })
        ?.querySelector(".raw-html-global");

    if (!contentRoot) return;

    const children = Array.from(contentRoot.children);

    const startIndex = children.findIndex((child) => {
        return (
            child.tagName.toLowerCase() === "h3" &&
            (
                normalizeString(child.textContent) === "platzkofferraum" ||
                normalizeString(child.textContent) === "spacetrunk"
            )
        );
    });

    if (startIndex === -1) return;

    const sectionText: string[] = [];

    for (const child of children.slice(startIndex + 1)) {
        const tagName = child.tagName.toLowerCase();

        // stop at next major section
        if (tagName === "h2" || tagName === "h3") {
            break;
        }

        if (tagName === "p") {
            const text = child.textContent?.trim();

            if (text) {
                sectionText.push(text);
            }
        }

        if (tagName === "ul") {
            const items = Array.from(child.querySelectorAll("li"))
                .map((li) => li.textContent?.trim())
                .filter(Boolean);

            sectionText.push(...items as string[]);
        }
    }

    return sectionText.join("\n\n") || "No details available.";
}

export function getEquipmentDetails(root: Element) {
    const contentRoot = Array.from(
        root.querySelectorAll("div.container")
    )
        .find((container) => {
            const title = normalizeString(
                container.querySelector("h2")?.textContent
            );

            return (
                title === "ausstattung" ||
                title === "equipment"
            );
        })
        ?.querySelector(".raw-html-global");

    if (!contentRoot) return;

    const children = Array.from(contentRoot.children);

    const startIndex = children.findIndex((child) => {
        return (
            child.tagName.toLowerCase() === "h2" &&
            (
                normalizeString(child.textContent) === "ausstattung" ||
                normalizeString(child.textContent) === "equipment"
            )
        );
    });

    if (startIndex === -1) return;

    const paragraphs: string[] = [];
    const images: string[] = [];

    for (const child of children.slice(startIndex + 1)) {
        const tagName = child.tagName.toLowerCase();

        // stop before next section
        if (tagName === "h3") {
            break;
        }

        if (tagName === "p") {
            const text = child.textContent
                ?.replace(/\s+/g, " ")
                .trim();

            // ignore any empty paragraphs
            if (text) {
                paragraphs.push(text);
            }

            const imageElements = Array.from(
                child.querySelectorAll("img")
            );

            images.push(
                ...imageElements
                    .map((img) => img.src)
                    .filter(Boolean)
            );
        }

        if (tagName === "ul") {
            const items = Array.from(child.querySelectorAll("li"))
                .map((li) => li.textContent?.trim())
                .filter(Boolean);

            paragraphs.push(...items);
        }
    }

    return {
        text: paragraphs.join("\n\n") || "No details available.",
        images,
    };
}