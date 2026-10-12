import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The beta guide and the product demo as a plain web page, for GitHub Pages.
 *
 * The same components as the extension's Settings tabs, with the same
 * stylesheet, fonts and icon, so the published copy can't drift from the one
 * inside the extension. `SITE_BASE` is the path Pages serves it under — the
 * repository's name — set by the workflow; locally it's the root.
 */
const extension = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    base: process.env.SITE_BASE ?? "/",
    publicDir: fileURLToPath(new URL("../public", import.meta.url)),
    plugins: [react()],
    resolve: { alias: { "@": extension } },
    define: { __LENS_VERSION__: JSON.stringify(`${version} beta`), __LENS_RELEASE__: JSON.stringify(version) },
    /* The documents live beside the extension, in the repository's own docs/. */
    server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
    build: { outDir: fileURLToPath(new URL("../.output/site", import.meta.url)), emptyOutDir: true },
});
