import { normalizeString } from "../../utils";

export default function extractCarDescription(root: Element) {
  const normalizedCarName = normalizeString(
    root.querySelector("h1")?.textContent
  );

  if (!normalizedCarName) {
    return { description: null };
  }

  const titleEl = [...root.querySelectorAll("h2")].find((el) => {
    const heading = normalizeString(el.textContent);

    return (
      heading.includes(normalizedCarName) ||
      normalizedCarName.includes(heading)
    );
  });

  if (!titleEl) {
    return { description: null };
  }

  let sibling = titleEl.nextElementSibling;

  while (sibling && sibling.tagName !== "P") {
    sibling = sibling.nextElementSibling;
  }

  return {
    description: sibling?.textContent?.trim() ?? null,
  };
}