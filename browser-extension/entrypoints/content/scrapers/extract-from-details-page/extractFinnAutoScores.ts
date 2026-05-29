import { normalizeString } from "../../utils";

export default function extractFinnAutoScores(root: Element) {
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
