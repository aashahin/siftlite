import {
  createStatementBudget,
  quoteIdent,
  reserveBinds,
  reserveFunctionArgs,
  reserveStatementBytes,
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
  const match = emitFts5Match(ctx.textQuery, ctx.definition);
  const budget = createStatementBudget(ctx.runtimeLimits ?? {}, ctx.limits);
  const highlight = ctx.highlight ?? [];

  reserveBinds(budget, match === undefined ? 0 : 1, "search");
  reserveBinds(budget, 2, "pagination");
  if (highlight.length > 0) {
    reserveBinds(budget, highlight.length * 3, "other");
    reserveFunctionArgs(budget, highlight.length * 6, "ranking");
  }

  const scope = compileScope(ctx.scope, ctx.definition);
  reserveBinds(budget, scope.params.length, "scope");
  const filter = compileFilter(ctx.filter, ctx.definition, budget);

  const emptyQuery = match === undefined;
  const fromSql = emptyQuery
    ? `FROM ${docs} AS d`
    : `FROM ${fts} AS f JOIN ${docs} AS d ON d.${quoteIdent("doc_id")} = f.${quoteIdent("rowid")}`;

  const whereParts = [`(${scope.sql})`, `(${filter.sql})`];
  const whereParams: unknown[] = [...scope.params, ...filter.params];
  if (match !== undefined) {
    whereParts.unshift(`${fts} MATCH ?`);
    whereParams.unshift(match);
  }
  const whereSql = whereParts.join(" AND ");

  const order = compileOrder(ctx, emptyQuery, fts);
  reserveFunctionArgs(
    budget,
    emptyQuery ? 0 : 1 + ctx.definition.searchableOrder.length,
    "ranking",
  );

  const highlightSelect = emptyQuery
    ? ""
    : highlight
        .map(
          (column) =>
            `, snippet(${fts}, ${column.ftsColumnIndex}, ?, ?, ?, ${column.tokens}) AS ${quoteIdent(`highlight_${column.field}`)}`,
        )
        .join("");
  const highlightParams = emptyQuery
    ? []
    : highlight.flatMap((column) => [column.start, column.end, column.ellipsis]);

  const sql = `SELECT d.${quoteIdent("source_id")} AS source_id, ${order.selectScore} AS rank${highlightSelect}
${fromSql}
WHERE ${whereSql}
ORDER BY ${order.orderBy}
LIMIT ? OFFSET ?`;
  reserveStatementBytes(budget, utf8ByteLength(sql), "search");

  const params = [...highlightParams, ...whereParams, ctx.limit, ctx.offset];
  return {
    statement: { sql, params },
    emptyQuery,
    fromSql,
    whereSql,
    whereParams,
    bindParameterCount: params.length,
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
    parts.push(sortSql(entry, bm25, ctx));
  }
  parts.push(`d.${quoteIdent("doc_id")} ASC`);
  return { selectScore, orderBy: parts.join(", ") };
}

function sortSql(entry: SearchSort, bm25: string, ctx: SearchCompileContext): string {
  if (entry.kind === "relevance") {
    return `${bm25} ASC`;
  }
  if (!Object.prototype.hasOwnProperty.call(ctx.definition.sortable, entry.field)) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: `field ${entry.field} is not declared sortable`,
      details: { reason: "undeclared-sort-field" },
    });
  }
  return `d.${quoteIdent(entry.field)} ${entry.direction === "desc" ? "DESC" : "ASC"}`;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}
