/**
 * Backend-neutral text-query AST.
 *
 * Ordinary search never includes a unary NOT node. Field selectors are not
 * produced by the portable parser; backends may attach them later from schema.
 */
export type TextQuery =
  | { readonly kind: "empty" }
  | {
      readonly kind: "term";
      readonly value: string;
      readonly field?: string;
      readonly prefix?: boolean;
    }
  | { readonly kind: "phrase"; readonly terms: readonly string[]; readonly field?: string }
  | { readonly kind: "and"; readonly children: readonly TextQuery[] }
  | { readonly kind: "or"; readonly children: readonly TextQuery[] };

export function isTextQuery(value: unknown): value is TextQuery {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    return false;
  }
  const kind = (value as { kind: unknown }).kind;
  return (
    kind === "empty" || kind === "term" || kind === "phrase" || kind === "and" || kind === "or"
  );
}

export function walkTextQuery(node: TextQuery, visit: (node: TextQuery) => void): void {
  visit(node);
  if (node.kind === "and" || node.kind === "or") {
    for (const child of node.children) {
      walkTextQuery(child, visit);
    }
  }
}

export function collectTextTerms(node: TextQuery): string[] {
  const terms: string[] = [];
  walkTextQuery(node, (current) => {
    if (current.kind === "term") {
      terms.push(current.value);
    }
    if (current.kind === "phrase") {
      terms.push(...current.terms);
    }
  });
  return terms;
}
