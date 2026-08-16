import { describe, expect, test } from "bun:test";
import { defineIndex, parsePlainTextQuery, DEFAULT_APPLICATION_LIMITS } from "@siftlite/core";
import {
  compileTursoDdl,
  compileTursoPhysicalManifest,
  emitTursoMatch,
  tursoNativeBackend,
  TURSO_NATIVE_SCORE,
  TURSO_NATIVE_UPSTREAM_STATUS,
  TURSO_NATIVE_VISIBILITY,
} from "../src/index.ts";

function articles() {
  return defineIndex({
    name: "articles",
    mode: "linked",
    source: { table: "articles", primaryKey: { field: "id", type: "string" } },
    searchable: {
      title: { weight: 5 },
      body: { weight: 1 },
    },
  });
}

describe("Turso-native architecture pressure", () => {
  test("compiles logical schema to native FTS DDL and physical manifest", () => {
    const definition = articles();
    const ctx = { definition, physicalIndexId: "k3f9", generation: 1 };
    const ddl = compileTursoDdl(ctx);
    expect(ddl).toContain("CREATE INDEX");
    expect(ddl).toContain("USING fts");
    expect(ddl).toContain("title weight=5");
    expect(ddl).not.toContain("USING fts5");
    expect(ddl).not.toContain("MATCH");

    const manifest = compileTursoPhysicalManifest(ctx);
    expect(manifest.backend).toBe("turso-native");
    expect(manifest.weightsQueryTime).toBe(false);
    expect(manifest.physicalConfig?.["weight:title"]).toBe(5);
  });

  test("weight changes are rebuild-required for native FTS, unlike FTS5 query-time weights", () => {
    const backend = tursoNativeBackend();
    const previous = backend.compilePhysicalManifest({
      definition: articles(),
      physicalIndexId: "k3f9",
      generation: 1,
    });
    const next = backend.compilePhysicalManifest({
      definition: defineIndex({
        name: "articles",
        mode: "linked",
        source: { table: "articles", primaryKey: { field: "id", type: "string" } },
        searchable: { title: { weight: 9 }, body: { weight: 1 } },
      }),
      physicalIndexId: "k3f9",
      generation: 1,
    });
    expect(backend.classifyPhysicalChange(previous, next).kind).toBe("rebuild-required");
  });

  test("compiles portable AST to native syntax, not FTS5 MATCH", () => {
    const query = parsePlainTextQuery('hello "iphone pro" world', {
      limits: DEFAULT_APPLICATION_LIMITS,
      matchingStrategy: "last-prefix",
    });
    const match = emitTursoMatch(query);
    expect(match).toContain("AND");
    expect(match).toContain('"iphone pro"');
    expect(match).toContain("*");
    expect(match).not.toContain("MATCH");
    expect(match).not.toContain("NEAR");
  });

  test("models native score, highlight, maintenance, and visibility differences", () => {
    expect(TURSO_NATIVE_SCORE.nativeDirection).toBe("higher-is-better");
    expect(TURSO_NATIVE_SCORE.weightsPhysical).toBe(true);
    expect(TURSO_NATIVE_SCORE.snippet).toBe(false);
    expect(TURSO_NATIVE_VISIBILITY.preCommitSearchVisible).toBe(false);
    expect(TURSO_NATIVE_VISIBILITY.postCommitSearchVisible).toBe(true);
    expect(TURSO_NATIVE_VISIBILITY.optimizeCommand).toBe("OPTIMIZE INDEX");
    expect(TURSO_NATIVE_UPSTREAM_STATUS.packageLabel).toBe("experimental");
    expect(TURSO_NATIVE_UPSTREAM_STATUS.remoteTestsAvailable).toBe(false);
  });
});
