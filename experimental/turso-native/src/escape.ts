/** Tantivy/Turso-native literal escaping. Do not reuse FTS5 escaping. */
export function escapeTursoLiteral(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function emitTursoTerm(value: string, prefix = false): string {
  const literal = escapeTursoLiteral(value);
  return prefix ? `${literal}*` : literal;
}

export function emitTursoPhrase(terms: readonly string[]): string {
  return escapeTursoLiteral(terms.join(" "));
}
