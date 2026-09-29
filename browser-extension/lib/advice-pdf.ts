import type { Options } from "react-to-pdf";

/**
 * Taking the advice away as a file.
 *
 * A recommendation is a thing people argue about with somebody else — a
 * partner, a housemate, whoever is paying half of it — and until now the only
 * way to show it to them was to sit them in front of this browser profile.
 * The page is already the whole argument in order, so the export is a
 * photograph of it rather than a second, print-shaped rendering of the same
 * facts. Two renderings of one argument is how the two start disagreeing.
 *
 * What the file must not carry is the parts of the page that only mean
 * something while it is on screen: the buttons that change the answers, and
 * the picker that chooses which rival to examine. Those are marked
 * `finn-lens-screen-only` and dropped for the capture — see the rule in
 * assets/tailwind.css. Whichever rival was in the hot seat when the reader
 * pressed the button is kept, because that comparison is part of what they
 * are taking away; when nothing is in it, nothing is added.
 *
 * What it must carry is the links. The capture is a photograph, so every
 * anchor in it — "View this car on FINN", first among them — arrives as
 * pixels of a button that cannot be pressed. A file whose whole purpose is
 * to be sent to somebody else should not be the one copy of this argument
 * with no way back to the cars. So the anchors are measured on the page and
 * re-added to the document as link annotations, which is a thing PDF has
 * and an image does not.
 */

/** px per mm at 96dpi, which is the number react-to-pdf lays pages out with. */
const MM_TO_PX = 3.77952755906;

/** The margin the capture is placed inside, in mm, on every edge. */
export const PDF_MARGIN_MM = 8;

