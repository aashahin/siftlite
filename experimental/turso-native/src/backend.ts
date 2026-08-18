import {
  classifyPhysicalChange,
  quoteIdent,
  resolveEffectiveCapabilities,
  type CapabilityResolutionContext,
  type IndexCompileContext,
  type SearchBackend,
  type SearchCompileContext,
  type SqlStatement,
} from "@siftlite/core";
import { emitTursoMatch } from "./emit.js";
import { compileTursoPhysicalManifest } from "./manifest.js";
import { TURSO_NATIVE_BASE_CAPABILITIES } from "./semantics.js";

export function tursoNativeBackend(): SearchBackend {
  return {
    id: "turso-native",
    baseCapabilities: TURSO_NATIVE_BASE_CAPABILITIES,
    resolveCapabilities(ctx: CapabilityResolutionContext) {
      return resolveEffectiveCapabilities({ ...ctx, backend: TURSO_NATIVE_BASE_CAPABILITIES });
    },
    compilePhysicalManifest(ctx: IndexCompileContext) {
      return compileTursoPhysicalManifest(ctx);
    },
    classifyPhysicalChange,
    compileSearch(ctx: SearchCompileContext) {
      const match = emitTursoMatch(ctx.textQuery);
      const table = quoteIdent(ctx.definition.source?.table ?? ctx.definition.name);
      const statement: SqlStatement = match
        ? {
            sql: `SELECT source_id, fts_score() AS rank FROM ${table} WHERE fts_match(?) LIMIT ? OFFSET ?`,
            params: [match, ctx.limit, ctx.offset],
          }
        : {
            sql: `SELECT source_id, NULL AS rank FROM ${table} LIMIT ? OFFSET ?`,
            params: [ctx.limit, ctx.offset],
          };
      return {
        statement,
        emptyQuery: match === undefined,
        fromSql: `FROM ${table}`,
        whereSql: match ? "fts_match(?)" : "1 = 1",
        whereParams: match ? [match] : [],
        bindParameterCount: statement.params.length,
      };
    },
  };
}
