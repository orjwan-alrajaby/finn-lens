import { normalizeString } from "../../utils";

export default function extractSpaceAndTrunkDetails(root: Element) {
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
