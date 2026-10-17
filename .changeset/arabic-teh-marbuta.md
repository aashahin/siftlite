---
"@siftlite/core": minor
"@siftlite/fts5": minor
---

Add the opt-in `arabic-teh-marbuta` normalization profile (`ة` → `ه`), so `شبة` and `شبه` match each other. It is available in linked mode and composes with `arabic-basic` and `numeric-arabic`.

FTS5 searches now fail closed with `SEARCH_MAINTENANCE_FAILED` and `details.reason: "registry-stale"` when the stored generation was built for a different physical definition (for example a changed `normalization`), instead of searching an index whose text was folded differently from the query. Call `rebuild()` to recover.

Healthy FTS5 searches no longer run registry DDL or schema probes: the registry is read directly and only created on the cold path when it is missing.
