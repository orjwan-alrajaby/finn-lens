import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  /*
   * react-to-pdf takes its screenshot with html2canvas, which was last
   * released before CSS Color 4 and cannot parse `color-mix(in oklab, …)`.
   * Tailwind v4 compiles every opacity utility — `bg-white/45`, `ring-white/60`
   * — to exactly that, so the PDF export threw on the first colour it met
   * rather than producing a file.
   *
   * html2canvas-pro is the maintained fork of the same library, same API,
   * with the modern colour functions understood. Aliased rather than adopted
   * outright because react-to-pdf asks for `html2canvas` by name: this hands
   * it the fork without forking react-to-pdf itself.
   */
  vite: () => ({
    resolve: {
      alias: {
        html2canvas: 'html2canvas-pro',
      },
    },
  }),
  manifest: () => ({
    /*
     * Set here rather than left to package.json, which would install this as
     * "finn-lens" — the npm package name, not the product's.
     */
    name: "Finn Lens",
    /*
     * The beta FINN's team is trying. Chrome shows this beside the version
     * (0.9.1, from package.json) in chrome://extensions; the UI says "Beta"
     * where the reader sees Lens's name.
     */
    version_name: "0.9.1 beta",
    description:
      "Choose between FINN car subscriptions by chatting with Lens. Tell it what you need, and it judges the cars on finn.com and explains its pick.",
    host_permissions: ["https://www.finn.com/*"],
    permissions: [
      "tabs",
      "activeTab",
      "storage",
    ],
    web_accessible_resources: [
      {
        /*
         * The panel's stylesheet is fetched by the content script and put
         * inside a shadow root, so it has to be reachable as a resource.
         *
         * The fonts come with it. That stylesheet's `@font-face` rules point
         * at `/fonts/…`, and a font pulled in by an extension stylesheet that
         * is applying to finn.com is being loaded into that page — so without
         * this the request is blocked there and the panel alone falls back to
         * system sans while every extension page renders in Inter.
         *
         * The icon is here for the same reason. The fit badge, the launcher
         * and the panel header all carry Lens's mark so a reader can tell
         * whose opinion they are reading while standing on FINN's page, and
         * an <img> pointing at an extension resource from inside that page is
         * blocked unless the file is listed.
         */
        resources: [
          "network-interceptor.js",
          "content-scripts/content.css",
          "fonts/*",
          "icon/*",
          /*
           * Ask Lens: the chat is an extension page framed into finn.com, so
           * the page and the script and style chunks it loads have to be
           * reachable from there. Only on finn.com. The page runs on
           * the extension's origin, so finn.com can frame it but can't read
           * into it, or into the storage holding the reader's chats.
           */
          "lens-chat.html",
          "lens-drawer.html",
          "chunks/*",
          "assets/*",
        ],
        matches: ["https://www.finn.com/*"]
      }
    ]
  })
});
