import { codePoints } from "../parser/unicode.js";

/** Damerau-Levenshtein distance over Unicode code points. */
export function damerauLevenshtein(left: string, right: string): number {
  const source = [...codePoints(left)];
  const target = [...codePoints(right)];
  const rows = source.length + 1;
  const cols = target.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let i = 0; i < rows; i += 1) {
    distances[i]![0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    distances[0]![j] = j;
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      const deletion = distances[i - 1]![j]! + 1;
      const insertion = distances[i]![j - 1]! + 1;
      const substitution = distances[i - 1]![j - 1]! + cost;
      let best = Math.min(deletion, insertion, substitution);
      if (
        i > 1 &&
        j > 1 &&
        source[i - 1] === target[j - 2] &&
        source[i - 2] === target[j - 1]
      ) {
        best = Math.min(best, distances[i - 2]![j - 2]! + 1);
      }
      distances[i]![j] = best;
    }
  }
  return distances[source.length]![target.length]!;
}

export function maxEditsForToken(codePointLength: number): number {
  if (codePointLength < 5) {
    return 0;
  }
  if (codePointLength < 9) {
    return 1;
  }
  return 2;
}
