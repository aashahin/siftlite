import { sql, type RuntimeProbeResult, type SqlAdapter } from "@siftlite/core";

export async function probeFts5Capabilities(adapter: SqlAdapter): Promise<RuntimeProbeResult> {
  const warnings: { code: string; message: string }[] = [];
  const fts5 = await probe(adapter, "CREATE VIRTUAL TABLE temp.__sift_probe_fts USING fts5(x)");
  const trigramTokenizer = await probe(
    adapter,
    "CREATE VIRTUAL TABLE temp.__sift_probe_tri USING fts5(x, tokenize='trigram')",
  );
  const fts5SecureDelete = await probe(
    adapter,
    "CREATE VIRTUAL TABLE temp.__sift_probe_sd USING fts5(x, secure-delete=1)",
  );
  let fts5Vocab = false;
  if (fts5) {
    fts5Vocab = await probe(
      adapter,
      "CREATE VIRTUAL TABLE temp.__sift_probe_vocab USING fts5vocab(temp.__sift_probe_fts, row)",
    );
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

async function probe(adapter: SqlAdapter, statement: string): Promise<boolean> {
  try {
    await adapter.execute(sql(statement));
    return true;
  } catch {
    return false;
  }
}
