import { normalizeString } from "../../utils";

export default function getEquipmentDetails(root: Element) {
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
