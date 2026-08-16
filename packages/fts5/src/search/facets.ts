import {
  quoteIdent,
  SearchError,
  sql,
  type ApplicationLimits,
  type CompiledSearch,
  type FacetDistribution,
  type FacetStats,
  type IndexDefinition,
  type PortableScalar,
  type ResolvedFieldType,
  type SqlAdapter,
} from "@siftlite/core";

export interface CompiledFacets {
  readonly facets: Readonly<Record<string, FacetDistribution>>;
  readonly facetStats: Readonly<Record<string, FacetStats>>;
}

export async function executeFacets(args: {
  readonly adapter: SqlAdapter;
  readonly definition: IndexDefinition;
  readonly compiled: CompiledSearch;
  readonly fields: readonly string[];
  readonly limits: ApplicationLimits;
}): Promise<CompiledFacets> {
  if (args.fields.length === 0) {
    return { facets: {}, facetStats: {} };
  }
  if (args.fields.length > args.limits.maxFacets) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: "facet count exceeds maxFacets",
      details: { reason: "max-facets", count: args.fields.length },
    });
  }

  const facets: Record<string, FacetDistribution> = {};
  const facetStats: Record<string, FacetStats> = {};

  for (const field of args.fields) {
    if (!args.definition.facets.includes(field)) {
      throw new SearchError({
        code: "SEARCH_QUERY_INVALID",
        message: `field ${field} is not declared as a facet`,
        details: { reason: "undeclared-facet" },
      });
    }
    const spec = args.definition.filterable[field] ?? args.definition.sortable[field];
    if (!spec) {
      throw new SearchError({
        code: "SEARCH_QUERY_INVALID",
        message: `facet field ${field} has no projected storage type`,
        details: { reason: "undeclared-facet-type" },
      });
    }
    const column = `d.${quoteIdent(field)}`;
    const rows = await args.adapter.query<{ value: unknown; count: number }>(
      sql(
        `SELECT ${column} AS value, COUNT(*) AS count
${args.compiled.fromSql}
WHERE ${args.compiled.whereSql} AND ${column} IS NOT NULL
GROUP BY ${column}
ORDER BY count DESC, value ASC
LIMIT ?`,
        [...args.compiled.whereParams, args.limits.maxFacetValues],
      ),
    );
    facets[field] = rows.map((row) => ({
      value: publicFacetValue(spec, row.value),
      count: Number(row.count),
    }));

    if (isNumericFacet(spec)) {
      const stats = await args.adapter.query<{ min: number | null; max: number | null }>(
        sql(
          `SELECT MIN(${column}) AS min, MAX(${column}) AS max
${args.compiled.fromSql}
WHERE ${args.compiled.whereSql} AND ${column} IS NOT NULL`,
          args.compiled.whereParams,
        ),
      );
      const min = stats[0]?.min;
      const max = stats[0]?.max;
      if (min !== null && min !== undefined && max !== null && max !== undefined) {
        facetStats[field] = { min: Number(min), max: Number(max) };
      }
    }
  }

  return { facets, facetStats };
}

function isNumericFacet(spec: ResolvedFieldType): boolean {
  return (
    spec.storageKind === "safe-integer" ||
    spec.storageKind === "finite-real" ||
    spec.storageKind === "timestamp-integer"
  );
}

function publicFacetValue(spec: ResolvedFieldType, value: unknown): PortableScalar {
  switch (spec.storageKind) {
    case "boolean-integer":
      return value === 1 || value === true;
    case "safe-integer":
    case "finite-real":
    case "timestamp-integer":
      return Number(value);
    default:
      return String(value);
  }
}
