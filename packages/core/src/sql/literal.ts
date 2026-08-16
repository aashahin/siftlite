/**
 * SQL string literals for compile-time constants only.
 *
 * Ordinary request input must never become a SQL literal. User values stay
 * parameterized. This helper exists for finite, curated replacement tables
 * that must be inlined into trigger/backfill DDL.
 */
export function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
