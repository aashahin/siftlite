import { assertBindValue, SearchError } from "@siftlite/core";

export type D1BindValue = string | number | boolean | null | ArrayBuffer | ArrayBufferView;

export function assertD1BindValue(value: unknown): D1BindValue {
  const checked = assertBindValue(value);
  if (typeof checked === "number" && Number.isInteger(checked) && !Number.isSafeInteger(checked)) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "D1 rejects integer binds outside the safe-integer range",
      details: { reason: "unsafe-integer" },
    });
  }
  if (
    checked === null ||
    typeof checked === "string" ||
    typeof checked === "number" ||
    typeof checked === "boolean" ||
    checked instanceof ArrayBuffer ||
    ArrayBuffer.isView(checked)
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
