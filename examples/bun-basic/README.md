# bun-basic

Minimal SiftLite workspace example using `bun:sqlite`, `createFts5Engine`,
and a linked `defineIndex`.

```bash
bun install
bun run start
```

Prints JSON hits for a `sqlite` query. Highlighted strings are not HTML-safe.
This example keeps typo fallback off. The package has an experimental fallback
mode, but it is not needed for the exact `sqlite` query shown here.
