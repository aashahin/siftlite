import { SearchError } from "../errors/search-error.js";
import type { TextQuery } from "../ast/text-query.js";
import { getPortableNormalizer } from "./registry.js";
import type { SqlExpression } from "./types.js";

export function normalizeIndexText(input: string, profiles: readonly string[]): string {
  let output = input;
  for (const id of profiles) {
    output = getPortableNormalizer(id).normalize(output);
  }
  return output;
}

export function compileIndexNormalizationSql(
  inputExpression: SqlExpression,
  profiles: readonly string[],
): SqlExpression {
  let current = inputExpression;
  for (const id of profiles) {
    current = getPortableNormalizer(id).compileSql(current);
  }
  return current;
}

export function normalizeTextQuery(query: TextQuery, profiles: readonly string[]): TextQuery {
  if (profiles.length === 0) {
    return query;
  }
  switch (query.kind) {
    case "empty":
      return query;
    case "term":
      return {
        kind: "term",
        value: normalizeIndexText(query.value, profiles),
        ...(query.field !== undefined ? { field: query.field } : {}),
        ...(query.prefix === true ? { prefix: true } : {}),
      };
    case "phrase":
      return {
        kind: "phrase",
        terms: query.terms.map((term) => normalizeIndexText(term, profiles)),
        ...(query.field !== undefined ? { field: query.field } : {}),
      };
    case "and":
    case "or":
      return {
        kind: query.kind,
        children: query.children.map((child) => normalizeTextQuery(child, profiles)),
      };
  }
}

/**
 * Apply the index profile to synonym keys and values before expansion.
 * NFC/lowercase matching remains the synonym map's lookup rule.
 */
export function normalizeSynonymCatalog(
  synonyms: Readonly<Record<string, readonly string[]>>,
  profiles: readonly string[],
): Readonly<Record<string, readonly string[]>> {
  if (profiles.length === 0) {
    return synonyms;
  }
  const next: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(synonyms)) {
    const normalizedKey = normalizeIndexText(key, profiles);
    if (normalizedKey.length === 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "synonym keys must be non-empty after index normalization",
        details: { reason: "empty-synonym-key" },
      });
    }
    const existing = next[normalizedKey] ?? [];
    for (const value of values) {
      const normalizedValue = normalizeIndexText(value, profiles);
      if (normalizedValue.length === 0) {
        throw new SearchError({
          code: "SEARCH_CONFIG_INVALID",
          message: "synonym values must be non-empty after index normalization",
          details: { reason: "empty-synonym-value" },
        });
      }
      existing.push(normalizedValue);
    }
    next[normalizedKey] = existing;
  }
  return next;
}
