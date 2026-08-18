import type {
  CapabilityResolutionContext,
  EffectiveCapabilities,
  SearchCapabilities,
} from "../capabilities/types.js";
import type { IndexDefinition } from "../definition/types.js";
import type { FilterNode } from "../ast/filter.js";
import type { BoundScope } from "../ast/scope.js";
import type { TextQuery } from "../ast/text-query.js";
import type { ApplicationLimits } from "../limits/application-limits.js";
import type { RuntimeSqlLimits } from "../limits/runtime-sql-limits.js";
import type { SqlStatement } from "../sql/statement.js";
import type { PhysicalChange, PhysicalSchemaManifest } from "./manifest.js";

export interface IndexCompileContext {
  readonly definition: IndexDefinition;
  readonly physicalIndexId: string;
  readonly generation: number;
}

export interface SearchCompileContext {
  readonly definition: IndexDefinition;
  readonly physical: PhysicalSchemaManifest;
  readonly physicalIndexId: string;
  readonly generation: number;
  readonly textQuery: TextQuery;
  readonly filter?: FilterNode;
  readonly scope?: BoundScope;
  readonly sort?: readonly SearchSort[];
  readonly limit: number;
  readonly offset: number;
  readonly limits: ApplicationLimits;
  readonly runtimeLimits?: RuntimeSqlLimits;
  readonly highlight?: readonly CompiledHighlightColumn[];
}

export type SearchSort<TField extends string = string> =
  | { readonly kind: "relevance" }
  | { readonly kind: "field"; readonly field: TField; readonly direction: "asc" | "desc" };

export interface CompiledHighlightColumn {
  readonly field: string;
  readonly ftsColumnIndex: number;
  readonly start: string;
  readonly end: string;
  readonly ellipsis: string;
  readonly tokens: number;
}

export interface CompiledSearch {
  readonly statement: SqlStatement;
  readonly emptyQuery: boolean;
  readonly fromSql: string;
  readonly whereSql: string;
  readonly whereParams: readonly unknown[];
  readonly bindParameterCount: number;
}

export interface SearchBackend {
  readonly id: string;
  readonly baseCapabilities: SearchCapabilities;
  resolveCapabilities(ctx: CapabilityResolutionContext): EffectiveCapabilities;
  compilePhysicalManifest(ctx: IndexCompileContext): PhysicalSchemaManifest;
  classifyPhysicalChange(
    previous: PhysicalSchemaManifest | null,
    next: PhysicalSchemaManifest,
  ): PhysicalChange;
  compileSearch(ctx: SearchCompileContext): CompiledSearch;
}
