/**
 * Portable index-level normalizer contract.
 *
 * Linked-mode profiles must implement identical JavaScript and SQL forms.
 * Generic NFC/NFKC is not part of the portable SQL contract.
 */
export interface SqlExpression {
  readonly sql: string;
}

export interface PortableNormalizer {
  readonly id: string;
  readonly linkedMode: boolean;
  normalize(input: string): string;
  compileSql(inputExpression: SqlExpression): SqlExpression;
}

export type LinkedNormalizerId = "arabic-basic" | "numeric-arabic";

export type PortableNormalizerId = LinkedNormalizerId;

export interface PortableNormalizerSpec {
  readonly id: string;
  readonly replacements: readonly (readonly [string, string])[];
  readonly linkedMode?: boolean;
}
