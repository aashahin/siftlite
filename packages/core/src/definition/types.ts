import type { SearchStorageKind, TimestampUnit } from "../codecs/kinds.js";

/** Logical definition format version included in the definition hash. */
export const LOGICAL_FORMAT_VERSION = 1;

export type IndexMode = "linked" | "manual";

export type SourceIdType = "string" | "safe-integer";

export type MatchingStrategy = "all" | "any" | "last-prefix";

export type TypoToleranceMode = "off" | "fallback";

export type FieldTypeShorthand = "text" | "number" | "integer" | "boolean";

export type FieldTypeSpec =
  | FieldTypeShorthand
  | SearchStorageKind
  | { readonly kind: "timestamp-integer"; readonly unit: TimestampUnit };

export interface SourcePrimaryKey {
  readonly field: string;
  readonly type: SourceIdType;
}

export interface SourceTable {
  readonly table: string;
  readonly primaryKey: SourcePrimaryKey;
}

export interface SearchableFieldConfig {
  readonly weight: number;
}

export interface TypoToleranceConfig {
  readonly mode: TypoToleranceMode;
}

export interface IndexDefinitionInput {
  readonly name: string;
  readonly mode: IndexMode;
  readonly source?: SourceTable;
  readonly normalization?: readonly string[];
  readonly searchable: Readonly<Record<string, SearchableFieldConfig>>;
  readonly filterable?: Readonly<Record<string, FieldTypeSpec>>;
  readonly sortable?: Readonly<Record<string, FieldTypeSpec>>;
  readonly facets?: readonly string[];
  readonly prefix?: readonly number[];
  readonly typoTolerance?: TypoToleranceConfig;
  readonly synonyms?: Readonly<Record<string, readonly string[]>>;
  readonly matchingStrategy?: MatchingStrategy;
}

export interface ResolvedFieldType {
  readonly storageKind: SearchStorageKind;
  readonly timestampUnit?: TimestampUnit;
}

export interface IndexDefinition {
  readonly logicalFormatVersion: typeof LOGICAL_FORMAT_VERSION;
  readonly name: string;
  readonly mode: IndexMode;
  readonly source: SourceTable | undefined;
  readonly normalization: readonly string[];
  readonly searchable: Readonly<Record<string, SearchableFieldConfig>>;
  readonly searchableOrder: readonly string[];
  readonly filterable: Readonly<Record<string, ResolvedFieldType>>;
  readonly filterableOrder: readonly string[];
  readonly sortable: Readonly<Record<string, ResolvedFieldType>>;
  readonly sortableOrder: readonly string[];
  readonly facets: readonly string[];
  readonly prefix: readonly number[];
  readonly typoTolerance: TypoToleranceConfig;
  readonly synonyms: Readonly<Record<string, readonly string[]>>;
  readonly matchingStrategy: MatchingStrategy;
}

export interface CanonicalLogicalDefinition {
  readonly logicalFormatVersion: number;
  readonly name: string;
  readonly mode: IndexMode;
  readonly source: { readonly table: string; readonly primaryKey: SourcePrimaryKey } | null;
  readonly normalization: readonly string[];
  readonly searchable: readonly { readonly field: string; readonly weight: number }[];
  readonly filterable: readonly { readonly field: string; readonly type: ResolvedFieldType }[];
  readonly sortable: readonly { readonly field: string; readonly type: ResolvedFieldType }[];
  readonly facets: readonly string[];
  readonly prefix: readonly number[];
  readonly typoTolerance: TypoToleranceConfig;
  readonly synonyms: readonly { readonly key: string; readonly values: readonly string[] }[];
  readonly matchingStrategy: MatchingStrategy;
}
