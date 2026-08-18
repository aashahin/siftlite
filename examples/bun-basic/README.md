# bun-basic

Minimal SiftLite workspace example using `bun:sqlite`, `createFts5Engine`,
and a linked `defineIndex`.

```bash
bun install
bun run start
```

Prints JSON hits for a `sqlite` query. Highlighted strings are not HTML-safe.
Typo / fuzzy fallback is not implemented.
