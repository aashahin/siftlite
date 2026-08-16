import type { RuntimeCapabilities } from "../capabilities/types.js";
import type { ExecuteResult, SqlStatement } from "./statement.js";

/**
 * Runtime SQL executor. Adapters do not know FTS5 or Turso search semantics.
 */
export interface SqlAdapter {
  readonly id: string;
  readonly dialect: "sqlite";
  readonly runtimeCapabilities: RuntimeCapabilities;
  query<T>(statement: SqlStatement): Promise<readonly T[]>;
  execute(statement: SqlStatement): Promise<ExecuteResult>;
  batch?(statements: readonly SqlStatement[]): Promise<readonly ExecuteResult[]>;
  transaction?<T>(fn: (tx: SqlAdapter) => Promise<T>): Promise<T>;
}
