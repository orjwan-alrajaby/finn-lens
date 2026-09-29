import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

import { Spinner } from "@/components/Spinner";

import {
    advicePdfOptions,
    PDF_MARGIN_MM,
    placeLinks,
    type LinkRect,
} from "@/lib/advice-pdf";

/**
 * Saving the winner's argument as a file.
 *
 * A recommendation is something people argue about with somebody else — a
 * partner, whoever is paying half of it — so it has to be able to leave this
 * browser. The capture is taken in an effect rather than in the click, so it
 * happens *after* React has drawn the print copy; and the library is only
 * loaded then, since it is larger than the rest of the drawer.
 */
export function usePdfExport(fileName: string | null) {
    const printable = useRef<HTMLDivElement>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (!exporting || !fileName) return;

        let alive = true;

        void (async () => {
            try {
                const { default: generatePDF } = await import("react-to-pdf");

                const pdf = await generatePDF(
                    printable,
                    advicePdfOptions(fileName),
                );

                if (!pdf) return;

                addLinks(pdf, printable.current);

                await pdf.save(fileName, { returnPromise: true });
            } catch (error) {
                console.error("Finn Lens: could not export the PDF", error);
            } finally {
                if (alive) setExporting(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [exporting, fileName]);

    return { printable, exporting, start: () => setExporting(true) };
}

export function ExportButton({ exporting, onExport }: { exporting: boolean; onExport: () => void }) {
    return (
        <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-finn-cotton px-4 text-[12.5px] font-black text-finn-black transition-colors hover:bg-finn-pale-blue hover:text-finn-accent-blue disabled:cursor-wait disabled:text-finn-iron"
        >
            {exporting ? (
                <>
                    <Spinner className="h-4 w-4" />
                    Building your PDF…
                </>
            ) : (
                <>
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Save as PDF
                </>
            )}
        </button>
    );
}

/** Only the parts of jsPDF this file touches. */
interface PdfInternals {
    pageSize: { width: number; height: number };
}

type LinkTarget = (
    x: number,
    y: number,
    width: number,
    height: number,
    options: { url: string },
) => void;

/**
 * Re-attaching the page's links to the picture of the page.
 *
 * html2canvas produces pixels, so every anchor in the capture arrives as a
 * button that cannot be pressed. PDF carries link annotations separately from
 * what is drawn, which means the hotspots can simply be laid back over the
 * image where the anchors were.
 *
 * Measured after the capture, while the page is still in its export state:
 * anything hidden for the file reports a zero-sized rect and is dropped on
 * that basis rather than by knowing which elements were hidden and why.
 */
function addLinks(
    pdf: {
        setPage: (page: number) => void;
        link: LinkTarget;
        internal: PdfInternals;
    },
    element: HTMLElement | null,
): void {
    if (!element) return;

    const base = element.getBoundingClientRect();

    const links: LinkRect[] = [
        ...element.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ].map((anchor) => {
        const rect = anchor.getBoundingClientRect();

        return {
            /* `.href` rather than the attribute: already absolute. */
            url: anchor.href,
            x: rect.left - base.left,
            y: rect.top - base.top,
            width: rect.width,
            height: rect.height,
        };
    });

    const placements = placeLinks(links, {
        elementWidth: base.width,
        pageWidth: pdf.internal.pageSize.width,
        pageHeight: pdf.internal.pageSize.height,
        margin: PDF_MARGIN_MM,
    });

    for (const placement of placements) {
        pdf.setPage(placement.page);
        pdf.link(placement.x, placement.y, placement.width, placement.height, {
            url: placement.url,
        });
    }
}
