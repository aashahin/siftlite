import { SearchError } from "../errors/search-error.js";

export function rejectValue(field: string, reason: string, message: string): never {
  throw new SearchError({
    code: "SEARCH_VALUE_INVALID",
    message,
    details: { field, reason },
  });
}

export function rejectUnsupportedPublicValue(field: string, value: unknown): never {
  if (typeof value === "bigint") {
    rejectValue(field, "bigint", `${field} rejects bigint`);
  }
  if (typeof value === "number" && Number.isNaN(value)) {
    rejectValue(field, "nan", `${field} rejects NaN`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    rejectValue(field, "infinity", `${field} rejects Infinity`);
  }
  if (value instanceof Date) {
    rejectValue(
      field,
      "date",
      `${field} rejects Date; declare an explicit timestamp-integer codec`,
    );
  }
  if (value === null) {
    rejectValue(field, "null", `${field} rejects null comparison values; use isNull/isNotNull`);
  }
  if (value === undefined) {
    rejectValue(field, "undefined", `${field} rejects undefined`);
  }
  if (Array.isArray(value)) {
    rejectValue(field, "array", `${field} rejects arrays`);
  }
  if (typeof value === "object") {
    rejectValue(field, "object", `${field} rejects objects, blobs, and JSON values`);
  }
  if (typeof value === "symbol" || typeof value === "function") {
    rejectValue(field, "unsupported-type", `${field} rejects unsupported value types`);
  }
  rejectValue(field, "unsupported-type", `${field} rejects unsupported value types`);
}
