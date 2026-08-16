import { SearchError, type FieldTypeSpec, type SourceIdType } from "@siftlite/core";

/** Public Drizzle column fields used by the mapper. */
export interface DrizzleColumnLike {
  readonly name: string;
  readonly dataType: string;
  readonly columnType: string;
  readonly primary: boolean;
  readonly notNull: boolean;
  readonly mode?: unknown;
}

export type PortableDrizzleIdColumn = DrizzleColumnLike & {
  readonly dataType: "string" | "number";
  readonly columnType: "SQLiteText" | "SQLiteInteger";
};

export function mapDrizzleColumnToFieldType(column: DrizzleColumnLike): FieldTypeSpec {
  switch (column.columnType) {
    case "SQLiteText":
      return "text";
    case "SQLiteInteger":
      return "integer";
    case "SQLiteReal":
      return "number";
    case "SQLiteBoolean":
      return "boolean";
    case "SQLiteTimestamp":
      if (column.mode === "timestamp_ms") {
        return { kind: "timestamp-integer", unit: "unix-milliseconds" };
      }
      if (column.mode === "timestamp") {
        return { kind: "timestamp-integer", unit: "unix-seconds" };
      }
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `Drizzle timestamp column ${column.name} requires an explicit mode`,
        details: { reason: "drizzle-timestamp-mode", column: column.name },
      });
    case "SQLiteBigInt":
    case "SQLiteBlobBuffer":
    case "SQLiteBlobJson":
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `Drizzle column ${column.name} (${column.columnType}) is not a portable SiftLite field`,
        details: { reason: "unsupported-drizzle-type", column: column.name },
      });
    default:
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `unsupported Drizzle column type ${column.columnType}`,
        details: { reason: "unsupported-drizzle-type", column: column.name },
      });
  }
}

export function mapDrizzleIdColumn(column: DrizzleColumnLike): {
  readonly field: string;
  readonly type: SourceIdType;
} {
  if (column.columnType === "SQLiteText" && column.dataType === "string") {
    return { field: column.name, type: "string" };
  }
  if (column.columnType === "SQLiteInteger" && column.dataType === "number") {
    return { field: column.name, type: "safe-integer" };
  }
  throw new SearchError({
    code: "SEARCH_CONFIG_INVALID",
    message: "portable Drizzle source IDs must be text or integer columns",
    details: { reason: "unsupported-drizzle-id", column: column.name },
  });
}

export function assertSearchableDrizzleColumn(column: DrizzleColumnLike): void {
  if (column.columnType !== "SQLiteText" || column.dataType !== "string") {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `searchable field ${column.name} must be a Drizzle text column`,
      details: { reason: "drizzle-searchable-type", column: column.name },
    });
  }
}
