/**
 * Canonical portable storage kinds. ORM types must map into these kinds;
 * they must not leak into core.
 */
export type SearchStorageKind =
  | "text"
  | "safe-integer"
  | "finite-real"
  | "boolean-integer"
  | "timestamp-integer";

/** Declared integer timestamp unit. Dates are never inferred. */
export type TimestampUnit = "unix-seconds" | "unix-milliseconds";

/** Encoded portable storage value. `null` is SQL NULL, not a comparison scalar. */
export type EncodedFieldValue = string | number | null;

/**
 * Canonical field codec.
 *
 * `encode` rejects unsupported public values before SQL is generated.
 * `decode` reconstructs the public value from typed storage.
 */
export interface FieldCodec<TPublic> {
  readonly storageKind: SearchStorageKind;
  encode(value: TPublic): Exclude<EncodedFieldValue, null>;
  decode(value: EncodedFieldValue): TPublic;
}
