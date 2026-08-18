import type { FieldCodec } from "./kinds.js";
import { rejectUnsupportedPublicValue, rejectValue } from "./reject.js";
import { decodeIntegerStorage, decodeRealStorage } from "./storage.js";

export const textCodec: FieldCodec<string> = {
  storageKind: "text",
  encode(value) {
    if (typeof value !== "string") {
      rejectUnsupportedPublicValue("text", value);
    }
    return value;
  },
  decode(value) {
    if (typeof value !== "string") {
      rejectValue("text", "storage-mismatch", "text codec expected TEXT storage");
    }
    return value;
  },
};

export const safeIntegerCodec: FieldCodec<number> = {
  storageKind: "safe-integer",
  encode(value) {
    if (typeof value !== "number") {
      rejectUnsupportedPublicValue("safe-integer", value);
    }
    if (Number.isNaN(value)) {
      rejectValue("safe-integer", "nan", "safe-integer rejects NaN");
    }
    if (!Number.isFinite(value)) {
      rejectValue("safe-integer", "infinity", "safe-integer rejects Infinity");
    }
    if (!Number.isSafeInteger(value)) {
      rejectValue("safe-integer", "unsafe-integer", "safe-integer requires Number.isSafeInteger");
    }
    return value;
  },
  decode(value) {
    const decoded = decodeIntegerStorage(value);
    if (decoded === undefined) {
      rejectValue(
        "safe-integer",
        "storage-mismatch",
        "safe-integer codec expected INTEGER storage",
      );
    }
    return decoded;
  },
};

export const finiteRealCodec: FieldCodec<number> = {
  storageKind: "finite-real",
  encode(value) {
    if (typeof value !== "number") {
      rejectUnsupportedPublicValue("finite-real", value);
    }
    if (Number.isNaN(value)) {
      rejectValue("finite-real", "nan", "finite-real rejects NaN");
    }
    if (!Number.isFinite(value)) {
      rejectValue("finite-real", "infinity", "finite-real rejects Infinity");
    }
    return value;
  },
  decode(value) {
    const decoded = decodeRealStorage(value);
    if (decoded === undefined) {
      rejectValue("finite-real", "storage-mismatch", "finite-real codec expected REAL storage");
    }
    return decoded;
  },
};

export const booleanIntegerCodec: FieldCodec<boolean> = {
  storageKind: "boolean-integer",
  encode(value) {
    if (typeof value !== "boolean") {
      rejectUnsupportedPublicValue("boolean-integer", value);
    }
    return value ? 1 : 0;
  },
  decode(value) {
    const decoded = decodeIntegerStorage(value);
    if (decoded === 1) {
      return true;
    }
    if (decoded === 0) {
      return false;
    }
    rejectValue(
      "boolean-integer",
      "storage-mismatch",
      "boolean-integer codec expected INTEGER 0 or 1",
    );
  },
};

export function codecForKind(
  kind: "text" | "safe-integer" | "finite-real" | "boolean-integer",
): FieldCodec<string> | FieldCodec<number> | FieldCodec<boolean> {
  switch (kind) {
    case "text":
      return textCodec;
    case "safe-integer":
      return safeIntegerCodec;
    case "finite-real":
      return finiteRealCodec;
    case "boolean-integer":
      return booleanIntegerCodec;
  }
}
