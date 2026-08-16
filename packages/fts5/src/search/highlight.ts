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
  return fields.map((field) => {
    const ftsColumnIndex = definition.searchableOrder.indexOf(field);
    if (ftsColumnIndex < 0) {
      throw new SearchError({
        code: "SEARCH_QUERY_INVALID",
        message: `highlight field ${field} is not searchable`,
        details: { reason: "undeclared-highlight-field" },
      });
    }
    return {
      field,
      ftsColumnIndex,
      start: resolved.start,
      end: resolved.end,
      ellipsis: resolved.ellipsis,
      tokens: SNIPPET_TOKENS,
    };
  });
}

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
