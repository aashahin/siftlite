import { SearchError } from "../errors/search-error.js";
import { sqlStringLiteral } from "../sql/literal.js";
import type { PortableNormalizer, PortableNormalizerSpec, SqlExpression } from "./types.js";

/**
 * Define a finite replacement/removal normalizer.
 *
 * The JavaScript and SQL forms apply the same replacements in the same order.
 * Linked-mode profiles must not prepend NFC/NFKC.
 */
export function definePortableNormalizer(spec: PortableNormalizerSpec): PortableNormalizer {
  if (spec.id.length === 0) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: "normalizer id must be a non-empty string",
      details: { reason: "invalid-normalizer-id" },
    });
  }
  const replacements = spec.replacements.map((pair) => [pair[0], pair[1]] as const);
  for (const [from] of replacements) {
    if (from.length === 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "normalizer replacements cannot use an empty source string",
        details: { reason: "empty-replacement-source", id: spec.id },
      });
    }
  }
  const linkedMode = spec.linkedMode !== false;

  return {
    id: spec.id,
    linkedMode,
    normalize(input: string): string {
      let output = input;
      for (const [from, to] of replacements) {
        output = output.replaceAll(from, to);
      }
      return output;
    },
    compileSql(inputExpression: SqlExpression): SqlExpression {
      if (!linkedMode) {
        throw new SearchError({
          code: "SEARCH_CAPABILITY_UNSUPPORTED",
          message: `normalizer ${spec.id} has no portable SQL form`,
          details: { reason: "manual-only-normalizer", id: spec.id },
        });
      }
      let sql = inputExpression.sql;
      for (const [from, to] of replacements) {
        sql = `replace(${sql}, ${sqlStringLiteral(from)}, ${sqlStringLiteral(to)})`;
      }
      return { sql };
    },
  };
}
