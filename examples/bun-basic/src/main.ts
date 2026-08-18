import { Database } from "bun:sqlite";
import { bunSqliteAdapter } from "@siftlite/bun";
import { defineIndex } from "@siftlite/core";
import { createFts5Engine } from "@siftlite/fts5";

const products = defineIndex({
  name: "products",
  mode: "linked",
  source: { table: "products", primaryKey: { field: "id", type: "string" } },
  searchable: { title: { weight: 1 } },
  filterable: { status: "text" },
});

const sqlite = new Database(":memory:");
sqlite.run(
  "CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL)",
);
sqlite.run("INSERT INTO products (id, title, status) VALUES (?, ?, ?)", [
  "p1",
  "sqlite search",
  "active",
]);

const engine = createFts5Engine({ adapter: bunSqliteAdapter(sqlite) });
const index = engine.index(products);
await index.create();
const result = await index.search("sqlite");
console.log(JSON.stringify({ hits: result.hits.map((hit) => hit.id) }));
