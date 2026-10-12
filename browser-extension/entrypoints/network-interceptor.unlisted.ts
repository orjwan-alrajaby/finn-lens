/**
 * The half of Lens that has to run in finn.com's own world.
 *
 * A content script gets the page's DOM but not its JavaScript: it has its own
 * globals, so wrapping `fetch` or `history.pushState` there wraps a copy
 * nothing on the page ever calls. Both of the things below are FINN calling
 * its own functions, so both have to be wrapped here, in the page, and
 * reported back over `postMessage`.
 *
 * Nothing here reads or decides anything. It forwards two facts — FINN
 * fetched some cars, FINN moved to another page — and the content script does
 * the rest.
 */
export default defineUnlistedScript(() => {
  /*
   * One wrap per page. A second injection — the extension reloaded while a
   * finn.com tab is open — would otherwise wrap the wrapper, and every
   * navigation would be reported as many times as the script had run.
   */
  const flag = "__finnLensInterceptor";

  if ((window as unknown as Record<string, boolean>)[flag]) return;
  (window as unknown as Record<string, boolean>)[flag] = true;

  console.info("network interceptor is running...");

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      /* A `Request` stringifies as "[object Request]"; its URL is on `.url`. */
      const url =
        args[0] instanceof Request ? args[0].url : String(args[0]);

      if (url.includes("/api/cars")) {
        const json = await response.clone().json();

        window.postMessage({
          source: "finn-lens",
          type: "FINN_CARS_RESPONSE",
          payload: json,
          url,
        });
      }
    } catch (err) {
      console.error(err);
    }

    return response;
  };

  /*
   * FINN moves between cars without reloading, so a navigation is a
   * `pushState` call and nothing else — no load, no `popstate`. The content
   * script needs to hear about it to shut a panel that is still describing
   * the car the reader has just left, and to tell an open Ask Lens chat to
   * re-read the page.
   */
  const announce = () => {
    try {
      window.postMessage({
        source: "finn-lens",
        type: "FINN_NAVIGATED",
        url: location.href,
      });
    } catch (err) {
      console.error(err);
    }
  };

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);

    history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      announce();
    };
  }
});
