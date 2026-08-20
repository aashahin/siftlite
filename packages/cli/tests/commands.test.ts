import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineIndex, sql } from "@siftlite/core";
import { bunSqliteAdapter } from "@siftlite/bun";
import { createFts5Engine, readRegistry } from "@siftlite/fts5";
import { runBackfill } from "../src/commands/backfill.ts";
import { runDrop } from "../src/commands/drop.ts";
import { runMerge } from "../src/commands/merge.ts";
import { runRebuild } from "../src/commands/rebuild.ts";
import type { CommandContext } from "../src/types.ts";
import { importSiftLiteConfig, runCli } from "../src/index.ts";

const testsDir = dirname(fileURLToPath(import.meta.url));
const tmpRoot = join(testsDir, "tmp");
const tmpDirs: string[] = [];

function tempDir(): string {
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(join(tmpRoot, "mutate-"));
  tmpDirs.push(dir);
  return dir;
}

function writeBunConfig(dir: string): string {
  const path = join(dir, "siftlite.config.mjs");
  writeFileSync(
    path,
    `import { Database } from "bun:sqlite";
import { bunSqliteAdapter } from "@siftlite/bun";
import { defineIndex } from "@siftlite/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export function createAdapter() {
  return bunSqliteAdapter(new Database(join(dir, "siftlite.sqlite")));
}

export const indexes = defineIndex({
  name: "products",
  mode: "linked",
  source: { table: "products", primaryKey: { field: "id", type: "string" } },
  searchable: { name: { weight: 5 } },
  filterable: { status: "text" },
});
`,
    "utf8",
  );
  return path;
}

function catalogDefinition() {
  return defineIndex({
    name: "products",
    mode: "linked",
    source: { table: "products", primaryKey: { field: "id", type: "string" } },
    searchable: { name: { weight: 5 } },
    filterable: { status: "text" },
  });
}

