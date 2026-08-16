import {
  hashLogicalDefinition,
  hashPhysicalManifest,
  physicalIndexIdFor,
  type IndexDefinition,
} from "@siftlite/core";
import {
  compileBackfillSql,
  compileDocsDdl,
  compileFts5PhysicalManifest,
  compileFtsDdl,
  compileLinkedTriggers,
} from "@siftlite/fts5";
import type { DrizzleIndex } from "./define-index.js";

export interface DrizzleSearchMigration {
  readonly indexName: string;
  readonly logicalDefinitionHash: string;
  readonly physicalSchemaHash: string;
  readonly statements: readonly string[];
  readonly sql: string;
}

export function generateDrizzleSearchSql(
  index: DrizzleIndex | IndexDefinition,
  options: { readonly physicalIndexId?: string; readonly generation?: number } = {},
): DrizzleSearchMigration {
  const definition = "definition" in index ? index.definition : index;
  const physicalIndexId = options.physicalIndexId ?? physicalIndexIdFor(definition.name);
  const generation = options.generation ?? 1;
  const statements = [
    compileDocsDdl(definition, physicalIndexId, generation),
    compileFtsDdl(definition, physicalIndexId, generation),
    ...(definition.mode === "linked"
      ? compileLinkedTriggers(definition, physicalIndexId, generation)
      : []),
    ...(definition.mode === "linked"
      ? compileBackfillSql(definition, physicalIndexId, generation)
      : []),
  ];
  const physical = compileFts5PhysicalManifest({ definition, physicalIndexId, generation });
  return {
    indexName: definition.name,
    logicalDefinitionHash: hashLogicalDefinition(definition),
    physicalSchemaHash: hashPhysicalManifest(physical),
    statements,
    sql: `${statements.map((statement) => `${statement};`).join("\n\n")}\n`,
  };
}
