import { rejectUnsupportedPublicValue } from "../codecs/reject.js";

/**
 * Portable comparison scalar after codec-independent rejection.
 *
 * Field codecs still decide whether a number is a safe integer, finite real,
 * or timestamp. This type is not an unconstrained `unknown` contract.
 */
export type PortableScalar = string | number | boolean;

export function assertPortableScalar(value: unknown, field: string): PortableScalar {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      rejectUnsupportedPublicValue(field, value);
    }
    if (!Number.isFinite(value)) {
      rejectUnsupportedPublicValue(field, value);
    }
    return value;
  }
  rejectUnsupportedPublicValue(field, value);
}
