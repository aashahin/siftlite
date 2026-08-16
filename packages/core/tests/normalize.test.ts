import { describe, expect, test } from "bun:test";
import {
  arabicBasic,
  compileIndexNormalizationSql,
  defineIndex,
  definePortableNormalizer,
  getPortableNormalizer,
  LINKED_NORMALIZER_IDS,
  normalizeIndexText,
  normalizeSynonymCatalog,
  numericArabic,
  parseIndexTextQuery,
  SearchError,
  table,
  DEFAULT_APPLICATION_LIMITS,
} from "../src/index.ts";

describe("portable normalizers", () => {
  test("arabic-basic applies only the curated replacements", () => {
    expect(arabicBasic.id).toBe("arabic-basic");
    expect(arabicBasic.linkedMode).toBe(true);
    expect(arabicBasic.normalize("آيفون")).toBe("ايفون");
    expect(arabicBasic.normalize("مدرسة")).toBe("مدرسة");
    expect(arabicBasic.normalize("١٢")).toBe("١٢");
    expect(arabicBasic.normalize("ايفون".normalize("NFKC"))).toBe("ايفون");
  });

  test("numeric-arabic is opt-in and does not fold Persian digits", () => {
    expect(numericArabic.normalize("١٢٣")).toBe("123");
    expect(numericArabic.normalize("۰۱۲")).toBe("۰۱۲");
  });

  test("index-level profiles compose in declared order", () => {
    expect(normalizeIndexText("آيفون-١٢", ["arabic-basic", "numeric-arabic"])).toBe("ايفون-12");
    expect(compileIndexNormalizationSql({ sql: "?" }, []).sql).toBe("?");
    expect(compileIndexNormalizationSql({ sql: "?" }, ["arabic-basic"]).sql).toContain("replace(");
    expect(compileIndexNormalizationSql({ sql: "?" }, ["arabic-basic"]).sql).not.toContain("NFC");
  });

  test("defineIndex rejects unknown, empty, and duplicate profiles", () => {
    const base = {
      name: "products",
      mode: "linked" as const,
      source: table("products", { primaryKey: { field: "id", type: "string" } }),
      searchable: { name: { weight: 1 } },
    };
    expect(() => defineIndex({ ...base, normalization: ["nfc"] })).toThrow(SearchError);
    expect(() => defineIndex({ ...base, normalization: [""] })).toThrow(SearchError);
    expect(() => defineIndex({ ...base, normalization: ["arabic-basic", "arabic-basic"] })).toThrow(
      SearchError,
    );
    expect(defineIndex({ ...base, normalization: ["arabic-basic"] }).normalization).toEqual([
      "arabic-basic",
    ]);
  });

  test("unknown registry lookups fail closed", () => {
    expect(LINKED_NORMALIZER_IDS).toEqual(["arabic-basic", "numeric-arabic"]);
    expect(() => getPortableNormalizer("nfkc")).toThrow(SearchError);
  });

  test("manual-only normalizers cannot compile SQL", () => {
    const manual = definePortableNormalizer({
      id: "manual-only-fixture",
      replacements: [["a", "b"]],
      linkedMode: false,
    });
    expect(manual.normalize("a")).toBe("b");
    expect(() => manual.compileSql({ sql: "?" })).toThrow(SearchError);
  });

  test("synonym catalog is normalized with the index profile", () => {
    const catalog = normalizeSynonymCatalog({ آيفون: ["iphone"], iphone: ["آيفون", "ايفون"] }, [
      "arabic-basic",
    ]);
    expect(catalog["ايفون"]).toEqual(["iphone"]);
    expect(catalog["iphone"]).toEqual(["ايفون", "ايفون"]);
  });

  test("parseIndexTextQuery normalizes before portable parsing", () => {
    const ast = parseIndexTextQuery("اَيفون، pro", {
      limits: DEFAULT_APPLICATION_LIMITS,
      normalization: ["arabic-basic"],
    });
    expect(ast).toEqual({
      kind: "and",
      children: [
        { kind: "term", value: "ايفون" },
        { kind: "term", value: "pro" },
      ],
    });
  });

  test("raw query length limits apply before normalization", () => {
    expect(() =>
      parseIndexTextQuery("كــــتاب", {
        limits: { ...DEFAULT_APPLICATION_LIMITS, maxQueryLength: 3 },
        normalization: ["arabic-basic"],
      }),
    ).toThrow(SearchError);
  });
});
