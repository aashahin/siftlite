let meta = #{
    name: "siftlite-residual-critic",
    description: "Second-pass critic for leftover mistakes, logic bugs, and dead code in the SiftLite audit diff",
    phases: [
        #{ title: "Critic", detail: "logic, mistakes, dead code across the uncommitted diff" },
        #{ title: "Verify", detail: "adversarial re-check of each claimed finding" },
    ],
    when_to_use: "After the SiftLite audit-fix-gate landing; hunt residual bugs before merge",
};

let findings_schema = #{
    "type": "object",
    "required": ["findings", "summary"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 10,
            "items": #{
                "type": "object",
                "required": ["file", "issue", "severity"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                },
            },
        },
        "summary": #{ "type": "string" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let root = if args == () || args.root == () {
    "/home/shahin/Documents/projects/personal/packages/siftlite"
} else {
    args.root
};

phase("Critic");
log("Residual critic on uncommitted audit diff in " + root);

let common = "";
common += "Repo root: " + root + "\n";
common += "You are a skeptical critic of the UNCOMMITTED audit-fix diff (git status vs HEAD 555511b).\n";
common += "Use read_file, grep, and git diff ONLY. Do not edit. Do not commit.\n";
common += "Inspect the actual current files. Do not invent. Do not re-report already-fixed items from the first audit if the current code no longer has them.\n";
common += "Empty findings is valid ONLY after you have read the relevant current source.\n";
common += "Severity must be critical (correctness/security/data-loss) or important (logic/maintainability) or nit.\n";
common += "Skip docs-only nits, GitHub visibility, npm org, Phase 12 fuzzy, CLI, better-sqlite3, provenance.\n";
common += "Return at most 10 findings as {file, issue, severity} plus summary.\n";

let c_logic = common;
c_logic += "SCOPE: packages/core/src and packages/fts5/src (engine, search, lifecycle, manifest, probes, emit, bind, define-index).\n";
c_logic += "Hunt: silent wrong answers, inverted predicates, off-by-one, wrong error codes, hash/manifest holes, ingest writing the wrong generation, hydrate decode mistakes, reserved-name case holes that still emit bad SQL, mergeFtsIndex lying about workRemaining, compileFilter/search allowing disallowed fields.\n";
c_logic += "Read define-index.ts, identifiers.ts, bind.ts, engine.ts, manual-proof.ts, manifest.ts, probes.ts, compile-search.ts, compile-filter.ts, emit.ts, search/execute.ts, search/hydrate.ts, search/highlight.ts, lifecycle/companion-sql.ts, lifecycle/maintenance.ts.\n";

let c_adp = common;
c_adp += "SCOPE: packages/bun d1 libsql drizzle prisma testing src, plus examples/bun-basic examples/libsql-basic examples/d1-worker.\n";
c_adp += "Hunt: transaction swallow, D1 success ignored, unsafe integer bind, Prisma @map field still wrong, adapter wrap leaking SQL into message, example :memory: vs file:, /migrate non-idempotent, /search ignoring tenant, dead public APIs that lie.\n";
c_adp += "Read adapter.ts in bun/d1/libsql, prisma hydrate/search, testing adapter-conformance.ts, example mains and d1 worker.\n";

let c_dead = common;
c_dead += "SCOPE: entire uncommitted diff including new helpers/exports.\n";
c_dead += "Hunt: unused imports, unused functions, unreachable branches, leftover TODOs that disable behavior, half-implementations, exports nothing calls, comments that claim behavior the code does not do, README/product strings that still claim typo tolerance or missing packages.\n";
c_dead += "Use git diff HEAD and grep for unused symbols you find. Confirm a symbol is unused before reporting it.\n";
c_dead += "Check packages/core/src/index.ts and packages/fts5/src/index.ts new exports have callers or are intended public API.\n";

let critic_jobs = [
    #{ prompt: c_logic, label: "critic:logic-core-fts5", capability_mode: "read-only", output_schema: findings_schema },
    #{ prompt: c_adp, label: "critic:logic-adapters", capability_mode: "read-only", output_schema: findings_schema },
    #{ prompt: c_dead, label: "critic:dead-code", capability_mode: "read-only", output_schema: findings_schema },
];
let critic_results = parallel(critic_jobs);

let findings = [];
let ci = 0;
while ci < critic_results.len() {
    let cr = critic_results[ci];
    if cr != () && cr.success && cr.output != () {
        if cr.output.summary != () { log("Critic: " + cr.output.summary); }
        if cr.output.findings != () {
            let fi = 0;
            while fi < cr.output.findings.len() {
                findings.push(cr.output.findings[fi]);
                fi += 1;
            }
        }
    } else {
        log("Critic slot " + ci.to_string() + " failed");
    }
    ci += 1;
}
log("Critic raw findings=" + findings.len().to_string());

if findings.len() == 0 {
    let empty_path = write_scratch_file("siftlite-residual-critic.md", "# Residual critic\n\nNo findings.\n");
    complete(#{ summary: "No residual findings", confirmed: [], report_path: empty_path });
}

phase("Verify");
let vjobs = [];
let vi = 0;
while vi < findings.len() {
    let f = findings[vi];
    let ffile = if f.file != () { f.file } else { "(unknown)" };
    let fissue = if f.issue != () { f.issue } else { "(unknown)" };
    let vp = "";
    vp += "Adversarially verify this residual finding in " + root + ".\n";
    vp += "Use read_file and grep. Do not edit.\n";
    vp += "File: " + ffile + "\n";
    vp += "Claim: " + fissue + "\n";
    vp += "Set real=true ONLY with concrete evidence you independently inspected in the CURRENT file.\n";
    vp += "If the claim is stale, already fixed, docs-only, or speculative, set real=false.\n";
    vp += "evidence must quote the actual code or command output.\n";
    vjobs.push(#{
        prompt: vp,
        label: "verify:" + vi.to_string(),
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
    vi += 1;
}

let verdicts = parallel(vjobs);
let confirmed = [];
let dropped = 0;
let vj = 0;
while vj < verdicts.len() {
    let v = verdicts[vj];
    if v != () && v.success && v.output != () && v.output.real == true && v.output.evidence != () && v.output.evidence != "" {
        let item = findings[vj];
        confirmed.push(item);
    } else {
        dropped += 1;
    }
    vj += 1;
}
log("Verified " + confirmed.len().to_string() + "/" + findings.len().to_string() + " (dropped " + dropped.to_string() + ")");

let report = "";
report += "# SiftLite residual critic\n\n";
report += "- raw: " + findings.len().to_string() + "\n";
report += "- confirmed: " + confirmed.len().to_string() + "\n";
report += "- dropped: " + dropped.to_string() + "\n\n";
report += "## Confirmed\n";
if confirmed.len() == 0 {
    report += "(none)\n";
} else {
    let ki = 0;
    while ki < confirmed.len() {
        let c = confirmed[ki];
        let sev = if c.severity != () { c.severity } else { "unknown" };
        let cf = if c.file != () { c.file } else { "?" };
        let ci2 = if c.issue != () { c.issue } else { "?" };
        report += "- [" + sev + "] " + cf + ": " + ci2 + "\n";
        ki += 1;
    }
}

let report_path = write_scratch_file("siftlite-residual-critic.md", report);
complete(#{
    summary: confirmed.len().to_string() + " confirmed residual findings",
    confirmed_count: confirmed.len(),
    raw_count: findings.len(),
    dropped: dropped,
    confirmed: confirmed,
    report_path: report_path,
});
