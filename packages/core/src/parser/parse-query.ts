import type { MatchingStrategy } from "../definition/types.js";
import { SearchError } from "../errors/search-error.js";
import type { ApplicationLimits } from "../limits/application-limits.js";
import type { TextQuery } from "../ast/text-query.js";
import {
  codePointLength,
  isBoundaryPunctuation,
  isCombiningMark,
  isWhitespaceCodePoint,
} from "./unicode.js";

export interface ParseQueryOptions {
  readonly limits: ApplicationLimits;
  readonly matchingStrategy?: MatchingStrategy;
  readonly minPrefixLength?: number;
}

const FTS_OPERATOR_LOOKALIKES = new Set(["AND", "OR", "NOT", "NEAR", "NOTAND", "MATCH"]);

/**
 * Portable query parser. This is not an FTS5 `unicode61` or Tantivy clone.
 * Combining marks stay attached; punctuation is a portable intent boundary.
 * Index-level normalization runs before this function on the application path.
 */
export function parsePlainTextQuery(input: string, options: ParseQueryOptions): TextQuery {
  if (input.includes("\u0000")) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "query rejects NUL bytes",
      details: { reason: "nul-byte" },
    });
  }
  if (codePointLength(input) > options.limits.maxQueryLength) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "query exceeds maxQueryLength",
      details: { reason: "max-query-length", length: codePointLength(input) },
    });
  }

  const tokens = tokenize(input);
  if (tokens.length === 0) {
    return { kind: "empty" };
  }

  const termCount = tokens.reduce(
    (count, token) => count + (token.kind === "phrase" ? token.terms.length : 1),
    0,
  );
  if (termCount > options.limits.maxTerms) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "query exceeds maxTerms",
      details: { reason: "max-terms", terms: termCount },
    });
  }

  const strategy = options.matchingStrategy ?? "all";
  const nodes = tokens.map((token, index) =>
    toNode(token, strategy, index === tokens.length - 1, options),
  );
  if (nodes.length === 1) {
    return nodes[0] ?? { kind: "empty" };
  }
  return {
    kind: strategy === "any" ? "or" : "and",
    children: nodes,
  };
}

type Token =
  | { readonly kind: "term"; readonly value: string }
  | { readonly kind: "phrase"; readonly terms: readonly string[] };

function tokenize(input: string): Token[] {
  const chars = [...input];
  const tokens: Token[] = [];
  let current = "";
  let inPhrase = false;
  let phraseTerms: string[] = [];

  const flushTerm = (): void => {
    if (current.length === 0) {
      return;
    }
    if (inPhrase) {
      phraseTerms.push(current);
    } else {
      tokens.push({ kind: "term", value: current });
    }
    current = "";
  };

  for (const char of chars) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x22) {
      flushTerm();
      if (inPhrase) {
        if (phraseTerms.length === 0) {
          throw new SearchError({
            code: "SEARCH_QUERY_INVALID",
            message: "empty phrase is not allowed",
            details: { reason: "empty-phrase" },
          });
        }
        tokens.push({ kind: "phrase", terms: phraseTerms });
        phraseTerms = [];
        inPhrase = false;
      } else {
        inPhrase = true;
      }
      continue;
    }
    if (isCombiningMark(code)) {
      current += char;
      continue;
    }
    if (isWhitespaceCodePoint(code) || isBoundaryPunctuation(code)) {
      flushTerm();
      continue;
    }
    current += char;
  }

  if (inPhrase) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: "unclosed phrase quote",
      details: { reason: "unclosed-phrase" },
    });
  }
  flushTerm();
  return tokens;
}

function toNode(
  token: Token,
  strategy: MatchingStrategy,
  isLast: boolean,
  options: ParseQueryOptions,
): TextQuery {
  if (token.kind === "phrase") {
    return { kind: "phrase", terms: token.terms };
  }
  const prefix =
    strategy === "last-prefix" &&
    isLast &&
    codePointLength(token.value) >= (options.minPrefixLength ?? 2);
  return prefix
    ? { kind: "term", value: token.value, prefix: true }
    : { kind: "term", value: token.value };
}

export function looksLikeBackendOperator(term: string): boolean {
  return FTS_OPERATOR_LOOKALIKES.has(term.toUpperCase()) || /[*():^]/.test(term);
}
