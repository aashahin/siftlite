import { describe, expect, test } from "bun:test";
import { classifyPhysicalChange, type PhysicalSchemaManifest } from "../src/index.ts";

function manifest(overrides: Partial<PhysicalSchemaManifest> = {}): PhysicalSchemaManifest {
  return {
    backend: "fts5",
    version: 1,
    objects: [{ kind: "table", name: "docs", columns: ["doc_id", "status"] }],
    tokenizer: "unicode61",
    prefix: [2],
    searchable: ["title"],
    projected: ["status"],
    weightsQueryTime: true,
    ...overrides,
  };
}

describe("classifyPhysicalChange", () => {
  test("weight-only and identical manifests stay runtime-only", () => {
    expect(classifyPhysicalChange(manifest(), manifest()).kind).toBe("runtime-only");
  });

  test("projected field additions are migration-only even when object columns change", () => {
    const next = manifest({
      projected: ["status", "category"],
      objects: [{ kind: "table", name: "docs", columns: ["doc_id", "status", "category"] }],
    });
    expect(classifyPhysicalChange(manifest(), next)).toEqual({
      kind: "migration-only",
      reasons: ["projected-fields"],
    });
  });

  test("physical version, weights, and object identity require rebuild", () => {
    expect(classifyPhysicalChange(manifest(), manifest({ version: 2 })).kind).toBe(
      "rebuild-required",
    );
    expect(classifyPhysicalChange(manifest(), manifest({ weightsQueryTime: false })).kind).toBe(
      "rebuild-required",
    );
    expect(
      classifyPhysicalChange(
        manifest(),
        manifest({ objects: [{ kind: "table", name: "docs_g2", columns: ["doc_id", "status"] }] }),
      ).kind,
    ).toBe("rebuild-required");
  });
});
