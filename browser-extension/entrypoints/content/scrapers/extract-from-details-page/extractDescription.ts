import { normalizeString } from "../../utils";

export default function extractCarDescription(root: Element) {
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
