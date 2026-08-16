import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const CORE_ROOT = join(import.meta.dir, "../../packages/core");
const CORE_SRC = join(CORE_ROOT, "src");
const CORE_PACKAGE_JSON = join(CORE_ROOT, "package.json");

const FORBIDDEN_SPECIFIERS = [
  /^bun(?::|$)/,
  /^node:/,
  /^cloudflare:/,
  /^wrangler$/,
  /^@siftlite\/bun$/,
  /^@siftlite\/d1$/,
  /^@siftlite\/libsql$/,
  /^@siftlite\/drizzle$/,
  /^@siftlite\/prisma$/,
  /^@siftlite\/cli$/,
  /^@siftlite\/turso$/,
  /^drizzle-orm$/,
  /^drizzle-kit$/,
  /^@prisma\/client$/,
  /^@prisma\/adapter-/,
  /^prisma$/,
  /^@libsql\/client$/,
  /^@libsql\/hrana-client$/,
  /^libsql$/,
  /^(?:node:)?(?:assert|async_hooks|buffer|child_process|cluster|console|constants|crypto|dgram|diagnostics_channel|dns|domain|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)(?:\/|$)/,
] as const;

const IMPORT_SPECIFIER =
  /(?:import|export)(?:\s+type)?(?:[\s\w*,{}]+from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

function walkTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walkTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files;
}

function specifiersIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      found.push(specifier);
    }
  }
  return found;
}

function isForbidden(specifier: string): boolean {
  return FORBIDDEN_SPECIFIERS.some((pattern) => pattern.test(specifier));
}

describe("core dependency boundary", () => {
  test("core package.json has no runtime or ORM dependencies", () => {
    const pkg = JSON.parse(readFileSync(CORE_PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.optionalDependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
  });

  test("core source does not import Node, Bun, D1, libSQL, or ORM modules", () => {
    const files = walkTypeScriptFiles(CORE_SRC);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const specifier of specifiersIn(source)) {
        if (isForbidden(specifier)) {
          violations.push(`${relative(CORE_ROOT, file)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
