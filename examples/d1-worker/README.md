# SiftLite D1 example

Local Worker + D1 migration workflow:

```bash
bun install
cd examples/d1-worker
bunx wrangler d1 migrations apply siftlite-example --local
bunx wrangler dev
```

Then:

- `GET /migrate` materializes the linked SiftLite index from `products`
- `GET /search?q=sqlite` searches through the D1 adapter

`/migrate` is demo-only. Do not expose unauthenticated DDL in production.

Use `d1SessionAdapter` and the `x-d1-bookmark` header when read replication is
enabled. Writes and searches default to `first-primary` and return
`x-d1-bookmark` so the next request can continue the same session. Do not
assume a plain D1 binding provides read-your-writes on replicas.
