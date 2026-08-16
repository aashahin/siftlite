import { describe, expect, test } from "bun:test";
import { quoteIdent, SearchError } from "../src/index.ts";

describe("SQL identifiers", () => {
  test("quotes validated identifiers", () => {
    expect(quoteIdent("status")).toBe('"status"');
    expect(quoteIdent("__sift_products_proof_g1_docs")).toBe('"__sift_products_proof_g1_docs"');
  });

  test("rejects request-like and illegal identifiers", () => {
    expect(() => quoteIdent("status; drop table x")).toThrow(SearchError);
    expect(() => quoteIdent("tenant id")).toThrow(SearchError);
    expect(() => quoteIdent("")).toThrow(SearchError);
  });
});
