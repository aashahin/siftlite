import { SearchError, type TextQuery } from "@siftlite/core";
import { emitFts5Phrase, emitFts5Term } from "./escape.js";

export function emitFts5Match(query: TextQuery): string | undefined {
  if (query.kind === "empty") {
    return undefined;
  }
  return emitNode(query);
}

function emitNode(query: TextQuery): string {
  switch (query.kind) {
    case "empty":
      throw new SearchError({
        code: "SEARCH_QUERY_INVALID",
        message: "empty query cannot emit MATCH grammar",
        details: { reason: "empty-match" },
      });
    case "term":
      return emitFielded(query.field, emitFts5Term(query.value, query.prefix === true));
    case "phrase":
      return emitFielded(query.field, emitFts5Phrase(query.terms));
    case "and":
      return `(${query.children.map(emitNode).join(" AND ")})`;
    case "or":
      return `(${query.children.map(emitNode).join(" OR ")})`;
  }
}

const FTS5_FIELD_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function emitFielded(field: string | undefined, literal: string): string {
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
  return `${field}:${literal}`;
}
