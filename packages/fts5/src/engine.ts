import {
  assertBoundScope,
  bindScope,
  SearchError,
  validateApplicationLimits,
  type ApplicationLimits,
  type BoundScope,
  type CheckReport,
  type DoctorReport,
  type FilterNode,
  type IndexDefinition,
  type SearchHooks,
  type SearchPolicy,
  type SearchRequest,
  type SearchResponse,
  type SourceId,
  type SqlAdapter,
  type UnsafeBackendQuery,
} from "@siftlite/core";
import { checkIndex, doctorIndex } from "./lifecycle/doctor.js";
import type { SecureDeletePolicy } from "./lifecycle/maintenance.js";
import { createIndex, dropIndex, rebuildIndex } from "./lifecycle/operations.js";
import { ensureRegistry, readRegistry } from "./lifecycle/registry-sql.js";
import {
  deleteManualDocument,
  upsertManualDocuments,
  type ManualProofDocument,
} from "./manual-proof.js";
import { physicalNames, type PhysicalNames } from "./names.js";
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
  upsert(documents: readonly ManualProofDocument[]): Promise<void>;
  delete(id: SourceId): Promise<void>;
  create(): Promise<void>;
  drop(): Promise<void>;
  rebuild(): Promise<void>;
  check(): Promise<CheckReport>;
  doctor(): Promise<DoctorReport>;
}

export interface Fts5Engine {
  index(definition: IndexDefinition): Fts5IndexHandle;
}

interface IndexHandleState {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly policy?: SearchPolicy;
  readonly limits?: ApplicationLimits;
  readonly hooks?: SearchHooks;
  readonly secureDelete: SecureDeletePolicy;
  readonly scope?: BoundScope;
}

export function createFts5Engine(options: Fts5EngineOptions): Fts5Engine {
  const limits = options.limits ? validateApplicationLimits(options.limits) : undefined;
  const adapter = options.adapter;
  const secureDelete = options.secureDelete ?? "off";
  return {
    index(definition) {
      return createIndexHandle({
        adapter,
        definition,
        secureDelete,
        ...optionalEngineFields({
          ...options,
          ...(limits ? { limits } : {}),
        }),
      });
    },
  };
}

function createIndexHandle(state: IndexHandleState): Fts5IndexHandle {
  const lifecycle = {
    adapter: state.adapter,
    definition: state.definition,
    secureDelete: state.secureDelete,
  };

  return {
    definition: state.definition,
    scope(values) {
      return createIndexHandle({
        ...state,
        scope: appendHandleScope(state.scope, values),
      });
    },
    search(query, request = {}) {
      return runIndexSearch(state, request, (physical, resolved) =>
        searchFts5Index(searchContext(state, physical), query, resolved),
      );
    },
    searchRaw(raw, request = {}) {
      return runIndexSearch(state, request, (physical, resolved) =>
        searchFts5IndexRaw(searchContext(state, physical), raw, resolved),
      );
    },
    async upsert(documents) {
      assertManualIngest(state.definition);
      await writeManualDocuments(state, (names) =>
        upsertManualDocuments(state.adapter, state.definition, names, documents),
      );
    },
    async delete(id) {
      assertManualIngest(state.definition);
      await writeManualDocuments(state, (names) => deleteManualDocument(state.adapter, names, id));
    },
    create() {
      return createIndex(lifecycle);
    },
    drop() {
      return dropIndex(lifecycle);
    },
    rebuild() {
      return rebuildIndex(lifecycle);
    },
    check() {
      return checkIndex(state.adapter, state.definition);
    },
    doctor() {
      return doctorIndex(state.adapter, state.definition);
    },
  };
}

async function runIndexSearch(
  state: IndexHandleState,
  request: SearchRequest,
  execute: (
    physical: { physicalIndexId: string; generation: number },
    resolved: SearchRequest,
  ) => Promise<SearchResponse>,
): Promise<SearchResponse> {
  const started = Date.now();
  const physical = await resolvePhysical(state.adapter, state.definition);
  const resolved = withHandleScope(request, state.scope);
  const response = await execute(physical, resolved);
  state.hooks?.onSearch?.({
    indexName: state.definition.name,
    backend: "fts5",
    durationMs: Date.now() - started,
    resultCount: response.hits.length,
    filterCount: countFilterNodes(resolved.filter),
    facetCount: resolved.facets?.length ?? 0,
    fuzzyUsed: false,
  });
  return response;
}

function assertManualIngest(definition: IndexDefinition): void {
  if (definition.mode !== "manual") {
    throw new SearchError({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
      message: "linked indexes write through source-table triggers",
      details: { reason: "linked-writes" },
    });
  }
}

async function writeManualDocuments(
  state: IndexHandleState,
  write: (names: PhysicalNames) => Promise<void>,
): Promise<void> {
  const physical = await resolvePhysical(state.adapter, state.definition);
  await write(physicalNames(state.definition, physical.physicalIndexId, physical.generation));
}

function searchContext(
  state: IndexHandleState,
  physical: { physicalIndexId: string; generation: number },
) {
  return {
    adapter: state.adapter,
    definition: state.definition,
    physicalIndexId: physical.physicalIndexId,
    generation: physical.generation,
    ...(state.limits ? { limits: state.limits } : {}),
    ...(state.policy ? { policy: state.policy } : {}),
  };
}

function optionalEngineFields(fields: {
  readonly policy?: SearchPolicy;
  readonly limits?: ApplicationLimits;
  readonly hooks?: SearchHooks;
  readonly scope?: BoundScope;
}): Pick<IndexHandleState, "policy" | "limits" | "hooks" | "scope"> {
  return {
    ...(fields.policy ? { policy: fields.policy } : {}),
    ...(fields.limits ? { limits: fields.limits } : {}),
    ...(fields.hooks ? { hooks: fields.hooks } : {}),
    ...(fields.scope ? { scope: fields.scope } : {}),
  };
}

function countFilterNodes(node: FilterNode | undefined): number {
  if (!node) {
    return 0;
  }
  switch (node.op) {
    case "and":
    case "or":
      return 1 + node.children.reduce((total, child) => total + countFilterNodes(child), 0);
    case "not":
      return 1 + countFilterNodes(node.child);
    default:
      return 1;
  }
}

function appendHandleScope(
  existing: BoundScope | undefined,
  values: Record<string, unknown>,
): BoundScope {
  const next = bindScope(values);
  if (!existing) {
    return next;
  }
  return {
    kind: "bound-scope",
    predicates: [...existing.predicates, ...next.predicates],
  };
}

function withHandleScope(
  request: SearchRequest,
  handleScope: BoundScope | undefined,
): SearchRequest {
  if (request.scope !== undefined) {
    assertBoundScope(request.scope);
  }
  if (!handleScope) {
    return request;
  }
  if (!request.scope) {
    return { ...request, scope: handleScope };
  }
  return {
    ...request,
    scope: {
      kind: "bound-scope",
      predicates: [...handleScope.predicates, ...request.scope.predicates],
    },
  };
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
  if (row.health !== "healthy") {
    throw new SearchError({
      code: "SEARCH_MAINTENANCE_FAILED",
      message: "index is not healthy",
      details: { reason: row.health === "pending" ? "registry-pending" : "registry-unhealthy" },
    });
  }
  return { physicalIndexId: row.physicalIndexId, generation: row.activeGeneration };
}
