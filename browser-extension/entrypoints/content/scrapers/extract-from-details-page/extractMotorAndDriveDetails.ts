import { normalizeString } from "../../utils";

export default function getMotorAndDriveDetails(root: Element) {
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
