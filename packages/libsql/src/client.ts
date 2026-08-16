/**
 * Minimal libSQL/Turso client surface. Compatible with `@libsql/client`
 * without importing that package into `@siftlite/core`.
 */
export type LibsqlValue = null | string | number | bigint | ArrayBuffer | Uint8Array;

export interface LibsqlStatement {
  readonly sql: string;
  readonly args?: readonly unknown[];
}

export interface LibsqlResultLike {
  readonly rows: readonly Record<string, unknown>[];
  readonly rowsAffected: number;
}

export interface LibsqlClientLike {
  execute(statement: LibsqlStatement | string): Promise<LibsqlResultLike>;
  batch?(
    statements: readonly (LibsqlStatement | string)[],
    mode?: "write" | "read" | "deferred",
  ): Promise<readonly LibsqlResultLike[]>;
  transaction?(mode: "write" | "read" | "deferred"): Promise<LibsqlTransactionLike>;
}

export interface LibsqlTransactionLike {
  execute(statement: LibsqlStatement | string): Promise<LibsqlResultLike>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): void;
}
