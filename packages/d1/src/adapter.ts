import {
  SearchError,
  type ExecuteResult,
  type SqlAdapter,
  type SqlStatement,
} from "@siftlite/core";
import { assertD1BindValues } from "./bind.js";
import type {
  D1DatabaseLike,
  D1ExecutionTarget,
  D1PreparedLike,
  D1ResultLike,
  D1SessionConstraint,
  D1SessionLike,
} from "./client.js";
import { d1RuntimeCapabilities } from "./limits.js";
import { toD1QueryMeta, type D1QueryMeta } from "./meta.js";

export interface D1SqlAdapter extends SqlAdapter {
  readonly targetKind: "database" | "session";
  lastMeta(): D1QueryMeta | undefined;
  getBookmark(): string | null;
}

class D1Adapter implements D1SqlAdapter {
  readonly id: string;
  readonly dialect = "sqlite" as const;
  readonly runtimeCapabilities;
  readonly targetKind: "database" | "session";
  #lastMeta: D1QueryMeta | undefined;
  #session: D1SessionLike | undefined;

  constructor(
    private readonly target: D1ExecutionTarget,
    kind: "database" | "session",
    session?: D1SessionLike,
  ) {
    this.targetKind = kind;
    this.id = kind === "session" ? "d1-session" : "d1";
    this.runtimeCapabilities = d1RuntimeCapabilities(kind);
    this.#session = session;
  }

  lastMeta(): D1QueryMeta | undefined {
    return this.#lastMeta;
  }

  getBookmark(): string | null {
    return this.#session?.getBookmark() ?? null;
  }

  async query<T>(statement: SqlStatement): Promise<readonly T[]> {
    try {
      const prepared = prepare(this.target, statement);
      const result = await prepared.all<T>();
      assertD1Success(result);
      this.#lastMeta = toD1QueryMeta(result.meta);
      return result.results ?? [];
    } catch (error) {
      throw wrap(error);
    }
  }

  async execute(statement: SqlStatement): Promise<ExecuteResult> {
    try {
      const prepared = prepare(this.target, statement);
      const result = await prepared.run();
      assertD1Success(result);
      this.#lastMeta = toD1QueryMeta(result.meta);
      return { rowsAffected: result.meta?.changes ?? 0 };
    } catch (error) {
      throw wrap(error);
    }
  }

  async batch(statements: readonly SqlStatement[]): Promise<readonly ExecuteResult[]> {
    try {
      const prepared = statements.map((statement) => prepare(this.target, statement));
      const results = await this.target.batch(prepared);
      for (const result of results) {
        assertD1Success(result);
      }
      const last = results[results.length - 1];
      this.#lastMeta = toD1QueryMeta(last?.meta);
      return results.map((result) => ({ rowsAffected: result.meta?.changes ?? 0 }));
    } catch (error) {
      throw wrap(error);
    }
  }
}

export function d1Adapter(database: D1DatabaseLike): D1SqlAdapter {
  return new D1Adapter(database, "database");
}

export function d1SessionAdapter(
  database: D1DatabaseLike,
  constraintOrBookmark: D1SessionConstraint = "first-unconstrained",
): D1SqlAdapter {
  if (typeof database.withSession !== "function") {
    throw new SearchError({
      code: "SEARCH_CAPABILITY_UNSUPPORTED",
      message: "D1 Sessions API is not available on this execution target",
      details: { reason: "d1-session-unavailable" },
    });
  }
  const session = database.withSession(constraintOrBookmark);
  return new D1Adapter(session, "session", session);
}

function prepare(target: D1ExecutionTarget, statement: SqlStatement): D1PreparedLike {
  const stmt = target.prepare(statement.sql);
  if (statement.params.length === 0) {
    return stmt;
  }
  return stmt.bind(...assertD1BindValues(statement.params));
}

function assertD1Success<T>(result: D1ResultLike<T>): void {
  if (result.success === false || typeof result.error === "string") {
    throw new SearchError({
      code: "SEARCH_ADAPTER_ERROR",
      message: "D1 adapter error",
      details: { reason: "d1-unsuccessful" },
      ...(typeof result.error === "string" ? { cause: result.error } : {}),
    });
  }
}

function wrap(error: unknown): SearchError {
  if (error instanceof SearchError) {
    return error;
  }
  return new SearchError({
    code: "SEARCH_ADAPTER_ERROR",
    // driver text stays on cause; do not copy it into message
    message: "D1 adapter error",
    details: { reason: "adapter" },
    cause: error,
  });
}

export type { D1ResultLike };
