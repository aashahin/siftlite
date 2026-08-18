import { describe, expect, test } from "bun:test";
import { SIFTLITE_NODE_PACKAGE } from "../src/index.ts";

describe("@siftlite/node", () => {
  test("exports package identity and depends on core", () => {
    expect(SIFTLITE_NODE_PACKAGE.name).toBe("@siftlite/node");
    expect(SIFTLITE_NODE_PACKAGE.dependsOn).toBe("@siftlite/core");
  });
});
