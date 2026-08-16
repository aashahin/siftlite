import type { IndexDefinition } from "@siftlite/core";
import { compileBackfillSql, compileDocsDdl, compileFtsDdl } from "./schema.js";
import { compileLinkedTriggers } from "./triggers.js";

export function compileIndexLifecycleSql(
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): readonly string[] {
  return [
    compileDocsDdl(definition, physicalIndexId, generation),
    compileFtsDdl(definition, physicalIndexId, generation),
    ...(definition.mode === "linked"
      ? [
          ...compileLinkedTriggers(definition, physicalIndexId, generation),
          ...compileBackfillSql(definition, physicalIndexId, generation),
        ]
      : []),
  ];
}
