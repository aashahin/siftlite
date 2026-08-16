import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { createIndex } from "@siftlite/fts5";
import { defineDrizzleIndex, drizzleSearch } from "@siftlite/drizzle";

const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
});

const articlesSearch = defineDrizzleIndex(articles, {
  id: articles.id,
  searchable: { title: { weight: 1 } },
  filterable: { status: articles.status },
});

const sqlite = new Database(":memory:");
sqlite.run(
  "CREATE TABLE articles (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, published_at INTEGER)",
);
const adapter = bunSqliteAdapter(sqlite);
await createIndex({ adapter, definition: articlesSearch.definition });
const db = drizzle(sqlite, { schema: { articles } });
await db.insert(articles).values({ id: "a1", title: "drizzle search", status: "active" });
const result = await drizzleSearch(db, articlesSearch, adapter).search("drizzle", {
  hydrate: true,
});
console.log(JSON.stringify({ hits: result.hits.map((hit) => hit.id) }));
