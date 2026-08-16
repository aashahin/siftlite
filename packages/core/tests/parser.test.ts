import { describe, expect, test } from "bun:test";
import {
  collectTextTerms,
  DEFAULT_APPLICATION_LIMITS,
  parsePlainTextQuery,
  SearchError,
} from "../src/index.ts";

const limits = DEFAULT_APPLICATION_LIMITS;

describe("portable query parser", () => {
  test("parses terms, phrases, and empty queries", () => {
    expect(parsePlainTextQuery("", { limits })).toEqual({ kind: "empty" });
    expect(parsePlainTextQuery("iphone pro", { limits })).toEqual({
      kind: "and",
      children: [
        { kind: "term", value: "iphone" },
        { kind: "term", value: "pro" },
      ],
    });
    expect(parsePlainTextQuery('"iphone pro"', { limits })).toEqual({
      kind: "phrase",
      terms: ["iphone", "pro"],
    });
  });

  test("treats backend operators and punctuation as text boundaries, not grammar", () => {
    const ast = parsePlainTextQuery('title:foo AND body:bar NEAR "x" foo*', { limits });
    const terms = collectTextTerms(ast);
    expect(terms).toContain("title");
    expect(terms).toContain("foo");
    expect(terms).toContain("AND");
    expect(terms).toContain("body");
    expect(terms).toContain("bar");
    expect(terms).toContain("NEAR");
    expect(
      ast.kind === "and" || ast.kind === "or" || ast.kind === "term" || ast.kind === "phrase",
    ).toBe(true);
    expect(JSON.stringify(ast)).not.toContain("MATCH");
  });

  test("last-prefix marks only the last term", () => {
    const ast = parsePlainTextQuery("iphone pr", {
      limits,
      matchingStrategy: "last-prefix",
      minPrefixLength: 2,
    });
    expect(ast).toEqual({
      kind: "and",
      children: [
        { kind: "term", value: "iphone" },
        { kind: "term", value: "pr", prefix: true },
      ],
    });
  });

  test("keeps Arabic combining marks attached and splits mixed punctuation", () => {
    const ast = parsePlainTextQuery("اَيفون، pro", { limits });
    const terms = collectTextTerms(ast);
    expect(terms[0]?.startsWith("ا")).toBe(true);
    expect(terms[0]?.includes("\u064e") || terms[0] === "اَيفون").toBe(true);
    expect(terms).toContain("pro");
  });

  test("handles emoji and mixed Arabic/English", () => {
    const ast = parsePlainTextQuery("ايفون 📱 pro", { limits });
    expect(collectTextTerms(ast)).toEqual(["ايفون", "📱", "pro"]);
  });

  test("rejects unclosed phrases, NUL, and over-limit queries", () => {
    expect(() => parsePlainTextQuery('"iphone', { limits })).toThrow(SearchError);
    expect(() => parsePlainTextQuery("iphone\u0000pro", { limits })).toThrow(SearchError);
    expect(() => parsePlainTextQuery("abc", { limits: { ...limits, maxQueryLength: 2 } })).toThrow(
      SearchError,
    );
  });
});
