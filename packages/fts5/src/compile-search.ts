import {
  createStatementBudget,
  quoteIdent,
  reserveBinds,
  SearchError,
  type CompiledSearch,
  type SearchCompileContext,
  type SearchSort,
} from "@siftlite/core";
import { compileFilter, compileScope } from "./compile-filter.js";
import { emitFts5Match } from "./emit.js";
import { physicalNames } from "./names.js";

export function compileFts5Search(ctx: SearchCompileContext): CompiledSearch {
  const names = physicalNames(ctx.definition, ctx.physicalIndexId, ctx.generation);
  const docs = quoteIdent(names.docs);
  const fts = quoteIdent(names.fts);
  const match = emitFts5Match(ctx.textQuery);
  const budget = createStatementBudget({}, ctx.limits);
  const params: unknown[] = [];

  const scope = compileScope(ctx.scope, ctx.definition);
  const filter = compileFilter(ctx.filter, ctx.definition);
  reserveBinds(budget, match === undefined ? 0 : 1, "search");
  reserveBinds(budget, scope.params.length, "scope");
  reserveBinds(budget, filter.params.length, "filter");
  reserveBinds(budget, 2, "pagination");
  params.push(...scope.params, ...filter.params);

  const emptyQuery = match === undefined;
  const from = emptyQuery
    ? `FROM ${docs} AS d`
    : `FROM ${fts} AS f JOIN ${docs} AS d ON d.${quoteIdent("doc_id")} = f.${quoteIdent("rowid")}`;

  const whereParts = [`(${scope.sql})`, `(${filter.sql})`];
  if (match !== undefined) {
    whereParts.unshift(`${fts} MATCH ?`);
    params.unshift(match);
  }

  const order = compileOrder(ctx, emptyQuery, fts);
  params.push(ctx.limit, ctx.offset);

  const sql = `SELECT d.${quoteIdent("source_id")} AS source_id, ${order.selectScore} AS rank
${from}
WHERE ${whereParts.join(" AND ")}
ORDER BY ${order.orderBy}
LIMIT ? OFFSET ?`;

  return {
    statement: { sql, params },
    emptyQuery,
  };
}

function compileOrder(
  ctx: SearchCompileContext,
  emptyQuery: boolean,
  fts: string,
): { selectScore: string; orderBy: string } {
  const sort = ctx.sort ?? [{ kind: "relevance" }];
  const usesRelevance = sort.some((entry) => entry.kind === "relevance");
  if (usesRelevance && emptyQuery) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "relevance sort is not available for empty-query browsing",
      details: { reason: "empty-relevance" },
    });
  }

  const weights = ctx.definition.searchableOrder.map(
    (field) => ctx.definition.searchable[field]?.weight ?? 1,
  );
  const bm25 = `bm25(${fts}${weights.map((weight) => `, ${weight}`).join("")})`;
  const selectScore = emptyQuery ? "NULL" : bm25;

  const parts: string[] = [];
  for (const entry of sort) {
    parts.push(sortSql(entry, bm25));
  }
  parts.push(`d.${quoteIdent("doc_id")} ASC`);
  return { selectScore, orderBy: parts.join(", ") };
}

function sortSql(entry: SearchSort, bm25: string): string {
  if (entry.kind === "relevance") {
    return `${bm25} ASC`;
  }
  return `${quoteIdent(entry.field)} ${entry.direction === "desc" ? "DESC" : "ASC"}`;
}
