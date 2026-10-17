import { definePortableNormalizer } from "./define.js";

/**
 * Optional teh marbuta folding (`ة` → `ه`). Not part of `arabic-basic`.
 *
 * Everyday Arabic typing uses the two letters interchangeably at word end,
 * so a query for `شبة` should find `شبه` and the reverse.
 */
export const ARABIC_TEH_MARBUTA_REPLACEMENTS = [["ة", "ه"]] as const;

export const arabicTehMarbuta = definePortableNormalizer({
  id: "arabic-teh-marbuta",
  replacements: ARABIC_TEH_MARBUTA_REPLACEMENTS,
  linkedMode: true,
});
