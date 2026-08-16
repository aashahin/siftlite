# `@siftlite/libsql`

libSQL / Turso Cloud **FTS5** runtime adapter.

This is not `@siftlite/turso` and does not use Turso-native Tantivy FTS.

The adapter accepts a minimal `LibsqlClientLike` so `@libsql/client` (or a
compatible client) never leaks into `@siftlite/core`.

```ts
import { createClient } from "@libsql/client";
import { libsqlAdapter, wrapLibsqlClient } from "@siftlite/libsql";

const client = createClient({ url: "file:local.db" });
const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
```

Remote clients should pass `{ kind: "remote" }` so bind/function limits stay
unproven until probed, and `costSensitive` is true.
