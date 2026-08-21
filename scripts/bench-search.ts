/**
 * Local search characterization (P12-08 / P12-09 / P14-05).
 *
 *   bun run scripts/bench-search.ts --scale=100k --write-report
 *   bun run scripts/bench-search.ts --scale=1m --write-report
 *   bun run scripts/bench-search.ts --d1
 *
 * 1m is a local stress characterization, not a CI gate. D1 remote cost
 * requires SIFTLITE_D1_* credentials and is skipped when they are absent.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { bunSqliteAdapter } from "../packages/bun/src/index.ts";
import { defineIndex, eq } from "../packages/core/src/index.ts";
import { createFts5Engine, createIndex } from "../packages/fts5/src/index.ts";

const SCALE_ROWS = {
  "1k": 1_000,
  "100k": 100_000,
  "1m": 1_000_000,
} as const;

type Scale = keyof typeof SCALE_ROWS;

const args = process.argv.slice(2);
const scaleArg = args.find((arg) => arg.startsWith("--scale="))?.slice("--scale=".length);
const scale: Scale =
  scaleArg === "1k" || scaleArg === "100k" || scaleArg === "1m" ? scaleArg : "100k";
const writeReport = args.includes("--write-report");
const d1Only = args.includes("--d1");

if (d1Only) {
  await writeD1RemoteReport();
  process.exit(0);
}

const rows = SCALE_ROWS[scale];
const dbPath = join(tmpdir(), `siftlite-bench-${scale}-${Date.now()}.db`);
const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA synchronous = OFF");
sqlite.exec(
  "CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, brand TEXT NOT NULL)",
);

const insertStarted = Date.now();
const insert = sqlite.prepare(
  "INSERT INTO products (id, title, description, status, brand) VALUES (?, ?, ?, ?, ?)",
);
sqlite.exec("BEGIN");
insert.run("plant-exact", "iphone 15 pro max", "flagship phone".repeat(8), "active", "acme");
insert.run("plant-typo", "iphoen 15 pro max", "flagship phone".repeat(8), "active", "beta");
for (let index = 0; index < rows - 2; index += 1) {
  const brand = index % 3 === 0 ? "acme" : index % 3 === 1 ? "beta" : "gamma";
  insert.run(
    `p${index}`,
    `widget ${index} ${brand}`,
    `portable widget description ${index} `.repeat(6),
    index % 10 === 0 ? "draft" : "active",
    brand,
  );
}
sqlite.exec("COMMIT");
const insertMs = Date.now() - insertStarted;

const definition = defineIndex({
  name: "products",
  mode: "linked",
  source: { table: "products", primaryKey: { field: "id", type: "string" } },
  searchable: { title: { weight: 5 }, description: { weight: 1 } },
  filterable: { status: "text", brand: "text" },
  facets: ["brand"],
  typoTolerance: { mode: "fallback" },
});
const adapter = bunSqliteAdapter(sqlite);
const backfillStarted = Date.now();
await createIndex({ adapter, definition });
const backfillMs = Date.now() - backfillStarted;
const index = createFts5Engine({
  adapter,
  policy: { typoFallback: "enabled" },
}).index(definition);

async function timed(label: string, run: () => Promise<{ hits: number; fuzzyUsed: boolean }>) {
  const warmup = await run();
  const samples: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const started = Date.now();
    await run();
    samples.push(Date.now() - started);
  }
  samples.sort((left, right) => left - right);
  return {
    label,
    hits: warmup.hits,
    fuzzyUsed: warmup.fuzzyUsed,
    p50: samples[Math.floor(samples.length * 0.5)] ?? 0,
    p95: samples[Math.floor(samples.length * 0.95)] ?? samples.at(-1) ?? 0,
  };
}

const exact = await timed("exact term", async () => {
  const result = await index.search("iphone", { limit: 20, diagnostics: true });
  return { hits: result.hits.length, fuzzyUsed: result.meta?.fuzzyUsed === true };
});
const fuzzy = await timed("typo fallback", async () => {
  const result = await index.search("iphoen", { limit: 20, diagnostics: true });
  return { hits: result.hits.length, fuzzyUsed: result.meta?.fuzzyUsed === true };
});
const filtered = await timed("filtered exact", async () => {
  const result = await index.search("widget", {
    filter: eq("status", "active"),
    limit: 20,
    diagnostics: true,
  });
  return { hits: result.hits.length, fuzzyUsed: result.meta?.fuzzyUsed === true };
});

const exactRecall = await index.search("iphone", { limit: 5, diagnostics: true });
const fuzzyRecall = await index.search("iphoen", { limit: 5, diagnostics: true });
if (exactRecall.hits[0]?.id !== "plant-exact") {
  throw new Error(`exact recall failed: first hit ${String(exactRecall.hits[0]?.id)}`);
}
if (!exactRecall.hits.some((hit) => hit.id === "plant-typo")) {
  throw new Error("merged fuzzy recall failed: plant-typo missing behind exact");
}
if (fuzzyRecall.hits[0]?.id !== "plant-typo") {
  throw new Error(`typo recall failed: first hit ${String(fuzzyRecall.hits[0]?.id)}`);
}

const rssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
const dbSizeMb = Math.round(((await Bun.file(dbPath).size) / 1024 / 1024) * 10) / 10;

const report = `# Local ${scale} search characterization

Generated: ${new Date().toISOString()}
Runtime: bun ${Bun.version}, bun:sqlite
Hardware: ${process.env["SIFTLITE_BENCH_HW"] ?? "unspecified local machine"}
Rows: ${rows.toLocaleString("en-US")}
Database file: \`${dbPath}\` (${dbSizeMb} MiB)
RSS after search: ${rssMb} MiB

## Methodology

- Deterministic planted documents \`plant-exact\` (\`iphone 15 pro max\`) and
  \`plant-typo\` (\`iphoen 15 pro max\`).
- Remaining rows are synthetic widget titles; descriptions are 100–500 chars.
- One linked FTS5 index, typo fallback enabled, default fuzzy policy.
- 1 warmup + 7 timed samples per operation; p50/p95 from those samples.
- Correctness guard: \`iphone\` must rank \`plant-exact\` first and still include
  \`plant-typo\` behind it; \`iphoen\` must rank \`plant-typo\` first.
- This is local SQLite. Do not compare these numbers to remote D1/Turso.

## Timings

| Operation | Hits | fuzzyUsed | p50 ms | p95 ms |
| --- | ---: | --- | ---: | ---: |
| Source insert | ${rows.toLocaleString("en-US")} | — | ${insertMs} | ${insertMs} |
| createIndex backfill | — | — | ${backfillMs} | ${backfillMs} |
| ${exact.label} | ${exact.hits} | ${exact.fuzzyUsed} | ${exact.p50} | ${exact.p95} |
| ${fuzzy.label} | ${fuzzy.hits} | ${fuzzy.fuzzyUsed} | ${fuzzy.p50} | ${fuzzy.p95} |
| ${filtered.label} | ${filtered.hits} | ${filtered.fuzzyUsed} | ${filtered.p50} | ${filtered.p95} |

## D1 default

These numbers are not D1 cost evidence. \`D1_DEFAULT_SEARCH_POLICY\` stays
\`disabled-on-cost-sensitive-runtimes\` until a remote D1 report exists.
`;

console.log(report);
if (writeReport) {
  mkdirSync(join(import.meta.dir, "../docs/benchmarks"), { recursive: true });
  const fileName =
    scale === "1m" ? "local-1m.md" : scale === "1k" ? "local-1k.md" : "local-100k.md";
  writeFileSync(join(import.meta.dir, "../docs/benchmarks", fileName), report);
}

sqlite.close();

async function writeD1RemoteReport(): Promise<void> {
  const accountId = process.env["SIFTLITE_D1_ACCOUNT_ID"];
  const databaseId = process.env["SIFTLITE_D1_DATABASE_ID"];
  const token = process.env["CLOUDFLARE_API_TOKEN"];
  mkdirSync(join(import.meta.dir, "../docs/benchmarks"), { recursive: true });
  if (!accountId || !databaseId || !token) {
    const skipped = `# D1 remote cost characterization

Generated: ${new Date().toISOString()}

Skipped: \`SIFTLITE_D1_ACCOUNT_ID\`, \`SIFTLITE_D1_DATABASE_ID\`, and
\`CLOUDFLARE_API_TOKEN\` are not configured.

P12-10 / P14-06 therefore have no remote rows-read or duration evidence.
\`D1_DEFAULT_SEARCH_POLICY.typoFallback\` remains
\`disabled-on-cost-sensitive-runtimes\`. Re-run
\`bun run scripts/bench-search.ts --d1 --write-report\` when credentials exist.
`;
    writeFileSync(join(import.meta.dir, "../docs/benchmarks/d1-remote.md"), skipped);
    console.log(skipped);
    return;
  }
  const started = Date.now();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const elapsed = Date.now() - started;
  const body = (await response.json()) as { success?: boolean };
  const report = `# D1 remote cost characterization

Generated: ${new Date().toISOString()}
Reachability: HTTP ${response.status}, success=${String(body.success === true)}, ${elapsed} ms

This check confirms the database is reachable. It does not insert a 100k FTS
corpus or measure fuzzy rows-read. Keep D1 typo fallback off until that
workload is measured on the remote database.
`;
  writeFileSync(join(import.meta.dir, "../docs/benchmarks/d1-remote.md"), report);
  console.log(report);
}
