import type { SearchStorageKind } from "../codecs/kinds.js";
import { SearchError } from "../errors/search-error.js";
import type { FieldTypeSpec, ResolvedFieldType } from "./types.js";

export function resolveFieldType(spec: FieldTypeSpec, field: string): ResolvedFieldType {
  if (typeof spec === "object") {
    if (spec.kind !== "timestamp-integer") {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `${field} has an unsupported field type object`,
        details: { reason: "unsupported-field-type" },
      });
    }
    if (spec.unit !== "unix-seconds" && spec.unit !== "unix-milliseconds") {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `${field} timestamp unit must be unix-seconds or unix-milliseconds`,
        details: { reason: "invalid-timestamp-unit" },
      });
    }
    return { storageKind: "timestamp-integer", timestampUnit: spec.unit };
  }

  const storageKind = shorthandToKind(spec);
  if (!storageKind) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `${field} has an unsupported field type`,
      details: { reason: "unsupported-field-type" },
    });
  }
  return { storageKind };
}

function shorthandToKind(spec: string): SearchStorageKind | undefined {
  switch (spec) {
    case "text":
      return "text";
    case "number":
    case "finite-real":
      return "finite-real";
    case "integer":
    case "safe-integer":
      return "safe-integer";
    case "boolean":
    case "boolean-integer":
      return "boolean-integer";
    case "timestamp-integer":
      return undefined;
    default:
      return undefined;
  }
}
