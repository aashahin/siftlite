import {
  encodeFieldValue,
  quoteIdent,
  SearchError,
  type BoundScope,
  type FilterNode,
  type IndexDefinition,
  type PortableScalar,
} from "@siftlite/core";

export interface CompiledPredicate {
  readonly sql: string;
  readonly params: unknown[];
}

export function compileScope(
  scope: BoundScope | undefined,
  definition: IndexDefinition,
): CompiledPredicate {
  if (!scope) {
    return { sql: "1 = 1", params: [] };
  }
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const predicate of scope.predicates) {
    const column = quoteIdent(predicate.field);
    parts.push(`${column} = ?`);
    params.push(encodeProjectedValue(definition, predicate.field, predicate.value));
  }
  return { sql: parts.join(" AND "), params };
}

export function compileFilter(
  node: FilterNode | undefined,
  definition: IndexDefinition,
): CompiledPredicate {
  if (!node) {
    return { sql: "1 = 1", params: [] };
  }
  return compileNode(node, definition);
}

function compileNode(node: FilterNode, definition: IndexDefinition): CompiledPredicate {
  switch (node.op) {
    case "and": {
      const children = node.children.map((child) => compileNode(child, definition));
      return join("AND", children);
    }
    case "or": {
      const children = node.children.map((child) => compileNode(child, definition));
      return join("OR", children);
    }
    case "not": {
      const child = compileNode(node.child, definition);
      return { sql: `NOT (${child.sql})`, params: child.params };
    }
    case "isNull":
      return { sql: `${quoteIdent(node.field)} IS NULL`, params: [] };
    case "isNotNull":
      return { sql: `${quoteIdent(node.field)} IS NOT NULL`, params: [] };
    case "in":
    case "notIn": {
      const placeholders = node.values.map(() => "?").join(", ");
      const operator = node.op === "in" ? "IN" : "NOT IN";
      return {
        sql: `${quoteIdent(node.field)} ${operator} (${placeholders})`,
        params: node.values.map((value) => encodeProjectedValue(definition, node.field, value)),
      };
    }
    default: {
      const operator = comparisonSql(node.op);
      return {
        sql: `${quoteIdent(node.field)} ${operator} ?`,
        params: [encodeProjectedValue(definition, node.field, node.value)],
      };
    }
  }
}

function join(operator: "AND" | "OR", children: readonly CompiledPredicate[]): CompiledPredicate {
  return {
    sql: children.map((child) => `(${child.sql})`).join(` ${operator} `),
    params: children.flatMap((child) => child.params),
  };
}

function comparisonSql(op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"): string {
  switch (op) {
    case "eq":
      return "=";
    case "neq":
      return "<>";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
  }
}

function encodeProjectedValue(
  definition: IndexDefinition,
  field: string,
  value: PortableScalar,
): string | number {
  const spec = definition.filterable[field] ?? definition.sortable[field];
  if (!spec) {
    throw new SearchError({
      code: "SEARCH_FILTER_INVALID",
      message: `field ${field} is not declared filterable or sortable`,
      details: { reason: "undeclared-field" },
    });
  }
  const encoded = encodeFieldValue(spec, value);
  if (encoded === null) {
    throw new SearchError({
      code: "SEARCH_VALUE_INVALID",
      message: "comparison values cannot encode to NULL",
      details: { reason: "null-encoded" },
    });
  }
  return encoded;
}
