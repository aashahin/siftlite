import { definePortableNormalizer } from "./define.js";

/**
 * Optional Arabic-Indic digit folding. Not part of `arabic-basic`.
 *
 * Maps U+0660–U+0669 only. Extended Persian/Urdu digits (U+06F0–U+06F9) are
 * intentionally unchanged until an accepted ADR adds them.
 */
export const NUMERIC_ARABIC_REPLACEMENTS = [
  ["\u0660", "0"],
  ["\u0661", "1"],
  ["\u0662", "2"],
  ["\u0663", "3"],
  ["\u0664", "4"],
  ["\u0665", "5"],
  ["\u0666", "6"],
  ["\u0667", "7"],
  ["\u0668", "8"],
  ["\u0669", "9"],
] as const;

export const numericArabic = definePortableNormalizer({
  id: "numeric-arabic",
  replacements: NUMERIC_ARABIC_REPLACEMENTS,
  linkedMode: true,
});
