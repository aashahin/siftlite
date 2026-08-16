# `@siftlite/drizzle`

Optional Drizzle companion. It maps public Drizzle table metadata into
canonical SiftLite `IndexDefinition` values.

This package does **not** own index synchronization. Linked indexes stay
correct when writes go through Drizzle **or** raw SQL because database
triggers maintain FTS state.

Supported metadata surface (tested on `drizzle-orm@0.45.2`):

- `getTableName`
- `getTableColumns`
- column `name`, `dataType`, `columnType`, timestamp `mode`

```ts
import { defineDrizzleIndex, drizzleSearch } from "@siftlite/drizzle";
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
    price: products.price,
  },
});

const results = await drizzleSearch(db, productsSearch, adapter).search("iphone", {
  hydrate: true,
});
```

Unsupported Drizzle types (`blob`, `bigint`, JSON blobs) fail at definition
time. Timestamp columns use Drizzle's explicit `timestamp` / `timestamp_ms`
mode; generic integers are not guessed to be dates.

Canonical escape hatch:

```ts
productsSearch.definition;
```
