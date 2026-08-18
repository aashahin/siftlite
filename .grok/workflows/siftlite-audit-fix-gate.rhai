let meta = #{
    name: "siftlite-audit-fix-gate",
    description: "Critic, fix, verify, and adversarially gate every SiftLite production-audit finding",
    phases: [
        #{ title: "Critic", detail: "confirm each audit finding still present" },
        #{ title: "Implement", detail: "parallel non-overlapping fix streams" },
        #{ title: "Integrate", detail: "cross-stream wiring + typecheck" },
        #{ title: "Verify", detail: "typecheck + bun test + invariant greps" },
        #{ title: "Gate", detail: "adversarial re-check of critical fixes" },
        #{ title: "Remediate", detail: "fix blocking gate items if any" },
    ],
    when_to_use: "After the SiftLite production publish audit; close every code-fixable finding",
};

let critic_schema = #{
    "type": "object",
    "required": ["confirmed", "already_fixed", "summary"],
    "properties": #{
        "confirmed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 60 },
        "already_fixed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 60 },
        "summary": #{ "type": "string" },
    },
};

let implement_schema = #{
    "type": "object",
    "required": ["ok", "files_changed", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "files_changed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 50 },
        "summary": #{ "type": "string" },
        "notes": #{ "type": "string" },
    },
};

let verify_schema = #{
    "type": "object",
    "required": ["ok", "typecheck_ok", "tests_ok", "invariants_ok", "failures", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "typecheck_ok": #{ "type": "boolean" },
        "tests_ok": #{ "type": "boolean" },
        "invariants_ok": #{ "type": "boolean" },
        "failures": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 50 },
        "commands_run": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 30 },
        "summary": #{ "type": "string" },
    },
};

let gate_schema = #{
    "type": "object",
    "required": ["pass", "blocking", "non_blocking", "summary"],
    "properties": #{
        "pass": #{ "type": "boolean" },
        "blocking": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 40 },
        "non_blocking": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 50 },
        "summary": #{ "type": "string" },
        "report_path": #{ "type": "string" },
    },
};

let fix_schema = #{
    "type": "object",
    "required": ["ok", "fixed", "remaining"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "fixed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 40 },
        "remaining": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 40 },
        "summary": #{ "type": "string" },
    },
};

let root = if args == () || args.root == () {
    "/home/shahin/Documents/projects/personal/packages/siftlite"
} else {
    args.root
};

// ─── Critic ──────────────────────────────────────────────────────
phase("Critic");
log("Critic: confirming production-audit findings in " + root);

let critic_common = "";
critic_common += "Repo root: " + root + "\n";
critic_common += "You are a skeptical critic. Use read_file and grep ONLY. Do not edit.\n";
critic_common += "For each item: CONFIRMED (still present, file:line) or ALREADY_FIXED (file:line evidence).\n";
critic_common += "Do not invent. Empty already_fixed is valid after you have read the code.\n";

let c_core = critic_common;
c_core += "SCOPE: packages/core and packages/fts5 search/lifecycle.\n";
c_core += "C1 typoTolerance.mode fallback accepted in defineIndex then ignored in searchFts5Index; fuzzyUsed hardcoded false; FTS5_BASE_CAPABILITIES.typoFallback true; execute probes: {}.\n";
c_core += "C2 defineIndex accepts filterable doc_id/source_id, searchable rank/rowid, title+title_source; compileDocsDdl emits duplicate columns.\n";
c_core += "C3 compileFts5PhysicalManifest omits normalization, storage kinds, source table/PK, triggers; syncRuntimeDefinition marks healthy on unchanged physical hash.\n";
c_core += "C4 Fts5IndexHandle has no upsert/delete; only createManualFts5Proof ingests manual docs.\n";
c_core += "I1 probeFts5Capabilities CREATE without DROP; second probe false-negatives.\n";
c_core += "I2 mergeFtsIndex always workRemaining false.\n";
c_core += "I3 projection hydrate returns 0/1 for boolean-integer; no codec.decode.\n";
c_core += "I4 reserveStatementBytes never called from compile-search.\n";
c_core += "I5 emitFielded does not check searchableOrder.\n";
c_core += "I6 highlight duplicate fields emit duplicate aliases.\n";
c_core += "I7 createManualFts5Proof.search skips resolveSearchPage.\n";
c_core += "I8 validateApplicationLimits not called at engine entry; defaultLimit 0 allowed by helper.\n";
c_core += "I9 isUnsafeFts5Query does not reject NUL/empty that constructor rejects.\n";
c_core += "I10 compileFilter allows sortable-only; validateFilter requires filterable.\n";
c_core += "Return confirmed[], already_fixed[], summary.\n";

