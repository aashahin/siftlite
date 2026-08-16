import type { IndexCompileContext, PhysicalSchemaManifest } from "@siftlite/core";

export function compileTursoPhysicalManifest(ctx: IndexCompileContext): PhysicalSchemaManifest {
  const indexName = `sift_${ctx.definition.name}_${ctx.physicalIndexId}_g${ctx.generation}`;
  return {
    backend: "turso-native",
    version: 1,
    objects: [
      {
        kind: "index",
        name: indexName,
        columns: [...ctx.definition.searchableOrder],
      },
    ],
    tokenizer: "default",
    prefix: ctx.definition.prefix,
    searchable: [...ctx.definition.searchableOrder],
    projected: [...ctx.definition.filterableOrder],
    weightsQueryTime: false,
    physicalConfig: Object.fromEntries(
      ctx.definition.searchableOrder.map((field) => [
        `weight:${field}`,
        ctx.definition.searchable[field]?.weight ?? 1,
      ]),
    ),
  };
}

export function compileTursoDdl(ctx: IndexCompileContext): string {
  const manifest = compileTursoPhysicalManifest(ctx);
  const index = manifest.objects[0];
  if (!index) {
    throw new Error("native manifest missing index object");
  }
  const weighted = ctx.definition.searchableOrder
    .map((field) => {
      const weight = ctx.definition.searchable[field]?.weight ?? 1;
      return weight === 1 ? field : `${field} weight=${weight}`;
    })
    .join(", ");
  const table = ctx.definition.source?.table ?? ctx.definition.name;
  return `CREATE INDEX ${index.name} ON ${table} USING fts (${weighted})`;
}
