# SiftLite D1 example

Local Worker + D1 migration workflow:

```bash
bun install
cd examples/d1-worker
bunx wrangler d1 migrations apply siftlite-example --local
bunx wrangler dev
```

Then:

- `GET /migrate` materializes the linked SiftLite index from `products`. The
  route is demo-only and idempotent: an already-existing index returns `{ ok: true }`.
- `GET /search?q=sqlite` searches through the D1 adapter. A tenant is
  required (`x-tenant-id` or `?tenant=`); omitting it returns 400 instead of
  browsing every tenant. This is not authentication.

`/migrate` is demo-only. Do not expose unauthenticated DDL in production.

Use `d1SessionAdapter` and the `x-d1-bookmark` header when read replication or
cross-request sequential consistency matters. Writes and searches default to
`first-primary` and return `x-d1-bookmark` so the next request can continue
from at least the same database version.
