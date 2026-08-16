import { SearchError } from "../errors/search-error.js";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertSqlIdentifier(name: string): string {
  if (name.length === 0 || name.length > 96 || !IDENT.test(name)) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "SQL identifier failed conservative validation",
      details: { reason: "invalid-identifier" },
    });
  }
  return name;
}

/** Shared identifier quoting. Request input must never reach this function. */
export function quoteIdent(name: string): string {
  const safe = assertSqlIdentifier(name);
  return `"${safe.replaceAll('"', '""')}"`;
}
