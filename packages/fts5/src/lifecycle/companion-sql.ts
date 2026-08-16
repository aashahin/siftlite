import type { IndexDefinition } from "@siftlite/core";
import {
  compileBackfillSql,
  compileDocsDdl,
  compileFtsDdl,
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
    compileDocsDdl(definition, physicalIndexId, generation),
    ...compileProjectionIndexes(definition, physicalIndexId, generation),
    compileFtsDdl(definition, physicalIndexId, generation, options),
    ...(definition.mode === "linked"
      ? [
          ...compileLinkedTriggers(definition, physicalIndexId, generation),
          ...compileBackfillSql(definition, physicalIndexId, generation),
        ]
      : []),
  ];
}
