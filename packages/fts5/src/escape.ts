/**
 * Escape a user term as an FTS5 string literal. The result is later bound as a
 * single MATCH parameter; it is never concatenated as raw grammar.
 */
export function escapeFts5Literal(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function emitFts5Term(value: string, prefix = false): string {
  const literal = escapeFts5Literal(value);
  return prefix ? `${literal}*` : literal;
}

export function emitFts5Phrase(terms: readonly string[]): string {
  return escapeFts5Literal(terms.join(" "));
}
