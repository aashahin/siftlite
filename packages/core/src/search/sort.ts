import type { SearchSort } from "../backend/search-backend.js";

/** Relevance sort. Unavailable for empty-query browsing. */
export function relevance(): SearchSort {
  return { kind: "relevance" };
}

/** Ascending sort on a declared sortable field. */
export function asc<TField extends string>(field: TField): SearchSort<TField> {
  return { kind: "field", field, direction: "asc" };
}

/** Descending sort on a declared sortable field. */
export function desc<TField extends string>(field: TField): SearchSort<TField> {
  return { kind: "field", field, direction: "desc" };
}
