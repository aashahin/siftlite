import { definePortableNormalizer } from "./define.js";

/**
 * Conservative `arabic-basic` replacements.
 *
 * Included:
 * - tatweel removal (U+0640);
 * - common harakat / tanween / shadda / sukun (U+064B–U+0652);
 * - superscript alef (U+0670);
 * - selected precomposed alef variants → bare alef;
 * - alef maqsura → yeh.
 *
 * Explicitly excluded (must stay unchanged):
 * - teh marbuta → heh (`ة` → `ه`);
 * - waw with hamza → waw (`ؤ` → `و`);
 * - yeh with hamza → yeh (`ئ` → `ي`);
 * - Arabic-Indic digit folding;
 * - presentation / compatibility forms;
 * - generic NFC/NFKC;
 * - Quranic annotation marks (U+06D6–U+06ED);
 * - combining hamza above/below (U+0654/U+0655).
 */
export const ARABIC_BASIC_REPLACEMENTS = [
  ["\u0640", ""], // tatweel
  ["\u064B", ""], // fathatan
  ["\u064C", ""], // dammatan
  ["\u064D", ""], // kasratan
  ["\u064E", ""], // fatha
  ["\u064F", ""], // damma
  ["\u0650", ""], // kasra
  ["\u0651", ""], // shadda
  ["\u0652", ""], // sukun
  ["\u0670", ""], // superscript alef
  ["\u0623", "\u0627"], // alef with hamza above
  ["\u0625", "\u0627"], // alef with hamza below
  ["\u0622", "\u0627"], // alef with madda above
  ["\u0671", "\u0627"], // alef wasla
  ["\u0649", "\u064A"], // alef maqsura → yeh
] as const;

export const arabicBasic = definePortableNormalizer({
  id: "arabic-basic",
  replacements: ARABIC_BASIC_REPLACEMENTS,
  linkedMode: true,
});
