import {
  hashLogicalDefinition,
  hashPhysicalManifest,
  physicalIndexIdFor,
  type IndexDefinition,
} from "@siftlite/core";
import { compileFts5PhysicalManifest, compileIndexLifecycleSql } from "@siftlite/fts5";

export interface PrismaSearchMigration {
  readonly indexName: string;
  readonly logicalDefinitionHash: string;
  readonly physicalSchemaHash: string;
  readonly statements: readonly string[];
  readonly sql: string;
}

/**
 * Deterministic companion SQL for a subsequent Prisma migration directory.
 * Never rewrites previously applied Prisma migrations.
 */
export function generatePrismaSearchSql(
  definition: IndexDefinition,
  options: { readonly physicalIndexId?: string; readonly generation?: number } = {},
): PrismaSearchMigration {
  const physicalIndexId = options.physicalIndexId ?? physicalIndexIdFor(definition.name);
  const generation = options.generation ?? 1;
  const statements = compileIndexLifecycleSql(definition, physicalIndexId, generation);
  const physical = compileFts5PhysicalManifest({ definition, physicalIndexId, generation });
  return {
    indexName: definition.name,
    logicalDefinitionHash: hashLogicalDefinition(definition),
    physicalSchemaHash: hashPhysicalManifest(physical),
    statements,
    sql: `${statements.map((statement) => `${statement};`).join("\n\n")}\n`,
  };
}
