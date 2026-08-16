import { createClient } from "@libsql/client";
import { defineIndex, eq } from "@siftlite/core";
import { createManualFts5Proof, searchFts5Index } from "@siftlite/fts5";
import { libsqlAdapter, wrapLibsqlClient } from "@siftlite/libsql";

const definition = defineIndex({
  name: "articles",
  mode: "manual",
  source: { table: "articles", primaryKey: { field: "id", type: "string" } },
  searchable: { title: { weight: 1 } },
  filterable: { status: "text" },
});

const client = createClient({ url: ":memory:" });
const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
const index = await createManualFts5Proof({ adapter, definition });
await index.upsert([
  { id: "a1", searchable: { title: "libsql search" }, filterable: { status: "active" } },
]);
const result = await searchFts5Index(
  {
    adapter,
    definition,
    physicalIndexId: index.physicalIndexId,
    generation: index.generation,
  },
  "libsql",
  { filter: eq("status", "active") },
);
console.log(JSON.stringify({ hits: result.hits.map((hit) => hit.id) }));
