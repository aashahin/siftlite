import {
  assertFilterCannotCarryScope,
  attachHydratedDocuments,
  DEFAULT_APPLICATION_LIMITS,
  expandTextQueryWithSynonyms,
  normalizeSynonymCatalog,
  parseIndexTextQuery,
  resolveSearchPage,
  SearchError,
  sql,
  validateFilter,
  type ApplicationLimits,
  type CompiledSearch,
  type DocumentHydrator,
  type EffectiveCapabilities,
  type IndexDefinition,
  type SearchHit,
  type SearchPolicy,
  type SearchRequest,
  type SearchResponse,
  type SearchWarning,
  type SqlAdapter,
  type TextQuery,
  type UnsafeBackendQuery,
  isUnsafeFts5Query,
} from "@siftlite/core";
import { FTS5_BASE_CAPABILITIES, sqliteFts5 } from "../backend.js";
import { compileFts5PhysicalManifest } from "../manifest.js";
import { publicScoreFromFts5Bm25 } from "../score.js";
import { executeFacets } from "./facets.js";
import { resolveHighlightColumns } from "./highlight.js";
import { createProjectionHydrator, restoreSourceId } from "./hydrate.js";

export interface Fts5SearchContext {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly physicalIndexId: string;
  readonly generation: number;
  readonly limits?: ApplicationLimits;
  readonly policy?: SearchPolicy;
  readonly hydrator?: DocumentHydrator<Record<string, unknown>>;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "search was aborted",
      details: { reason: "aborted" },
    });
  }
}

export async function searchFts5Index(
  ctx: Fts5SearchContext,
  query: string,
  request: SearchRequest = {},
): Promise<SearchResponse<Record<string, unknown>>> {
  throwIfAborted(request.signal);
  const limits = ctx.limits ?? DEFAULT_APPLICATION_LIMITS;
  const parsed = parseIndexTextQuery(query, {
    limits,
    matchingStrategy: request.matchingStrategy ?? ctx.definition.matchingStrategy,
    normalization: ctx.definition.normalization,
  });
  const textQuery = expandTextQueryWithSynonyms(
    parsed,
    normalizeSynonymCatalog(ctx.definition.synonyms, ctx.definition.normalization),
    { limits },
  );
  return runFts5Search(ctx, request, { mode: "parsed", query, textQuery });
}

export async function searchFts5IndexRaw(
  ctx: Fts5SearchContext,
  raw: UnsafeBackendQuery,
  request: SearchRequest = {},
): Promise<SearchResponse<Record<string, unknown>>> {
  throwIfAborted(request.signal);
  if (!isUnsafeFts5Query(raw) || raw.kind !== "unsafe-backend-query" || raw.backend !== "fts5") {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "searchRaw requires an unsafe FTS5 backend query",
      details: { reason: "unsafe-query-required" },
    });
  }
  return runFts5Search(ctx, request, { mode: "raw", query: raw.value, match: raw.value });
}

type PreparedSearch =
  | { readonly mode: "parsed"; readonly query: string; readonly textQuery: TextQuery }
  | { readonly mode: "raw"; readonly query: string; readonly match: string };

