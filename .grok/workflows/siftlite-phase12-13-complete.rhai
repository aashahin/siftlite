let meta = #{
    name: "siftlite-phase12-13-complete",
    description: "Close Phase 12 fuzzy correctness + Phase 13 CLI via Grok 4.6 xhigh-fast subagents",
    phases: [
        #{ title: "Critic", detail: "confirm remaining audit/Phase12/13 gaps" },
        #{ title: "Implement", detail: "parallel streams A-E" },
        #{ title: "Integrate", detail: "cross-stream wiring + typecheck" },
        #{ title: "Verify", detail: "typecheck + bun test + invariant greps" },
        #{ title: "Gate", detail: "adversarial re-check of must-fix items" },
        #{ title: "Remediate", detail: "fix blocking gate items if any" },
    ],
    when_to_use: "After 0.1.0 publish; close fuzzy request-equivalence, companion trigram SQL, facet typing, and operational CLI",
};

let GROK_MODEL = "cursor-grok-4.6-xhigh-fast";

let critic_schema = #{
    "type": "object",
    "required": ["confirmed", "already_fixed", "summary"],
    "properties": #{
        "confirmed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 40 },
        "already_fixed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 40 },
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
    "/workspace"
} else {
    args.root
};

// ─── Critic ──────────────────────────────────────────────────────
phase("Critic");
log("Critic: confirming Phase 12/13 gaps in " + root);

let critic_common = "";
critic_common += "Repo root: " + root + "\n";
critic_common += "You are a skeptical critic. Use read_file and grep ONLY. Do not edit.\n";
critic_common += "For each item: CONFIRMED (still present, file:line) or ALREADY_FIXED (file:line evidence).\n";
critic_common += "Do not invent. Empty already_fixed is valid after you have read the code.\n";

let c_fuzzy = critic_common;
c_fuzzy += "SCOPE: packages/fts5/src/search/execute.ts and fuzzy policy/limits.\n";
c_fuzzy += "F1 searchFuzzyFallback candidate SQL lacks compileScope/compileFilter (scope bypass).\n";
c_fuzzy += "F2 minGramOverlap from DEFAULT_FUZZY_POLICY is never applied.\n";
c_fuzzy += "F3 ApplicationLimits.maxFuzzyCandidates is unused; only policy.maxCandidates.\n";
c_fuzzy += "F4 candidate searchable text is loaded with one query per candidate (N+1).\n";
c_fuzzy += "F5 after fuzzyUsed, totals/facets/hasMore still come from exact compiled query; fuzzy hits lack highlight warning.\n";

let c_comp = critic_common;
c_comp += "SCOPE: packages/fts5 lifecycle companion-sql, manifest, verify.\n";
c_comp += "T1 compileIndexLifecycleSql omits compileFtsTrigramDdl for fallback definitions.\n";
c_comp += "T2 compileFts5PhysicalManifest omits ftsTrigram object for fallback.\n";
c_comp += "T3 collectIntegrityFindings does not require trigram table for fallback defs.\n";

let c_cli = critic_common;
c_cli += "SCOPE: packages/cli and packages/core/src/search/types.ts facets.\n";
c_cli += "C1 CLI check/doctor always return adapter-required error (no config loader).\n";
c_cli += "C2 CLI has no init; backfill/rebuild/merge/drop are placeholders after --acknowledge.\n";
c_cli += "C3 SearchRequest.facets is typed only as TFilterable[] while defineIndex allows sortable facets.\n";

