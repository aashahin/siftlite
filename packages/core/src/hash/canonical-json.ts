import { SearchError } from "../errors/search-error.js";

/**
 * Deterministic JSON for drift hashes. Object keys are sorted; array order is
 * preserved. Non-finite numbers and unsupported types are rejected.
 */
export function canonicalizeJson(value: unknown): string {
  return writeCanonical(value);
}

function writeCanonical(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "canonical JSON rejects NaN and Infinity",
        details: { reason: "non-finite-number" },
      });
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => writeCanonical(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts = keys.map((key) => `${JSON.stringify(key)}:${writeCanonical(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new SearchError({
    code: "SEARCH_CONFIG_INVALID",
    message: "canonical JSON rejects unsupported values",
    details: { reason: "unsupported-type" },
  });
}
