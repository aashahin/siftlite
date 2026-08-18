import type { TextQuery } from "../ast/text-query.js";
import { SearchError } from "../errors/search-error.js";
import type { ApplicationLimits } from "../limits/application-limits.js";

export interface SynonymExpansionOptions {
  readonly limits: ApplicationLimits;
}

/**
 * One-level, index-local synonym expansion. Cycles are not walked recursively;
 * the original term is preserved first so exact matches keep ranking preference.
 */
export function expandTextQueryWithSynonyms(
  query: TextQuery,
  synonyms: Readonly<Record<string, readonly string[]>>,
  options: SynonymExpansionOptions,
): TextQuery {
  const map = buildSynonymMap(synonyms);
  let expanded = 0;

  const expand = (node: TextQuery): TextQuery => {
    switch (node.kind) {
      case "empty":
        return node;
      case "phrase":
        return node;
      case "and":
      case "or":
        return { kind: node.kind, children: node.children.map(expand) };
      case "term": {
        const alternatives = map.get(normalizeSynonymKey(node.value)) ?? [];
        const unique = dedupeAlternatives(node.value, alternatives);
        if (unique.length === 0) {
          return node;
        }
        expanded += unique.length;
        if (expanded > options.limits.maxSynonymExpansion) {
          throw new SearchError({
            code: "SEARCH_QUERY_LIMIT_EXCEEDED",
            message: "synonym expansion exceeds maxSynonymExpansion",
            details: { reason: "max-synonym-expansion", expanded },
          });
        }
        return {
          kind: "or",
          children: [node, ...unique.map((value) => termFromOriginal(node, value))],
        };
      }
    }
  };

  return expand(query);
}

export function normalizeSynonymKey(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

export function buildSynonymMap(
  synonyms: Readonly<Record<string, readonly string[]>>,
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const [rawKey, values] of Object.entries(synonyms)) {
    const key = normalizeSynonymKey(rawKey);
    if (key.length === 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "synonym keys must be non-empty after normalization",
        details: { reason: "empty-synonym-key" },
      });
    }
    const existing = map.get(key) ?? [];
    for (const value of values) {
      if (typeof value !== "string" || normalizeSynonymKey(value).length === 0) {
        throw new SearchError({
          code: "SEARCH_CONFIG_INVALID",
          message: "synonym values must be non-empty strings",
          details: { reason: "empty-synonym-value" },
        });
      }
      existing.push(value);
    }
    map.set(key, existing);
  }
  return map;
}

function dedupeAlternatives(original: string, alternatives: readonly string[]): string[] {
  const seen = new Set<string>([normalizeSynonymKey(original)]);
  const unique: string[] = [];
  for (const value of alternatives) {
    const key = normalizeSynonymKey(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function termFromOriginal(
  original: Extract<TextQuery, { kind: "term" }>,
  value: string,
): TextQuery {
  return {
    kind: "term",
    value,
    ...(original.prefix === true ? { prefix: true } : {}),
    ...(original.field !== undefined ? { field: original.field } : {}),
  };
}
