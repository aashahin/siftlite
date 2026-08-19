import { describe, expect, test } from "bun:test";
import { defineIndex } from "@siftlite/core";
import { resolveIndexDefinition, SiftLiteConfigError } from "../src/index.ts";

function notes() {
  return defineIndex({
    name: "notes",
    mode: "manual",
    searchable: { body: { weight: 1 } },
  });
}

function docs() {
  return defineIndex({
    name: "docs",
    mode: "manual",
    searchable: { title: { weight: 1 } },
  });
}

describe("resolveIndexDefinition", () => {
  test("uses a single definition", () => {
    const definition = notes();
    expect(resolveIndexDefinition(definition).definition.name).toBe("notes");
  });

  test("requires --name when several indexes exist", () => {
    expect(() => resolveIndexDefinition([notes(), docs()])).toThrow(SiftLiteConfigError);
    expect(resolveIndexDefinition([notes(), docs()], "docs").definition.name).toBe("docs");
  });

  test("picks a record by key or definition name", () => {
    const catalog = { notes: notes(), articles: docs() };
    expect(resolveIndexDefinition(catalog, "notes").definition.name).toBe("notes");
    expect(resolveIndexDefinition(catalog, "docs").definition.name).toBe("docs");
    expect(() => resolveIndexDefinition(catalog, "missing")).toThrow(/unknown index/);
  });
});
