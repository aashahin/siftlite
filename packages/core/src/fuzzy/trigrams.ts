import { codePoints } from "../parser/unicode.js";

/** Contiguous 3-code-point grams. Tokens shorter than 3 yield no grams. */
export function codePointTrigrams(value: string): readonly string[] {
  const points = [...codePoints(value)];
  if (points.length < 3) {
    return [];
  }
  const grams = new Set<string>();
  for (let index = 0; index <= points.length - 3; index += 1) {
    grams.add(points.slice(index, index + 3).join(""));
  }
  return [...grams];
}
