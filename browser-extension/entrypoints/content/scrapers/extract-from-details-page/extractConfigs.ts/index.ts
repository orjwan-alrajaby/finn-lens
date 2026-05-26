import { normalizeString, parseEuroPrice } from "../../../utils";

function extractText(el?: Element | null) {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? null;
}

function extractNumber(value?: string | null) {
  if (!value) return null;

  const match = value.match(/[\d,.]+/);

  if (!match) return null;

  return Number(match[0].replace(",", "."));
}

function extractConsumptionData(specs: string[]) {
  const consumption = specs.find((s) =>
    s.toLowerCase().includes("kraftstoffverbrauch")
  );

  const emissions = specs.find((s) =>
    s.toLowerCase().includes("co2-emission")
  );

  const co2Class = specs.find((s) =>
    s.toLowerCase().includes("co2-klasse")
  );

  return {
    consumption:
      extractNumber(consumption?.match(/([\d,.]+)\s*l\/100km/i)?.[1]) ?? null,

    emissions:
      extractNumber(emissions?.match(/([\d,.]+)\s*g\/km/i)?.[1]) ?? null,

    co2Class:
      co2Class?.split(":")?.[1]?.trim() ?? null,
  };
}

function extractColors(card: Element) {
  const colorNodes = card.querySelectorAll("[title]");

  const colors = [...colorNodes]
    .map((node) => node.getAttribute("title")?.trim())
    .filter(Boolean)
    .filter((title) => {
      const lower = title!.toLowerCase();

      return (
        !lower.includes("vergleichen") &&
        !lower.includes("kamera") &&
        !lower.includes("konfigurieren")
      );
    });

  return [...new Set(colors)];
}

function extractTags(card: Element) {
  const tags = [...card.querySelectorAll("div")]
    .map((el) => extractText(el))
    .filter(Boolean)
    .filter((text) => {
      const lower = text!.toLowerCase();

      return (
        lower.includes("schnell verfügbar") ||
        lower.includes("top preis") ||
        lower.includes("flexibel bei der farbe")
      );
    });

  return [...new Set(tags)];
}

function extractDeliveryEstimate(card: Element) {
  const allDivs = [...card.querySelectorAll("div")];

  const delivery = allDivs.find((div) =>
    div.textContent?.includes("Vsl. Übergabe")
  );

  return extractText(delivery);
}

export function extractConfigFromNode(node: Element, index: number) {
  const title =
    extractText(node.querySelector(".body-16-semibold")) ??
    `Unknown Config ${index}`;

  const image =
    node.querySelector("img[alt]")?.getAttribute("src") ?? null;

  const infoItems = [
    ...node.querySelectorAll(".body-14-regular"),
  ].map((el) => extractText(el));

  const fuelType = infoItems.find(
    (item) =>
      item &&
      !item.includes("kW") &&
      !item.includes("PS") &&
      !item.toLowerCase().includes("automatik") &&
      !item.toLowerCase().includes("manuell")
  );

  const power = infoItems.find(
    (item) => item?.includes("kW") || item?.includes("PS")
  );

  const transmission = infoItems.find(
    (item) =>
      item?.toLowerCase().includes("automatik") ||
      item?.toLowerCase().includes("manuell")
  );

  const allPrices = [
    ...node.querySelectorAll(".global-t5-semibold span"),
  ]
    .map((el) => extractText(el))
    .filter(Boolean);

  const euroPrices = allPrices
    .map((price) => parseEuroPrice(price))
    .filter(Boolean);

  const oldPrice =
    euroPrices.length > 1 ? euroPrices[0] : null;

  const monthlyPrice =
    euroPrices.length > 1
      ? euroPrices[1]
      : euroPrices[0] ?? null;

  const specTexts = [
    ...node.querySelectorAll(".body-12-light"),
  ]
    .map((el) => extractText(el))
    .filter(Boolean) as string[];

  const environmentalData =
    extractConsumptionData(specTexts);

  const badgeCount = extractNumber(
    extractText(
      node.querySelector(".absolute.right-4.bottom-2 span")
    )
  );

  return {
    id:
      node.getAttribute("id") ??
      `config-${index}`,

    title,
    normalizedTitle: normalizeString(title),

    image,

    fuelType,
    power,
    transmission,

    monthlyPrice,
    oldPrice,

    discountPercentage:
      oldPrice && monthlyPrice
        ? Math.round(
            ((oldPrice - monthlyPrice) / oldPrice) * 100
          )
        : null,

    deliveryEstimate:
      extractDeliveryEstimate(node),

    tags: extractTags(node),

    colors: extractColors(node),

    imageCount: badgeCount,

    environmentalData,

    rawSpecs: specTexts,
  };
}

export function extractConfigs() {
  const configNodes = document.querySelectorAll(
    "[id^='product-']"
  );

  return [...configNodes].map((node, index) =>
    extractConfigFromNode(node, index)
  );
}

export async function getAvailableConfigs(root: Element) {
    const sections = root.querySelectorAll("div.container");

    const configContainer = Array.from(sections).find((section) =>
        section.querySelector("#group-comparison")
    );

    if (!configContainer) return null;

    const tabGroup = configContainer.querySelector('div[role="group"]');

    if (!tabGroup) return null;

    const tabs = tabGroup.querySelectorAll<HTMLButtonElement>("button");

    const privateCustomerWithVAT = tabs[0];
    const businessCustomerWithoutVAT = tabs[1];

    async function scrapeCurrentConfigs() {
      const configGrid = configContainer?.querySelector(
          'div[data-testid="group-comparison"]'
      );

      if (!configGrid) return [];

      const configCards = Array.from(configGrid.children);

      return configCards.map((card, index) =>
          extractConfigFromNode(card, index)
      );
    }

    // scrape private customer configs first
    const privateCustomerConfigs = await scrapeCurrentConfigs();

    // click business tab
    if (
        businessCustomerWithoutVAT &&
        businessCustomerWithoutVAT.getAttribute("data-state") !== "on"
    ) {
        businessCustomerWithoutVAT.dispatchEvent(
            new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
            })
        );

      await new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          if (businessCustomerWithoutVAT.dataset.state === "on") {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(tabGroup, {
          attributes: true,
          subtree: true,
          attributeFilter: ["data-state"]
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(); // safety fallback
        }, 3000);
      });
    }

    // scrape business configs after rerender
    const businessCustomerConfigs = await scrapeCurrentConfigs();

    return {
        tabs: {
            privateCustomerWithVAT:
                privateCustomerWithVAT?.textContent?.trim() ?? null,

            businessCustomerWithoutVAT:
                businessCustomerWithoutVAT?.textContent?.trim() ?? null,
        },

        privateCustomerConfigs,
        businessCustomerConfigs,
    };
}