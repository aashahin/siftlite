import { SearchError, type TextQuery } from "@siftlite/core";
import { emitTursoPhrase, emitTursoTerm } from "./escape.js";

export function emitTursoMatch(query: TextQuery): string | undefined {
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
        message: "empty query cannot emit native match grammar",
        details: { reason: "empty-match" },
      });
    case "term":
      return emitTursoTerm(query.value, query.prefix === true);
    case "phrase":
      return emitTursoPhrase(query.terms);
    case "and":
      return `(${query.children.map(emitNode).join(" AND ")})`;
    case "or":
      return `(${query.children.map(emitNode).join(" OR ")})`;
    default: {
      throw new SearchError({
        code: "SEARCH_QUERY_INVALID",
        message: "unsupported text query node",
        details: { reason: "unsupported-node" },
      });
    }
  }
}
