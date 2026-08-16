import { describe, expect, test } from "bun:test";
import {
  canonicalizeIndexDefinition,
  defineIndex,
  hashLogicalDefinition,
  SearchError,
  table,
} from "../src/index.ts";

function productsInput() {
  return {
    name: "products",
    mode: "linked" as const,
    source: table("products", { primaryKey: { field: "id", type: "string" } }),
    normalization: ["arabic-basic"],
    searchable: {
      name: { weight: 5 },
      description: { weight: 1 },
    },
    filterable: {
      status: "text" as const,
      price: "number" as const,
      createdAt: { kind: "timestamp-integer" as const, unit: "unix-milliseconds" as const },
    },
    sortable: {
      price: "number" as const,
    },
    facets: ["status"],
    prefix: [2, 3],
    typoTolerance: { mode: "fallback" as const },
    synonyms: { iphone: ["ايفون"] },
  };
}

describe("index definition", () => {
  test("defineIndex canonicalizes and hashes independently of synonym key order", () => {
    const left = defineIndex({
      ...productsInput(),
      synonyms: { iphone: ["ايفون"], course: ["دورة"] },
    });
    const right = defineIndex({
      ...productsInput(),
      synonyms: { course: ["دورة"], iphone: ["ايفون"] },
    });
    expect(hashLogicalDefinition(left)).toBe(hashLogicalDefinition(right));
    expect(canonicalizeIndexDefinition(left).synonyms.map((entry) => entry.key)).toEqual([
      "course",
      "iphone",
    ]);
  });

  test("searchable field order is part of the logical hash", () => {
    const left = defineIndex({
      ...productsInput(),
      searchable: { name: { weight: 5 }, description: { weight: 1 } },
    });
    const right = defineIndex({
      ...productsInput(),
      searchable: { description: { weight: 1 }, name: { weight: 5 } },
    });
    expect(hashLogicalDefinition(left)).not.toBe(hashLogicalDefinition(right));
  });

  test("stores arabic-basic normalized synonym keys and values", () => {
    const index = defineIndex({
      ...productsInput(),
      normalization: ["arabic-basic"],
      synonyms: { آيفون: ["آيفون برو"] },
    });
    expect(index.synonyms).toEqual({ ايفون: ["ايفون برو"] });
    expect(Object.keys(index.synonyms)).toEqual(["ايفون"]);
    expect(index.synonyms["ايفون"]).toEqual(["ايفون برو"]);
  });

  test("runtime-only synonym edits change the logical hash", () => {
    const base = defineIndex(productsInput());
    const edited = defineIndex({
      ...productsInput(),
      synonyms: { iphone: ["ايفون", "آيفون"] },
    });
    expect(hashLogicalDefinition(base)).not.toBe(hashLogicalDefinition(edited));
  });

  test("rejects invalid names, missing linked source, and undeclared facets", () => {
    expect(() => defineIndex({ ...productsInput(), name: "Products" })).toThrow(SearchError);
    expect(() =>
      defineIndex({
        name: "manual_docs",
        mode: "linked",
        searchable: { title: { weight: 1 } },
      }),
    ).toThrow(SearchError);
    expect(() => defineIndex({ ...productsInput(), facets: ["brand"] })).toThrow(SearchError);
  });

  test("rejects unknown normalization profiles", () => {
    expect(() => defineIndex({ ...productsInput(), normalization: ["nfkc"] })).toThrow(SearchError);
  });

  test("timestamp fields require an explicit unit", () => {
    expect(() =>
      defineIndex({
        ...productsInput(),
        filterable: { createdAt: "timestamp-integer" },
      }),
    ).toThrow(SearchError);
  });
});
