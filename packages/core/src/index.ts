/**
 * `@siftlite/core` — portable, runtime-neutral SiftLite contracts.
 *
 * This package is Web/edge-safe. It must not import Node, Bun, D1, libSQL,
 * Drizzle, or Prisma APIs.
 */

export const SIFTLITE_CORE_PACKAGE = {
  name: "@siftlite/core",
  version: "0.0.0",
} as const;

export type SiftLiteCorePackage = typeof SIFTLITE_CORE_PACKAGE;

export type { SearchErrorCode } from "./errors/codes.js";
export { SEARCH_ERROR_CODES } from "./errors/codes.js";
export { SearchError, isSearchError } from "./errors/search-error.js";
export type { SearchErrorDetails, SearchErrorOptions } from "./errors/search-error.js";

export type { SourceId, SourceIdKind } from "./ids/source-id.js";
export {
  assertSourceId,
  isSafeIntegerSourceId,
  isSourceId,
  sourceIdKind,
  sourceIdsEqual,
} from "./ids/source-id.js";

export type {
  EncodedFieldValue,
  FieldCodec,
  SearchStorageKind,
  TimestampUnit,
} from "./codecs/kinds.js";
export {
  booleanIntegerCodec,
  codecForKind,
  finiteRealCodec,
  safeIntegerCodec,
  textCodec,
} from "./codecs/codecs.js";
export { timestampIntegerCodec } from "./codecs/timestamp.js";
export { codecForFieldType, encodeFieldValue } from "./codecs/resolve.js";

export type { PortableScalar } from "./ast/scalar.js";
export { assertPortableScalar } from "./ast/scalar.js";
export type {
  BooleanOperator,
  ComparisonOperator,
  FilterNode,
  MembershipOperator,
  NullOperator,
} from "./ast/filter.js";
export {
  and,
  between,
  eq,
  gt,
  gte,
  inList,
  isFilterNode,
  isNotNull,
  isNull,
  lt,
  lte,
  neq,
  not,
  notIn,
  or,
} from "./ast/filter.js";
export { validateFilter } from "./ast/filter-validate.js";
export type { FilterValidationOptions } from "./ast/filter-validate.js";
export type { TextQuery } from "./ast/text-query.js";
export { collectTextTerms, isTextQuery, walkTextQuery } from "./ast/text-query.js";
export type { BoundScope, ScopePredicate, ScopedFilter } from "./ast/scope.js";
export {
  assertFilterCannotCarryScope,
  bindScope,
  composeScopedFilter,
  isBoundScope,
} from "./ast/scope.js";

export type { MatchingStrategy } from "./definition/types.js";
export type {
  CanonicalLogicalDefinition,
  FieldTypeShorthand,
  FieldTypeSpec,
  IndexDefinition,
  IndexDefinitionInput,
  IndexMode,
  ResolvedFieldType,
  SearchableFieldConfig,
  SourceIdType,
  SourcePrimaryKey,
  SourceTable,
  TypoToleranceConfig,
  TypoToleranceMode,
} from "./definition/types.js";
export { LOGICAL_FORMAT_VERSION } from "./definition/types.js";
export { defineIndex, table } from "./definition/define-index.js";
export { canonicalizeIndexDefinition, hashLogicalDefinition } from "./definition/canonicalize.js";

export type { ParseQueryOptions } from "./parser/parse-query.js";
export { looksLikeBackendOperator, parsePlainTextQuery } from "./parser/parse-query.js";
export { codePointLength, codePoints } from "./parser/unicode.js";

export type { ApplicationLimits } from "./limits/application-limits.js";
export {
  DEFAULT_APPLICATION_LIMITS,
  validateApplicationLimits,
} from "./limits/application-limits.js";
export type { ProvenLimit, RuntimeSqlLimits } from "./limits/runtime-sql-limits.js";
export { interpretLimit, isUnprovenLimit, remainingOf } from "./limits/runtime-sql-limits.js";
export type { BudgetReason, StatementBudget } from "./limits/budget.js";
export {
  assertInListFits,
  createStatementBudget,
  effectiveMaxInValues,
  remainingBindBudget,
  remainingFunctionArgBudget,
  remainingStatementByteBudget,
  reserveBinds,
  reserveFunctionArgs,
  reserveStatementBytes,
} from "./limits/budget.js";

export type {
  CapabilityResolutionContext,
  CapabilityWarning,
  EffectiveCapabilities,
  ReadConsistencyCapabilities,
  RuntimeCapabilities,
  RuntimeProbeResult,
  SearchCapabilities,
  SearchPolicy,
  TypoFallbackPolicy,
} from "./capabilities/types.js";
export { DISABLED_SEARCH_CAPABILITIES } from "./capabilities/types.js";
export { resolveEffectiveCapabilities } from "./capabilities/resolve.js";

export type { ExecuteResult, SqlStatement } from "./sql/statement.js";
export { sql } from "./sql/statement.js";
export type { SqlAdapter } from "./sql/adapter.js";
export { assertSqlIdentifier, quoteIdent } from "./sql/ident.js";
export { assertBindValue, assertBindValues } from "./sql/bind.js";

export type {
  PhysicalChange,
  PhysicalChangeKind,
  PhysicalObject,
  PhysicalSchemaManifest,
} from "./backend/manifest.js";
export { classifyPhysicalChange } from "./backend/manifest.js";
export type {
  CompiledSearch,
  IndexCompileContext,
  SearchBackend,
  SearchCompileContext,
  SearchSort,
} from "./backend/search-backend.js";
