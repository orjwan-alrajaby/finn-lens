export function queryFirst(
    root: ParentNode,
    selectors: string[]
) {
    for (const selector of selectors) {
        const el = root.querySelector(selector);
        if (el) {
            return el;
        }
    }
    return null;
}