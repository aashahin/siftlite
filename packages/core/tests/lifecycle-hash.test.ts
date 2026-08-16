import { describe, expect, test } from "bun:test";
import { physicalIndexIdFor } from "../src/index.ts";

describe("physical index identifiers", () => {
  test("hashes the bare name when no namespace is provided", () => {
    expect(physicalIndexIdFor("products")).toBe("0a3e27b8");
    expect(physicalIndexIdFor("products", "")).toBe("0a3e27b8");
  });

  test("namespaces isolate physical ids for the same logical name", () => {
    expect(physicalIndexIdFor("products", "tenant-a")).not.toBe(
      physicalIndexIdFor("products", "tenant-b"),
    );
    expect(physicalIndexIdFor("products", "tenant-a")).not.toBe(physicalIndexIdFor("products"));
  });
});
