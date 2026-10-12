import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocateButton } from "./LocateButton";

describe("the button that finds a car on the page", () => {
    it("takes the winner's gold when it goes to the winner, and stays grey for any other car", () => {
        const winner = renderToStaticMarkup(createElement(LocateButton, { name: "Opel Astra", size: "sm", winner: true, onLocate: () => {} }));
        const other = renderToStaticMarkup(createElement(LocateButton, { name: "Dacia Bigster", size: "sm", onLocate: () => {} }));

        expect(winner).toContain("linear-gradient(135deg, #fff3c4 0%, #fcd34d 45%, #f59e0b 100%)");
        expect(winner).not.toContain("bg-finn-cotton");
        expect(other).toContain("bg-finn-cotton");
        expect(other).not.toContain("linear-gradient");
    });
});
