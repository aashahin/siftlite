import { canonicalizeJson } from "../hash/canonical-json.js";
import { sha256Hex } from "../hash/sha256.js";
import type { CanonicalLogicalDefinition, IndexDefinition } from "./types.js";

export function canonicalizeIndexDefinition(
  definition: IndexDefinition,
): CanonicalLogicalDefinition {
  return {
    logicalFormatVersion: definition.logicalFormatVersion,
    name: definition.name,
    mode: definition.mode,
    source: definition.source
      ? {
          table: definition.source.table,
          primaryKey: definition.source.primaryKey,
        }
      : null,
    normalization: [...definition.normalization],
    searchable: definition.searchableOrder.map((field) => ({
      field,
      weight: definition.searchable[field]?.weight ?? 0,
    })),
    filterable: definition.filterableOrder.map((field) => ({
      field,
      type: definition.filterable[field] ?? { storageKind: "text" },
    })),
    sortable: definition.sortableOrder.map((field) => ({
      field,
      type: definition.sortable[field] ?? { storageKind: "text" },
    })),
    facets: [...definition.facets],
    prefix: [...definition.prefix],
    typoTolerance: definition.typoTolerance,
    synonyms: Object.keys(definition.synonyms)
      .sort()
      .map((key) => ({
        key,
        values: [...(definition.synonyms[key] ?? [])],
      })),
    matchingStrategy: definition.matchingStrategy,
  };
}

export function hashLogicalDefinition(definition: IndexDefinition): string {
  return sha256Hex(canonicalizeJson(canonicalizeIndexDefinition(definition)));
}