let c_adp = critic_common;
c_adp += "SCOPE: packages/bun d1 libsql testing drizzle prisma and examples.\n";
c_adp += "A1 libSQL conformance on :memory: swallows transaction failure (adapter-conformance.ts assertTransactionCommitRollback early return).\n";
c_adp += "A2 assertBindValue allows unsafe integers; only D1 rejects them.\n";
c_adp += "A3 Prisma hydrate uses source.primaryKey.field as Prisma JS field (breaks @map).\n";
c_adp += "A4 generatePrismaSearchSql/generateDrizzleSearchSql omit registry; conflict with createIndex.\n";
c_adp += "A5 D1 adapter ignores result.success/error.\n";
c_adp += "A6 Bun transaction ROLLBACK throw hides original error; no savepoints.\n";
c_adp += "A7 SearchError wrap() sets cause to driver error (SQL leak if logged).\n";
c_adp += "A8 examples/libsql-basic uses :memory:; README says file:.\n";
c_adp += "A9 examples/d1-worker /migrate unauthenticated; /search ignores tenant_id.\n";
c_adp += "A10 examples/bun-basic only prints package identity.\n";
c_adp += "A11 @siftlite/testing published with skip-on-failure transaction checks.\n";
c_adp += "Return confirmed[], already_fixed[], summary.\n";

let c_pub = critic_common;
c_pub += "SCOPE: package.json files, changesets, READMEs, LICENSE, CI, tests/workspace.\n";
c_pub += "P1 workspace:* deps; no pending changesets.\n";
c_pub += "P2 examples/* and experimental package.json missing version field.\n";
c_pub += "P3 changeset ignore missing example-d1-worker, example-drizzle-bun, example-libsql-basic.\n";
c_pub += "P4 SIFTLITE_*_PACKAGE.version hardcoded 0.0.0 and tests pin it.\n";
c_pub += "P5 no LICENSE in package directories; files omit LICENSE.\n";
c_pub += "P6 no prepack/prepublishOnly build; dist gitignored.\n";
c_pub += "P7 root README/CONTRIBUTING say d1/libsql/drizzle/prisma are later phases; claim typo tolerance.\n";
c_pub += "P8 package-exports.test.ts only checks core/fts5/bun/testing.\n";
c_pub += "P9 declare global AbortSignal in core search/types.ts.\n";
c_pub += "P10 tsBuildInfoFile under dist/ will be packed.\n";
c_pub += "P11 changeset fixed group excludes d1/libsql/drizzle/prisma.\n";
c_pub += "P12 check-exports does not validate bun export path.\n";
c_pub += "Return confirmed[], already_fixed[], summary.\n";

let critic_jobs = [
    #{ prompt: c_core, label: "critic:core-fts5", capability_mode: "read-only", output_schema: critic_schema },
    #{ prompt: c_adp, label: "critic:adapters-orm", capability_mode: "read-only", output_schema: critic_schema },
    #{ prompt: c_pub, label: "critic:publish-docs", capability_mode: "read-only", output_schema: critic_schema },
];
let critic_results = parallel(critic_jobs);

let already_fixed = [];
let confirmed = [];
let ci = 0;
while ci < critic_results.len() {
    let cr = critic_results[ci];
    if cr != () && cr.success && cr.output != () {
        if cr.output.already_fixed != () {
            let aj = 0;
            while aj < cr.output.already_fixed.len() {
                already_fixed.push(cr.output.already_fixed[aj]);
                aj += 1;
            }
        }
        if cr.output.confirmed != () {
            let cj = 0;
            while cj < cr.output.confirmed.len() {
                confirmed.push(cr.output.confirmed[cj]);
                cj += 1;
            }
        }
        log("Critic: " + cr.output.summary);
    } else {
        log("Critic slot " + ci.to_string() + " failed — treating items as still open");
    }
    ci += 1;
}
log("Critic confirmed=" + confirmed.len().to_string() + " already_fixed=" + already_fixed.len().to_string());
let already_json = json_encode(already_fixed);

// ─── Implement ───────────────────────────────────────────────────
phase("Implement");
log("Implementing audit fixes in " + root);

let common = "";
common += "Repo root: " + root + "\n";
common += "Package: SiftLite monorepo (Bun + TypeScript, packages/core fts5 bun d1 libsql drizzle prisma testing).\n";
common += "Rules: read files BEFORE edit; minimal surgical diffs; do NOT commit; do NOT push.\n";
common += "Match existing SearchError codes, quoteIdent, assertBindValue, test style (bun:test).\n";
common += "After edits re-read changed regions. Add/update tests for every behavior change.\n";
common += "Skip an item only if already fixed with evidence. Already-fixed list: " + already_json + "\n";
common += "Do NOT implement Phase 12 fuzzy search. Reject fallback until it exists.\n";
common += "Do NOT change GitHub visibility, npm org, or CI secrets.\n";
common += "Return JSON {ok, files_changed, summary, notes}.\n";

