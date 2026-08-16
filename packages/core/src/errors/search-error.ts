import type { SearchErrorCode } from "./codes.js";

/** Safe, non-sensitive diagnostic details attached to a {@link SearchError}. */
export type SearchErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export interface SearchErrorOptions {
  readonly code: SearchErrorCode;
  readonly message: string;
  readonly details?: SearchErrorDetails;
  readonly cause?: unknown;
}

/**
 * Typed SiftLite error.
 *
 * Details must never include secrets, raw query text, or bound filter values.
 */
export class SearchError extends Error {
  readonly code: SearchErrorCode;
  readonly details: SearchErrorDetails | undefined;

  constructor(options: SearchErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SearchError";
    this.code = options.code;
    this.details = options.details;
  }
}

export function isSearchError(value: unknown): value is SearchError {
  return value instanceof SearchError;
}
