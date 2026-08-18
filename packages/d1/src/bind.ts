import { assertBindValue, SearchError } from "@siftlite/core";

export type D1BindValue = string | number | boolean | null | Uint8Array;

export function assertD1BindValue(value: unknown): D1BindValue {
  const checked = assertBindValue(value);
  if (
    checked === null ||
    typeof checked === "string" ||
    typeof checked === "number" ||
    typeof checked === "boolean" ||
    checked instanceof Uint8Array
  ) {
    return checked;
  }
  throw new SearchError({
    code: "SEARCH_VALUE_INVALID",
    message: "unsupported D1 bind value",
    details: { reason: "unsupported-bind" },
  });
}

export function assertD1BindValues(values: readonly unknown[]): readonly D1BindValue[] {
  return values.map((value) => assertD1BindValue(value));
}
