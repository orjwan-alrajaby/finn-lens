import { describe, expect, it } from "vitest";

import { germanToEnglish } from "./translate";

/**
 * The fuel names FINN actually sends.
 *
 * `FinnApiConfig.fuel` is a closed union of four, and a value this map misses
 * becomes `undefined` on the normalised car rather than failing loudly — which
 * is how diesel spent this long being priced as petrol.
 */
describe("fuel", () => {
  it("maps every fuel the API declares", () => {
    expect(germanToEnglish.Benzin).toBe("Petrol");
    expect(germanToEnglish.Diesel).toBe("Diesel");
    expect(germanToEnglish.Elektro).toBe("Electric");
    expect(germanToEnglish["Plug-in Hybrid"]).toBe("Plug-in Hybrid");
  });

  it("accepts the other spellings of a plug-in hybrid", () => {
    for (const written of ["Plug-In-Hybrid", "Plug-in-Hybrid"]) {
      expect(germanToEnglish[written]).toBe("Plug-in Hybrid");
    }
  });
});