async function runFts5Search(
  ctx: Fts5SearchContext,
  request: SearchRequest,
  prepared: PreparedSearch,
): Promise<SearchResponse<Record<string, unknown>>> {
  const started = Date.now();
  const limits = ctx.limits ?? DEFAULT_APPLICATION_LIMITS;
  const page = resolveSearchPage(request, limits);
  const capabilities = resolveSearchCapabilities(ctx);
  const warnings: SearchWarning[] = [...capabilities.warnings];

  if (request.filter) {
    validateFilter(request.filter, { limits, definition: ctx.definition });
    assertFilterCannotCarryScope(request.filter);
  }

  const textQuery: TextQuery =
    prepared.mode === "raw" ? { kind: "term", value: "raw" } : prepared.textQuery;
  const emptyQuery = prepared.mode === "raw" ? false : textQuery.kind === "empty";
  const sort = emptyQuery ? (request.sort ?? []) : request.sort;
  const highlightRequested = (request.highlight?.length ?? 0) > 0;

  if (highlightRequested && (!capabilities.features.highlight || !capabilities.features.snippet)) {
    throw new SearchError({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
      message: "highlight/snippet is not available for this backend/runtime",
      details: { reason: "highlight-unsupported" },
    });
  }

  const highlight =
    highlightRequested && !emptyQuery
      ? resolveHighlightColumns(ctx.definition, request.highlight, request.highlightMarkers)
      : [];
  if (highlightRequested && emptyQuery) {
    warnings.push({
      code: "highlight-unavailable-empty-query",
      message: "highlight requires a non-empty text query",
    });
  }

  const backend = sqliteFts5();
  const physical = compileFts5PhysicalManifest({
    definition: ctx.definition,
    physicalIndexId: ctx.physicalIndexId,
    generation: ctx.generation,
  });
  let compiled = backend.compileSearch({
    definition: ctx.definition,
    physical,
    physicalIndexId: ctx.physicalIndexId,
    generation: ctx.generation,
    textQuery,
    ...(request.filter ? { filter: request.filter } : {}),
    ...(request.scope ? { scope: request.scope } : {}),
    ...(sort ? { sort } : {}),
    ...(highlight.length > 0 ? { highlight } : {}),
    limit: page.limit + 1,
    offset: page.offset,
    limits,
    runtimeLimits: ctx.adapter.runtimeCapabilities.limits,
  });
  if (prepared.mode === "raw") {
    compiled = bindRawMatch(compiled, prepared.match);
  }

  throwIfAborted(request.signal);
  const rows = await ctx.adapter.query<HitRow>(compiled.statement);
  const hasMore = rows.length > page.limit;
  const pageRows = hasMore ? rows.slice(0, page.limit) : rows;
  const ids = pageRows.map((row) => restoreSourceId(ctx.definition, row.source_id));

  let documents: ReadonlyMap<(typeof ids)[number], Record<string, unknown>> | undefined;
  if (request.hydrate === true) {
    throwIfAborted(request.signal);
    const hydrator =
      ctx.hydrator ??
      createProjectionHydrator({
        adapter: ctx.adapter,
        definition: ctx.definition,
        physicalIndexId: ctx.physicalIndexId,
        generation: ctx.generation,
        limits,
        runtimeLimits: ctx.adapter.runtimeCapabilities.limits,
      });
    documents = await hydrator.hydrate(ids);
  }
  const hydrated = documents ? attachHydratedDocuments(ids, documents) : undefined;

  const hits: SearchHit<Record<string, unknown>>[] = pageRows.map((row, index) => {
    const formatted = formattedFromRow(row, highlight);
    const document = hydrated?.[index];
    return {
      id: ids[index] ?? restoreSourceId(ctx.definition, row.source_id),
      score:
        compiled.emptyQuery || row.rank == null ? null : publicScoreFromFts5Bm25(Number(row.rank)),
      ...(document !== undefined ? { document } : {}),
      ...(formatted ? { formatted } : {}),
    };
  });

  let totalHits: number | undefined;
  if (request.includeTotal === true) {
    throwIfAborted(request.signal);
    const countRows = await ctx.adapter.query<{ total: number }>(
      sql(
        `SELECT COUNT(*) AS total ${compiled.fromSql} WHERE ${compiled.whereSql}`,
        compiled.whereParams,
      ),
    );
    totalHits = Number(countRows[0]?.total ?? 0);
  }

  const facetFields = request.facets ?? [];
  if (facetFields.length > 0) {
    throwIfAborted(request.signal);
  }
  const facetResult =
    facetFields.length > 0
      ? await executeFacets({
          adapter: ctx.adapter,
          definition: ctx.definition,
          compiled,
          fields: facetFields,
          limits,
        })
      : undefined;

  const processingTimeMs = Date.now() - started;
  const meta = request.diagnostics
    ? {
        backend: backend.id,
        runtime: ctx.adapter.runtimeCapabilities.id,
        fuzzyUsed: false,
        bindParametersUsed: compiled.bindParameterCount,
        ...(warnings.length > 0 ? { warnings } : {}),
      }
    : undefined;

  return {
    hits,
    page: { limit: page.limit, offset: page.offset, hasMore },
    query: prepared.query,
    backend: backend.id,
    processingTimeMs,
    ...(totalHits !== undefined ? { totalHits } : {}),
    ...(facetResult && Object.keys(facetResult.facets).length > 0
      ? { facets: facetResult.facets }
      : {}),
    ...(facetResult && Object.keys(facetResult.facetStats).length > 0
      ? { facetStats: facetResult.facetStats }
      : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(meta ? { meta } : {}),
  };
}

function bindRawMatch(compiled: CompiledSearch, rawMatch: string): CompiledSearch {
  if (compiled.emptyQuery || compiled.whereParams.length === 0) {
    throw new SearchError({
      code: "SEARCH_BACKEND_ERROR",
      message: "raw MATCH bind is missing from the compiled search",
      details: { reason: "missing-match-bind" },
    });
  }
  const whereParams = [rawMatch, ...compiled.whereParams.slice(1)];
  const matchIndex = compiled.statement.params.length - compiled.whereParams.length - 2;
  if (matchIndex < 0 || matchIndex >= compiled.statement.params.length) {
    throw new SearchError({
      code: "SEARCH_BACKEND_ERROR",
      message: "raw MATCH bind index is invalid",
      details: { reason: "invalid-match-bind" },
    });
  }
  const params = compiled.statement.params.slice();
  params[matchIndex] = rawMatch;
  return {
    ...compiled,
    whereParams,
    statement: { sql: compiled.statement.sql, params },
  };
}

function resolveSearchCapabilities(ctx: Fts5SearchContext): EffectiveCapabilities {
  return sqliteFts5().resolveCapabilities({
    backend: FTS5_BASE_CAPABILITIES,
    runtime: ctx.adapter.runtimeCapabilities,
    probes: {},
    policy: ctx.policy ?? { typoFallback: "disabled" },
  });
}

interface HitRow {
  readonly source_id: unknown;
  readonly rank: number | null;
  readonly [column: string]: unknown;
}

function formattedFromRow(
  row: HitRow,
  highlight: readonly { readonly field: string }[],
): Readonly<Record<string, string>> | undefined {
  if (highlight.length === 0) {
    return undefined;
  }
  const formatted: Record<string, string> = {};
  for (const column of highlight) {
    const value = row[`highlight_${column.field}`];
    if (typeof value === "string" && value.length > 0) {
      formatted[column.field] = value;
    }
  }
  return Object.keys(formatted).length > 0 ? formatted : undefined;
}
