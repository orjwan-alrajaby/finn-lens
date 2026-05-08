export default defineContentScript({
  matches: ["*://*.finn.com/*"],
  main() {
    console.info('Hello from content.ts script!');
  },
});
