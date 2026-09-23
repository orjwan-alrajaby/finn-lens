import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Live evaluations: real conversations through the real model.
 *
 * Kept out of `npm test` on purpose — they need a Gemini key, spend its free
 * quota, and their output is read by a person rather than asserted on.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "node", include: ["evals/**/*.eval.ts"], testTimeout: 1_800_000 },
});
