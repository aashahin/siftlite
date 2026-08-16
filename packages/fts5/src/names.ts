import { assertSqlIdentifier, type IndexDefinition } from "@siftlite/core";

export interface PhysicalNames {
  readonly docs: string;
  readonly fts: string;
}

export function physicalNames(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): PhysicalNames {
  const prefix = `__sift_${definition.name}_${physicalIndexId}_g${generation}`;
  return {
    docs: assertSqlIdentifier(`${prefix}_docs`),
    fts: assertSqlIdentifier(`${prefix}_fts`),
  };
}

export function sourceIdColumnType(definition: IndexDefinition): "TEXT" | "INTEGER" {
  return definition.source?.primaryKey.type === "safe-integer" ? "INTEGER" : "TEXT";
}
