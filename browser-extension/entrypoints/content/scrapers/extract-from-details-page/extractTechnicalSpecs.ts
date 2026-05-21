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
