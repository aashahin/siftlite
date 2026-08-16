import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_ROOT = join(import.meta.dir, "../../packages");

const ALLOWED_PUBLISHED_PACKAGES = [
  "@siftlite/core",
  "@siftlite/fts5",
  "@siftlite/bun",
  "@siftlite/testing",
] as const;

describe("workspace package inventory", () => {
  test("Phase 0 publishes only the four approved packages", () => {
    const names = readdirSync(PACKAGES_ROOT)
      .filter((entry) => statSync(join(PACKAGES_ROOT, entry)).isDirectory())
      .map((entry) => {
        const pkg = JSON.parse(
          readFileSync(join(PACKAGES_ROOT, entry, "package.json"), "utf8"),
        ) as {
          name: string;
          private?: boolean;
        };
        return pkg;
      })
      .filter((pkg) => pkg.private !== true)
      .map((pkg) => pkg.name)
      .sort();

    expect(names).toEqual([...ALLOWED_PUBLISHED_PACKAGES].sort());
  });
});
