/**
 * Highlight/snippet formatting.
 *
 * Formatted and snippet strings are not HTML-safe. Callers must not assign
 * them to `innerHTML` (or equivalent) without sanitizing. Default markers
 * are markdown `**`.
 */
import {
  SearchError,
  type CompiledHighlightColumn,
  type HighlightMarkers,
  type IndexDefinition,
} from "@siftlite/core";

const DEFAULT_MARKERS: HighlightMarkers = {
  start: "**",
  end: "**",
  ellipsis: "…",
};

const MAX_MARKER_CODE_POINTS = 16;
const SNIPPET_TOKENS = 16;

export function resolveHighlightColumns(
  definition: IndexDefinition,
  fields: readonly string[] | undefined,
  markers: HighlightMarkers | undefined,
): readonly CompiledHighlightColumn[] {
  if (!fields || fields.length === 0) {
    return [];
  }
  const resolved = assertHighlightMarkers(markers ?? DEFAULT_MARKERS);
  const columns: CompiledHighlightColumn[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field)) {
      continue;
    }
    seen.add(field);
    const ftsColumnIndex = definition.searchableOrder.indexOf(field);
    if (ftsColumnIndex < 0) {
      throw new SearchError({
        code: "SEARCH_QUERY_INVALID",
        message: `highlight field ${field} is not searchable`,
        details: { reason: "undeclared-highlight-field" },
      });
    }
    columns.push({
      field,
      ftsColumnIndex,
      start: resolved.start,
      end: resolved.end,
      ellipsis: resolved.ellipsis,
      tokens: SNIPPET_TOKENS,
    });
  }
  return columns;
}

/**
 * Validates caller-selected highlight markers.
 *
 * The resulting formatted/snippet strings are not HTML-safe. Do not assign
 * them to `innerHTML` without sanitizing. Default markers are markdown `**`.
 */
export function assertHighlightMarkers(markers: HighlightMarkers): HighlightMarkers {
  return {
    start: assertMarker("start", markers.start),
    end: assertMarker("end", markers.end),
    ellipsis: assertMarker("ellipsis", markers.ellipsis),
  };
}

function assertMarker(name: string, value: string): string {
  if (typeof value !== "string" || value.includes("\u0000")) {
    throw new SearchError({
      code: "SEARCH_QUERY_INVALID",
      message: `highlight ${name} marker is invalid`,
      details: { reason: "highlight-marker" },
    });
  }
  if ([...value].length > MAX_MARKER_CODE_POINTS) {
    throw new SearchError({
      code: "SEARCH_QUERY_LIMIT_EXCEEDED",
      message: `highlight ${name} marker exceeds ${MAX_MARKER_CODE_POINTS} code points`,
      details: { reason: "highlight-marker-length" },
    });
  }
  return value;
}
