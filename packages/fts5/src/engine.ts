import {
  bindScope,
  SearchError,
  type ApplicationLimits,
  type BoundScope,
  type CheckReport,
  type DoctorReport,
  type IndexDefinition,
  type SearchHooks,
  type SearchPolicy,
  type SearchRequest,
  type SearchResponse,
  type SqlAdapter,
  type UnsafeBackendQuery,
} from "@siftlite/core";
import { checkIndex, doctorIndex } from "./lifecycle/doctor.js";
import { assertSecureDeletePolicy, type SecureDeletePolicy } from "./lifecycle/maintenance.js";
import { createIndex, dropIndex, rebuildIndex } from "./lifecycle/operations.js";
import { ensureRegistry, readRegistry } from "./lifecycle/registry-sql.js";
import { searchFts5Index, searchFts5IndexRaw } from "./search/execute.js";

export interface Fts5EngineOptions {
  readonly adapter: SqlAdapter;
  readonly policy?: SearchPolicy;
  readonly limits?: ApplicationLimits;
  readonly hooks?: SearchHooks;
  readonly secureDelete?: SecureDeletePolicy;
}

export interface Fts5IndexHandle {
  readonly definition: IndexDefinition;
  scope(values: Record<string, unknown>): Fts5IndexHandle;
  search(query: string, request?: SearchRequest): Promise<SearchResponse>;
  searchRaw(raw: UnsafeBackendQuery, request?: SearchRequest): Promise<SearchResponse>;
  create(): Promise<void>;
  drop(): Promise<void>;
  rebuild(): Promise<void>;
  check(): Promise<CheckReport>;
  doctor(options?: { level?: "fast" | "deep" }): Promise<DoctorReport>;
}

export interface Fts5Engine {
  index(definition: IndexDefinition): Fts5IndexHandle;
}

export function createFts5Engine(options: Fts5EngineOptions): Fts5Engine {
  const adapter = options.adapter;
  const policy = options.policy;
  const limits = options.limits;
  const hooks = options.hooks;
  const secureDelete = options.secureDelete ?? "off";

  return {
    index(definition) {
      return createHandle({
        adapter,
        definition,
        policy,
        limits,
        hooks,
        secureDelete,
      });
    },
  };
}

function createHandle(args: {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly policy?: SearchPolicy;
  readonly limits?: ApplicationLimits;
  readonly hooks?: SearchHooks;
  readonly secureDelete: SecureDeletePolicy;
  readonly scope?: BoundScope;
}): Fts5IndexHandle {
  const lifecycle = { adapter: args.adapter, definition: args.definition };

  return {
    definition: args.definition,
    scope(values) {
      const next = bindScope(values);
      return createHandle({
        ...args,
        scope: mergeScopes(args.scope, next),
      });
    },
    async search(query, request = {}) {
      const started = Date.now();
      const physical = await resolvePhysical(args.adapter, args.definition);
      const resolved = withHandleScope(request, args.scope);
      const result = await searchFts5Index(
        {
          adapter: args.adapter,
          definition: args.definition,
          physicalIndexId: physical.physicalIndexId,
          generation: physical.generation,
          ...(args.limits ? { limits: args.limits } : {}),
          ...(args.policy ? { policy: args.policy } : {}),
        },
        query,
        resolved,
      );
      emitSearchHook(args, resolved, result, started);
      return result;
    },
    async searchRaw(raw, request = {}) {
      const started = Date.now();
      const physical = await resolvePhysical(args.adapter, args.definition);
      const resolved = withHandleScope(request, args.scope);
      const result = await searchFts5IndexRaw(
        {
          adapter: args.adapter,
          definition: args.definition,
          physicalIndexId: physical.physicalIndexId,
          generation: physical.generation,
          ...(args.limits ? { limits: args.limits } : {}),
          ...(args.policy ? { policy: args.policy } : {}),
        },
        raw,
        resolved,
      );
      emitSearchHook(args, resolved, result, started);
      return result;
    },
    async create() {
      if (args.secureDelete !== "off") {
        await assertSecureDeletePolicy(args.adapter, args.secureDelete);
      }
      await createIndex(lifecycle);
    },
    async drop() {
      await dropIndex(lifecycle);
    },
    async rebuild() {
      if (args.secureDelete !== "off") {
        await assertSecureDeletePolicy(args.adapter, args.secureDelete);
      }
      await rebuildIndex(lifecycle);
    },
    async check() {
      return checkIndex(args.adapter, args.definition);
    },
    async doctor(options) {
      return doctorIndex(args.adapter, args.definition, options);
    },
  };
}

function emitSearchHook(
  args: { readonly definition: IndexDefinition; readonly hooks?: SearchHooks },
  request: SearchRequest,
  result: SearchResponse,
  started: number,
): void {
  args.hooks?.onSearch?.({
    indexName: args.definition.name,
    backend: "fts5",
    durationMs: Date.now() - started,
    resultCount: result.hits.length,
    filterCount: request.filter ? 1 : 0,
    facetCount: request.facets?.length ?? 0,
    fuzzyUsed: false,
  });
}

function withHandleScope(request: SearchRequest, handleScope: BoundScope | undefined): SearchRequest {
  const scope = mergeScopes(handleScope, request.scope);
  return scope ? { ...request, scope } : request;
}

function mergeScopes(handle: BoundScope | undefined, request: BoundScope | undefined): BoundScope | undefined {
  if (handle && request) {
    return {
      kind: "bound-scope",
      predicates: [...handle.predicates, ...request.predicates],
    };
  }
  return handle ?? request;
}

async function resolvePhysical(
  adapter: SqlAdapter,
  definition: IndexDefinition,
): Promise<{ physicalIndexId: string; generation: number }> {
  await ensureRegistry(adapter);
  const row = await readRegistry(adapter, definition.name);
  if (!row) {
    throw new SearchError({
      code: "SEARCH_INDEX_NOT_FOUND",
      message: "index is not registered",
      details: { reason: "missing-registry" },
    });
  }
  return { physicalIndexId: row.physicalIndexId, generation: row.activeGeneration };
}
