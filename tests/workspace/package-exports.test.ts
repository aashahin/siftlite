import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

const PACKAGES = ["core", "fts5", "bun", "d1", "libsql", "testing", "drizzle", "prisma"] as const;

describe("package export maps", () => {
  test("each published package has deterministic ESM exports", () => {
    for (const name of PACKAGES) {
      const packageDir = join(ROOT, "packages", name);
      const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
        name: string;
        type: string;
        exports: {
          ".": {
            types: string;
            bun?: string;
            import: string;
            default: string;
          };
        };
        main: string;
        types: string;
        files: string[];
      };

      expect(pkg.type).toBe("module");
      expect(pkg.exports["."].types).toBe("./dist/index.d.ts");
      expect(pkg.exports["."].bun).toBe("./src/index.ts");
      expect(pkg.exports["."].import).toBe("./dist/index.js");
      expect(pkg.exports["."].default).toBe("./dist/index.js");
      expect(pkg.main).toBe("./dist/index.js");
      expect(pkg.types).toBe("./dist/index.d.ts");
      expect(pkg.files).toContain("dist");
      expect(pkg.files).toContain("src");
      expect(pkg.files).toContain("LICENSE");
      expect(existsSync(join(packageDir, "src", "index.ts"))).toBe(true);
      expect(existsSync(join(packageDir, "LICENSE"))).toBe(true);
    }
  });
});
