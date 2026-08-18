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
  #inTransaction = false;

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
    if (this.#inTransaction) {
      return this.executeAll(statements);
    }
    return this.transaction(async (tx) => {
      const nested = tx as BunSqliteAdapter;
      return nested.executeAll(statements);
    });
  }

  async transaction<T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T> {
    if (this.#inTransaction) {
      return fn(this);
    }
    this.database.exec("BEGIN");
    this.#inTransaction = true;
    try {
      const result = await fn(this);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // rollback errors must not hide the original failure
      }
      throw wrap(error);
    } finally {
      this.#inTransaction = false;
    }
  }

  private async executeAll(statements: readonly SqlStatement[]): Promise<readonly ExecuteResult[]> {
    const results: ExecuteResult[] = [];
    for (const statement of statements) {
      results.push(await this.execute(statement));
    }
    return results;
  }
}

export function bunSqliteAdapter(
  databaseOrOptions: Database | BunSqliteAdapterOptions,
): SqlAdapter {
  const database =
    typeof databaseOrOptions === "object" &&
    databaseOrOptions !== null &&
    "database" in databaseOrOptions
      ? databaseOrOptions.database
      : databaseOrOptions;
  return new BunSqliteAdapter(database);
}

type SqliteBinding = string | number | boolean | null | Uint8Array;

function toSqliteBindings(values: readonly unknown[]): SqliteBinding[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    if (typeof value === "number") {
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new SearchError({
          code: "SEARCH_VALUE_INVALID",
          message: "bun:sqlite rejects integer binds outside the safe-integer range",
          details: { reason: "unsafe-integer" },
        });
      }
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
    // driver text stays on cause; do not copy it into message
    message: "bun:sqlite adapter error",
    details: { reason: "adapter" },
    cause: error,
  });
}