let p_a = "";
p_a += common;
p_a += "STREAM A — core contracts. OWN FILES ONLY under packages/core/ (src + tests).\n";
p_a += "Do not edit packages/fts5 or adapters.\n\n";
p_a += "TASKS:\n";
p_a += "C1) defineIndex: if typoTolerance.mode is fallback, throw SEARCH_CAPABILITY_UNSUPPORTED (reason typo-fallback-unimplemented). Default remains off. Update definition.test.ts.\n";
p_a += "C2) identifiers.ts: reject reserved physical names at assertFieldName or a new assertProjectedFieldName used by defineIndex for searchable/filterable/sortable/facets: doc_id, source_id, rowid, rank (case-sensitive as stored). Also reject any filterable/sortable name equal to `${searchableField}_source`. Tests in definition.test.ts for each collision.\n";
p_a += "A2) sql/bind.ts assertBindValue: reject integer numbers that fail Number.isSafeInteger (keep finite reals that are not integers). Tests in bind.test.ts.\n";
p_a += "I8) validateApplicationLimits: defaultLimit and maxLimit must be >= 1; maxFacets/maxFacetValues/maxInValues may be 0. Call validateApplicationLimits from a new exported helper or document that engine must call it — add validateApplicationLimits usage test. If engine is not in this stream, export the stricter helper only.\n";
p_a += "I9) isUnsafeFts5Query: require non-empty string without NUL (same as constructor).\n";
p_a += "I10) filter-validate already requires filterable — keep it. Do not loosen compileFilter here (fts5 stream owns compile-filter).\n";
p_a += "P9) search/types.ts: remove declare global AbortSignal. Use a local interface SearchAbortSignal { readonly aborted: boolean } and type SearchRequest.signal as that. Update any references.\n";
p_a += "P4) package.test.ts: read packages/core/package.json version via node:fs and assert SIFTLITE_CORE_PACKAGE.version equals it (do not hardcode 0.0.0). Keep source version in sync with package.json (leave 0.0.0 if package.json is 0.0.0).\n";
p_a += "I-comment) search/hydrate.ts attachHydratedDocuments JSDoc: say missing documents become undefined slots; hits are not dropped.\n";
p_a += "A7-core) SearchError: do not put raw query text or bound values in details (already typed). No change to message policy.\n";

let p_b = "";
p_b += common;
p_b += "STREAM B — FTS5 search compiler. OWN FILES ONLY:\n";
p_b += "- packages/fts5/src/search/execute.ts\n";
p_b += "- packages/fts5/src/search/highlight.ts\n";
p_b += "- packages/fts5/src/search/hydrate.ts\n";
p_b += "- packages/fts5/src/compile-search.ts\n";
p_b += "- packages/fts5/src/compile-filter.ts\n";
p_b += "- packages/fts5/src/emit.ts\n";
p_b += "- packages/fts5/src/backend.ts\n";
p_b += "- packages/fts5/tests/compile-search.test.ts\n";
p_b += "- packages/fts5/tests/phase6.test.ts\n";
p_b += "- packages/fts5/tests/arabic.test.ts only if hydrate/search assertions need it\n";
p_b += "Do NOT edit engine.ts, manual-proof.ts, lifecycle/, probes.ts, manifest.ts, core.\n\n";
p_b += "TASKS:\n";
p_b += "C1) FTS5_BASE_CAPABILITIES.typoFallback = false until Phase 12. execute.ts: if definition.typoTolerance.mode === 'fallback', throw SEARCH_CAPABILITY_UNSUPPORTED (defense in depth). Keep fuzzyUsed false. Do not invent trigram queries.\n";
p_b += "I3) toDocument in search/hydrate.ts: decode projected fields via codecForFieldType/encode inverse (use existing codecs from core). boolean-integer -> true/false. Add/adjust hydrate tests if they live in fts5 tests; if only core hydrate.test.ts exists, add a small test in phase6 or a new hydrate.test.ts under packages/fts5/tests/.\n";
p_b += "I4) After building SQL in compileFts5Search, call reserveStatementBytes(budget, byteLength of sql, 'search') using TextEncoder or string length as UTF-8 bytes ([...sql].join or Buffer/TextEncoder). If TextEncoder unavailable in this lib, use a small utf8 byte counter already in core or new local helper.\n";
p_b += "I5) emitFielded: field must be in definition searchableOrder. Change emitFts5Match / emitNode to take definition or searchable allowlist. Throw SEARCH_QUERY_INVALID for unknown field.\n";
p_b += "I6) resolveHighlightColumns: unique field names preserving order; reject or collapse duplicates.\n";
p_b += "I10) compileFilter encodeProjectedValue: only definition.filterable[field], not sortable fallback — match validateFilter.\n";
p_b += "Tests: reserved compile still works for valid fields; duplicate highlight does not emit two aliases; unknown fielded AST throws; boolean hydrate decodes; typo fallback throws if a definition can still be constructed in tests via object spread (if defineIndex now rejects fallback, test execute with a mutated definition or skip if impossible).\n";

