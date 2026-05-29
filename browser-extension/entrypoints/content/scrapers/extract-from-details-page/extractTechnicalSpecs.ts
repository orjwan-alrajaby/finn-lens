export default function extractTechnicalSpecs(root: Element) {
    const technicalSpecsTab = root.querySelector(
        'div[role="tabpanel"][id="horizontal_tab_2-panel"]'
    );

    if (!technicalSpecsTab) return [];

    const specsDivs = technicalSpecsTab.querySelectorAll(
        ".border-pearl.border-0.border-b.border-solid"
    );

    return Array.from(specsDivs)
        .map((spec) => {
            const label = spec.querySelector(":scope > div:first-child")?.textContent?.trim();
            const value = spec.querySelector(":scope > div:last-child")?.textContent?.trim();

            if (!label || !value) return null;

            return {
                label,
                value,
            };
        })
        .filter(Boolean);
}
