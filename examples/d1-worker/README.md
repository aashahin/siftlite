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

Use `d1SessionAdapter` and the `x-d1-bookmark` header when read replication is enabled.
Do not assume a plain D1 binding provides read-your-writes on replicas.
