# Drizzle and Prisma Integrations

## Principle

ORM integrations are ergonomic/type layers. They do not own the index or synchronization lifecycle.

## Drizzle — first-class integration

Drizzle should be the deepest v1 ORM integration because its TypeScript schema is available at runtime and it is close to SQL.

### Desired API

```ts
import { defineDrizzleIndex } from "@siftlite/drizzle";
import { products } from "./schema";

export const productsSearch = defineDrizzleIndex(products, {
  id: products.id,
  normalization: ["arabic-basic"],
  searchable: {
    name: { weight: 5 },
    description: { weight: 1 },
  },
  filterable: {
    status: products.status,
    categoryId: products.categoryId,
    price: products.price,
  },
  sortable: {
    price: products.price,
    createdAt: products.createdAt,
  },
  facets: [products.categoryId, products.status],
});
```

The integration converts this to the same canonical `IndexDefinition` used by non-Drizzle callers.

### Required inference

Infer where stable:

- SQL table name;
- SQL column name;
- TypeScript field type;
- nullable state;
- primary-key candidate;
- SQLite storage type;
- whether the source ID maps safely to the portable `string | safe-integer number` contract.

Reject/require explicit manual configuration for IDs outside the portable v1 contract; never silently stringify or narrow them.

Do not depend on undocumented Drizzle internals if a public API does not expose the needed metadata. Create a narrow compatibility layer and pin/test supported Drizzle major versions.

### Migrations

FTS5 virtual-table DDL should be emitted as companion SQL migration content.

Recommended workflow:

```text
drizzle-kit generate
siftlite generate --integration drizzle
```

`siftlite generate` is already implemented by the lifecycle phase before ORM integrations land. The Drizzle integration feeds its canonical index definition into that generator. It may output a deterministic companion migration fragment/file rather than editing existing Drizzle SQL unpredictably.

Rules:

- never mutate previously applied migrations;
- search migration records logical definition hash plus backend physical-schema hash/version;
- `check` fails if application Drizzle schema changed in a way that invalidates the search schema;
- raw SQL is acceptable and expected for virtual tables/triggers.

### Drizzle search service

Canonical:

```ts
const products = engine.index(productsSearch);
const hits = await products.search("...");
```

Optional helper:

```ts
const results = await drizzleSearch(db, productsSearch).search("...", {
  hydrate: true,
});
```

Hydration should execute one `IN (...)` query (chunked if necessary), then restore search rank order in JavaScript.

Do not monkey-patch `db` or Drizzle table objects.

## Prisma integration

Prisma is more generated/abstracted. Keep its integration separate from schema DDL.

### Rules

1. Do not attempt to model FTS5 virtual tables in `schema.prisma`.
2. Do not rely on Prisma query hooks/extensions to synchronize the FTS index.
3. Use companion SQL migrations for search structures.
4. Use Prisma Client Extensions for optional ergonomic model methods.
5. Keep the canonical search service available even if extension typing becomes constrained by a Prisma release.

### Canonical service API

```ts
const productSearch = createPrismaSearch({
  prisma,
  engine,
  model: "product",
  index: productsIndex,
});

const result = await productSearch.search("iphone", {
  filter: eq("status", "ACTIVE"),
  hydrate: true,
});
```

### Optional model extension

Prisma officially supports adding custom methods to models through Client Extensions. Provide a shareable extension after the service API is stable:

```ts
const base = new PrismaClient();
const prisma = base.$extends(
  searchExtension({
    prisma: base,
    adapter,
    models: {
      product: productsIndex,
    },
  }),
);

const result = await prisma.product.search("iphone", {
  filter: eq("status", "ACTIVE"),
});
```

### Type-safety target for v1

Required:

- model name checked by configuration typing where possible;
- returned hydrated record is the full generated model type;
- index ID type matches the model only when it is a portable string or safe-integer numeric ID; unsupported ID types fail clearly;
- search filter/facet/sort keys are typed from `IndexDefinition`.

Not required for first v1 implementation:

- arbitrary Prisma `select` inference through `.search()`;
- arbitrary `include` relation inference;
- Prisma `WhereInput` translation into search filters;
- nested-write interception.

These can be layered later. Avoid sacrificing reliability for an overly magical generic extension.

### Prisma migrations

Supported workflow (the search generator already exists before the Prisma phase):

```text
prisma migrate dev --create-only
siftlite generate --integration prisma
```

Safer implementation options:

1. generate a deterministic separate subsequent migration directory; or
2. output SQL that the user/agent explicitly places in a migration before apply.

Do not automatically rewrite arbitrary Prisma migration files without deterministic tests.

## Source-ID behavior in ORM integrations

ORM integrations must preserve the core source-ID contract rather than widening it opportunistically.

- string/UUID-like IDs remain strings and are stored as `TEXT`;
- numeric IDs must be finite safe integers before reaching an adapter;
- Prisma/Drizzle `bigint` IDs are not silently converted to `number`; v1 reports them as unsupported for the portable linked/search ID path;
- composite IDs are deferred;
- hydration restores records using the same declared ID type.

This avoids a library that appears type-safe at compile time but loses identifier precision or identity at D1/runtime boundaries.

## Why no ORM synchronization hooks

This must remain true:

```text
raw SQL INSERT/UPDATE/DELETE
            |
      source table
            |
      database trigger
            |
     search projection
```

not:

```text
Prisma/Drizzle write
       |
 application callback
       |
 search update
```

The latter breaks when writes bypass the ORM.

## ORM version compatibility

Maintain a matrix in CI, not vague “supports Drizzle/Prisma” statements.

For each supported major/minor family:

- compile-time type fixture;
- migration generation fixture;
- runtime CRUD -> search consistency test;
- hydration test.

Use peer-dependency ranges only after the test matrix proves them.

## ORM-independent escape hatch

Every ORM integration should expose the canonical underlying index definition or handle so users can drop to:

```ts
engine.index(productsIndex).search(...)
```

This protects the project against ORM API churn.

## ORM-to-core type boundary

Drizzle and Prisma integrations must map ORM metadata into SiftLite's canonical `SearchStorageKind`/codec schema before core sees the definition. Core must not depend on ORM-specific column classes or JavaScript representations.

Examples:

- Drizzle/Prisma string-like scalar -> `text` only when its runtime value is a string;
- integer -> `safe-integer` with runtime range validation;
- floating number -> `finite-real`;
- boolean -> `boolean-integer`;
- dates/timestamps require an explicit SiftLite storage-unit decision instead of guessing from ORM serialization.

Unsupported ORM types fail at definition time with a clear message rather than being stringified silently.
