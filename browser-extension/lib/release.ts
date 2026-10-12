/**
 * Where a reader gets Lens: the packaged build the repository keeps in
 * `releases/` (`npm run release` copies each one there), and the beta note's
 * steps for loading it. Shared by the published site's header and the product
 * demo, so a new version can't leave one of them pointing at the old zip.
 */

/** The package for `version` — the bare one, "0.9.1", which the zip is named by. */
export function packageUrl(version: string): string {
    return `https://github.com/orjwan-alrajaby/finn-lens/raw/main/releases/finn-lens-${version}-chrome.zip`;
}

/** The beta note's install steps, in the documentation tab — the same route in Settings and on the site. */
export const INSTALL_STEPS = "#docs/beta/install-it-chrome-on-a-computer-about-two-minutes";
