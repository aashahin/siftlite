import type { IndexCompileContext, PhysicalSchemaManifest } from "@siftlite/core";
import { physicalNames } from "./names.js";

export const FTS5_PHYSICAL_VERSION = 1;

export function compileFts5PhysicalManifest(ctx: IndexCompileContext): PhysicalSchemaManifest {
  const names = physicalNames(ctx.definition, ctx.physicalIndexId, ctx.generation);
  const projected = [
    ...ctx.definition.filterableOrder,
    ...ctx.definition.sortableOrder.filter((field) => !(field in ctx.definition.filterable)),
  ];
  return {
    backend: "fts5",
    version: FTS5_PHYSICAL_VERSION,
    objects: [
      { kind: "table", name: names.docs, columns: ["doc_id", "source_id", ...projected] },
      { kind: "virtual-table", name: names.fts, columns: [...ctx.definition.searchableOrder] },
    ],
    tokenizer: "unicode61",
    prefix: ctx.definition.prefix,
    searchable: [...ctx.definition.searchableOrder],
    projected,
    weightsQueryTime: true,
  };
}
