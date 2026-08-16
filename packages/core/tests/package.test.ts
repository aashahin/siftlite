import { describe, expect, test } from "bun:test";
import { SIFTLITE_CORE_PACKAGE } from "../src/index.ts";

describe("@siftlite/core", () => {
  test("exports package identity", () => {
    expect(SIFTLITE_CORE_PACKAGE.name).toBe("@siftlite/core");
    expect(SIFTLITE_CORE_PACKAGE.version).toBe("0.0.0");
  });
});
