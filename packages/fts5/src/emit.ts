import { SearchError, type IndexDefinition, type TextQuery } from "@siftlite/core";
import { emitFts5Phrase, emitFts5Term } from "./escape.js";

export function emitFts5Match(
  query: TextQuery,
  searchable?: Pick<IndexDefinition, "searchableOrder"> | readonly string[],
): string | undefined {
  if (query.kind === "empty") {
    return undefined;
  }
  return emitNode(query, searchableFields(searchable));
}

function emitNode(query: TextQuery, searchable: ReadonlySet<string> | undefined): string {
  switch (query.kind) {
    case "empty":
      throw new SearchError({
        code: "SEARCH_QUERY_INVALID",
        message: "empty query cannot emit MATCH grammar",
        details: { reason: "empty-match" },
      });
    case "term":
      return emitFielded(query.field, emitFts5Term(query.value, query.prefix === true), searchable);
    case "phrase":
      return emitFielded(query.field, emitFts5Phrase(query.terms), searchable);
    case "and":
      return `(${query.children.map((child) => emitNode(child, searchable)).join(" AND ")})`;
    case "or":
      return `(${query.children.map((child) => emitNode(child, searchable)).join(" OR ")})`;
  }
}

const FTS5_FIELD_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function emitFielded(
  field: string | undefined,
  literal: string,
  searchable: ReadonlySet<string> | undefined,
): string {
  if (field === undefined) {
    return literal;
  }
  if (!FTS5_FIELD_IDENTIFIER.test(field)) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "field selector is not a valid FTS5 column identifier",
      details: { reason: "invalid-field-identifier" },
    });
  }
  if (searchable === undefined || !searchable.has(field)) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: `field ${field} is not declared searchable`,
      details: { reason: "undeclared-search-field" },
    });
  }
  return `${field}:${literal}`;
}

function searchableFields(
  searchable: Pick<IndexDefinition, "searchableOrder"> | readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (searchable === undefined) {
    return undefined;
  }
  if ("searchableOrder" in searchable) {
    return new Set(searchable.searchableOrder);
  }
  return new Set(searchable);
}
