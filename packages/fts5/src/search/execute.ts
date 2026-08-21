import {
  assertBoundScope,
  assertFilterCannotCarryScope,
  attachHydratedDocuments,
  chunkIdsForHydration,
  collectTextTerms,
  codePointLength,
  codePointTrigrams,
  createStatementBudget,
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
  type FacetDistribution,
  type EffectiveCapabilities,
  type IndexDefinition,
  type SearchHit,
  type SearchAbortSignal,
  type SearchPolicy,
  type SearchRequest,
  type SearchResponse,
  type SearchWarning,
  type SourceId,
  type SqlAdapter,
  type TextQuery,
  type UnsafeBackendQuery,
  isUnsafeFts5Query,
} from "@siftlite/core";
import { FTS5_BASE_CAPABILITIES, sqliteFts5 } from "../backend.js";
import { compileFilter, compileScope } from "../compile-filter.js";
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
  let hasMore = rows.length > page.limit;
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
  let fuzzySurvivorIds: readonly SourceId[] = [];
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

  const fuzzyEligible =
    prepared.mode === "parsed" &&
    ctx.definition.typoTolerance.mode === "fallback" &&
    capabilities.features.typoFallback &&
    !emptyQuery;
  let exactCount: number | undefined;
  if (fuzzyEligible) {
    const scored = await scoreFuzzyCandidates(ctx, prepared.textQuery, request);
    const exactAmongFuzzy = await sourceIdsMatchingCompiled(
      ctx,
      compiled,
      scored.map((row) => row.id),
    );
    const fuzzySurvivors = scored.filter((row) => !exactAmongFuzzy.has(row.id));
    fuzzySurvivorIds = fuzzySurvivors.map((row) => row.id);
    fuzzyUsed = fuzzySurvivors.length > 0;
    if (fuzzyUsed) {
      throwIfAborted(request.signal);
      exactCount = await countCompiled(ctx, compiled);
      const merged = mergeExactAndFuzzyPage({
        exactHits: hits,
        exactCount,
        page,
        fuzzySurvivors,
      });
      const fuzzyHits = await materializeFuzzyHits(ctx, request, merged.fuzzySlice);
      hits = [...merged.exactHits, ...fuzzyHits];
      hasMore = merged.hasMore;
      if (merged.fuzzySlice.length > 0 && highlightRequested) {
        warnings.push({
          code: "highlight-unavailable-fuzzy",
          message: "highlight is not available for fuzzy fallback hits",
        });
      }
    }
  }

  let totalHits: number | undefined;
  if (request.includeTotal === true) {
    throwIfAborted(request.signal);
    if (fuzzyUsed) {
      totalHits = (exactCount ?? 0) + fuzzySurvivorIds.length;
    } else {
      totalHits = await countCompiled(ctx, compiled);
    }
  }

  const facetFields = request.facets ?? [];
  if (facetFields.length > 0) {
    throwIfAborted(request.signal);
  }
  const facetResult =
    facetFields.length > 0
      ? await resolveMergedFacets({
          ctx,
          compiled,
          fields: facetFields,
          limits,
          fuzzyUsed,
          exactCount: exactCount ?? 0,
          fuzzySurvivorIds,
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

interface FuzzySurvivor {
  readonly id: SourceId;
  readonly distance: number;
}

async function scoreFuzzyCandidates(
  ctx: Fts5SearchContext,
  textQuery: TextQuery,
  request: SearchRequest,
): Promise<FuzzySurvivor[]> {
  const policy = DEFAULT_FUZZY_POLICY;
  const limits = ctx.limits ?? DEFAULT_APPLICATION_LIMITS;
  const candidateLimit = Math.min(policy.maxCandidates, limits.maxFuzzyCandidates);
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
  const queryGramSet = new Set(grams);
  const names = physicalNames(ctx.definition, ctx.physicalIndexId, ctx.generation);
  const match = grams.map((gram) => `"${gram.replaceAll('"', '""')}"`).join(" OR ");
  const scope = compileScope(request.scope, ctx.definition);
  const filter = compileFilter(request.filter, ctx.definition);
  const rows = await ctx.adapter.query<{ source_id: unknown; rank: number | null }>(
    sql(
      `SELECT d.${quoteIdent("source_id")} AS source_id, NULL AS rank
FROM ${quoteIdent(names.ftsTrigram)} AS t
JOIN ${quoteIdent(names.docs)} AS d ON d.${quoteIdent("doc_id")} = t.${quoteIdent("rowid")}
WHERE ${quoteIdent(names.ftsTrigram)} MATCH ?
AND (${scope.sql})
AND (${filter.sql})
LIMIT ?`,
      [match, ...scope.params, ...filter.params, candidateLimit],
    ),
  );
  const candidateIds = rows.map((row) => restoreSourceId(ctx.definition, row.source_id));
  const storedById = await loadSearchableSources(ctx, names.docs, candidateIds);
  const scored: FuzzySurvivor[] = [];
  for (const id of candidateIds) {
    const stored = storedById.get(id);
    const haystack = ctx.definition.searchableOrder
      .map((field) =>
        normalizeIndexText(String(stored?.[`${field}_source`] ?? ""), ctx.definition.normalization),
      )
      .join(" ");
    if (sharedTrigramCount(haystack, queryGramSet) < policy.minGramOverlap) {
      continue;
    }
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
  return scored;
}

function mergeExactAndFuzzyPage(args: {
  readonly exactHits: SearchHit<Record<string, unknown>>[];
  readonly exactCount: number;
  readonly page: { readonly limit: number; readonly offset: number };
  readonly fuzzySurvivors: readonly FuzzySurvivor[];
}): {
  readonly exactHits: SearchHit<Record<string, unknown>>[];
  readonly fuzzySlice: readonly FuzzySurvivor[];
  readonly hasMore: boolean;
} {
  const total = args.exactCount + args.fuzzySurvivors.length;
  const end = args.page.offset + args.page.limit;
  const hasMore = total > end;
  if (args.page.offset >= args.exactCount) {
    const fuzzyOffset = args.page.offset - args.exactCount;
    return {
      exactHits: [],
      fuzzySlice: args.fuzzySurvivors.slice(fuzzyOffset, fuzzyOffset + args.page.limit),
      hasMore,
    };
  }
  const exactRemaining = args.exactCount - args.page.offset;
  const exactTake = Math.min(args.page.limit, exactRemaining, args.exactHits.length);
  const exactHits = args.exactHits.slice(0, exactTake);
  const remaining = args.page.limit - exactHits.length;
  return {
    exactHits,
    fuzzySlice: remaining > 0 ? args.fuzzySurvivors.slice(0, remaining) : [],
    hasMore,
  };
}

async function materializeFuzzyHits(
  ctx: Fts5SearchContext,
  request: SearchRequest,
  slice: readonly FuzzySurvivor[],
): Promise<SearchHit<Record<string, unknown>>[]> {
  if (slice.length === 0) {
    return [];
  }
  if (request.hydrate !== true) {
    return slice.map((hit) => ({ id: hit.id, score: null }));
  }
  const limits = ctx.limits ?? DEFAULT_APPLICATION_LIMITS;
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
  const ids = slice.map((hit) => hit.id);
  const documents = await hydrator.hydrate(ids);
  const hydrated = attachHydratedDocuments(ids, documents);
  return slice.map((hit, index) => ({
    id: hit.id,
    score: null,
    ...(hydrated[index] !== undefined ? { document: hydrated[index] } : {}),
  }));
}

async function countCompiled(ctx: Fts5SearchContext, compiled: CompiledSearch): Promise<number> {
  const countRows = await ctx.adapter.query<{ total: number }>(
    sql(
      `SELECT COUNT(*) AS total ${compiled.fromSql} WHERE ${compiled.whereSql}`,
      compiled.whereParams,
    ),
  );
  return Number(countRows[0]?.total ?? 0);
}

async function sourceIdsMatchingCompiled(
  ctx: Fts5SearchContext,
  compiled: CompiledSearch,
  ids: readonly SourceId[],
): Promise<Set<SourceId>> {
  const matched = new Set<SourceId>();
  if (compiled.emptyQuery || ids.length === 0) {
    return matched;
  }
  const budget = createStatementBudget(
    ctx.adapter.runtimeCapabilities.limits,
    ctx.limits ?? DEFAULT_APPLICATION_LIMITS,
  );
  for (const chunk of chunkIdsForHydration(ids, budget)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await ctx.adapter.query<{ source_id: unknown }>(
      sql(
        `SELECT d.${quoteIdent("source_id")} AS source_id ${compiled.fromSql}
WHERE ${compiled.whereSql} AND d.${quoteIdent("source_id")} IN (${placeholders})`,
        [...compiled.whereParams, ...chunk],
      ),
    );
    for (const row of rows) {
      matched.add(restoreSourceId(ctx.definition, row.source_id));
    }
  }
  return matched;
}

async function resolveMergedFacets(args: {
  readonly ctx: Fts5SearchContext;
  readonly compiled: CompiledSearch;
  readonly fields: readonly string[];
  readonly limits: ApplicationLimits;
  readonly fuzzyUsed: boolean;
  readonly exactCount: number;
  readonly fuzzySurvivorIds: readonly SourceId[];
}): Promise<Awaited<ReturnType<typeof executeFacets>> | undefined> {
  if (args.fields.length === 0) {
    return undefined;
  }
  const docs = physicalNames(
    args.ctx.definition,
    args.ctx.physicalIndexId,
    args.ctx.generation,
  ).docs;
  if (!args.fuzzyUsed) {
    return executeFacets({
      adapter: args.ctx.adapter,
      definition: args.ctx.definition,
      compiled: args.compiled,
      fields: args.fields,
      limits: args.limits,
    });
  }
  const fuzzyFacets = await executeFacets({
    adapter: args.ctx.adapter,
    definition: args.ctx.definition,
    compiled: compiledSearchForSourceIds(docs, args.fuzzySurvivorIds),
    fields: args.fields,
    limits: args.limits,
  });
  if (args.exactCount === 0) {
    return fuzzyFacets;
  }
  const exactFacets = await executeFacets({
    adapter: args.ctx.adapter,
    definition: args.ctx.definition,
    compiled: args.compiled,
    fields: args.fields,
    limits: args.limits,
  });
  return mergeFacetResults(exactFacets, fuzzyFacets);
}

function mergeFacetResults(
  exact: Awaited<ReturnType<typeof executeFacets>>,
  fuzzy: Awaited<ReturnType<typeof executeFacets>>,
): Awaited<ReturnType<typeof executeFacets>> {
  const facets: Record<string, FacetDistribution> = { ...exact.facets };
  for (const [field, buckets] of Object.entries(fuzzy.facets)) {
    const merged = new Map<string, FacetDistribution[number]>();
    for (const bucket of facets[field] ?? []) {
      merged.set(String(bucket.value), { value: bucket.value, count: bucket.count });
    }
    for (const bucket of buckets) {
      const key = String(bucket.value);
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, { value: existing.value, count: existing.count + bucket.count });
      } else {
        merged.set(key, { value: bucket.value, count: bucket.count });
      }
    }
    facets[field] = [...merged.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return String(left.value).localeCompare(String(right.value));
    });
  }
  const facetStats = { ...exact.facetStats };
  for (const [field, stats] of Object.entries(fuzzy.facetStats)) {
    const current = facetStats[field];
    facetStats[field] = current
      ? { min: Math.min(current.min, stats.min), max: Math.max(current.max, stats.max) }
      : stats;
  }
  return { facets, facetStats };
}