async function tempSqlite(): Promise<{
  adapter: ReturnType<typeof bunSqliteAdapter>;
  definition: ReturnType<typeof catalogDefinition>;
  context: CommandContext;
}> {
  const adapter = bunSqliteAdapter(new Database(":memory:"));
  await adapter.execute(sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"));
  await adapter.execute(
    sql("INSERT INTO products (id, name, status) VALUES (?, ?, ?), (?, ?, ?)", [
      "p1",
      "sqlite",
      "active",
      "p2",
      "libsql",
      "archived",
    ]),
  );
  const definition = catalogDefinition();
  return { adapter, definition, context: { adapter, definition } };
}

async function sourceRows(adapter: ReturnType<typeof bunSqliteAdapter>) {
  return adapter.query<{ id: string; name: string }>(
    sql("SELECT id, name FROM products ORDER BY id"),
  );
}

async function tableNames(adapter: ReturnType<typeof bunSqliteAdapter>) {
  const rows = await adapter.query<{ name: string }>(
    sql("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"),
  );
  return rows.map((row) => row.name);
}

function searchObjectTables(names: readonly string[]): string[] {
  return names.filter(
    (name) =>
      name.startsWith("__sift_") &&
      (name.endsWith("_docs") || name.endsWith("_fts") || name.endsWith("_tri")),
  );
}

describe("mutating CLI commands", () => {
  test("runCli still refuses drop without acknowledgement", async () => {
    const result = await runCli(["node", "siftlite", "drop"]);
    expect(result.status).toBe("error");
    expect(result.message).toContain("--acknowledge");
  });

  test("mutating commands refuse without --acknowledge", async () => {
    const { context } = await tempSqlite();
    for (const run of [runBackfill, runRebuild, runMerge, runDrop]) {
      const result = await run(["node", "siftlite"], context);
      expect(result.status).toBe("error");
      expect(result.message).toContain("--acknowledge");
    }
  });

  test("dry-run backfill/rebuild/merge/drop print a plan without executing", async () => {
    const { adapter, definition, context } = await tempSqlite();
    const backfill = await runBackfill(["--dry-run"], { ...context, dryRun: true });
    expect(backfill.status).toBe("ok");
    expect(backfill.message).toContain("dry-run");
    expect((await tableNames(adapter)).some((name) => name.startsWith("__sift_"))).toBe(false);

    const created = await runBackfill(["--acknowledge"], { ...context, acknowledge: true });
    expect(created.status).toBe("ok");

    const beforeTables = await tableNames(adapter);
    const rebuild = await runRebuild(["--dry-run"], { ...context, dryRun: true });
    const merge = await runMerge(["--dry-run", "--page-budget", "2"], { ...context, dryRun: true });
    const drop = await runDrop(["--dry-run"], { ...context, dryRun: true });
    expect(rebuild.status).toBe("ok");
    expect(merge.status).toBe("ok");
    expect(drop.status).toBe("ok");
    expect(merge.data).toEqual(
      expect.objectContaining({ pageBudget: 2, dryRun: true, action: "merge" }),
    );
    expect(drop.message).toContain("source table");
    expect(await tableNames(adapter)).toEqual(beforeTables);
    expect((await readRegistry(adapter, definition.name))?.health).toBe("healthy");
    expect(await sourceRows(adapter)).toEqual([
      { id: "p1", name: "sqlite" },
      { id: "p2", name: "libsql" },
    ]);
  });

  test("backfill creates a missing linked index from source rows", async () => {
    const { adapter, definition, context } = await tempSqlite();
    const result = await runBackfill(["--acknowledge", "--json"], {
      ...context,
      acknowledge: true,
      json: true,
    });
    expect(result.status).toBe("ok");
    expect(result.command).toBe("backfill");
    expect(result.data).toEqual(expect.objectContaining({ action: "create", dryRun: false }));
    expect((await readRegistry(adapter, definition.name))?.health).toBe("healthy");

    const handle = createFts5Engine({ adapter }).index(definition);
    const search = await handle.search("sqlite");
    expect(search.hits.map((hit) => hit.id)).toEqual(["p1"]);
  });

  test("backfill heals a pending index and refuses a healthy one", async () => {
    const { adapter, definition, context } = await tempSqlite();
    expect((await runBackfill(["--acknowledge"], { ...context, acknowledge: true })).status).toBe(
      "ok",
    );
    const healthy = await readRegistry(adapter, definition.name);
    expect(healthy?.health).toBe("healthy");
    if (!healthy) {
      throw new Error("expected registry row");
    }

    const refused = await runBackfill(["--acknowledge"], { ...context, acknowledge: true });
    expect(refused.status).toBe("error");
    expect(refused.message).toContain("already exists");
    expect(refused.data).toEqual(expect.objectContaining({ reason: "already-exists" }));
    expect((await readRegistry(adapter, definition.name))?.health).toBe("healthy");

    const { writePendingRegistry } = await import("@siftlite/fts5");
    await writePendingRegistry(adapter, { ...healthy, updatedAt: Date.now() });
    expect((await readRegistry(adapter, definition.name))?.health).toBe("pending");

    const healed = await runBackfill(["--acknowledge"], { ...context, acknowledge: true });
    expect(healed.status).toBe("ok");
    expect(healed.data).toEqual(expect.objectContaining({ action: "heal" }));
    expect((await readRegistry(adapter, definition.name))?.health).toBe("healthy");
  });

  test("rebuild rematerializes and merge reports pageBudget", async () => {
    const { adapter, definition, context } = await tempSqlite();
    expect((await runBackfill(["--acknowledge"], { ...context, acknowledge: true })).status).toBe(
      "ok",
    );

    await adapter.execute(
      sql("INSERT INTO products (id, name, status) VALUES (?, ?, ?)", ["p3", "fts5", "active"]),
    );
    const rebuilt = await runRebuild(["--acknowledge"], { ...context, acknowledge: true });
    expect(rebuilt.status).toBe("ok");
    expect(rebuilt.command).toBe("rebuild");
    expect((await readRegistry(adapter, definition.name))?.health).toBe("healthy");

    const hits = await createFts5Engine({ adapter }).index(definition).search("fts5");
    expect(hits.hits.map((hit) => hit.id)).toEqual(["p3"]);

    const merged = await runMerge(["--acknowledge", "--page-budget", "2", "--json"], {
      ...context,
      acknowledge: true,
      json: true,
    });
    expect(merged.status).toBe("ok");
    expect(merged.data).toEqual(
      expect.objectContaining({
        action: "merge",
        pageBudget: 2,
        workRemaining: expect.any(Boolean),
        physicalIndexId: expect.any(String),
        generation: expect.any(Number),
      }),
    );
  });

  test("merge without a registered index is an honest error", async () => {
    const { context } = await tempSqlite();
    const result = await runMerge(["--acknowledge"], { ...context, acknowledge: true });
    expect(result.status).toBe("error");
    expect(result.message).toContain("not registered");
  });

  test("drop removes search objects and never drops the source table", async () => {
    const { adapter, definition, context } = await tempSqlite();
    expect((await runBackfill(["--acknowledge"], { ...context, acknowledge: true })).status).toBe(
      "ok",
    );
    const beforeDrop = await tableNames(adapter);
    expect(beforeDrop.some((name) => name.startsWith("__sift_"))).toBe(true);
    expect(beforeDrop).toContain("products");

    const dropped = await runDrop(["--acknowledge", "--json"], {
      ...context,
      acknowledge: true,
      json: true,
    });
    expect(dropped.status).toBe("ok");
    expect(dropped.data).toEqual(expect.objectContaining({ sourceTablePreserved: true }));

    const after = await tableNames(adapter);
    expect(after).toContain("products");
    expect(searchObjectTables(after)).toEqual([]);
    expect(await readRegistry(adapter, definition.name)).toBeNull();
    expect(await sourceRows(adapter)).toEqual([
      { id: "p1", name: "sqlite" },
      { id: "p2", name: "libsql" },
    ]);
  });

  test("runCli backfill/rebuild/merge/drop against a temp bun:sqlite config", async () => {
    const cwd = tempDir();
    const configPath = writeBunConfig(cwd);
    const config = await importSiftLiteConfig(configPath);
    const seed = await config.createAdapter();
    await seed.execute(sql("CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, status TEXT)"));
    await seed.execute(
      sql("INSERT INTO products (id, name, status) VALUES (?, ?, ?)", ["p1", "sqlite", "active"]),
    );

    const planned = await runCli(
      ["node", "siftlite", "backfill", "--dry-run", "--config", configPath],
      { cwd },
    );
    expect(planned.status).toBe("ok");
    expect(planned.message).toContain("dry-run");

    const backfill = await runCli(
      ["node", "siftlite", "backfill", "--acknowledge", "--json", "--config", configPath],
      { cwd },
    );
    expect(backfill.status).toBe("ok");
    expect(backfill.data).toEqual(expect.objectContaining({ action: "create" }));

    const rebuild = await runCli(
      ["node", "siftlite", "rebuild", "--acknowledge", "--config", configPath],
      { cwd },
    );
    expect(rebuild.status).toBe("ok");

    const merge = await runCli(
      [
        "node",
        "siftlite",
        "merge",
        "--acknowledge",
        "--page-budget",
        "2",
        "--json",
        "--config",
        configPath,
      ],
      { cwd },
    );
    expect(merge.status).toBe("ok");
    expect(merge.data).toEqual(expect.objectContaining({ pageBudget: 2 }));

    const drop = await runCli(
      ["node", "siftlite", "drop", "--acknowledge", "--config", configPath],
      { cwd },
    );
    expect(drop.status).toBe("ok");

    const verify = await config.createAdapter();
    const tables = await verify.query<{ name: string }>(
      sql("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"),
    );
    const names = tables.map((row) => row.name);
    expect(names).toContain("products");
    expect(searchObjectTables(names)).toEqual([]);
    const rows = await verify.query<{ id: string }>(sql("SELECT id FROM products"));
    expect(rows).toEqual([{ id: "p1" }]);
  });
});

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
