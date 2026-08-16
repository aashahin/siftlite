import {
  assertInListFits,
  encodeFieldValue,
  quoteIdent,
  reserveBinds,
  SearchError,
  type BoundScope,
  type FilterNode,
  type IndexDefinition,
  type PortableScalar,
  type StatementBudget,
} from "@siftlite/core";

export interface CompiledPredicate {
  readonly sql: string;
  readonly params: unknown[];
}

const DOCS_ALIAS = "d";

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
    parts.push(`${columnRef(predicate.field)} = ?`);
    params.push(encodeProjectedValue(definition, predicate.field, predicate.value));
  }
  return { sql: parts.join(" AND "), params };
}

export function compileFilter(
  node: FilterNode | undefined,
  definition: IndexDefinition,
  budget?: StatementBudget,
): CompiledPredicate {
  if (!node) {
    return { sql: "1 = 1", params: [] };
  }
  return compileNode(node, definition, budget);
}

function compileNode(
  node: FilterNode,
  definition: IndexDefinition,
  budget: StatementBudget | undefined,
): CompiledPredicate {
  switch (node.op) {
    case "and": {
      const children = node.children.map((child) => compileNode(child, definition, budget));
      return join("AND", children);
    }
    case "or": {
      const children = node.children.map((child) => compileNode(child, definition, budget));
      return join("OR", children);
    }
    case "not": {
      const child = compileNode(node.child, definition, budget);
      return { sql: `NOT (${child.sql})`, params: child.params };
    }
    case "isNull":
      return { sql: `${columnRef(node.field)} IS NULL`, params: [] };
    case "isNotNull":
      return { sql: `${columnRef(node.field)} IS NOT NULL`, params: [] };
    case "in":
    case "notIn": {
      if (budget) {
        assertInListFits(budget, node.values.length);
        reserveBinds(budget, node.values.length, "in-list");
      }
      const placeholders = node.values.map(() => "?").join(", ");
      const operator = node.op === "in" ? "IN" : "NOT IN";
      return {
        sql: `${columnRef(node.field)} ${operator} (${placeholders})`,
        params: node.values.map((value) => encodeProjectedValue(definition, node.field, value)),
      };
    }
    default: {
      if (budget) {
        reserveBinds(budget, 1, "filter");
      }
      const operator = comparisonSql(node.op);
      return {
        sql: `${columnRef(node.field)} ${operator} ?`,
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

function columnRef(field: string): string {
  return `${DOCS_ALIAS}.${quoteIdent(field)}`;
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
