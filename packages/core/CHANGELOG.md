# @siftlite/core

## 0.3.0

### Minor Changes

- 69d7d40: Add the opt-in `arabic-teh-marbuta` normalization profile (`ة` → `ه`), so `شبة` and `شبه` match each other. It is available in linked mode and composes with `arabic-basic` and `numeric-arabic`.

  FTS5 searches now fail closed with `SEARCH_MAINTENANCE_FAILED` and `details.reason: "registry-stale"` when the stored generation was built for a different physical definition (for example a changed `normalization`), instead of searching an index whose text was folded differently from the query. Call `rebuild()` to recover.

  Healthy FTS5 searches no longer run registry DDL or schema probes: the registry is read directly and only created on the cold path when it is missing.

## 0.2.0

### Minor Changes

- Complete Phase 12/13: request-equivalent fuzzy fallback, trigram companion SQL, sortable facet typing, and operational CLI.

## 0.1.0

### Minor Changes

- 4fa2f04: Type engine filter keys, add Node and CLI packages, and ship bounded typo fallback.
