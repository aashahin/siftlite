import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { defineDrizzleIndex } from "../src/index.ts";

const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  price: integer("price"),
});

export const productsSearch = defineDrizzleIndex(products, {
  id: products.id,
  searchable: { name: { weight: 5 } },
  filterable: { status: products.status, price: products.price },
});

type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

export type _name = Expect<Extends<(typeof productsSearch)["definition"]["name"], string>>;
export type _mode = Expect<
  Extends<(typeof productsSearch)["definition"]["mode"], "linked" | "manual">
>;
export const _canonical = productsSearch.definition;
