export default defineBackground(() => {
  console.info('Hello from background.ts script!', { id: browser.runtime.id });
});
