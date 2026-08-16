import type { ResolvedFieldType } from "../definition/types.js";
import { booleanIntegerCodec, finiteRealCodec, safeIntegerCodec, textCodec } from "./codecs.js";
import type { EncodedFieldValue, FieldCodec } from "./kinds.js";
import { timestampIntegerCodec } from "./timestamp.js";

export function codecForFieldType(
  type: ResolvedFieldType,
): FieldCodec<string> | FieldCodec<number> | FieldCodec<boolean> {
  switch (type.storageKind) {
    case "text":
      return textCodec;
    case "safe-integer":
      return safeIntegerCodec;
    case "finite-real":
      return finiteRealCodec;
    case "boolean-integer":
      return booleanIntegerCodec;
    case "timestamp-integer":
      return timestampIntegerCodec(type.timestampUnit ?? "unix-milliseconds");
  }
}

export function encodeFieldValue(type: ResolvedFieldType, value: unknown): EncodedFieldValue {
  const codec = codecForFieldType(type);
  return codec.encode(value as never);
}
