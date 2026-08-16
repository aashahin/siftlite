import {
  ARABIC_NORMALIZATION_CORPUS,
  compileIndexNormalizationSql,
  normalizeIndexText,
  SearchError,
  sql,
  type SqlAdapter,
} from "@siftlite/core";

/** Prove JS normalize(input) === SQL normalize(input) on a real adapter. */
export async function runArabicNormalizationCorpus(adapter: SqlAdapter): Promise<void> {
  for (const fixture of ARABIC_NORMALIZATION_CORPUS) {
    const js = normalizeIndexText(fixture.input, fixture.profiles);
    if (js !== fixture.expected) {
      throw new SearchError({
        code: "SEARCH_BACKEND_ERROR",
        message: `JS arabic corpus mismatch for ${fixture.id}`,
        details: { reason: "arabic-js", id: fixture.id, js, expected: fixture.expected },
      });
    }
    const compiled = compileIndexNormalizationSql({ sql: "?" }, fixture.profiles);
    const rows = await adapter.query<{ out: string | null }>(
      sql(`SELECT ${compiled.sql} AS out`, [fixture.input]),
    );
    const sqlOut = rows[0]?.out;
    if (sqlOut !== fixture.expected) {
      throw new SearchError({
        code: "SEARCH_BACKEND_ERROR",
        message: `SQL arabic corpus mismatch for ${fixture.id}`,
        details: {
          reason: "arabic-sql",
          id: fixture.id,
          sqlOut: sqlOut ?? null,
          expected: fixture.expected,
        },
      });
    }
  }
}
