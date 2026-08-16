import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CORE_SRC = join(import.meta.dir, "../src");

const FORBIDDEN = [
  /\bbm25\s*\(/i,
  /\bUSING fts5\b/i,
  /\btokenize\s*=/,
  /\bOPTIMIZE INDEX\b/,
  /\bfts_match\b/,
];

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...walk(path));
    } else if (path.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("core FTS5 leakage audit", () => {
  test("public/core contracts do not mention FTS5 or Tantivy grammar", () => {
    const violations: string[] = [];
    for (const file of walk(CORE_SRC)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${file} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
