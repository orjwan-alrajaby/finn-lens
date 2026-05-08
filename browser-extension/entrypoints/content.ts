export default defineContentScript({
  matches: ["https://www.finn.com/*"],
  main() {
    console.info('Hello from content.ts script!');
  },
});
