# `@siftlite/prisma`

Optional Prisma companion. It does **not** model FTS5 in `schema.prisma`
and does **not** use Prisma query hooks to synchronize indexes.

```ts
const productSearch = createPrismaSearch({
  prisma,
  adapter,
  model: "product",
  index: productsIndex,
});

const result = await productSearch.search("iphone", { hydrate: true });
```

Companion SQL is a deterministic subsequent migration fragment:

```ts
const migration = generatePrismaSearchSql(productsIndex);
```

Optional Client Extension (ergonomic only):

```ts
const prisma = new PrismaClient().$extends(
  searchExtension({
    adapter,
    models: { product: productsIndex },
  }),
);
```

Supported client family: Prisma 6 (`@prisma/client` ^6). Portable source IDs
remain `string | safe-integer`. BigInt and composite IDs are rejected by core.
