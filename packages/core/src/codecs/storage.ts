const EXACT_SAFE_INTEGER_DECIMAL = /^-?(0|[1-9]\d*)$/;

/** Coerce SQLite/D1/libSQL integer-ish row values to a portable safe integer. */
export function decodeIntegerStorage(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return undefined;
    }
    return Number(value);
  }
  if (typeof value === "string" && EXACT_SAFE_INTEGER_DECIMAL.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(parsed) === value) {
      return parsed;
    }
  }
  return undefined;
}

/** Coerce SQLite/D1/libSQL real-ish row values to a portable finite number. */
export function decodeRealStorage(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const integer = decodeIntegerStorage(value);
  if (integer !== undefined) {
    return integer;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}
