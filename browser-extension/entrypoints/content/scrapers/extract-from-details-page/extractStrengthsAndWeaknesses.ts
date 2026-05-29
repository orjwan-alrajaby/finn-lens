export default function extractStrengthsAndWeaknesses(
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
