# `@siftlite/prisma`

Optional Prisma companion. It does **not** model FTS5 in `schema.prisma`
and does **not** use Prisma query hooks to synchronize indexes.
`@prisma/client` is an optional peer and is never required to compile this
package.

```ts
const productSearch = createPrismaSearch({
  prisma,
  adapter,
  model: "product",
  index: productsIndex,
});

const result = await productSearch.search("iphone", { hydrate: true });
```

When the Prisma field name differs from the SQL primary-key column (for
example `pid` mapped to `"id"`), pass `prismaIdField`. Hydration `findMany`
and `row[id]` use that field. Triggers and companion SQL still use
`index.source.primaryKey.field`.

```ts
createPrismaSearch({
  prisma,
  adapter,
  model: "product",
  index: productsIndex,
  prismaIdField: "pid",
});
```

Companion SQL is a deterministic subsequent Prisma migration fragment. It
never rewrites previously applied migrations:

```ts
const migration = generatePrismaSearchSql(productsIndex);
```

`generatePrismaSearchSql` forwards `compileIndexLifecycleSql`, so the
fragment creates the physical objects and seeds a **pending** registry row.
Applying it is not enough: run `createIndex` once with the same definition to
verify the objects and mark the row `healthy`, then call `createPrismaSearch`.
An intact pending generation is reused; incomplete objects may be
rematerialized during recovery. A later call against an already-healthy row
fails with `SEARCH_CONFIG_INVALID` / `already-exists`.

The `0.1.0` companion-SQL generator does not emit the trigram table required by
`typoTolerance.mode: "fallback"`. Use runtime `createIndex` instead of the
companion-SQL path for those definitions.

Optional Client Extension (ergonomic only):

```ts
const base = new PrismaClient();
const prisma = base.$extends(
  searchExtension({
    prisma: base,
    adapter,
    models: { product: productsIndex },
    prismaIdFields: { product: "pid" },
  }),
);
```

Supported client family: Prisma 6 (`@prisma/client` ^6). Portable source IDs
remain `string | safe-integer`. BigInt and composite IDs are rejected by core.
