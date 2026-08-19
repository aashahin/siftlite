import {
  hashLogicalDefinition,
  hashPhysicalManifest,
  quoteIdent,
  REGISTRY_TABLE,
  sqlStringLiteral,
  type IndexDefinition,
} from "@siftlite/core";
import { compileFts5PhysicalManifest } from "../manifest.js";
import { compileEnsureRegistrySql, REGISTRY_SQL_COLUMNS } from "./registry-sql.js";
import {
  compileBackfillSql,
  compileDocsDdl,
  compileFtsDdl,
  compileFtsTrigramDdl,
  compileProjectionIndexes,
} from "./schema.js";
import { compileLinkedTriggers } from "./triggers.js";

export function compileIndexLifecycleSql(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
  options?: { readonly secureDelete?: boolean },
): readonly string[] {
  return [
    compileEnsureRegistrySql(),
    compileRegistrySeedSql(definition, physicalIndexId, generation, options),
    compileDocsDdl(definition, physicalIndexId, generation),
    ...compileProjectionIndexes(definition, physicalIndexId, generation),
    compileFtsDdl(definition, physicalIndexId, generation, options),
    ...(definition.typoTolerance.mode === "fallback"
      ? [compileFtsTrigramDdl(definition, physicalIndexId, generation)]
      : []),
    ...(definition.mode === "linked"
      ? [
          ...compileLinkedTriggers(definition, physicalIndexId, generation),
          ...compileBackfillSql(definition, physicalIndexId, generation),
        ]
      : []),
  ];
}

// Pending: this INSERT is emitted before object DDL in the companion script.
function compileRegistrySeedSql(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
  options?: { readonly secureDelete?: boolean },
): string {
  const manifest = compileFts5PhysicalManifest(
    { definition, physicalIndexId, generation },
    { secureDelete: options?.secureDelete === true },
  );
  const sourceTable = definition.source ? sqlStringLiteral(definition.source.table) : "NULL";
  return `INSERT INTO ${quoteIdent(REGISTRY_TABLE)} (
      ${REGISTRY_SQL_COLUMNS.join(", ")}
    ) VALUES (
      ${sqlStringLiteral(definition.name)},
      ${sqlStringLiteral(physicalIndexId)},
      ${generation},
      ${sqlStringLiteral(hashLogicalDefinition(definition))},
      ${manifest.version},
      ${sqlStringLiteral(hashPhysicalManifest(manifest))},
      ${sqlStringLiteral("fts5")},
      ${sourceTable},
      ${sqlStringLiteral(definition.mode)},
      0,
      0,
      ${sqlStringLiteral("pending")}
    )
    ON CONFLICT(index_name) DO NOTHING`;
}
