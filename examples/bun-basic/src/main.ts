import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

/**
 * Minimal Phase 0 example.
 *
 * The intended application API is:
 *
 *   const result = await products.search("ايفون برو", {
 *     filter: and(eq("status", "active"), lte("price", 50_000)),
 *     facets: ["brand", "category"],
 *     limit: 20,
 *   });
 *
 * That API is implemented in later phases. This example only proves the
 * workspace can resolve `@siftlite/core`.
 */
console.log(`${SIFTLITE_CORE_PACKAGE.name}@${SIFTLITE_CORE_PACKAGE.version}`);