let critic_jobs = [
    #{ prompt: c_fuzzy, label: "critic:fuzzy", model: GROK_MODEL, capability_mode: "read-only", output_schema: critic_schema },
    #{ prompt: c_comp, label: "critic:companion", model: GROK_MODEL, capability_mode: "read-only", output_schema: critic_schema },
    #{ prompt: c_cli, label: "critic:cli-facets", model: GROK_MODEL, capability_mode: "read-only", output_schema: critic_schema },
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
log("Implementing Phase 12/13 in " + root);

let common = "";
common += "Repo root: " + root + "\n";
common += "Package: SiftLite monorepo (Bun + TypeScript).\n";
common += "Rules: read files BEFORE edit; minimal surgical diffs; do NOT commit; do NOT push.\n";
common += "Match existing SearchError codes, quoteIdent, bun:test style.\n";
common += "After edits re-read changed regions. Add/update tests for every behavior change.\n";
common += "Skip an item only if already fixed with evidence. Already-fixed list: " + already_json + "\n";
common += "Do NOT implement Phase 14 RC or remote 100k/1m benches.\n";
common += "Keep typoTolerance.mode fallback = empty-exact-then-fuzzy (do not invent always-merge ranking).\n";
common += "Return JSON {ok, files_changed, summary, notes}.\n";

let p_a = "";
p_a += common;
p_a += "STREAM A — fuzzy request-equivalent search. OWN:\n";
p_a += "- packages/fts5/src/search/execute.ts\n";
p_a += "- packages/fts5/tests/phase6.test.ts and/or new packages/fts5/tests/fuzzy.test.ts\n";
p_a += "May READ compile-filter.ts, core fuzzy policy, application limits. Do NOT edit companion-sql, manifest, verify, CLI, core types.\n\n";
p_a += "TASKS:\n";
p_a += "1) searchFuzzyFallback: compileScope(request.scope) + compileFilter(request.filter) ANDed into candidate SQL on docs alias d; params ordered match, scope, filter, limit.\n";
p_a += "2) candidateLimit = min(DEFAULT_FUZZY_POLICY.maxCandidates, (ctx.limits??DEFAULT_APPLICATION_LIMITS).maxFuzzyCandidates).\n";
p_a += "3) Enforce minGramOverlap before edit-distance (count shared trigrams vs query gram set).\n";
p_a += "4) Batch-load candidate searchable _source columns with IN chunks (not N+1).\n";
p_a += "5) Return hasMore from fuzzy paging; searchFts5Index when fuzzyUsed must recompute hasMore/totalHits/facets from fuzzy result set (ID IN list for facets/totals), not exact compiled MATCH. Omit formatted highlights; push warning code highlight-unavailable-fuzzy when highlight requested.\n";
p_a += "6) Tests: tenant scope bypass proof; filter preserved; overlap threshold; maxFuzzyCandidates; batch query count; fuzzy hasMore/total/facets; highlight warning; existing iphoen->iphone still passes.\n";

let p_b = "";
p_b += common;
p_b += "STREAM B — trigram companion SQL/manifest/verify. OWN:\n";
p_b += "- packages/fts5/src/lifecycle/companion-sql.ts\n";
p_b += "- packages/fts5/src/manifest.ts\n";
p_b += "- packages/fts5/src/lifecycle/verify.ts\n";
p_b += "- packages/fts5/tests/lifecycle.test.ts (extend)\n";
p_b += "Do NOT edit search/execute.ts or CLI.\n\n";
p_b += "TASKS:\n";
p_b += "1) compileIndexLifecycleSql: when typoTolerance.mode===fallback, append compileFtsTrigramDdl after FTS DDL.\n";
p_b += "2) compileFts5PhysicalManifest: include ftsTrigram virtual-table object when fallback.\n";
p_b += "3) collectIntegrityFindings: for fallback defs, error if trigram table missing.\n";
p_b += "4) Tests covering generated SQL, non-fallback omission, integrity failure without trigram.\n";

let p_c = "";
p_c += common;
p_c += "STREAM C — facet typing. OWN:\n";
p_c += "- packages/core/src/search/types.ts\n";
p_c += "- packages/fts5/src/engine.ts (TypedSearchRequest only if needed)\n";
p_c += "- type fixtures under packages/core/tests or packages/fts5/type-fixtures if present\n";
p_c += "Do NOT edit execute.ts lifecycle or CLI.\n\n";
p_c += "TASKS:\n";
p_c += "1) Widen SearchRequest.facets so sortable-only declared facets type-check (TFilterable | TSortable or TFacet generic).\n";
p_c += "2) Keep runtime undeclared-facet rejection.\n";
p_c += "3) Add type fixture proving sortable-only facet assignability.\n";

let p_d = "";
p_d += common;
p_d += "STREAM D — CLI config/init/check/doctor. OWN packages/cli/src/** except Stream E command modules if split.\n";
p_d += "Prefer: config.ts, init.ts, check/doctor handlers, cli.ts router, tests, README.\n";
p_d += "Do NOT edit fts5/core search sources.\n\n";
p_d += "TASKS:\n";
p_d += "1) Config loader: --config or ./siftlite.config.mjs exporting createAdapter() and indexes; dynamic import via pathToFileURL.\n";
p_d += "2) init scaffolds siftlite.config.mjs (refuse overwrite without --force).\n";
p_d += "3) check/doctor load config, createFts5Engine, call handle.check/doctor, --json output, non-zero on errors.\n";
p_d += "4) Keep help/version/generate working.\n";
p_d += "5) Tests with temp bun:sqlite via config importing @siftlite/bun from workspace.\n";
p_d += "CLI package must stay Node-compatible (no hard bun:sqlite dependency in package.json).\n";

let p_e = "";
p_e += common;
p_e += "STREAM E — CLI mutating ops. OWN packages/cli/src/commands/*.ts (backfill, rebuild, merge, drop) + tests for them.\n";
p_e += "Do not rewrite Stream D config loader; import it. If cli.ts router must register commands, add minimal imports only.\n\n";
p_e += "TASKS:\n";
p_e += "1) rebuild -> handle.rebuild(); drop -> handle.drop(); merge -> mergeFtsIndex from @siftlite/fts5.\n";
p_e += "2) backfill: wire honest lifecycle path or clear error — never fake success. Prefer exporting/using existing create/heal/backfill if available.\n";
p_e += "3) Require --acknowledge for mutating; --dry-run prints plan; --json machine output.\n";
p_e += "4) Never drop source tables.\n";
p_e += "5) Smoke tests under bun:test.\n";

let jobs = [
    #{ prompt: p_a, label: "fix:fuzzy-search", model: GROK_MODEL, capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_b, label: "fix:companion-trigram", model: GROK_MODEL, capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_c, label: "fix:facet-types", model: GROK_MODEL, capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_d, label: "fix:cli-read-path", model: GROK_MODEL, capability_mode: "all", output_schema: implement_schema },
    #{ prompt: p_e, label: "fix:cli-write-path", model: GROK_MODEL, capability_mode: "all", output_schema: implement_schema },
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
p_int += "Integrate SiftLite Phase 12/13 streams in " + root + ". Do NOT commit.\n";
p_int += "Fix cross-stream wiring: cli.ts router + commands, facet generic fallout, export maps, test imports.\n";
p_int += "Run bun run typecheck and fix breakage. Do not start Phase 14.\n";
p_int += "Return {ok, files_changed, summary, notes}.\n";
let integ = agent(p_int, #{
    label: "integrate:cross-stream",
    model: GROK_MODEL,
    capability_mode: "all",
    output_schema: implement_schema,
});
if integ != () && integ.success && integ.output != () {
    log("Integrate: " + integ.output.summary);
} else {
    log("Integrate agent failed");
}

// ─── Verify ──────────────────────────────────────────────────────
phase("Verify");
let p_ver = "";
p_ver += "Verify SiftLite Phase 12/13 in " + root + ".\n";
p_ver += "1) bun run typecheck\n";
p_ver += "2) bun test packages/fts5 packages/core packages/cli\n";
p_ver += "3) Invariant greps:\n";
p_ver += "   - companion-sql references compileFtsTrigramDdl or tokenize='trigram' for fallback\n";
p_ver += "   - searchFuzzyFallback / execute uses compileScope\n";
p_ver += "   - CLI has config loader (createAdapter)\n";
p_ver += "   - SearchRequest facets type is not only TFilterable[]\n";
p_ver += "Return typecheck_ok, tests_ok, invariants_ok, failures[], commands_run[], summary, ok=all three true.\n";
let ver = agent(p_ver, #{
    label: "verify:typecheck-tests-invariants",
    model: GROK_MODEL,
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
p_gate += "Adversarially gate Phase 12/13 remediation in " + root + ".\n";
p_gate += "Read code. Do NOT trust implement summaries.\n";
p_gate += "BLOCKING if still true:\n";
p_gate += "F1 fuzzy candidate SQL still lacks scope/filter.\n";
p_gate += "F2 minGramOverlap still unused.\n";
p_gate += "F3 maxFuzzyCandidates still unused.\n";
p_gate += "F4 still N+1 candidate text loads.\n";
p_gate += "F5 fuzzyUsed still reuses exact totals/facets/hasMore blindly.\n";
p_gate += "T1 companion SQL still omits trigram for fallback.\n";
p_gate += "T2/T3 manifest/verify still ignore trigram for fallback.\n";
p_gate += "C1 check/doctor still always adapter-required with no config path.\n";
p_gate += "C3 facets still typed only as TFilterable[].\n";
p_gate += "typecheck or targeted bun test red.\n";
p_gate += "NON-BLOCKING: P12-06 merge ranking, P12-08/09/10 remote benches, Phase 14, D1 fuzzy default off.\n";
p_gate += "Return pass, blocking[], non_blocking[], summary, report_path.\n";
let gate = agent(p_gate, #{
    label: "gate:adversarial",
    model: GROK_MODEL,
    capability_mode: "read-only",
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
    p_fix += "Fix remaining BLOCKING Phase 12/13 issues in " + root + ".\n";
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
    p_fix += "Read code, fix surgically, re-run typecheck and targeted tests. Do not commit.\n";
    p_fix += "Return {ok, fixed, remaining, summary}.\n";
    let rem = agent(p_fix, #{
        label: "remediate:blocking",
        model: GROK_MODEL,
        capability_mode: "all",
        output_schema: fix_schema,
    });
    let ver2 = agent(
        "Re-verify " + root + " after remediation. Run bun run typecheck and bun test packages/fts5 packages/core packages/cli. Re-check F1-F5 T1-T3 C1 C3. Return verify_schema fields.",
        #{ label: "verify:post-remediate", model: GROK_MODEL, capability_mode: "all", output_schema: verify_schema },
    );
    if ver2 != () && ver2.success && ver2.output != () {
        typecheck_ok = ver2.output.typecheck_ok == true;
        tests_ok = ver2.output.tests_ok == true;
        invariants_ok = ver2.output.invariants_ok == true;
        if ver2.output.failures != () { ver_failures = ver2.output.failures; }
        log("Post-remediate verify: " + ver2.output.summary);
    }
    let gate2 = agent(
        "Quick re-gate of " + root + " for F1-F5 T1-T3 C1 C3 only. Return pass, blocking, non_blocking, summary.",
        #{ label: "gate:post-remediate", model: GROK_MODEL, capability_mode: "read-only", output_schema: gate_schema },
    );
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
report += "# SiftLite Phase 12/13 complete result\n\n";
report += "- final_pass: " + final_pass.to_string() + "\n";
report += "- typecheck_ok: " + typecheck_ok.to_string() + "\n";
report += "- tests_ok: " + tests_ok.to_string() + "\n";
report += "- invariants_ok: " + invariants_ok.to_string() + "\n";
report += "- gate_pass: " + gate_pass.to_string() + "\n";
report += "- implement ok/fail: " + impl_ok_count.to_string() + "/" + impl_fail_count.to_string() + "\n";
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

let report_path = write_scratch_file("siftlite-phase12-13-result.md", report);
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
