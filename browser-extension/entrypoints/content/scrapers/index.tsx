import {
    normalizeString,
} from "../utils";
import { queryFirst } from "./dom";
import {
    extractDescription,
    extractStrengthsAndWeaknesses,
    extractImages,
    extractFinnAutoScores,
    extractPriceInfo as extractPriceInfoFromDetails,
    extractTechnicalSpecs,
    extractMotorAndDriveDetails,
    extractDesignDetails,
    extractSpaceAndTrunkDetails,
    extractEquipmentDetails,
} from "./extract-from-details-page";
import {
    extractPriceInfo as extractPriceInfoFromItem,
} from "./extract-from-listing-item";
import {
    getAvailableConfigs,
} from "./extract-from-details-page/extractConfigs.ts";
import { FINN_BASE_URL } from "@/constants"
import { CarType } from "@/types";

export function getCarInformationFromListingItem(
    node: Element
) {
    const linkEl = queryFirst(node, [
        "h3 a",
        "a[href*='/']",
    ]);

    const link =
        linkEl?.getAttribute("href");

    const img = queryFirst(node, [
        "img[alt]",
        "img",
    ]);

    const thumbnail =
        img?.getAttribute("src") ||
        img?.getAttribute("data-src") ||
        null;

    const price = extractPriceInfoFromItem(node);

    return {
        price,
        thumbnail,
        url: link
            ? new URL(
                link,
                location.origin
            ).href
            : null,
    };
}

export function extractCarsFromListingsPage() {
    const nodes = document.querySelectorAll(
        '[data-testid="product-card"]'
    );

    return Array.from(nodes).map((node) =>
        getCarInformationFromListingItem(node)
    );
}

async function fetchCarDocument(
    carUrl: string
) {
    const res = await fetch(
        `${FINN_BASE_URL}${carUrl}`
    );

    const html = await res.text();

    return new DOMParser().parseFromString(
        html,
        "text/html"
    );
}

export async function extractFullCarDetails(
    carUrl: string,
    currentCarCardElement: HTMLElement
): Promise<CarType> {
    const {
        thumbnail: mainImageUrl,
        price,
    } = getCarInformationFromListingItem(
        currentCarCardElement
    );

    const doc = await fetchCarDocument(
        carUrl
    );

    const result = await getCarInformationFromDetailsPage(doc)

    return {
        ...result,
        thumbnail: mainImageUrl || "",
        price,
    };
}

export async function getCarInformationFromDetailsPage(root?: Document | Element) {
    let body = null;

    // calling this function from outside the page
    if (root instanceof Document) {
        body = root?.querySelector(
            'div[data-appid="product-details"]'
        );
    } else {
        body = root;
    }

    if (!body) {
        return {};
    }

    const title =
        body
            .querySelector("h1")
            ?.textContent?.trim() ?? null;

    const { description } =
        extractDescription(body);

    const {
        strengths,
        weaknesses,
    } =
        extractStrengthsAndWeaknesses(
            body
        );

    const images =
        extractImages(body);

    const scores = extractFinnAutoScores(body);
    const technicalSpecs = extractTechnicalSpecs(body);
    const configs = await getAvailableConfigs(body);
    const motorDetails = extractMotorAndDriveDetails(body);
    const designDetails = extractDesignDetails(body);
    const spaceDetails = extractSpaceAndTrunkDetails(body);
    const equipmentDetails = extractEquipmentDetails(body);
    const price = extractPriceInfoFromDetails(body);

    return {
        id: `car-${normalizeString(title)}`,
        price,
        name: title,
        description,
        strengths,
        weaknesses,
        images,
        scores,
        technicalSpecs,
        configs,
        details: {
            motor: motorDetails,
            design: designDetails,
            space: spaceDetails,
            equipment: equipmentDetails
        }
    };
}