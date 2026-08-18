import { describe, expect, test } from "bun:test";
import { SearchError } from "@siftlite/core";
import { isAlreadyExistsError, resolveRequestTenant } from "./worker.ts";

describe("examples/d1-worker helpers", () => {
  test("resolves tenant from x-tenant-id before the query param", () => {
    const url = new URL("https://example.test/search?tenant=from-query");
    const header = new Request(url, { headers: { "x-tenant-id": "from-header" } });
    expect(resolveRequestTenant(header, url)).toBe("from-header");

    const queryOnly = new Request(url);
    expect(resolveRequestTenant(queryOnly, url)).toBe("from-query");

    const noneUrl = new URL("https://example.test/search");
    expect(resolveRequestTenant(new Request(noneUrl), noneUrl)).toBeUndefined();
  });

  test("search without a tenant is a missing-tenant case", () => {
    const url = new URL("https://example.test/search?q=sqlite");
    expect(resolveRequestTenant(new Request(url), url)).toBeUndefined();
  });

  test("treats already-exists SearchError as idempotent migrate success", () => {
    expect(
      isAlreadyExistsError(
        new SearchError({
          code: "SEARCH_CONFIG_INVALID",
          message: "index already exists",
          details: { reason: "already-exists" },
        }),
      ),
    ).toBe(true);
    expect(isAlreadyExistsError(new Error("index already exists"))).toBe(false);
    expect(
      isAlreadyExistsError(
        new SearchError({
          code: "SEARCH_CONFIG_INVALID",
          message: "other",
          details: { reason: "invalid-mode" },
        }),
      ),
    ).toBe(false);
  });
});
