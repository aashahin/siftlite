import { sql, type RuntimeProbeResult, type SqlAdapter } from "@siftlite/core";

const PROBE_FTS = "temp.__sift_probe_fts";
const PROBE_TRI = "temp.__sift_probe_tri";
const PROBE_SD = "temp.__sift_probe_sd";
const PROBE_VOCAB = "temp.__sift_probe_vocab";

export async function probeFts5Capabilities(adapter: SqlAdapter): Promise<RuntimeProbeResult> {
  const warnings: { code: string; message: string }[] = [];
  const fts5 = await probeCreate(adapter, `CREATE VIRTUAL TABLE ${PROBE_FTS} USING fts5(x)`);
  let fts5Vocab = false;
  try {
    if (fts5) {
      fts5Vocab = await probeCreate(
        adapter,
        `CREATE VIRTUAL TABLE ${PROBE_VOCAB} USING fts5vocab(${PROBE_FTS}, row)`,
      );
    }
  } finally {
    await dropProbe(adapter, PROBE_VOCAB);
    await dropProbe(adapter, PROBE_FTS);
  }

  let trigramTokenizer = false;
  try {
    trigramTokenizer = await probeCreate(
      adapter,
      `CREATE VIRTUAL TABLE ${PROBE_TRI} USING fts5(x, tokenize='trigram')`,
    );
  } finally {
    await dropProbe(adapter, PROBE_TRI);
  }

  let fts5SecureDelete = false;
  try {
    fts5SecureDelete = await probeCreate(
      adapter,
      `CREATE VIRTUAL TABLE ${PROBE_SD} USING fts5(x, secure-delete=1)`,
    );
  } finally {
    await dropProbe(adapter, PROBE_SD);
  }

  if (!fts5) {
    warnings.push({ code: "fts5-missing", message: "FTS5 virtual table is unavailable" });
  }
  return {
    fts5,
    trigramTokenizer,
    fts5SecureDelete,
    fts5Vocab,
    warnings,
  };
}

async function probeCreate(adapter: SqlAdapter, statement: string): Promise<boolean> {
  try {
    await adapter.execute(sql(statement));
    return true;
  } catch {
    return false;
  }
}

async function dropProbe(adapter: SqlAdapter, table: string): Promise<void> {
  try {
    await adapter.execute(sql(`DROP TABLE IF EXISTS ${table}`));
  } catch {
    // Cleanup must not hide a successful CREATE probe or turn a missing
    // capability into a thrown adapter error.
  }
}
