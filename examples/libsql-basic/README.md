# SiftLite libSQL example

```bash
bun install
bun run --cwd examples/libsql-basic start
```

Uses `@libsql/client` against a temporary `file:` database (created with
`mkdtemp`), not `:memory:`. libSQL `:memory:` connections do not share state
across some client operations.

This is the FTS5 path, not Turso-native Tantivy FTS.