let p_c = "";
p_c += common;
p_c += "STREAM C — FTS5 lifecycle/manifest/probes. OWN FILES ONLY:\n";
p_c += "- packages/fts5/src/manifest.ts\n";
p_c += "- packages/fts5/src/lifecycle/**\n";
p_c += "- packages/fts5/src/probes.ts\n";
p_c += "- packages/fts5/src/names.ts if needed\n";
p_c += "- packages/fts5/tests/lifecycle.test.ts\n";
p_c += "- packages/fts5/tests/doctor.test.ts\n";
p_c += "- packages/fts5/tests/phase5.test.ts\n";
p_c += "- packages/core/src/backend/manifest.ts ONLY if classifyPhysicalChange must read new fields (prefer keeping classifier working on new manifest keys)\n";
p_c += "- packages/core/tests/manifest.test.ts if you must extend the fixture shape\n";
p_c += "Do NOT edit engine.ts, manual-proof.ts, search/, compile-search.ts.\n\n";
p_c += "TASKS:\n";
p_c += "C3) compileFts5PhysicalManifest must include: normalization profiles, projected field storage kinds, source table + PK field/type, trigger names for linked mode. hashPhysicalManifest then changes when those change. syncRuntimeDefinition must NOT rewrite healthy if logical definition hash differs OR if new manifest fields differ. If only synonyms/limits/weights (already query-time) change, runtime-only remains OK. Tests: toggling arabic-basic is physical-changed; changing filterable type is physical-changed.\n";
p_c += "I1) probes.ts: DROP TABLE IF EXISTS each probe table after CREATE (or in finally). Swallow only the CREATE failure, not unexpected errors if you can distinguish. Calling probeFts5Capabilities twice on one bun:sqlite connection must return the same true flags. Add test in phase5 or lifecycle.\n";
p_c += "I2) mergeFtsIndex: do not claim workRemaining false unconditionally. After merge, either inspect FTS5 stat via a documented probe or return workRemaining: true when pageBudget is a partial merge and you cannot prove done — prefer querying fts5vocab/config if cheap; if unprovable, return workRemaining: true unless pageBudget is the conventional 'full' sentinel already used in tests. Update phase5.test.ts to match honest semantics. Document in a one-line comment.\n";
p_c += "A4-sql) compileIndexLifecycleSql: prepend ensure-registry CREATE TABLE IF NOT EXISTS (same columns as registry-sql.ts) and an INSERT OR IGNORE/UPSERT of a pending or healthy registry row for this index (use hash helpers). Statements must be deterministic (no Date.now() — use 0 or bind-less integer 0 for timestamps in SQL literals). Align column names with registry-sql.ts. Tests: generated Prisma/Drizzle SQL (if you touch those files you MUST NOT — only companion-sql.ts) contains __sift_registry.\n";

let p_d = "";
p_d += common;
p_d += "STREAM D — engine + manual ingest. OWN FILES ONLY:\n";
p_d += "- packages/fts5/src/engine.ts\n";
p_d += "- packages/fts5/src/manual-proof.ts\n";
p_d += "- packages/fts5/src/index.ts\n";
p_d += "- packages/fts5/tests/engine.test.ts\n";
p_d += "- packages/fts5/tests/proof.test.ts (only if you change proof API)\n";
p_d += "Do NOT edit lifecycle/operations.ts, compile-search, search/execute except via using existing exports.\n\n";
p_d += "TASKS:\n";
p_d += "C4) Fts5IndexHandle: add upsert(documents) and delete(id) for manual mode.\n";
p_d += "   Reuse createManualFts5Proof internals: extract shared upsert/delete functions in manual-proof.ts and call them with physical names from the registry (same resolvePhysical as search).\n";
p_d += "   Linked mode: upsert/delete throw SEARCH_CAPABILITY_UNSUPPORTED (triggers own writes).\n";
p_d += "   After create() of a manual index, handle.upsert must write to the registered generation, not physicalIndexId 'proof'.\n";
p_d += "I7) createManualFts5Proof.search must use resolveSearchPage (import from core) so limit/offset are clamped. Prefer delegating search to searchFts5Index when existingSchema/registry available; if you keep a private compile path, still clamp page.\n";
p_d += "I8-engine) If options.limits is provided, call validateApplicationLimits before storing.\n";
p_d += "Tests: manual create + upsert + search via engine handle; linked upsert throws; proof search rejects limit 0 or huge offset via resolveSearchPage.\n";
p_d += "Keep createManualFts5Proof exported (tests/conformance depend on it).\n";

