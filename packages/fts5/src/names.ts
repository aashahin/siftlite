import { assertSqlIdentifier, type IndexDefinition } from "@siftlite/core";

export interface PhysicalNames {
  readonly docs: string;
  readonly fts: string;
  readonly ftsTrigram: string;
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
    ftsTrigram: assertSqlIdentifier(`${prefix}_tri`),
  };
}

export function sourceIdColumnType(definition: IndexDefinition): "TEXT" | "INTEGER" {
  return definition.source?.primaryKey.type === "safe-integer" ? "INTEGER" : "TEXT";
}

/** Failed rebuilds can leave objects at N-1 and N+1. */
export function adjacentLeftoverGenerations(activeGeneration: number): readonly number[] {
  return activeGeneration > 1
    ? [activeGeneration + 1, activeGeneration - 1]
    : [activeGeneration + 1];
}

export function dropTargetGenerations(activeGeneration: number): readonly number[] {
  return [activeGeneration, ...adjacentLeftoverGenerations(activeGeneration)];
}
