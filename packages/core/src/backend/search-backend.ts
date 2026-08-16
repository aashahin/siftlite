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
}

export type SearchSort =
  | { readonly kind: "relevance" }
  | { readonly kind: "field"; readonly field: string; readonly direction: "asc" | "desc" };

export interface CompiledSearch {
  readonly statement: SqlStatement;
  readonly emptyQuery: boolean;
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
