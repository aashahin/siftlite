import {
  hasOwnField,
  type IndexCompileContext,
  type PhysicalObject,
  type PhysicalSchemaManifest,
} from "@siftlite/core";
import { triggerNames } from "./lifecycle/triggers.js";
import { physicalNames } from "./names.js";

export const FTS5_PHYSICAL_VERSION = 1;

export function compileFts5PhysicalManifest(
  ctx: IndexCompileContext,
  options?: { readonly secureDelete?: boolean },
): PhysicalSchemaManifest {
  const names = physicalNames(ctx.definition, ctx.physicalIndexId, ctx.generation);
  const projected = [
    ...ctx.definition.filterableOrder,
    ...ctx.definition.sortableOrder.filter(
      (field) => !hasOwnField(ctx.definition.filterable, field),
    ),
  ];
  const objects: PhysicalObject[] = [
    {
      kind: "table",
      name: names.docs,
      columns: [
        "doc_id",
        "source_id",
        ...ctx.definition.searchableOrder.map((field) => `${field}_source:text`),
        ...projected.map((field) => projectedColumnToken(ctx, field)),
      ],
    },
    { kind: "virtual-table", name: names.fts, columns: [...ctx.definition.searchableOrder] },
  ];
  if (ctx.definition.mode === "linked" && ctx.definition.source) {
    const triggers = triggerNames(names.docs);
    objects.push(
      { kind: "trigger", name: triggers.insert },
      { kind: "trigger", name: triggers.update },
      { kind: "trigger", name: triggers.delete },
    );
  }
  return {
    backend: "fts5",
    version: FTS5_PHYSICAL_VERSION,
    objects,
    tokenizer: "unicode61",
    prefix: ctx.definition.prefix,
    searchable: [...ctx.definition.searchableOrder],
    projected,
    weightsQueryTime: true,
    physicalConfig: {
      mode: ctx.definition.mode,
      normalization: ctx.definition.normalization.join(","),
      sourceTable: ctx.definition.source?.table ?? "",
      sourcePkField: ctx.definition.source?.primaryKey.field ?? "",
      sourcePkType: ctx.definition.source?.primaryKey.type ?? "",
      secureDelete: options?.secureDelete === true ? "1" : "0",
    },
  };
}

function projectedColumnToken(ctx: IndexCompileContext, field: string): string {
  const spec = ctx.definition.filterable[field] ?? ctx.definition.sortable[field];
  const kind = spec?.storageKind ?? "text";
  return spec?.timestampUnit ? `${field}:${kind}:${spec.timestampUnit}` : `${field}:${kind}`;
}
