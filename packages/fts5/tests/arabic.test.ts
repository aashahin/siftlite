import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  collectTextTerms,
  defineIndex,
  parsePlainTextQuery,
  physicalIndexIdFor,
  sql,
  DEFAULT_APPLICATION_LIMITS,
} from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { runArabicNormalizationCorpus } from "../../testing/src/arabic-conformance.ts";
import { createIndex, createManualFts5Proof, searchFts5Index } from "../src/index.ts";

describe("Phase 9 Arabic normalization on Bun", () => {
  test("JS and SQL corpus outputs are identical", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    await runArabicNormalizationCorpus(adapter);
  });

  test("linked triggers index normalized text and hydrate the original", async () => {
    const db = new Database(":memory:");
    const adapter = bunSqliteAdapter(db);
    await adapter.execute(
      sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, description TEXT, status TEXT)"),
    );
    const definition = defineIndex({
      name: "products",
      mode: "linked",
      source: { table: "products", primaryKey: { field: "id", type: "string" } },
      normalization: ["arabic-basic"],
      searchable: { name: { weight: 5 }, description: { weight: 1 } },
      filterable: { status: "text" },
    });
    await createIndex({ adapter, definition });
    await adapter.execute(
      sql("INSERT INTO products (id, name, description, status) VALUES (?, ?, ?, ?)", [
        "p1",
        "آيفون",
        "هاتف",
        "active",
      ]),
    );

    const result = await searchFts5Index(
      {
        adapter,
        definition,
        physicalIndexId: physicalIndexIdFor("products"),
        generation: 1,
      },
      "اَيفون",
      { hydrate: true },
    );
    expect(result.hits.map((hit) => hit.id)).toEqual(["p1"]);
    expect(result.hits[0]?.document?.["name"]).toBe("آيفون");

    const alef = await searchFts5Index(
      {
        adapter,
        definition,
        physicalIndexId: physicalIndexIdFor("products"),
        generation: 1,
      },
      "أيفون",
    );
    expect(alef.hits.map((hit) => hit.id)).toEqual(["p1"]);
  });

  test("manual upsert normalizes FTS text without mutating source columns", async () => {
    const adapter = bunSqliteAdapter(new Database(":memory:"));
    const definition = defineIndex({
      name: "articles",
      mode: "manual",
      source: { table: "articles", primaryKey: { field: "id", type: "string" } },
      normalization: ["arabic-basic"],
      searchable: { title: { weight: 1 } },
    });
    const index = await createManualFts5Proof({ adapter, definition });
    await index.upsert([{ id: "a1", searchable: { title: "إلى الإدارة" } }]);
    expect((await index.search("الي الادارة")).map((hit) => hit.id)).toEqual(["a1"]);
    expect((await index.search("إلى")).map((hit) => hit.id)).toEqual(["a1"]);
  });

  test("portable parser is not an FTS5 unicode61 clone", async () => {
    const limits = DEFAULT_APPLICATION_LIMITS;
    expect(collectTextTerms(parsePlainTextQuery("ايفون، pro", { limits }))).toEqual([
      "ايفون",
      "pro",
    ]);
    const withHarakat = collectTextTerms(parsePlainTextQuery("اَيفون", { limits }));
    expect(withHarakat).toEqual(["اَيفون"]);

    const db = new Database(":memory:");
    db.run("CREATE VIRTUAL TABLE docs USING fts5(title, tokenize='unicode61')");
    db.run("INSERT INTO docs (rowid, title) VALUES (1, 'اَيفون'), (2, 'ايفون📱pro')");
    db.run("CREATE VIRTUAL TABLE vocab USING fts5vocab(docs, row)");
    const tokens = (db.query("SELECT term FROM vocab").all() as { term: string }[]).map(
      (row) => row.term,
    );
    expect(tokens).toContain("ا");
    expect(tokens).toContain("يفون");
    expect(tokens).not.toContain("اَيفون");
    expect(tokens).toContain("pro");
    expect(tokens).not.toContain("📱");
    expect(collectTextTerms(parsePlainTextQuery("ايفون📱pro", { limits }))).toEqual(["ايفون📱pro"]);
    expect(collectTextTerms(parsePlainTextQuery("ايفون 📱 pro", { limits }))).toEqual([
      "ايفون",
      "📱",
      "pro",
    ]);
  });
});
