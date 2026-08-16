import { SearchError } from "../errors/search-error.js";
import { assertFieldName, assertIndexName, assertTableName } from "./identifiers.js";
import { resolveFieldType } from "./resolve-field-type.js";
import {
  LOGICAL_FORMAT_VERSION,
  type IndexDefinition,
  type IndexDefinitionInput,
  type ResolvedFieldType,
  type SourceIdType,
} from "./types.js";

export function table(
  name: string,
  options: {
    readonly primaryKey: {
      readonly field: string;
      readonly type: "string" | "integer" | "safe-integer";
    };
  },
): {
  readonly table: string;
  readonly primaryKey: { readonly field: string; readonly type: SourceIdType };
} {
  return {
    table: name,
    primaryKey: {
      field: options.primaryKey.field,
      type: options.primaryKey.type === "string" ? "string" : "safe-integer",
    },
  };
}

export function defineIndex(input: IndexDefinitionInput): IndexDefinition {
  const name = assertIndexName(input.name);
  if (input.mode !== "linked" && input.mode !== "manual") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "index mode must be linked or manual",
      details: { reason: "invalid-mode" },
    });
  }

  const source = resolveSource(input);
  const searchableOrder = Object.keys(input.searchable);
  if (searchableOrder.length === 0) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "at least one searchable field is required",
      details: { reason: "empty-searchable" },
    });
  }

  const searchable: Record<string, { readonly weight: number }> = {};
  for (const field of searchableOrder) {
    assertFieldName(field, "searchable");
    const config = input.searchable[field];
    if (!config || !Number.isFinite(config.weight) || config.weight <= 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `searchable field ${field} requires a positive finite weight`,
        details: { reason: "invalid-weight" },
      });
    }
    searchable[field] = { weight: config.weight };
  }

  const filterableOrder = Object.keys(input.filterable ?? {});
  const filterable: Record<string, ResolvedFieldType> = {};
  for (const field of filterableOrder) {
    assertFieldName(field, "filterable");
    const spec = input.filterable?.[field];
    if (spec === undefined) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `filterable field ${field} is missing a type`,
        details: { reason: "missing-field-type" },
      });
    }
    filterable[field] = resolveFieldType(spec, field);
  }

  const sortableOrder = Object.keys(input.sortable ?? {});
  const sortable: Record<string, ResolvedFieldType> = {};
  for (const field of sortableOrder) {
    assertFieldName(field, "sortable");
    const spec = input.sortable?.[field];
    if (spec === undefined) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `sortable field ${field} is missing a type`,
        details: { reason: "missing-field-type" },
      });
    }
    sortable[field] = resolveFieldType(spec, field);
  }

  const facets = [...(input.facets ?? [])];
  for (const field of facets) {
    assertFieldName(field, "facet");
    if (!(field in filterable) && !(field in sortable)) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `facet ${field} must be declared filterable or sortable`,
        details: { reason: "undeclared-facet" },
      });
    }
  }

  const prefix = [...(input.prefix ?? [])];
  for (const length of prefix) {
    if (!Number.isSafeInteger(length) || length < 1 || length > 8) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "prefix lengths must be safe integers between 1 and 8",
        details: { reason: "invalid-prefix" },
      });
    }
  }

  const normalization = [...(input.normalization ?? [])];
  for (const profile of normalization) {
    if (typeof profile !== "string" || profile.length === 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "normalization profiles must be non-empty strings",
        details: { reason: "invalid-normalization" },
      });
    }
  }

  const matchingStrategy = input.matchingStrategy ?? "all";
  if (
    matchingStrategy !== "all" &&
    matchingStrategy !== "any" &&
    matchingStrategy !== "last-prefix"
  ) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "matchingStrategy must be all, any, or last-prefix",
      details: { reason: "invalid-matching-strategy" },
    });
  }

  const typoTolerance = input.typoTolerance ?? { mode: "off" };
  if (typoTolerance.mode !== "off" && typoTolerance.mode !== "fallback") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "typoTolerance.mode must be off or fallback",
      details: { reason: "invalid-typo-mode" },
    });
  }

  const synonyms: Record<string, readonly string[]> = {};
  for (const [key, values] of Object.entries(input.synonyms ?? {})) {
    if (key.length === 0 || values.some((value) => value.length === 0)) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "synonym keys and values must be non-empty",
        details: { reason: "invalid-synonym" },
      });
    }
    synonyms[key] = [...values];
  }

  return {
    logicalFormatVersion: LOGICAL_FORMAT_VERSION,
    name,
    mode: input.mode,
    source,
    normalization,
    searchable,
    searchableOrder,
    filterable,
    filterableOrder,
    sortable,
    sortableOrder,
    facets,
    prefix,
    typoTolerance,
    synonyms,
    matchingStrategy,
  };
}

function resolveSource(input: IndexDefinitionInput): IndexDefinition["source"] {
  if (input.mode === "linked") {
    if (!input.source) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "linked indexes require a source table",
        details: { reason: "missing-source" },
      });
    }
    return normalizeSource(input.source);
  }
  return input.source ? normalizeSource(input.source) : undefined;
}

function normalizeSource(
  source: NonNullable<IndexDefinitionInput["source"]>,
): NonNullable<IndexDefinition["source"]> {
  assertTableName(source.table);
  assertFieldName(source.primaryKey.field, "primaryKey");
  if (source.primaryKey.type !== "string" && source.primaryKey.type !== "safe-integer") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "source primary key type must be string or safe-integer",
      details: { reason: "invalid-source-id-type" },
    });
  }
  return {
    table: source.table,
    primaryKey: {
      field: source.primaryKey.field,
      type: source.primaryKey.type,
    },
  };
}
