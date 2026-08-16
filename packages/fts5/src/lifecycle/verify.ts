import {
  quoteIdent,
  SearchError,
  sql,
  type DoctorFinding,
  type IndexDefinition,
  type SqlAdapter,
} from "@siftlite/core";
import { physicalNames, sourceIdColumnType } from "../names.js";
import { triggerNames } from "./triggers.js";

const VERIFY_SAMPLE = 32;

export async function collectIntegrityFindings(
  adapter: SqlAdapter,
  definition: IndexDefinition,
  physicalIndexId: string,
  generation: number,
): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  const names = physicalNames(definition, physicalIndexId, generation);
  const docs = await readMaster(adapter, names.docs);
  const fts = await readMaster(adapter, names.fts);
  if (!isDocsTable(docs) || !isFtsTable(fts)) {
    findings.push({
      severity: "error",
      code: "missing-physical",
      message: "required docs/fts objects are missing",
    });
    return findings;
  }

  const docsCount = await countRows(adapter, names.docs, "doc_id");
  const ftsCount = await countRows(adapter, names.fts, "rowid");
  if (docsCount !== ftsCount) {
    findings.push({
      severity: "error",
      code: "count-mismatch",
      message: "docs and fts row counts differ",
    });
  }

  const sample = await adapter.query<{ doc_id: number }>(
    sql(
      `SELECT ${quoteIdent("doc_id")} AS doc_id FROM ${quoteIdent(names.docs)} ORDER BY ${quoteIdent("doc_id")} LIMIT ?`,
      [VERIFY_SAMPLE],
    ),
  );
  if (sample.length > 0) {
    const placeholders = sample.map(() => "?").join(", ");
    const hits = await adapter.query<{ rowid: number }>(
      sql(
        `SELECT ${quoteIdent("rowid")} AS rowid FROM ${quoteIdent(names.fts)} WHERE ${quoteIdent("rowid")} IN (${placeholders})`,
        sample.map((row) => row.doc_id),
      ),
    );
    if (hits.length !== sample.length) {
      findings.push({
        severity: "error",
        code: "orphan-doc",
        message: "sampled docs.doc_id is missing from fts rowid",
      });
    }
  }

  const expectedType = sourceIdColumnType(definition) === "INTEGER" ? "integer" : "text";
  const types = await adapter.query<{ source_id_typeof: string }>(
    sql(
      `SELECT typeof(${quoteIdent("source_id")}) AS source_id_typeof FROM ${quoteIdent(names.docs)} ORDER BY ${quoteIdent("doc_id")} LIMIT ?`,
      [VERIFY_SAMPLE],
    ),
  );
  if (types.some((row) => row.source_id_typeof !== expectedType)) {
    findings.push({
      severity: "error",
      code: "source-id-type",
      message: "source_id typeof does not match declared type",
    });
  }

  if (definition.mode === "linked" && definition.source) {
    const triggers = triggerNames(names.docs);
    for (const name of [triggers.insert, triggers.update, triggers.delete]) {
      if (!(await triggerExists(adapter, name))) {
        findings.push({
          severity: "error",
          code: "missing-trigger",
          message: `trigger ${name} is missing`,
        });
      }
    }
  }

  return findings;
}

export async function verifyOrThrow(
  ctx: { readonly adapter: SqlAdapter; readonly definition: IndexDefinition },
  physicalIndexId: string,
  generation: number,
): Promise<void> {
  const findings = await collectIntegrityFindings(
    ctx.adapter,
    ctx.definition,
    physicalIndexId,
    generation,
  );
  const error = findings.find((finding) => finding.severity === "error");
  if (error) {
    throw new SearchError({
      code: "SEARCH_MAINTENANCE_FAILED",
      message: error.message,
      details: { reason: error.code },
    });
  }
}

async function readMaster(
  adapter: SqlAdapter,
  name: string,
): Promise<{ readonly name: string; readonly type: string; readonly sql: string | null } | null> {
  const rows = await adapter.query<{ name: string; type: string; sql: string | null }>(
    sql(`SELECT name, type, sql FROM sqlite_master WHERE name = ?`, [name]),
  );
  return rows[0] ?? null;
}

function isDocsTable(row: { readonly type: string; readonly sql: string | null } | null): boolean {
  if (!row || (row.type !== "table" && row.type !== "virtual")) {
    return false;
  }
  return !(row.sql ?? "").toLowerCase().includes("virtual");
}

function isFtsTable(row: { readonly type: string; readonly sql: string | null } | null): boolean {
  if (!row || (row.type !== "table" && row.type !== "virtual")) {
    return false;
  }
  const text = (row.sql ?? "").toLowerCase();
  return text.includes("virtual") || text.includes("fts5");
}

async function countRows(adapter: SqlAdapter, table: string, column: string): Promise<number> {
  const rows = await adapter.query<{ n: number }>(
    sql(`SELECT COUNT(${quoteIdent(column)}) AS n FROM ${quoteIdent(table)}`),
  );
  return rows[0]?.n ?? 0;
}

async function triggerExists(adapter: SqlAdapter, name: string): Promise<boolean> {
  const rows = await adapter.query<{ name: string }>(
    sql(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?`, [name]),
  );
  return rows.length > 0;
}
