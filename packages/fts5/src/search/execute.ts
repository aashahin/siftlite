import {
  assertBoundScope,
  assertFilterCannotCarryScope,
  attachHydratedDocuments,
  collectTextTerms,
  codePointLength,
  codePointTrigrams,
  damerauLevenshtein,
  DEFAULT_APPLICATION_LIMITS,
  DEFAULT_FUZZY_POLICY,
  expandTextQueryWithSynonyms,
  maxEditsForToken,
  normalizeIndexText,
  normalizeSynonymCatalog,
  parseIndexTextQuery,
  quoteIdent,
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
  type SearchAbortSignal,
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
import { physicalNames } from "../names.js";
import { probeFts5Capabilities } from "../probes.js";
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

export function throwIfAborted(signal?: SearchAbortSignal): void {
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
  const capabilities = await resolveSearchCapabilities(ctx);
  if (ctx.definition.typoTolerance.mode === "fallback" && !capabilities.features.typoFallback) {
    throw new SearchError({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
      message: "typo fallback is not available on this runtime",
      details: { reason: "typo-fallback-unsupported" },
    });
  }
  const warnings: SearchWarning[] = [...capabilities.warnings];

  if (request.filter) {
    validateFilter(request.filter, { limits, definition: ctx.definition });
    assertFilterCannotCarryScope(request.filter);
  }
  if (request.scope !== undefined) {
    assertBoundScope(request.scope);
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

  let fuzzyUsed = false;
  let hits: SearchHit<Record<string, unknown>>[] = pageRows.map((row, index) => {
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

  if (
    hits.length === 0 &&
    prepared.mode === "parsed" &&
    ctx.definition.typoTolerance.mode === "fallback" &&
    capabilities.features.typoFallback
  ) {
    hits = await searchFuzzyFallback(ctx, prepared.textQuery, page, request);
    fuzzyUsed = hits.length > 0;
  }

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
        fuzzyUsed,
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

async function resolveSearchCapabilities(ctx: Fts5SearchContext): Promise<EffectiveCapabilities> {
  const probes =
    ctx.definition.typoTolerance.mode === "fallback"
      ? await probeFts5Capabilities(ctx.adapter)
      : {};
  return sqliteFts5().resolveCapabilities({
    backend: FTS5_BASE_CAPABILITIES,
    runtime: ctx.adapter.runtimeCapabilities,
    probes,
    policy: ctx.policy ?? { typoFallback: "disabled-on-cost-sensitive-runtimes" },
  });
}

async function searchFuzzyFallback(
  ctx: Fts5SearchContext,
  textQuery: TextQuery,
  page: { readonly limit: number; readonly offset: number },
  request: SearchRequest,
): Promise<SearchHit<Record<string, unknown>>[]> {
  const policy = DEFAULT_FUZZY_POLICY;
  const terms = collectTextTerms(textQuery)
    .map((term) => normalizeIndexText(term, ctx.definition.normalization))
    .filter((term) => codePointLength(term) >= policy.minTokenCodepoints)
    .slice(0, policy.maxQueryTokens);
  const grams = [...new Set(terms.flatMap((term) => codePointTrigrams(term)))].slice(
    0,
    policy.maxTrigramsPerToken * Math.max(terms.length, 1),
  );
  if (grams.length === 0) {
    return [];
  }
  const names = physicalNames(ctx.definition, ctx.physicalIndexId, ctx.generation);
  const match = grams.map((gram) => `"${gram.replaceAll('"', '""')}"`).join(" OR ");
  const rows = await ctx.adapter.query<{ source_id: unknown; rank: number | null }>(
    sql(
      `SELECT d.${quoteIdent("source_id")} AS source_id, NULL AS rank
FROM ${quoteIdent(names.ftsTrigram)} AS t
JOIN ${quoteIdent(names.docs)} AS d ON d.${quoteIdent("doc_id")} = t.${quoteIdent("rowid")}
WHERE ${quoteIdent(names.ftsTrigram)} MATCH ?
LIMIT ?`,
      [match, policy.maxCandidates],
    ),
  );
  const scored: Array<{ id: ReturnType<typeof restoreSourceId>; distance: number }> = [];
  for (const row of rows) {
    const id = restoreSourceId(ctx.definition, row.source_id);
    const stored = await ctx.adapter.query<Record<string, unknown>>(
      sql(
        `SELECT ${ctx.definition.searchableOrder.map((field) => quoteIdent(`${field}_source`)).join(", ")} FROM ${quoteIdent(names.docs)} WHERE ${quoteIdent("source_id")} = ?`,
        [id],
      ),
    );
    const haystack = ctx.definition.searchableOrder
      .map((field) =>
        normalizeIndexText(
          String(stored[0]?.[`${field}_source`] ?? ""),
          ctx.definition.normalization,
        ),
      )
      .join(" ");
    let best = Number.POSITIVE_INFINITY;
    for (const term of terms) {
      for (const token of haystack.split(/\s+/).filter(Boolean)) {
        const allowed = Math.min(policy.maxEditDistance, maxEditsForToken(codePointLength(term)));
        const distance = damerauLevenshtein(term, token);
        if (distance <= allowed) {
          best = Math.min(best, distance);
        }
      }
    }
    if (Number.isFinite(best)) {
      scored.push({ id, distance: best });
    }
  }
  scored.sort((left, right) => left.distance - right.distance);
  const pageHits = scored.slice(page.offset, page.offset + page.limit);
  if (request.hydrate !== true) {
    return pageHits.map((hit) => ({ id: hit.id, score: null }));
  }
  const hydrator =
    ctx.hydrator ??
    createProjectionHydrator({
      adapter: ctx.adapter,
      definition: ctx.definition,
      physicalIndexId: ctx.physicalIndexId,
      generation: ctx.generation,
      limits: ctx.limits ?? DEFAULT_APPLICATION_LIMITS,
      runtimeLimits: ctx.adapter.runtimeCapabilities.limits,
    });
  const documents = await hydrator.hydrate(pageHits.map((hit) => hit.id));
  const hydrated = attachHydratedDocuments(
    pageHits.map((hit) => hit.id),
    documents,
  );
  return pageHits.map((hit, index) => ({
    id: hit.id,
    score: null,
    ...(hydrated[index] !== undefined ? { document: hydrated[index] } : {}),
  }));
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