let p_e = "";
p_e += common;
p_e += "STREAM E — adapters + conformance. OWN FILES ONLY:\n";
p_e += "- packages/bun/src/**\n";
p_e += "- packages/bun/tests/**\n";
p_e += "- packages/d1/src/**\n";
p_e += "- packages/d1/tests/**\n";
p_e += "- packages/libsql/src/**\n";
p_e += "- packages/libsql/tests/**\n";
p_e += "- packages/testing/src/adapter-conformance.ts\n";
p_e += "- packages/testing/src/fts5-conformance.ts\n";
p_e += "- packages/testing/tests/**\n";
p_e += "Do not edit core bind.ts (Stream A owns it); consume stricter binds once present.\n\n";
p_e += "TASKS:\n";
p_e += "A1) adapter-conformance assertTransactionCommitRollback: do NOT return success when transaction() throws or follow-up query throws. If adapter.runtimeCapabilities.transactions is true, require real commit/rollback. If local libSQL :memory: cannot do this, set libsqlRuntimeCapabilities('local').transactions to false OR skip transaction() implementation for known-broken clients and advertise transactions:false for that kind. Prefer: document :memory: unsupported; tests use file: tmp path for transaction conformance; keep :memory: tests for query/execute only.\n";
p_e += "A5) D1 adapter query/execute/batch: if result.success === false, throw SearchError SEARCH_ADAPTER_ERROR with details.reason d1-unsuccessful (do not put SQL in message). Do not treat empty results as success when success is false.\n";
p_e += "A6) Bun transaction catch: try ROLLBACK; catch rollbackErr; throw wrap(original) (never let rollback hide original). Same pattern as libSQL.\n";
p_e += "A7) wrap() in bun/d1/libsql: keep cause for debugging but message stays generic 'adapter error' (already true). Do not copy driver message into SearchError.message.\n";
p_e += "A2-adapters) After core rejects unsafe integers, add adapter tests that unsafe integer binds throw SEARCH_VALUE_INVALID. Enable rejectUnsafeIntegers in bun and libsql conformance if that flag exists.\n";
p_e += "A11) Do not publish-skip: fix conformance instead of swallowing.\n";

let p_f = "";
p_f += common;
p_f += "STREAM F — Drizzle + Prisma. OWN FILES ONLY:\n";
p_f += "- packages/drizzle/** (except you may read fts5 companion-sql)\n";
p_f += "- packages/prisma/**\n";
p_f += "Do not edit packages/fts5/src/lifecycle/companion-sql.ts (Stream C).\n\n";
p_f += "TASKS:\n";
p_f += "A4) After Stream C, generatePrismaSearchSql/generateDrizzleSearchSql should include registry SQL automatically if they call compileIndexLifecycleSql — verify by reading generated sql in tests (expect __sift_registry). If companion-sql not yet updated when you run, still add a test that will pass once C lands; if C already added registry statements, assert them now.\n";
p_f += "A3) Prisma hydrator: add optional prismaIdField?: string on createPrismaHydrator / createPrismaSearch. Default: source.primaryKey.field. findMany where and row[id] use prismaIdField; SQL/triggers still use definition.source.primaryKey.field. Document in packages/prisma/README.md. Add a test where prisma field is 'id' and sql field stays 'id' (existing) plus a test that prismaIdField 'pid' reads row.pid.\n";
p_f += "Do not add a real @prisma/client dependency.\n";
p_f += "Keep peer optional. Update README: companion SQL + createIndex — if registry is in companion SQL, document apply migration then search; if createIndex still required, say so honestly.\n";