/** One anchor, measured against the top-left of the captured element. */
export interface LinkRect {
  url: string;
  /** CSS pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where that anchor lands once the capture has been cut into pages. */
export interface LinkPlacement {
  /** 1-based, the way jsPDF counts. */
  page: number;
  /** Millimetres, from the top-left of the sheet. */
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
}

export interface CaptureGeometry {
  /** The captured element's own width, in CSS pixels. */
  elementWidth: number;
  /** The sheet, in mm. */
  pageWidth: number;
  pageHeight: number;
  margin: number;
}

/**
 * Only what a PDF reader can actually follow.
 *
 * In-page anchors and `javascript:` are meaningless in a file, and an empty
 * href resolves to the document it came from — which in a PDF is nowhere at
 * all. A zero-sized rect is an anchor that was hidden for the capture, so
 * there is nothing on the sheet to put a hotspot over.
 */
function worthLinking(link: LinkRect): boolean {
  return (
    link.width > 0 &&
    link.height > 0 &&
    /^https?:\/\//i.test(link.url)
  );
}

/**
 * Turning positions on a long page into positions on numbered sheets.
 *
 * This mirrors the arithmetic react-to-pdf does to place the image, and has
 * to keep mirroring it: the capture is scaled to fit the page width, and the
 * scaling decides both how many pixels of the page fit on a sheet and how
 * many millimetres a pixel is worth. Getting it wrong doesn't fail loudly —
 * it puts an invisible hotspot slightly to the left of a button.
 *
 * A link that lies across a page break is placed twice, once on each sheet,
 * clipped to it. The alternative is choosing a sheet for it and leaving half
 * the button dead, which is the kind of thing nobody reports and everybody
 * notices.
 */
export function placeLinks(
  links: LinkRect[],
  geometry: CaptureGeometry,
): LinkPlacement[] {
  const { elementWidth, pageWidth, pageHeight, margin } = geometry;

  const availableWidth = (pageWidth - margin * 2) * MM_TO_PX;
  const availableHeight = (pageHeight - margin * 2) * MM_TO_PX;

  if (availableWidth <= 0 || availableHeight <= 0) return [];

  /*
   * Wider than the sheet, so everything is scaled down to fit — the same
   * decision react-to-pdf makes, expressed the same way, because the two
   * have to agree to the pixel.
   */
  const fit =
    elementWidth > availableWidth ? elementWidth / availableWidth : 1;

  const toMm = (px: number) => px / (MM_TO_PX * fit);

  /** How much of the page, in its own pixels, one sheet holds. */
  const sheet = availableHeight * fit;

  const placements: LinkPlacement[] = [];

  for (const link of links.filter(worthLinking)) {
    const first = Math.floor(link.y / sheet) + 1;
    const last = Math.floor((link.y + link.height - 0.001) / sheet) + 1;

    for (let page = first; page <= last; page += 1) {
      const top = Math.max(link.y, (page - 1) * sheet);
      const bottom = Math.min(link.y + link.height, page * sheet);

      if (bottom <= top) continue;

      placements.push({
        page,
        x: margin + toMm(link.x),
        y: margin + toMm(top - (page - 1) * sheet),
        width: toMm(link.width),
        height: toMm(bottom - top),
        url: link.url,
      });
    }
  }

  return placements;
}

/** Everything a filename may contain, once the car's name has been through it. */
const UNSAFE = /[^a-z0-9]+/g;

/**
 * `finn-lens-advice-byd-dolphin-2026-09-05.pdf`.
 *
 * The car and the date, because the two questions anyone asks of a file like
 * this months later are which car it was about and when it was true. Dates
 * are ISO so a folder of them sorts itself.
 */
export function adviceFileName(carName: string, on: Date = new Date()): string {
  return fileName("finn-lens-advice", carName, on);
}

/**
 * The comparison's own file, named for both cars.
 *
 * The recommendation and the challenge export separately — one document that
 * held both argued for a car and then against it, and a reader sending it on
 * could not say which half was the answer. Two files only help if their names
 * say which is which, so this one carries "challenge" and both cars rather
 * than sharing the advice prefix and sorting next to it by date.
 */
export function challengeFileName(
  challengerName: string,
  winnerName: string,
  on: Date = new Date(),
): string {
  return fileName(
    "finn-lens-challenge",
    `${challengerName} vs ${winnerName}`,
    on,
  );
}

function fileName(prefix: string, subject: string, on: Date): string {
  const slug = subject.toLowerCase().replace(UNSAFE, "-").replace(/^-|-$/g, "");
  const day = [
    on.getFullYear(),
    `${on.getMonth() + 1}`.padStart(2, "0"),
    `${on.getDate()}`.padStart(2, "0"),
  ].join("-");

  return [prefix, slug, day].filter(Boolean).join("-") + ".pdf";
}

/**
 * How the capture is taken.
 *
 * A4 portrait with a small margin, and the page split across as many sheets
 * as it needs — the advice runs to a couple of thousand pixels and refusing
 * to paginate would either crop the argument or shrink it past reading.
 *
 * `useCORS` is what lets the car's photograph through: it comes from FINN's
 * own CDN, and without it html2canvas silently leaves a hole where the car
 * was. If the CDN declines, the rest of the page still exports — the photo
 * is the one thing in here the reader can get elsewhere.
 *
 * JPEG rather than PNG, at a resolution of 2. The page is mostly flat colour
 * and text, where the difference is invisible, and a PNG of six A4 pages at
 * this size runs to tens of megabytes.
 */
export function advicePdfOptions(filename: string): Options {
  return {
    filename,
    /*
     * Built rather than saved, so the document can be handed back with the
     * link annotations still to be added to it. Saving is the caller's last
     * step.
     */
    method: "build",
    resolution: 2,
    page: {
      format: "a4",
      orientation: "portrait",
      margin: PDF_MARGIN_MM,
    },
    canvas: { mimeType: "image/jpeg", qualityRatio: 0.92, useCORS: true },
    overrides: {
      canvas: {
        useCORS: true,
        /* The page's own ground, so margins don't come out black. */
        backgroundColor: "#ffffff",
        /* Long enough for a CDN image, short enough not to hang the button. */
        imageTimeout: 6000,
        logging: false,
      },
    },
  };
}
