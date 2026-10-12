import { describe, expect, it } from "vitest";

import { finnSlug, readFinnSearch, searchQuery, vocabularyFrom } from "./finn-search";

/**
 * Each expectation here is FINN's own reading of the same address: the query
 * its listing wrote onto the model-card link it drew for that search, copied
 * from finn.com on 23 September 2026.
 */

const vocabulary = vocabularyFrom({
    brands: [{ id: "Kia" }, { id: "Fiat" }, { id: "BMW" }, { id: "Mercedes-Benz" }, { id: "Audi" }, { id: "MG" }],
    models: ["3er Limousine", "2er Active Tourer", "Grande Panda", "iX1", "Cyberster"],
    cartypes: ["SUV", "Cabriolet", "Klein- und Kompaktwagen"],
    fuels: ["Elektro", "Benzin"],
    gearshifts: ["Automatik", "Manuell"],
    terms: [6, 12],
    product_group: ["earlybooking", "MILAGEDEAL"],
});

const TODAY = new Date("2026-09-23T10:00:00Z");

describe("reading finn.com's addresses the way FINN does", () => {
    it("reads brands and models from the first segment", () => {
        const search = readFinnSearch(
            "https://www.finn.com/de-DE/subscribe/kia.fiat.bmw.mercedes-benz.audi_3er-limousine_2er-active-tourer_grande-panda",
            vocabulary,
            TODAY,
        )!;

        /* FINN's link: brands=Kia,Fiat,BMW,Mercedes-Benz,Audi&models=3er Limousine,2er Active Tourer,Grande Panda */
        expect(search.brands).toEqual(["Kia", "Fiat", "BMW", "Mercedes-Benz", "Audi"]);
        expect(search.models).toEqual(["3er Limousine", "2er Active Tourer", "Grande Panda"]);
    });

    it("reads a brand segment, switches and query filters together", () => {
        const search = readFinnSearch(
            "https://www.finn.com/de-DE/subscribe/mg/cabriolet_automatik_elektro_14-days?colors=Grau,Silber,Anthrazitgrau,Hellgrau,Mittelgrau,Dunkelgrau&doors=2&features=automatic_parking&mileage_package=500&seats=2",
            vocabulary,
            TODAY,
        )!;

        /* FINN's link: available_to=2026-10-07&brands=MG&cartypes=Cabriolet&…&fuels=Elektro&gearshifts=Automatik&mileage_package=500&seats=2 */
        expect(search.brands).toEqual(["MG"]);
        expect(search.cartypes).toEqual(["Cabriolet"]);
        expect(search.gearshifts).toEqual(["Automatik"]);
        expect(search.fuels).toEqual(["Elektro"]);
        expect(search.availableTo).toBe("2026-10-07");
        expect(search.colors).toHaveLength(6);
        expect(search.doors).toEqual([2]);
        expect(search.seats).toEqual([2]);
        expect(search.features).toEqual(["automatic_parking"]);
        expect(search.mileagePackage).toBe(500);
    });

    it("reads contract length, offers, features and a price range", () => {
        const search = readFinnSearch(
            "https://www.finn.com/de-DE/subscribe/suv_elektro_6-monate_earlybooking?features=hitch,automatic_parking&max_price=950&mileage_package=1500&min_price=770",
            vocabulary,
            TODAY,
        )!;

        /* FINN's link: cartypes=SUV&features=hitch,automatic_parking&fuels=Elektro&max_price=950&mileage_package=1500&min_price=770&product_group=earlybooking&terms=6 */
        expect(search.cartypes).toEqual(["SUV"]);
        expect(search.fuels).toEqual(["Elektro"]);
        expect(search.terms).toEqual([6]);
        expect(search.productGroups).toEqual(["earlybooking"]);
        expect(search.features).toEqual(["hitch", "automatic_parking"]);
        expect(search.minPrice).toBe(770);
        expect(search.maxPrice).toBe(950);
        expect(search.mileagePackage).toBe(1500);
    });

    it("reads the same search off a car page, where FINN writes it in its API form", () => {
        const search = readFinnSearch(
            "https://www.finn.com/de-DE/models/bmw/ix1?cartypes=SUV&features=hitch,automatic_parking&fuels=Elektro&max_price=950&mileage_package=1500&min_price=770&product_group=earlybooking&terms=6",
            vocabulary,
            TODAY,
        )!;

        expect(search.cartypes).toEqual(["SUV"]);
        expect(search.fuels).toEqual(["Elektro"]);
        expect(search.terms).toEqual([6]);
        expect(search.features).toEqual(["hitch", "automatic_parking"]);
        expect(search.maxPrice).toBe(950);
    });

    it("never reads a brand or model out of the second segment", () => {
        /* "mg" as a second-segment token would otherwise add a brand nobody chose. */
        const search = readFinnSearch("https://www.finn.com/de-DE/subscribe/bmw/suv_mg", vocabulary, TODAY)!;

        expect(search.brands).toEqual(["BMW"]);
        expect(search.cartypes).toEqual(["SUV"]);
    });

    it("has nothing to say about an unfiltered listing, or a page that isn't one", () => {
        expect(readFinnSearch("https://www.finn.com/de-DE/subscribe", vocabulary, TODAY)).toBeNull();
        expect(readFinnSearch("https://www.finn.com/de-DE", vocabulary, TODAY)).toBeNull();
        expect(readFinnSearch("https://www.finn.com/de-DE/models/bmw/ix1?selected_config=41553", vocabulary, TODAY)).toBeNull();
    });

    it("reads English contract lengths too", () => {
        expect(readFinnSearch("https://www.finn.com/en-US/subscribe/12-months", vocabulary, TODAY)!.terms).toEqual([12]);
    });

    it("slugs values the way FINN does", () => {
        expect(finnSlug("3er Limousine")).toBe("3er-limousine");
        expect(finnSlug("Klein- und Kompaktwagen")).toBe("klein--und-kompaktwagen");
        expect(finnSlug("Coupé")).toBe("coupe");
        expect(finnSlug("Mercedes-Benz")).toBe("mercedes-benz");
    });
});

describe("asking FINN for exactly these cars", () => {
    it("repeats list keys and prices the way the page does", () => {
        const search = readFinnSearch(
            "https://www.finn.com/de-DE/subscribe/suv_elektro_6-monate?features=hitch,automatic_parking&max_price=950",
            vocabulary,
            TODAY,
        )!;
        const query = new URLSearchParams(searchQuery(search));

        expect(query.getAll("features")).toEqual(["hitch", "automatic_parking"]);
        expect(query.get("cartypes")).toBe("SUV");
        expect(query.get("terms")).toBe("6");
        expect(query.get("max_price")).toBe("950");
        expect(query.get("pricing_type")).toBe("downpayment");
    });
});
