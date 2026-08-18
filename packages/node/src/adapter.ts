import {
  assertBindValues,
  SearchError,
  type ExecuteResult,
  type SqlAdapter,
  type SqlStatement,
} from "@siftlite/core";
import { nodeSqliteRuntimeCapabilities } from "./limits.js";

export interface BetterSqliteStatementLike {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { readonly changes: number };
}

export interface BetterSqliteDatabaseLike {
  prepare(sql: string): BetterSqliteStatementLike;
  exec(sql: string): unknown;
}

export interface NodeSqliteAdapterOptions {
  readonly database: BetterSqliteDatabaseLike;
}

class NodeSqliteAdapter implements SqlAdapter {
  readonly id = "node-better-sqlite3";
  readonly dialect = "sqlite" as const;
  readonly runtimeCapabilities = nodeSqliteRuntimeCapabilities();
  #inTransaction = false;

  constructor(private readonly database: BetterSqliteDatabaseLike) {}

  async query<T>(statement: SqlStatement): Promise<readonly T[]> {
    try {
      const params = toSqliteBindings(assertBindValues(statement.params));
      return this.database.prepare(statement.sql).all(...params) as T[];
    } catch (error) {
      throw wrap(error);
    }
  }

  async execute(statement: SqlStatement): Promise<ExecuteResult> {
    try {
      const params = toSqliteBindings(assertBindValues(statement.params));
      const result = this.database.prepare(statement.sql).run(...params);
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
      const nested = tx as NodeSqliteAdapter;
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

export function nodeSqliteAdapter(
  databaseOrOptions: BetterSqliteDatabaseLike | NodeSqliteAdapterOptions,
): SqlAdapter {
  const database =
    typeof databaseOrOptions === "object" &&
    databaseOrOptions !== null &&
    "database" in databaseOrOptions
      ? databaseOrOptions.database
      : databaseOrOptions;
  return new NodeSqliteAdapter(database);
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
    message: "better-sqlite3 adapter error",
    details: { reason: "adapter" },
    cause: error,
  });
}