let p_g = "";
p_g += common;
p_g += "STREAM G — publish metadata, docs, examples, LICENSE. OWN FILES ONLY:\n";
p_g += "- README.md, CONTRIBUTING.md, IMPLEMENTATION_STATUS.md\n";
p_g += "- packages/*/README.md, packages/*/package.json\n";
p_g += "- packages/*/LICENSE (copy from root LICENSE)\n";
p_g += "- examples/**, .changeset/config.json\n";
p_g += "- scripts/check-exports.ts\n";
p_g += "- tests/workspace/**\n";
p_g += "- tsconfig.package.json or per-package tsconfig only to move tsBuildInfoFile out of dist (e.g. *.tsbuildinfo next to tsconfig, not under dist/)\n";
p_g += "Do not edit src logic files owned by A-F.\n\n";
p_g += "TASKS:\n";
p_g += "P2) Add \"version\": \"0.0.0\" to every examples/* and experimental/*/package.json that lacks it.\n";
p_g += "P3) changeset ignore: add @siftlite/example-d1-worker, @siftlite/example-drizzle-bun, @siftlite/example-libsql-basic (keep existing ignores).\n";
p_g += "P5) Copy root LICENSE into each packages/* directory. Add LICENSE to each package files array.\n";
p_g += "P6) Add scripts.prepack = tsc -p tsconfig.json on each published package.\n";
p_g += "P7) Root README: list all eight packages; remove 'later phases add d1/libsql/drizzle/prisma'; state typo fallback is not implemented; highlight XSS warning stays. CONTRIBUTING: Phase 0-11 publish set is the eight packages; publishing still owner-gated.\n";
p_g += "P8) package-exports.test.ts: iterate the same eight names as package-inventory / check-exports.\n";
p_g += "P10) Move tsBuildInfoFile out of dist in each package tsconfig (e.g. tsBuildInfoFile: 'tsconfig.tsbuildinfo') so files: [dist] does not pack incremental info.\n";
p_g += "P11) changeset fixed group: include @siftlite/d1 @siftlite/libsql @siftlite/drizzle @siftlite/prisma with core/fts5/bun/testing.\n";
p_g += "P12) check-exports.ts: require exports['.'].bun === './src/index.ts' and that file exists; files must include src and LICENSE.\n";
p_g += "A8) examples/libsql-basic: use file: URL to a tmp file (mkdtemp) not :memory:; align README.\n";
p_g += "A9) examples/d1-worker: /migrate remain demo-only but make createIndex idempotent (catch already-exists and return ok); /search apply handle-equivalent scope from header x-tenant-id or query tenant using bindScope if present; do not invent auth.\n";
p_g += "A10) examples/bun-basic: real bun:sqlite + createFts5Engine + defineIndex linked or manual upsert + search; depend on @siftlite/bun and @siftlite/fts5; update test that currently expects @siftlite/core@0.0.0 — print JSON hits instead and assert exit 0 / sqlite hit.\n";
p_g += "P4-workspace) example-bun-basic.test.ts must match new example output (not core@0.0.0).\n";
p_g += "IMPLEMENTATION_STATUS.md: note remaining Phase 12-14; list that 0.x publish blockers from audit are being closed in this pass.\n";
p_g += "Honesty: do not claim production-ready 1.0 or implemented fuzzy search.\n";

let jobs = [
    #{ prompt: p_a, label: "fix:core-contracts", capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_b, label: "fix:fts5-search", capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_c, label: "fix:fts5-lifecycle", capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_d, label: "fix:engine-ingest", capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_e, label: "fix:adapters-conformance", capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_f, label: "fix:orm-companions", capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_g, label: "fix:publish-docs-examples", capability_mode: "all", output_schema: implement_schema },
];

let impl_results = parallel(jobs);
let impl_ok_count = 0;
let impl_fail_count = 0;
let impl_i = 0;
while impl_i < impl_results.len() {
    let r = impl_results[impl_i];
    if r != () && r.success && r.output != () && r.output.ok == true {
        impl_ok_count += 1;
        log("OK implement: " + r.output.summary);
    } else {
        impl_fail_count += 1;
        log("FAIL implement slot " + impl_i.to_string());
    }
    impl_i += 1;
}
log("Implement done ok=" + impl_ok_count.to_string() + " fail=" + impl_fail_count.to_string());

// ─── Integrate ───────────────────────────────────────────────────
phase("Integrate");
let p_int = "";
p_int += "Integrate SiftLite audit fixes in " + root + ". Do NOT commit.\n";
p_int += "Cross-stream wiring only plus compile/test breakage.\n";
p_int += "1) defineIndex now rejects typo fallback — fix any test that still constructs mode fallback expecting success (core definition.test, capabilities if needed).\n";
p_int += "2) compileIndexLifecycleSql registry statements must match registry-sql.ts columns; Prisma/Drizzle tests that snapshot SQL must accept registry DDL.\n";
p_int += "3) Fts5IndexHandle new upsert/delete must typecheck; index.ts exports them if public.\n";
p_int += "4) SearchRequest.signal type change must compile in fts5 execute throwIfAborted.\n";
p_int += "5) assertBindValue unsafe-integer: adapter tests and hydrate of integer 0 still work.\n";
p_int += "6) example-bun-basic workspace test matches new example.\n";
p_int += "7) Run: cd " + root + " && bun run typecheck\n";
p_int += "8) Fix TypeScript errors you can see until typecheck passes.\n";
p_int += "9) bun test packages/core packages/fts5 -- if red, fix owned regressions (any package).\n";
p_int += "Return {ok, files_changed, summary, notes}.\n";

let int_result = agent(p_int, #{
    label: "integrate:wire-typecheck",
    capability_mode: "all",
    output_schema: implement_schema,
});
if int_result == () || !int_result.success || int_result.output.ok != true {
    log("Integrate reported issues — verify will surface details");
} else {
    log("Integrate OK: " + int_result.output.summary);
}

