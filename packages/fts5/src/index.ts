/**
 * `@siftlite/fts5` — SQLite FTS5 search backend.
 */
import { SIFTLITE_CORE_PACKAGE } from "@siftlite/core";

export const SIFTLITE_FTS5_PACKAGE = {
  name: "@siftlite/fts5",
  version: "0.1.0",
  dependsOn: SIFTLITE_CORE_PACKAGE.name,
} as const;

export type SiftLiteFts5Package = typeof SIFTLITE_FTS5_PACKAGE;

export { sqliteFts5, FTS5_BASE_CAPABILITIES } from "./backend.js";
export { compileFts5PhysicalManifest, FTS5_PHYSICAL_VERSION } from "./manifest.js";
export { compileFts5Search } from "./compile-search.js";
export { compileFilter, compileScope } from "./compile-filter.js";
export { searchFts5Index } from "./search/execute.js";
export type { Fts5SearchContext } from "./search/execute.js";
export {
  createProjectionHydrator,
  createSourceTableHydrator,
  restoreSourceId,
} from "./search/hydrate.js";
export { compileIndexLifecycleSql } from "./lifecycle/companion-sql.js";
export { resolveHighlightColumns } from "./search/highlight.js";
export { emitFts5Match } from "./emit.js";
export { escapeFts5Literal, emitFts5Phrase, emitFts5Term } from "./escape.js";
export { probeFts5Capabilities } from "./probes.js";
export { publicScoreFromFts5Bm25 } from "./score.js";
export {
  createManualFts5Proof,
  deleteManualDocument,
  upsertManualDocuments,
} from "./manual-proof.js";
export type {
  ManualFts5Proof,
  ManualProofDocument,
  ProofSearchHit,
  ProofSearchOptions,
} from "./manual-proof.js";
export { physicalNames } from "./names.js";
export {
  createIndex,
  dropIndex,
  rebuildIndex,
  syncRuntimeDefinition,
} from "./lifecycle/operations.js";
export type { LifecycleContext } from "./lifecycle/operations.js";
export { checkIndex, doctorIndex } from "./lifecycle/doctor.js";
export {
  compileEnsureRegistrySql,
  ensureRegistry,
  readRegistry,
  REGISTRY_SQL_COLUMNS,
} from "./lifecycle/registry-sql.js";
export { compileLinkedTriggers } from "./lifecycle/triggers.js";
export { compileSearchableExpression } from "./normalize-sql.js";
export { compileBackfillSql, compileDocsDdl, compileFtsDdl } from "./lifecycle/schema.js";
export {
  applyProjectionMigration,
  planProjectionMigration,
} from "./lifecycle/projection-migration.js";
export type { BackfillChunk, ProjectionMigrationPlan } from "./lifecycle/projection-migration.js";
export {
  assertSecureDeletePolicy,
  incrementalOptimize,
  mergeFtsIndex,
} from "./lifecycle/maintenance.js";
export type { MergeResult, SecureDeletePolicy } from "./lifecycle/maintenance.js";
export { createFts5Engine } from "./engine.js";
export type {
  Fts5Engine,
  Fts5EngineOptions,
  Fts5IndexHandle,
  TypedScopeValues,
  TypedSearchRequest,
} from "./engine.js";
export { searchFts5IndexRaw } from "./search/execute.js";
export { isUnsafeFts5Query, unsafeFts5Query } from "./raw.js";
export type { RawSearchBackend, UnsafeBackendQuery } from "./raw.js";
export { compileProjectionIndexes } from "./lifecycle/schema.js";
export { writePendingRegistry } from "./lifecycle/registry-sql.js";
