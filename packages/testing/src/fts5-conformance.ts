import {
  DEFAULT_APPLICATION_LIMITS,
  defineIndex,
  eq,
  inList,
  parsePlainTextQuery,
  SearchError,
  type SqlAdapter,
} from "@siftlite/core";
import { createManualFts5Proof, sqliteFts5 } from "@siftlite/fts5";

export async function runFts5SearchConformance(adapter: SqlAdapter): Promise<void> {
  const definition = defineIndex({
    name: "conformance",
    mode: "manual",
    source: { table: "docs", primaryKey: { field: "id", type: "string" } },
    searchable: { title: { weight: 1 } },
    filterable: { status: "text" },
  });
  const index = await createManualFts5Proof({ adapter, definition });
  await index.upsert([
    { id: "a", searchable: { title: "sqlite search" }, filterable: { status: "active" } },
    { id: "b", searchable: { title: "other" }, filterable: { status: "draft" } },
  ]);
  const hits = await index.search("sqlite", { filter: eq("status", "active") });
  if (hits.length !== 1 || hits[0]?.id !== "a") {
    throw new SearchError({
      code: "SEARCH_BACKEND_ERROR",
      message: "FTS5 conformance failed to return the expected hit",
      details: { reason: "search-hit" },
    });
  }

  const maxBinds = adapter.runtimeCapabilities.limits.maxBindParameters;
  if (maxBinds === undefined) {
    return;
  }
  const overflow = Array.from({ length: maxBinds }, (_, index) => `s${index}`);
  try {
    sqliteFts5().compileSearch({
      definition,
      physical: sqliteFts5().compilePhysicalManifest({
        definition,
        physicalIndexId: index.physicalIndexId,
        generation: index.generation,
      }),
      physicalIndexId: index.physicalIndexId,
      generation: index.generation,
      textQuery: parsePlainTextQuery("sqlite", { limits: DEFAULT_APPLICATION_LIMITS }),
      filter: inList("status", overflow),
      limit: 20,
      offset: 0,
      limits: { ...DEFAULT_APPLICATION_LIMITS, maxInValues: overflow.length },
      runtimeLimits: adapter.runtimeCapabilities.limits,
    });
  } catch (error) {
    if (error instanceof SearchError && error.code === "SEARCH_RUNTIME_LIMIT_EXCEEDED") {
      return;
    }
    throw error;
  }
  throw new SearchError({
    code: "SEARCH_RUNTIME_LIMIT_EXCEEDED",
    message: "IN compilation must fail when it exceeds the runtime bind budget",
    details: { reason: "in-budget" },
  });
}
