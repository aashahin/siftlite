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
  readonly kind: "local" | "remote";
  readonly transactions?: boolean;
}

class LibsqlAdapter implements SqlAdapter {
  readonly id: string;
  readonly dialect = "sqlite" as const;
  readonly runtimeCapabilities;

  constructor(
    private readonly client: LibsqlClientLike,
    options: LibsqlAdapterOptions,
  ) {
    const kind = options.kind;
    this.id = kind === "remote" ? "libsql-remote" : "libsql-local";
    const base = libsqlRuntimeCapabilities(kind);
    const memory = looksLikeMemoryClient(client);
    this.runtimeCapabilities = {
      ...base,
      transactions: options.transactions ?? (typeof client.transaction === "function" && !memory),
      batch: typeof client.batch === "function",
    };
  }

  async query<T>(statement: SqlStatement): Promise<readonly T[]> {
    try {
      const result = await this.client.execute(toLibsql(statement));
      return normalizeLibsqlRows<T>(result.rows);
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

  /**
   * Interactive transactions are unsupported on libSQL `:memory:` URLs: the
   * client detaches the connection and later queries see an empty database.
   * Use a `file:` path for commit/rollback. Query/execute on `:memory:` is fine.
   */
  async transaction<T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T> {
    if (!this.runtimeCapabilities.transactions || !this.client.transaction) {
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
        new LibsqlAdapter(asClient(tx), {
          kind: this.id === "libsql-remote" ? "remote" : "local",
          transactions: false,
        }),
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
      try {
        tx?.close();
      } catch {
        // close() must not hide commit, rollback, or callback failures
      }
    }
  }
}

export function libsqlAdapter(client: LibsqlClientLike, options: LibsqlAdapterOptions): SqlAdapter {
  if (options.kind !== "local" && options.kind !== "remote") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: 'libsqlAdapter requires an explicit kind: "local" or "remote"',
      details: { reason: "libsql-kind-required" },
    });
  }
  return new LibsqlAdapter(client, options);
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
  const execute = official.execute.bind(official);
  const batch = typeof official.batch === "function" ? official.batch.bind(official) : undefined;
  const transaction =
    typeof official.transaction === "function" ? official.transaction.bind(official) : undefined;
  const url = (official as { url?: unknown }).url;
  return {
    execute: (statement) => execute(statement),
    ...(batch ? { batch: (statements, mode) => batch(statements, mode) } : {}),
    ...(transaction
      ? { transaction: (mode) => transaction(mode) as Promise<LibsqlTransactionLike> }
      : {}),
    ...(typeof url === "string" ? { url } : {}),
  };
}

function looksLikeMemoryClient(client: LibsqlClientLike): boolean {
  const url = (client as { url?: unknown }).url;
  return typeof url === "string" && (url === ":memory:" || url.includes(":memory:"));
}

function toLibsql(statement: SqlStatement): LibsqlStatement {
  return {
    sql: statement.sql,
    args: assertBindValues(statement.params).map(assertSafeIntegerBind),
  };
}

function assertSafeIntegerBind<T>(value: T): T {
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "libSQL rejects integer binds outside the safe-integer range",
      details: { reason: "unsafe-integer" },
    });
  }
  return value;
}

function asClient(tx: LibsqlTransactionLike): LibsqlClientLike {
  const runBatch = typeof tx.batch === "function" ? tx.batch.bind(tx) : undefined;
  return {
    execute: (statement) => tx.execute(statement),
    batch: runBatch
      ? (statements, mode) => runBatch(statements, mode)
      : async (statements) => {
          const results: LibsqlResultLike[] = [];
          for (const statement of statements) {
            results.push(await tx.execute(statement));
          }
          return results;
        },
  };
}

function normalizeLibsqlRows<T>(rows: readonly Record<string, unknown>[]): T[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeLibsqlValue(value);
    }
    return normalized as T;
  });
}

function normalizeLibsqlValue(value: unknown): unknown {
  if (typeof value !== "bigint") {
    return value;
  }
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "libSQL row value exceeds the portable safe-integer range",
      details: { reason: "bigint-range" },
    });
  }
  return Number(value);
}

function wrap(error: unknown): SearchError {
  if (error instanceof SearchError) {
    return error;
  }
  return new SearchError({
    code: "SEARCH_ADAPTER_ERROR",
    // driver text stays on cause; do not copy it into message
    message: "libSQL adapter error",
    details: { reason: "adapter" },
    cause: error,
  });
}
