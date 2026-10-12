/**
 * Where a reader gets Lens and its source: the repository, the packaged build
 * it keeps in `releases/` (`npm run release` copies each one there), and the
 * beta note's first steps with it. Shared by the published site's header, the
 * product demo and the documentation tab, so a new version or a moved
 * repository can't leave one of them pointing at the old place.
 */

/** The repository on GitHub: the source code, and the home of every document the documentation tab shows. */
export const REPOSITORY = "https://github.com/orjwan-alrajaby/finn-lens";

/** The published guide, demo and documentation. A link from a document to one of its sections opens that tab in place. */
export const SITE = "https://orjwan-alrajaby.github.io/finn-lens/";

/** The package for `version` — the bare one, "0.9.1", which the zip is named by. */
export function packageUrl(version: string): string {
    return `${REPOSITORY}/raw/main/releases/finn-lens-${version}-chrome.zip`;
}

/** The beta note's "Try it" — what to do in the first five minutes — in the documentation tab, the same route in Settings and on the site. */
export const FIRST_STEPS = "#docs/beta/try-it-five-minutes";