// ─── Verify ──────────────────────────────────────────────────────
phase("Verify");
let p_ver = "";
p_ver += "Verify SiftLite audit fixes in " + root + " with command and file-read evidence.\n";
p_ver += "1) cd " + root + " && bun run typecheck\n";
p_ver += "2) cd " + root + " && bun test packages/core packages/fts5 packages/bun packages/d1/tests packages/libsql packages/testing packages/drizzle packages/prisma examples ./tests experimental\n";
p_ver += "3) Invariant greps (must hold):\n";
p_ver += "   - typoTolerance.mode fallback must throw in define-index.ts (SEARCH_CAPABILITY_UNSUPPORTED or throw SearchError)\n";
p_ver += "   - reserved names doc_id/source_id/rowid/rank rejected in identifiers or define-index\n";
p_ver += "   - compileFts5PhysicalManifest includes normalization or source table\n";
p_ver += "   - probeFts5Capabilities DROP TABLE or drop after probe\n";
p_ver += "   - Fts5IndexHandle upsert appears in engine.ts\n";
p_ver += "   - assertBindValue rejects unsafe integers\n";
p_ver += "   - examples/*/package.json all have a version field\n";
p_ver += "   - .changeset/config.json ignore includes example-d1-worker\n";
p_ver += "   - packages/core/LICENSE exists\n";
p_ver += "   - root README does not say later phases add @siftlite/d1 as if missing\n";
p_ver += "   - declare global AbortSignal must NOT appear in packages/core/src/search/types.ts\n";
p_ver += "   - adapter-conformance must not return success solely because transaction() threw (read the function)\n";
p_ver += "4) Do not publish. Do not start wrangler long-running.\n";
p_ver += "Return typecheck_ok, tests_ok, invariants_ok, failures[], commands_run[], summary, ok=all three true.\n";

let ver = agent(p_ver, #{
    label: "verify:typecheck-tests-invariants",
    capability_mode: "all",
    output_schema: verify_schema,
});

let typecheck_ok = false;
let tests_ok = false;
let invariants_ok = false;
let ver_failures = [];
if ver != () && ver.success && ver.output != () {
    typecheck_ok = ver.output.typecheck_ok == true;
    tests_ok = ver.output.tests_ok == true;
    invariants_ok = ver.output.invariants_ok == true;
    if ver.output.failures != () {
        ver_failures = ver.output.failures;
    }
    log("Verify: " + ver.output.summary);
} else {
    log("Verify agent failed");
    ver_failures.push("verify agent failed or empty");
}

// ─── Gate ────────────────────────────────────────────────────────
phase("Gate");
let p_gate = "";
p_gate += "Adversarially gate SiftLite production-audit remediation in " + root + ".\n";
p_gate += "Skeptical: read_file/grep the shipped code. Do NOT trust implement summaries.\n";
p_gate += "BLOCKING if still true:\n";
p_gate += "C1 defineIndex still accepts typoTolerance.mode fallback AND search ignores it (silent no-op).\n";
p_gate += "C2 defineIndex still accepts filterable.doc_id or source_id (duplicate column DDL).\n";
p_gate += "C3 physical manifest still omits normalization AND source identity so syncRuntimeDefinition can healthy-rewrite after arabic-basic toggle.\n";
p_gate += "C4 manual engine handle still has no upsert AND docs/examples still present index.upsert as the product API without a working handle method.\n";
p_gate += "A2 core assertBindValue still allows Number.MAX_SAFE_INTEGER+1 integer binds.\n";
p_gate += "I1 probeFts5Capabilities still has no DROP and second probe can false-negative.\n";
p_gate += "P5 packages/core/LICENSE missing.\n";
p_gate += "P2 example package.json still missing version (breaks Changesets).\n";
p_gate += "typecheck or bun test red.\n";
p_gate += "NON-BLOCKING: GitHub private repo, npm org, Phase 12 fuzzy implementation, CLI, Node better-sqlite3 adapter, npm provenance, typed generic engine.index filter keys, D1 remote smoke credentials.\n";
p_gate += "Write scratch report audit-gate-report.md if you can.\n";
p_gate += "Return pass (true only if no blocking), blocking[], non_blocking[], summary, report_path.\n";

let gate = agent(p_gate, #{
    label: "gate:adversarial",
    capability_mode: "all",
    output_schema: gate_schema,
});

let gate_pass = false;
let blocking = [];
let non_blocking = [];
let gate_summary = "gate incomplete";
if gate != () && gate.success && gate.output != () {
    gate_pass = gate.output.pass == true;
    if gate.output.blocking != () { blocking = gate.output.blocking; }
    if gate.output.non_blocking != () { non_blocking = gate.output.non_blocking; }
    if gate.output.summary != () { gate_summary = gate.output.summary; }
    log("Gate: pass=" + gate_pass.to_string() + " " + gate_summary);
} else {
    blocking.push("gate agent failed");
    log("Gate agent failed");
}

