import { describe, expect, test } from "bun:test";
import { SIFTLITE_FTS5_PACKAGE } from "../src/index.ts";

describe("@siftlite/fts5", () => {
  test("exports package identity and depends on core", () => {
    expect(SIFTLITE_FTS5_PACKAGE.name).toBe("@siftlite/fts5");
    expect(SIFTLITE_FTS5_PACKAGE.dependsOn).toBe("@siftlite/core");
  });
});
