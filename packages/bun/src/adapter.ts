import type { Database } from "bun:sqlite";
import {
  assertBindValues,
  SearchError,
  type ExecuteResult,
  type SqlAdapter,
  type SqlStatement,
} from "@siftlite/core";
import { bunRuntimeCapabilities } from "./limits.js";

export interface BunSqliteAdapterOptions {
  readonly database: Database;
}

class BunSqliteAdapter implements SqlAdapter {
  readonly id = "bun-sqlite";
  readonly dialect = "sqlite" as const;
  readonly runtimeCapabilities = bunRuntimeCapabilities();

  constructor(private readonly database: Database) {}

  async query<T>(statement: SqlStatement): Promise<readonly T[]> {
    try {
      const params = toSqliteBindings(assertBindValues(statement.params));
      const rows = this.database.query(statement.sql).all(...params);
      return rows as T[];
    } catch (error) {
      throw wrap(error);
    }
  }

  async execute(statement: SqlStatement): Promise<ExecuteResult> {
    try {
      const params = toSqliteBindings(assertBindValues(statement.params));
      const result = this.database.query(statement.sql).run(...params);
      return { rowsAffected: result.changes };
    } catch (error) {
      throw wrap(error);
    }
  }

  async batch(statements: readonly SqlStatement[]): Promise<readonly ExecuteResult[]> {
    const results: ExecuteResult[] = [];
    for (const statement of statements) {
      results.push(await this.execute(statement));
    }
    return results;
  }

  async transaction<T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T> {
    this.database.exec("BEGIN");
    try {
      const result = await fn(this);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw wrap(error);
    }
  }
}

export function bunSqliteAdapter(database: Database): SqlAdapter {
  return new BunSqliteAdapter(database);
}

type SqliteBinding = string | number | boolean | null | Uint8Array;

function toSqliteBindings(values: readonly unknown[]): SqliteBinding[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "unsupported SQLite bind value",
      details: { reason: "unsupported-bind" },
    });
  });
}

function wrap(error: unknown): SearchError {
  if (error instanceof SearchError) {
    return error;
  }
  return new SearchError({
    code: "SEARCH_ADAPTER_ERROR",
    message: "bun:sqlite adapter error",
    details: { reason: "adapter" },
    cause: error,
  });
}
