import type { FinnApiConfig } from "@/lib/types";
import type { PageContext } from "./page-context";

export type FinnCarsResponse = {
  offset: number;
  results: FinnApiConfig[];
  total_results: number;
};

type LoadCarsParams = PageContext & {
  anchorElement: HTMLElement;
  carConfigId: number;
};

async function finnFetch<T = any>(path: string): Promise<T> {
  const response = await fetch(`https://www.finn.com${path}`, {
    credentials: "include",
    headers: {
      "x-finn-actor": "ua_frontend",
      "x-language-tag": document.documentElement.lang || "de-DE",
    },
  });

  if (!response.ok) {
    throw new Error(`FINN API returned ${response.status}`);
  }

  return response.json();
}

/**
 * One page of FINN's configurations, ungrouped.
 *
 * `group_by=brand-model` — which every other call here uses — returns one
 * representative configuration per model, so most of the cards a listing
 * draws are missing from it. Without it the same endpoint lists the
 * configurations themselves, which is what a card's id refers to, and what
 * Lens has to hold to say anything about the car.
 */
export function loadCarPage(offset: number, limit = 200): Promise<FinnCarsResponse> {
  return finnFetch<FinnCarsResponse>(
    `/api/cars?hide_related=true&limit=${limit}&offset=${offset}&view=available_cars`,
  );
}

/**
 * Exactly one configuration, by the id the card carries. FINN takes a single
 * `config_id` per request — several ids in one call return nothing at all —
 * so this is for the few a page listing leaves behind, never for a whole page.
 */
export function loadCarByConfigId(configId: number): Promise<FinnCarsResponse> {
  return finnFetch<FinnCarsResponse>(
    `/api/cars?hide_related=true&limit=1&view=available_cars&config_id=${configId}`,
  );
}

export async function loadCarsFromFinnApi({
  isHomePage,
  isListingsPage,
  isDetailsPage,
  anchorElementIsAListItem,
  anchorElementIsAConfigCardItem,
  carConfigId,
}: LoadCarsParams): Promise<FinnCarsResponse> {
  const onDetailsPage = Boolean(isDetailsPage);

  if ((isHomePage || isListingsPage) && anchorElementIsAListItem) {
    return finnFetch<FinnCarsResponse>(
      "/api/cars?group_by=brand-model&hide_related=true&limit=20&pricing_type=downpayment&view=available_cars"
    );
  }

  // Swapping to a specific config from a list item shown on the details page.
  if (onDetailsPage && anchorElementIsAListItem) {
    return finnFetch<FinnCarsResponse>(
      `/api/cars?group_by=brand-model&hide_related=true&limit=20&pricing_type=downpayment&swap_config_id=${carConfigId}&view=available_cars`
    );
  }

  if (onDetailsPage && anchorElementIsAConfigCardItem) {
    // Config comparison cards only show trim/spec text, not the full car
    // name — so brand/model must come from the details page's own <h1>,
    // not from the card that was clicked.
    const title = isDetailsPage?.querySelector("h1")?.textContent?.trim() ?? "";
    if (!title) {
      throw new Error("Couldn't determine car name.");
    }

    const { brand, model } = splitBrandAndModel(title, window.location.pathname);

    return finnFetch<FinnCarsResponse>(
      `/api/cars?brands=${encodeURIComponent(brand)}&hide_related=true&limit=50&models=${encodeURIComponent(
        model
      )}&pricing_type=downpayment&view=available_cars`
    );
  }

  throw new Error("Couldn't determine which FINN API endpoint to call.");
}
/** Lowercased, with everything that isn't a letter or digit removed. */
const normalise = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Splits "BYD Dolphin Surf" into a brand and a model.
 *
 * The heading alone can't be split reliably: taking the first word gives
 * "Alfa" and "Romeo Tonale", and counting words in the URL slug instead gives
 * "Mercedes-Benz A-Klasse" as the brand, because that brand is two slug words
 * and one heading word. What does work is matching — a detail page lives at
 * `/de-DE/models/{brand}/{model}`, so the leading words of the heading whose
 * letters and digits equal the brand slug's are the brand, however either side
 * spells it.
 *
 * Falls back to the first word when the path doesn't say, which is what this
 * did before and is right for the great majority of brands.
 */
export function splitBrandAndModel(
  title: string,
  pathname: string
): { brand: string; model: string } {
  const words = title.split(/\s+/).filter(Boolean);
  const slug = /\/models\/([^/]+)\//.exec(pathname)?.[1];

  if (slug) {
    const target = normalise(slug);

    for (let count = 1; count < words.length; count++) {
      if (normalise(words.slice(0, count).join("")) === target) {
        return {
          brand: words.slice(0, count).join(" "),
          model: words.slice(count).join(" "),
        };
      }
    }
  }

  const [first, ...rest] = words;

  return { brand: first ?? "", model: rest.join(" ") };
}