// ─── Remediate ───────────────────────────────────────────────────
phase("Remediate");
if blocking.len() > 0 || typecheck_ok != true || tests_ok != true || invariants_ok != true {
    log("Remediating blocking issues");
    let p_fix = "";
    p_fix += "Fix remaining BLOCKING SiftLite audit issues in " + root + ".\n";
    p_fix += "typecheck_ok=" + typecheck_ok.to_string() + " tests_ok=" + tests_ok.to_string() + " invariants_ok=" + invariants_ok.to_string() + "\n";
    let bi = 0;
    while bi < blocking.len() {
        p_fix += "- blocking: " + blocking[bi] + "\n";
        bi += 1;
    }
    let fi = 0;
    while fi < ver_failures.len() {
        p_fix += "- verify failure: " + ver_failures[fi] + "\n";
        fi += 1;
    }
    p_fix += "Read code, fix surgically, re-run bun run typecheck and bun test until green. Do not commit.\n";
    p_fix += "Priority: typo fallback reject, reserved names, physical manifest, engine upsert, unsafe ints, probe DROP, LICENSE, example versions.\n";
    p_fix += "Return {ok, fixed, remaining, summary}.\n";

    let rem = agent(p_fix, #{
        label: "remediate:blocking",
        capability_mode: "all",
        output_schema: fix_schema,
    });

    let p_ver2 = "";
    p_ver2 += "Re-verify " + root + " after remediation.\n";
    p_ver2 += "Run bun run typecheck and bun test (same package set as before).\n";
    p_ver2 += "Re-check blocking invariants: fallback rejected, reserved names, manifest completeness, handle upsert, unsafe ints, probe DROP, LICENSE, example versions.\n";
    p_ver2 += "Return typecheck_ok, tests_ok, invariants_ok, failures, commands_run, summary, ok.\n";
    let ver2 = agent(p_ver2, #{
        label: "verify:post-remediate",
        capability_mode: "all",
        output_schema: verify_schema,
    });
    if ver2 != () && ver2.success && ver2.output != () {
        typecheck_ok = ver2.output.typecheck_ok == true;
        tests_ok = ver2.output.tests_ok == true;
        invariants_ok = ver2.output.invariants_ok == true;
        if ver2.output.failures != () { ver_failures = ver2.output.failures; }
        log("Post-remediate verify: " + ver2.output.summary);
    }

    let p_gate2 = "";
    p_gate2 += "Quick re-gate of " + root + " after remediation. Read code for remaining C1-C4 / A2 / I1 / P2 / P5 gaps only. ";
    p_gate2 += "Return pass, blocking, non_blocking, summary.\n";
    let gate2 = agent(p_gate2, #{
        label: "gate:post-remediate",
        capability_mode: "read-only",
        output_schema: gate_schema,
    });
    if gate2 != () && gate2.success && gate2.output != () {
        gate_pass = gate2.output.pass == true;
        if gate2.output.blocking != () { blocking = gate2.output.blocking; } else { blocking = []; }
        if gate2.output.non_blocking != () { non_blocking = gate2.output.non_blocking; }
        if gate2.output.summary != () { gate_summary = gate2.output.summary; }
    }
    if rem != () && rem.success && rem.output != () {
        log("Remediate: " + rem.output.summary);
    }
} else {
    log("No remediation needed");
}

let final_pass = gate_pass == true && typecheck_ok == true && tests_ok == true && invariants_ok == true;
let report = "";
report += "# SiftLite audit-fix-gate result\n\n";
report += "- final_pass: " + final_pass.to_string() + "\n";
report += "- typecheck_ok: " + typecheck_ok.to_string() + "\n";
report += "- tests_ok: " + tests_ok.to_string() + "\n";
report += "- invariants_ok: " + invariants_ok.to_string() + "\n";
report += "- gate_pass: " + gate_pass.to_string() + "\n";
report += "- implement ok/fail: " + impl_ok_count.to_string() + "/" + impl_fail_count.to_string() + "\n";
report += "- critic confirmed: " + confirmed.len().to_string() + " already_fixed: " + already_fixed.len().to_string() + "\n";
report += "- gate summary: " + gate_summary + "\n";
report += "\n## Blocking\n";
if blocking.len() == 0 {
    report += "(none)\n";
} else {
    let bj = 0;
    while bj < blocking.len() {
        report += "- " + blocking[bj] + "\n";
        bj += 1;
    }
}
report += "\n## Non-blocking\n";
if non_blocking.len() == 0 {
    report += "(none)\n";
} else {
    let nj = 0;
    while nj < non_blocking.len() {
        report += "- " + non_blocking[nj] + "\n";
        nj += 1;
    }
}

let report_path = write_scratch_file("siftlite-audit-fix-result.md", report);
log("Wrote " + report_path);

complete(#{
    final_pass: final_pass,
    typecheck_ok: typecheck_ok,
    tests_ok: tests_ok,
    invariants_ok: invariants_ok,
    gate_pass: gate_pass,
    implement_ok: impl_ok_count,
    implement_fail: impl_fail_count,
    blocking: blocking,
    non_blocking: non_blocking,
    report_path: report_path,
    summary: gate_summary,
});
