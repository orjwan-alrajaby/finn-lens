import { normalizeString } from "../../utils";

export default function getDesignDetails(root: Element) {
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
