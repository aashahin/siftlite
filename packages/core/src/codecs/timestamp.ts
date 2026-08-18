import type { FieldCodec, TimestampUnit } from "./kinds.js";
import { rejectUnsupportedPublicValue, rejectValue } from "./reject.js";
import { decodeIntegerStorage } from "./storage.js";

/**
 * Explicit integer timestamp codec. JavaScript `Date` is never accepted.
 */
export function timestampIntegerCodec(unit: TimestampUnit): FieldCodec<number> {
  return {
    storageKind: "timestamp-integer",
    encode(value) {
      if (typeof value !== "number") {
        rejectUnsupportedPublicValue(`timestamp-integer:${unit}`, value);
      }
      if (Number.isNaN(value)) {
        rejectValue(`timestamp-integer:${unit}`, "nan", "timestamp-integer rejects NaN");
      }
      if (!Number.isFinite(value)) {
        rejectValue(`timestamp-integer:${unit}`, "infinity", "timestamp-integer rejects Infinity");
      }
      if (!Number.isSafeInteger(value)) {
        rejectValue(
          `timestamp-integer:${unit}`,
          "unsafe-integer",
          "timestamp-integer requires a finite safe integer",
        );
      }
      return value;
    },
    decode(value) {
      const decoded = decodeIntegerStorage(value);
      if (decoded === undefined) {
        rejectValue(
          `timestamp-integer:${unit}`,
          "storage-mismatch",
          "timestamp-integer codec expected INTEGER storage",
        );
      }
      return decoded;
    },
  };
}
