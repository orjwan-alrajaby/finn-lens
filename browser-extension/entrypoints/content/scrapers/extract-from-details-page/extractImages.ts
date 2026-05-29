import { removeDuplicateImages } from "../utils";

export default function extractImages(root: Element) {
    const imageCarousel =
        root.querySelector(".slick-slider");

    const imageContainers =
        imageCarousel?.querySelectorAll(
            ".slick-slide"
        );

    if (!imageContainers?.length) {
        return [];
    }

    const extractedImages = Array.from(imageContainers)
        .map((container) => container.querySelector("img")?.src || "")
        .filter(Boolean);

    const images = removeDuplicateImages(extractedImages);

    return images;
}
