import { compileIndexNormalizationSql, type IndexDefinition } from "@siftlite/core";

/** Compile a searchable-column SQL expression through the index profile. */
export function compileSearchableExpression(
  definition: IndexDefinition,
  expressionSql: string,
): string {
  return compileIndexNormalizationSql({ sql: expressionSql }, definition.normalization).sql;
}
