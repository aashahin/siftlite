import { describe, expect, test } from "bun:test";
import { SIFTLITE_BUN_PACKAGE } from "../src/index.ts";

describe("@siftlite/bun", () => {
  test("exports package identity and depends on core", () => {
    expect(SIFTLITE_BUN_PACKAGE.name).toBe("@siftlite/bun");
    expect(SIFTLITE_BUN_PACKAGE.dependsOn).toBe("@siftlite/core");
  });
});
