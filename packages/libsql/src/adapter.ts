import {
  assertBindValues,
  SearchError,
  type ExecuteResult,
  type SqlAdapter,
  type SqlStatement,
} from "@siftlite/core";
import type {
  LibsqlClientLike,
  LibsqlResultLike,
  LibsqlStatement,
  LibsqlTransactionLike,
} from "./client.js";
import { libsqlRuntimeCapabilities } from "./limits.js";

export interface LibsqlAdapterOptions {
  readonly kind?: "local" | "remote";
}

class LibsqlAdapter implements SqlAdapter {
  readonly id: string;
  readonly dialect = "sqlite" as const;
  readonly runtimeCapabilities;

  constructor(
    private readonly client: LibsqlClientLike,
    kind: "local" | "remote",
  ) {
    this.id = kind === "remote" ? "libsql-remote" : "libsql-local";
    this.runtimeCapabilities = libsqlRuntimeCapabilities(kind);
  }

  async query<T>(statement: SqlStatement): Promise<readonly T[]> {
    try {
      const result = await this.client.execute(toLibsql(statement));
      return result.rows as T[];
    } catch (error) {
      throw wrap(error);
    }
  }

  async execute(statement: SqlStatement): Promise<ExecuteResult> {
    try {
      const result = await this.client.execute(toLibsql(statement));
      return { rowsAffected: result.rowsAffected };
    } catch (error) {
      throw wrap(error);
    }
  }

  async batch(statements: readonly SqlStatement[]): Promise<readonly ExecuteResult[]> {
    if (!this.client.batch) {
      throw new SearchError({
        code: "SEARCH_CAPABILITY_UNSUPPORTED",
        message: "libSQL client does not expose batch()",
        details: { reason: "libsql-batch" },
      });
    }
    try {
      const results = await this.client.batch(statements.map(toLibsql), "write");
      return results.map((result) => ({ rowsAffected: result.rowsAffected }));
    } catch (error) {
      throw wrap(error);
    }
  }

  async transaction<T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T> {
    if (!this.client.transaction) {
      throw new SearchError({
        code: "SEARCH_CAPABILITY_UNSUPPORTED",
        message: "libSQL client does not expose interactive transactions",
        details: { reason: "libsql-transaction" },
      });
    }
    let tx: LibsqlTransactionLike | undefined;
    try {
      tx = await this.client.transaction("write");
      const result = await fn(
        new LibsqlAdapter(asClient(tx), this.id === "libsql-remote" ? "remote" : "local"),
      );
      await tx.commit();
      return result;
    } catch (error) {
      if (tx) {
        try {
          await tx.rollback();
        } catch {
          // rollback errors must not hide the original failure
        }
      }
      throw wrap(error);
    } finally {
      tx?.close();
    }
  }
}

export function libsqlAdapter(
  client: LibsqlClientLike,
  options: LibsqlAdapterOptions = {},
): SqlAdapter {
  return new LibsqlAdapter(client, options.kind ?? "local");
}

/**
 * Adapt an official `@libsql/client` instance (or compatible object) to the
 * minimal interface. Avoids coupling the adapter type to a concrete class.
 */
export function wrapLibsqlClient(client: object): LibsqlClientLike {
  const official = client as {
    execute?: (statement: unknown) => Promise<LibsqlResultLike>;
    batch?: (statements: unknown, mode?: string) => Promise<readonly LibsqlResultLike[]>;
    transaction?: (mode: string) => Promise<LibsqlTransactionLike>;
  };
  if (typeof official.execute !== "function") {
    throw new SearchError({
      code: "SEARCH_ADAPTER_ERROR",
      message: "libSQL client must expose execute()",
      details: { reason: "libsql-execute" },
    });
  }
  const execute = official.execute;
  const batch = official.batch;
  const transaction = official.transaction;
  return {
    execute: (statement) => execute(statement),
    ...(typeof batch === "function"
      ? { batch: (statements, mode) => batch(statements, mode) }
      : {}),
    ...(typeof transaction === "function"
      ? { transaction: (mode) => transaction(mode) as Promise<LibsqlTransactionLike> }
      : {}),
  };
}

function toLibsql(statement: SqlStatement): LibsqlStatement {
  return {
    sql: statement.sql,
    args: assertBindValues(statement.params),
  };
}

function asClient(tx: LibsqlTransactionLike): LibsqlClientLike {
  return {
    execute: (statement) => tx.execute(statement),
  };
}

function wrap(error: unknown): SearchError {
  if (error instanceof SearchError) {
    return error;
  }
  return new SearchError({
    code: "SEARCH_ADAPTER_ERROR",
    message: "libSQL adapter error",
    details: { reason: "adapter" },
    cause: error,
  });
}
