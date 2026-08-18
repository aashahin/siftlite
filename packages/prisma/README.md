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
fragment includes `__sift_registry` DDL when that compiler emits it. Search
still requires a **healthy** registry row. Applying companion SQL is not
enough: after the source table exists, call `createIndex` and then
`createPrismaSearch` / `.search()`. Do not apply the fragment and then
`createIndex` on the same database — `createIndex` rematerializes the same
physical objects.

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
