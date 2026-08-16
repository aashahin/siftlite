# SiftLite implementation agent start prompt

You are implementing **SiftLite** from the attached **v1.2 implementation pack**.

Read the files in the README order. Treat `12-ADRS.md` as normative architecture decisions and `14-IMPLEMENTATION-TASKS.md` as the executable backlog.

Start with **Phase 0 only**. Phase 0 must receive a separate PASS/PARTIAL/BLOCKED report. You may start Phase 1 in the same session only after Phase 0 is fully PASS and its code/tests are not interleaved with unverified Phase 1 work.

Mandatory rules:

- use Bun workspaces and `bun:test` for repository/core tooling;
- keep `@siftlite/core` Web/edge-safe and free of Node/Bun/D1/ORM dependencies;
- published CLI code must be Node-compatible and also run under Bun unless an accepted ADR changes this;
- never expose ordinary user text as FTS5/Turso raw query grammar;
- use canonical field codecs and reject unsupported scalar values before SQL;
- model runtime SQL limits and budget compiled statements before execution;
- immutable tenant/application scope is compiler-owned and cannot be removed by request filters;
- physical identity uses stable ID + generation, never the current definition hash as object identity;
- D1 work is not PASS until Workers-runtime tests pass;
- fuzzy fallback uses explicit Unicode trigrams -> bounded overlap candidates -> Damerau-Levenshtein;
- FTS5 secure-delete is a separate privacy policy/capability; normal delete is not forensic erasure;
- remote maintenance must prefer bounded/incremental work;
- run the Turso-native architecture pressure spike in Phase 3 and fix any leaked FTS5 assumptions before continuing;
- do not label `@siftlite/turso` stable while required upstream behavior remains experimental;
- exact totals are opt-in;
- re-check version-sensitive upstream documentation rather than implementing from memory.

For each phase report:

1. tasks completed by task ID;
2. files/packages changed;
3. tests/commands run and results;
4. acceptance criteria evidence;
5. deviations or upstream limitations;
6. remaining blockers;
7. final status: PASS, PARTIAL, or BLOCKED.

Never weaken a failing acceptance criterion merely to report PASS.
