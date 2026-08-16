import { SearchError } from "../errors/search-error.js";
import type { ApplicationLimits } from "./application-limits.js";
import { interpretLimit, type ProvenLimit, type RuntimeSqlLimits } from "./runtime-sql-limits.js";

export type BudgetReason =
  | "search"
  | "scope"
  | "filter"
  | "in-list"
  | "pagination"
  | "facet"
  | "ranking"
  | "hydration"
  | "synonym"
  | "other";

export interface StatementBudget {
  readonly limits: RuntimeSqlLimits;
  readonly application: ApplicationLimits;
  reservedBinds: number;
  reservedFunctionArgs: number;
  reservedStatementBytes: number;
}

export function createStatementBudget(
  limits: RuntimeSqlLimits,
  application: ApplicationLimits,
): StatementBudget {
  return {
    limits,
    application,
    reservedBinds: 0,
    reservedFunctionArgs: 0,
    reservedStatementBytes: 0,
  };
}

export function remainingBindBudget(budget: StatementBudget): ProvenLimit {
  const limit = interpretLimit(budget.limits.maxBindParameters);
  return limit === "unproven" ? "unproven" : limit - budget.reservedBinds;
}

export function remainingFunctionArgBudget(budget: StatementBudget): ProvenLimit {
  const limit = interpretLimit(budget.limits.maxFunctionArguments);
  return limit === "unproven" ? "unproven" : limit - budget.reservedFunctionArgs;
}

export function remainingStatementByteBudget(budget: StatementBudget): ProvenLimit {
  const limit = interpretLimit(budget.limits.maxStatementBytes);
  return limit === "unproven" ? "unproven" : limit - budget.reservedStatementBytes;
}

export function reserveBinds(budget: StatementBudget, count: number, reason: BudgetReason): void {
  reserve(budget, "maxBindParameters", "reservedBinds", count, reason, "bind parameters");
}

export function reserveFunctionArgs(
  budget: StatementBudget,
  count: number,
  reason: BudgetReason,
): void {
  reserve(
    budget,
    "maxFunctionArguments",
    "reservedFunctionArgs",
    count,
    reason,
    "function arguments",
  );
}

export function reserveStatementBytes(
  budget: StatementBudget,
  count: number,
  reason: BudgetReason,
): void {
  reserve(budget, "maxStatementBytes", "reservedStatementBytes", count, reason, "statement bytes");
}

/**
 * Effective IN-list ceiling: application policy intersected with remaining
 * proven bind budget. Unproven runtime limits do not become unlimited.
 */
export function effectiveMaxInValues(budget: StatementBudget): number {
  const remaining = remainingBindBudget(budget);
  if (remaining === "unproven") {
    return budget.application.maxInValues;
  }
  return Math.max(0, Math.min(budget.application.maxInValues, remaining));
}

export function assertInListFits(budget: StatementBudget, count: number): void {
  const allowed = effectiveMaxInValues(budget);
  if (count > allowed) {
    throw new SearchError({
      code: "SEARCH_RUNTIME_LIMIT_EXCEEDED",
      message: "IN list exceeds remaining bind budget",
      details: {
        reason: "in-list-budget",
        requested: count,
        allowed,
        bindLimitProven: remainingBindBudget(budget) !== "unproven",
      },
    });
  }
}

function reserve(
  budget: StatementBudget,
  limitKey: "maxBindParameters" | "maxFunctionArguments" | "maxStatementBytes",
  usedKey: "reservedBinds" | "reservedFunctionArgs" | "reservedStatementBytes",
  count: number,
  reason: BudgetReason,
  label: string,
): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new SearchError({
      code: "SEARCH_RUNTIME_LIMIT_EXCEEDED",
      message: `invalid ${label} reservation`,
      details: { reason },
    });
  }
  const limit = budget.limits[limitKey];
  const next = budget[usedKey] + count;
  if (limit !== undefined && next > limit) {
    throw new SearchError({
      code: "SEARCH_RUNTIME_LIMIT_EXCEEDED",
      message: `plan exceeds proven ${label} limit`,
      details: {
        reason,
        requested: count,
        reserved: budget[usedKey],
        limit,
      },
    });
  }
  budget[usedKey] = next;
}
