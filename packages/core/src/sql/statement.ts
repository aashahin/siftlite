/** Parameterized SQL statement. Values are always binds, never interpolated. */
export interface SqlStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export interface ExecuteResult {
  readonly rowsAffected: number;
}

export function sql(text: string, params: readonly unknown[] = []): SqlStatement {
  return { sql: text, params };
}