function sharedTrigramCount(haystack: string, queryGrams: ReadonlySet<string>): number {
  let overlap = 0;
  for (const gram of codePointTrigrams(haystack)) {
    if (queryGrams.has(gram)) {
      overlap += 1;
    }
  }
  return overlap;
}

async function loadSearchableSources(
  ctx: Fts5SearchContext,
  docsTable: string,
  ids: readonly SourceId[],
): Promise<Map<SourceId, Record<string, unknown>>> {
  const storedById = new Map<SourceId, Record<string, unknown>>();
  if (ids.length === 0) {
    return storedById;
  }
  const columns = [
    quoteIdent("source_id"),
    ...ctx.definition.searchableOrder.map((field) => quoteIdent(`${field}_source`)),
  ];
  const budget = createStatementBudget(
    ctx.adapter.runtimeCapabilities.limits,
    ctx.limits ?? DEFAULT_APPLICATION_LIMITS,
  );
  for (const chunk of chunkIdsForHydration(ids, budget)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const stored = await ctx.adapter.query<Record<string, unknown>>(
      sql(
        `SELECT ${columns.join(", ")} FROM ${quoteIdent(docsTable)} WHERE ${quoteIdent("source_id")} IN (${placeholders})`,
        [...chunk],
      ),
    );
    for (const row of stored) {
      storedById.set(restoreSourceId(ctx.definition, row["source_id"]), row);
    }
  }
  return storedById;
}

function compiledSearchForSourceIds(docsTable: string, ids: readonly SourceId[]): CompiledSearch {
  if (ids.length === 0) {
    return {
      statement: sql("SELECT 1 WHERE 0", []),
      emptyQuery: true,
      fromSql: `FROM ${quoteIdent(docsTable)} AS d`,
      whereSql: "0 = 1",
      whereParams: [],
      bindParameterCount: 0,
    };
  }
  const placeholders = ids.map(() => "?").join(", ");
  const whereSql = `d.${quoteIdent("source_id")} IN (${placeholders})`;
  const fromSql = `FROM ${quoteIdent(docsTable)} AS d`;
  return {
    statement: sql(`SELECT 1 ${fromSql} WHERE ${whereSql}`, [...ids]),
    emptyQuery: true,
    fromSql,
    whereSql,
    whereParams: [...ids],
    bindParameterCount: ids.length,
  };
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
