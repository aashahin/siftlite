import {
  quoteIdent,
  SearchError,
  sql,
  type IndexDefinition,
  type SqlAdapter,
} from "@siftlite/core";
import { physicalNames } from "../names.js";
import { probeFts5Capabilities } from "../probes.js";
import { readRegistry } from "./registry-sql.js";

export type SecureDeletePolicy = "off" | "required-if-supported";

export interface MergeResult {
  readonly workRemaining: boolean;
  readonly pageBudget: number;
}

export async function mergeFtsIndex(args: {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly pageBudget: number;
}): Promise<MergeResult> {
  if (!Number.isSafeInteger(args.pageBudget) || args.pageBudget <= 0) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "merge pageBudget must be a positive safe integer",
      details: { reason: "page-budget" },
    });
  }
  const row = await readRegistry(args.adapter, args.definition.name);
  if (!row) {
    throw new SearchError({
      code: "SEARCH_INDEX_NOT_FOUND",
      message: "index is not registered",
      details: { reason: "missing-registry" },
    });
  }
  const names = physicalNames(args.definition, row.physicalIndexId, row.activeGeneration);
  await args.adapter.execute(
    sql(`INSERT INTO ${quoteIdent(names.fts)}(${quoteIdent(names.fts)}, rank) VALUES (?, ?)`, [
      "merge",
      args.pageBudget,
    ]),
  );
  return { workRemaining: false, pageBudget: args.pageBudget };
}

export async function incrementalOptimize(args: {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly pageBudget: number;
}): Promise<MergeResult> {
  return mergeFtsIndex(args);
}

export async function assertSecureDeletePolicy(
  adapter: SqlAdapter,
  policy: SecureDeletePolicy,
): Promise<void> {
  if (policy === "off") {
    return;
  }
  const probes = await probeFts5Capabilities(adapter);
  if (probes.fts5SecureDelete !== true) {
    throw new SearchError({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
      message: "FTS5 secure-delete is required by policy but unproven",
      details: { reason: "secure-delete-unproven" },
    });
  }
}
