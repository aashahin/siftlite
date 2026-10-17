import {
  assertBoundScope,
  hashPhysicalManifest,
  bindScope,
  SearchError,
  validateApplicationLimits,
  type ApplicationLimits,
  type BoundScope,
  type CheckReport,
  type DoctorReport,
  type FilterableFields,
  type FilterNode,
  type IndexDefinition,
  type PortableScalar,
  type SearchableFields,
  type SearchHooks,
  type SearchPolicy,
  type SearchRequest,
  type SearchResponse,
  type SortableFields,
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
import { compileFts5PhysicalManifest } from "./manifest.js";
import { physicalNames, type PhysicalNames } from "./names.js";
import { searchFts5Index, searchFts5IndexRaw } from "./search/execute.js";

export interface Fts5EngineOptions {
  readonly adapter: SqlAdapter;
  readonly policy?: SearchPolicy;
  readonly limits?: ApplicationLimits;
  readonly hooks?: SearchHooks;
  readonly secureDelete?: SecureDeletePolicy;
}

export type TypedSearchRequest<TDefinition extends IndexDefinition> = SearchRequest<
  FilterableFields<TDefinition>,
  SearchableFields<TDefinition>,
  SortableFields<TDefinition>
>;

export type TypedScopeValues<TDefinition extends IndexDefinition> = {
  readonly [K in FilterableFields<TDefinition>]?: PortableScalar;
};

export interface Fts5IndexHandle<TDefinition extends IndexDefinition = IndexDefinition> {
  readonly definition: TDefinition;
  scope(values: TypedScopeValues<TDefinition>): Fts5IndexHandle<TDefinition>;
  search(query: string, request?: TypedSearchRequest<TDefinition>): Promise<SearchResponse>;
  searchRaw(
    raw: UnsafeBackendQuery,
    request?: TypedSearchRequest<TDefinition>,
  ): Promise<SearchResponse>;
  upsert(documents: readonly ManualProofDocument[]): Promise<void>;
  delete(id: SourceId): Promise<void>;
  create(): Promise<void>;
  drop(): Promise<void>;
  rebuild(): Promise<void>;
  check(): Promise<CheckReport>;
  doctor(): Promise<DoctorReport>;
}

export interface Fts5Engine {
  index<TDefinition extends IndexDefinition>(definition: TDefinition): Fts5IndexHandle<TDefinition>;
}

interface IndexHandleState<TDefinition extends IndexDefinition = IndexDefinition> {
  readonly adapter: SqlAdapter;
  readonly definition: TDefinition;
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

function createIndexHandle<TDefinition extends IndexDefinition>(
  state: IndexHandleState<TDefinition>,
): Fts5IndexHandle<TDefinition> {
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
        scope: appendHandleScope(state.scope, values as Record<string, unknown>),
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
      await writeManualDocuments(state, (names) =>
        deleteManualDocument(state.adapter, names, id, state.definition),
      );
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
  const physical = await resolvePhysical(state.adapter, state.definition, state.secureDelete);
  const resolved = withHandleScope(request, state.scope);
  const response = await execute(physical, resolved);
  state.hooks?.onSearch?.({
    indexName: state.definition.name,
    backend: "fts5",
    durationMs: Date.now() - started,
    resultCount: response.hits.length,
    filterCount: countFilterNodes(resolved.filter),
    facetCount: resolved.facets?.length ?? 0,
    fuzzyUsed: response.meta?.fuzzyUsed === true,
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
  const physical = await resolvePhysical(state.adapter, state.definition, state.secureDelete);
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
  secureDelete: SecureDeletePolicy,
): Promise<{ physicalIndexId: string; generation: number }> {
  // Reading the explicit registry columns validates the installed schema too.
  // Keep DDL and PRAGMA on the cold/migration path, never on healthy searches.
  const row = await readRegistry(adapter, definition.name).catch(async (error: unknown) => {
    if (!isMissingRegistrySchema(error)) throw error;
    await ensureRegistry(adapter);
    return readRegistry(adapter, definition.name);
  });
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
  if (
    row.physicalSchemaHash !==
    expectedPhysicalHash(definition, row.physicalIndexId, row.activeGeneration, secureDelete)
  ) {
    // The stored generation was built for another physical definition (for
    // example a new normalization profile): querying it would normalize the
    // query differently from the indexed text. Callers rebuild, then retry.
    throw new SearchError({
      code: "SEARCH_MAINTENANCE_FAILED",
      message: "index was built for another physical definition",
      details: { reason: "registry-stale" },
    });
  }
  return { physicalIndexId: row.physicalIndexId, generation: row.activeGeneration };
}

// Definitions are long-lived module constants; hash each generation once.
const expectedHashes = new WeakMap<IndexDefinition, Map<string, string>>();

function expectedPhysicalHash(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
  secureDelete: SecureDeletePolicy,
): string {
  const key = `${physicalIndexId}:${generation}:${secureDelete !== "off"}`;
  let byGeneration = expectedHashes.get(definition);
  if (!byGeneration) {
    byGeneration = new Map();
    expectedHashes.set(definition, byGeneration);
  }
  let hash = byGeneration.get(key);
  if (hash === undefined) {
    hash = hashPhysicalManifest(
      compileFts5PhysicalManifest(
        { definition, physicalIndexId, generation },
        { secureDelete: secureDelete !== "off" },
      ),
    );
    byGeneration.set(key, hash);
  }
  return hash;
}

function isMissingRegistrySchema(error: unknown): boolean {
  // Adapters retain driver errors as causes without exposing SQL in public messages.
  for (let depth = 0; depth < 4 && error instanceof Error; depth++) {
    if (/no such (?:table|column):/i.test(error.message)) return true;
    error = error.cause;
  }
  return false;
}
