import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { IndexDefinition, SqlAdapter } from "@siftlite/core";

export const DEFAULT_CONFIG_FILES = ["siftlite.config.mjs", "siftlite.config.js"] as const;

export class SiftLiteConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiftLiteConfigError";
  }
}

export interface LoadSiftLiteConfigOptions {
  readonly cwd: string;
  readonly configPath?: string;
  readonly name?: string;
}

export interface SiftLiteConfigModule {
  readonly createAdapter: () => SqlAdapter | Promise<SqlAdapter>;
  readonly indexes:
    | IndexDefinition
    | readonly IndexDefinition[]
    | Readonly<Record<string, IndexDefinition>>;
}

export interface LoadedSiftLiteConfig {
  readonly path: string;
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly definitions: readonly IndexDefinition[];
}

export function resolveConfigPath(cwd: string, configPath?: string): string {
  if (configPath !== undefined) {
    const resolved = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
    if (!existsSync(resolved)) {
      throw new SiftLiteConfigError(`config file not found: ${resolved}`);
    }
    return resolved;
  }

  for (const fileName of DEFAULT_CONFIG_FILES) {
    const candidate = resolve(cwd, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new SiftLiteConfigError(
    `no siftlite config found (looked for ${DEFAULT_CONFIG_FILES.join(", ")}); pass --config`,
  );
}

interface ConfigNamespace {
  readonly createAdapter?: unknown;
  readonly indexes?: unknown;
}

export async function importSiftLiteConfig(path: string): Promise<SiftLiteConfigModule> {
  const namespace = (await import(pathToFileURL(path).href)) as ConfigNamespace;
  const createAdapter = namespace.createAdapter;
  const indexes = namespace.indexes;
  if (typeof createAdapter !== "function") {
    throw new SiftLiteConfigError("config must export createAdapter()");
  }
  if (indexes === undefined) {
    throw new SiftLiteConfigError("config must export indexes");
  }
  return {
    createAdapter: createAdapter as SiftLiteConfigModule["createAdapter"],
    indexes: indexes as SiftLiteConfigModule["indexes"],
  };
}

export function resolveIndexDefinition(
  indexes: SiftLiteConfigModule["indexes"],
  name?: string,
): { readonly definition: IndexDefinition; readonly definitions: readonly IndexDefinition[] } {
  const definitions = collectIndexDefinitions(indexes);
  if (definitions.length === 0) {
    throw new SiftLiteConfigError("config indexes is empty");
  }

  if (name !== undefined) {
    const named = pickNamedDefinition(indexes, definitions, name);
    if (named === undefined) {
      throw new SiftLiteConfigError(`unknown index ${name}`);
    }
    return { definition: named, definitions };
  }

  if (definitions.length === 1) {
    const only = definitions[0];
    if (only === undefined) {
      throw new SiftLiteConfigError("config indexes is empty");
    }
    return { definition: only, definitions };
  }

  const names = definitions.map((definition) => definition.name).join(", ");
  throw new SiftLiteConfigError(`multiple indexes; pass --name (${names})`);
}

export async function loadSiftLiteConfig(
  options: LoadSiftLiteConfigOptions,
): Promise<LoadedSiftLiteConfig> {
  const path = resolveConfigPath(options.cwd, options.configPath);
  const module = await importSiftLiteConfig(path);
  const { definition, definitions } = resolveIndexDefinition(module.indexes, options.name);
  const adapter = await module.createAdapter();
  if (!isSqlAdapter(adapter)) {
    throw new SiftLiteConfigError("createAdapter() must return a SqlAdapter");
  }
  return { path, adapter, definition, definitions };
}

function collectIndexDefinitions(
  indexes: SiftLiteConfigModule["indexes"],
): readonly IndexDefinition[] {
  if (isIndexDefinition(indexes)) {
    return [indexes];
  }
  if (Array.isArray(indexes)) {
    const definitions: IndexDefinition[] = [];
    for (const value of indexes) {
      if (!isIndexDefinition(value)) {
        throw new SiftLiteConfigError("config indexes array must contain IndexDefinition values");
      }
      definitions.push(value);
    }
    return definitions;
  }
  if (indexes !== null && typeof indexes === "object") {
    const record = indexes as Readonly<Record<string, unknown>>;
    const definitions: IndexDefinition[] = [];
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (!isIndexDefinition(value)) {
        throw new SiftLiteConfigError("config indexes record must contain IndexDefinition values");
      }
      definitions.push(value);
    }
    return definitions;
  }
  throw new SiftLiteConfigError(
    "config indexes must be an IndexDefinition, array, or name-to-definition record",
  );
}

function pickNamedDefinition(
  indexes: SiftLiteConfigModule["indexes"],
  definitions: readonly IndexDefinition[],
  name: string,
): IndexDefinition | undefined {
  if (!isIndexDefinition(indexes) && !Array.isArray(indexes) && indexes !== null) {
    const record = indexes as Readonly<Record<string, unknown>>;
    const byKey = record[name];
    if (isIndexDefinition(byKey)) {
      return byKey;
    }
  }
  return definitions.find((definition) => definition.name === name);
}

interface LooseIndexDefinition {
  readonly name?: unknown;
  readonly mode?: unknown;
  readonly logicalFormatVersion?: unknown;
  readonly searchable?: unknown;
  readonly searchableOrder?: unknown;
}

function isIndexDefinition(value: unknown): value is IndexDefinition {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as LooseIndexDefinition;
  return (
    typeof record.name === "string" &&
    (record.mode === "linked" || record.mode === "manual") &&
    typeof record.logicalFormatVersion === "number" &&
    record.searchable !== null &&
    typeof record.searchable === "object" &&
    Array.isArray(record.searchableOrder)
  );
}

interface LooseSqlAdapter {
  readonly query?: unknown;
  readonly execute?: unknown;
}

function isSqlAdapter(value: unknown): value is SqlAdapter {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as LooseSqlAdapter;
  return typeof record.query === "function" && typeof record.execute === "function";
}
