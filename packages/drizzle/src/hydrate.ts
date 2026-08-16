import {
  assertSourceId,
  chunkIdsForHydration,
  createStatementBudget,
  DEFAULT_APPLICATION_LIMITS,
  type ApplicationLimits,
  type DocumentHydrator,
  type SourceId,
  type SqlAdapter,
} from "@siftlite/core";
import { getTableColumns, inArray } from "drizzle-orm";
import type { DrizzleColumnLike } from "./columns.js";
import type { DrizzleIndex } from "./define-index.js";

export interface DrizzleSelectDatabase<TTable, TRow> {
  select(): {
    from(table: TTable): {
      where(condition: unknown): Promise<readonly TRow[]> | readonly TRow[];
    };
  };
}

export function createDrizzleHydrator<TTable, TRow extends Record<string, unknown>>(args: {
  readonly db: DrizzleSelectDatabase<TTable, TRow>;
  readonly index: DrizzleIndex<TTable>;
  readonly adapter: SqlAdapter;
  readonly limits?: ApplicationLimits;
}): DocumentHydrator<TRow> {
  const limits = args.limits ?? DEFAULT_APPLICATION_LIMITS;
  const idColumn = args.index.idColumn as DrizzleColumnLike & { readonly name: string };

  return {
    async hydrate(ids) {
      const documents = new Map<SourceId, TRow>();
      if (ids.length === 0) {
        return documents;
      }
      const budget = createStatementBudget(args.adapter.runtimeCapabilities.limits, limits);
      const idKey = jsKeyForColumn(args.index.table, idColumn);
      for (const chunk of chunkIdsForHydration(ids, budget)) {
        const rows = await Promise.resolve(
          args.db
            .select()
            .from(args.index.table)
            .where(inArray(idColumn as never, [...chunk] as never)),
        );
        for (const row of rows) {
          const raw = row[idKey] ?? row[idColumn.name];
          documents.set(restoreId(raw), row);
        }
      }
      return documents;
    },
  };
}

function jsKeyForColumn(table: unknown, column: DrizzleColumnLike): string {
  const columns = getTableColumns(table as never) as Record<string, DrizzleColumnLike>;
  for (const [key, candidate] of Object.entries(columns)) {
    if (candidate.name === column.name) {
      return key;
    }
  }
  return column.name;
}

function restoreId(value: unknown): SourceId {
  return assertSourceId(typeof value === "number" ? value : String(value));
}
