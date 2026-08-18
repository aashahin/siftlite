import { SearchError } from "../errors/search-error.js";

const INDEX_NAME = /^[a-z][a-z0-9_]{0,47}$/;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export function assertIndexName(name: string): string {
  if (!INDEX_NAME.test(name)) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "index name must match [a-z][a-z0-9_]{0,47}",
      details: { reason: "invalid-index-name" },
    });
  }
  return name;
}

const RESERVED_PHYSICAL_FIELDS = new Set(["doc_id", "source_id", "rowid", "rank"]);
const RESERVED_FTS5_MATCH_FIELDS = new Set(["and", "or", "not", "near"]);

export function assertFieldName(name: string, role: string): string {
  if (!FIELD_NAME.test(name)) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `${role} field name is not a conservative identifier`,
      details: { reason: "invalid-field-name", role },
    });
  }
  return name;
}

export function assertProjectedFieldName(name: string, role: string): string {
  assertFieldName(name, role);
  const folded = name.toLowerCase();
  if (RESERVED_PHYSICAL_FIELDS.has(folded)) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `${role} field ${name} is reserved`,
      details: { reason: "reserved-field-name", role },
    });
  }
  if (role === "searchable" && RESERVED_FTS5_MATCH_FIELDS.has(folded)) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `${role} field ${name} collides with FTS5 MATCH grammar`,
      details: { reason: "reserved-fts5-match-field", role },
    });
  }
  return name;
}

export function hasOwnField(
  record: Readonly<Record<string, unknown>>,
  field: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

export function assertTableName(name: string): string {
  if (!TABLE_NAME.test(name)) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "source table name is not a conservative identifier",
      details: { reason: "invalid-table-name" },
    });
  }
  return name;
}
