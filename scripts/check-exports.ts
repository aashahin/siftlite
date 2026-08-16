/**
 * Validates that every published workspace package has deterministic exports
 * and that the built artifacts (JS, types, source maps) exist.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PUBLISHED_PACKAGES = [
  "packages/core",
  "packages/fts5",
  "packages/bun",
  "packages/testing",
] as const;

interface PackageExportMap {
  readonly types?: string;
  readonly import?: string;
  readonly default?: string;
}

interface PackageJson {
  readonly name: string;
  readonly type?: string;
  readonly private?: boolean;
  readonly exports?: {
    readonly "."?: PackageExportMap;
    readonly [key: string]: unknown;
  };
  readonly main?: string;
  readonly types?: string;
  readonly files?: readonly string[];
}

function fail(message: string): never {
  throw new Error(message);
}

function readPackageJson(relativeDir: string): PackageJson {
  const path = join(root, relativeDir, "package.json");
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function resolveExportPath(
  packageDir: string,
  specifier: string | undefined,
  label: string,
): string {
  if (!specifier) {
    fail(`${packageDir}: missing ${label} export`);
  }
  if (!specifier.startsWith("./")) {
    fail(`${packageDir}: ${label} must be a relative path starting with ./`);
  }
  return join(root, packageDir, specifier);
}

let failures = 0;

for (const packageDir of PUBLISHED_PACKAGES) {
  try {
    const pkg = readPackageJson(packageDir);
    if (pkg.private === true) {
      fail(`${packageDir}: published packages must not be private`);
    }
    if (pkg.type !== "module") {
      fail(`${packageDir}: type must be "module"`);
    }
    if (!pkg.exports || typeof pkg.exports !== "object" || !("." in pkg.exports)) {
      fail(`${packageDir}: missing exports["."]`);
    }

    const rootExport = pkg.exports["."];
    if (!rootExport || typeof rootExport !== "object") {
      fail(`${packageDir}: exports["."] must be a conditional export map`);
    }

    const typesPath = resolveExportPath(packageDir, rootExport.types, "types");
    const importPath = resolveExportPath(packageDir, rootExport.import, "import");
    const defaultPath = resolveExportPath(packageDir, rootExport.default, "default");

    for (const [label, filePath] of [
      ["types", typesPath],
      ["import", importPath],
      ["default", defaultPath],
    ] as const) {
      if (!existsSync(filePath)) {
        fail(`${packageDir}: ${label} file does not exist: ${filePath}`);
      }
    }

    if (!existsSync(`${importPath}.map`)) {
      fail(`${packageDir}: missing source map for ${rootExport.import}`);
    }
    if (!existsSync(`${typesPath}.map`)) {
      fail(`${packageDir}: missing declaration map for ${rootExport.types}`);
    }

    if (pkg.main !== rootExport.import) {
      fail(`${packageDir}: main must match exports["."].import`);
    }
    if (pkg.types !== rootExport.types) {
      fail(`${packageDir}: types must match exports["."].types`);
    }
    if (!pkg.files?.includes("dist")) {
      fail(`${packageDir}: files must include "dist"`);
    }

    console.log(`ok  ${pkg.name} (${packageDir})`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`fail ${packageDir}: ${message}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
