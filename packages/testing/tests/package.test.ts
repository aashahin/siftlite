import { describe, expect, test } from "bun:test";
import { SIFTLITE_TESTING_PACKAGE } from "../src/index.ts";

describe("@siftlite/testing", () => {
  test("exports package identity and depends on core", () => {
    expect(SIFTLITE_TESTING_PACKAGE.name).toBe("@siftlite/testing");
    expect(SIFTLITE_TESTING_PACKAGE.dependsOn).toBe("@siftlite/core");
  });
});
