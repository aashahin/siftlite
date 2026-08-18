import {
  classifyPhysicalChange,
  DISABLED_SEARCH_CAPABILITIES,
  resolveEffectiveCapabilities,
  type CapabilityResolutionContext,
  type EffectiveCapabilities,
  type IndexCompileContext,
  type PhysicalChange,
  type PhysicalSchemaManifest,
  type SearchBackend,
  type SearchCapabilities,
  type SearchCompileContext,
} from "@siftlite/core";
import { compileFts5Search } from "./compile-search.js";
import { compileFts5PhysicalManifest } from "./manifest.js";

export const FTS5_BASE_CAPABILITIES: SearchCapabilities = {
  ...DISABLED_SEARCH_CAPABILITIES,
  fullText: true,
  phrase: true,
  prefix: true,
  weightedRanking: true,
  highlight: true,
  snippet: true,
  filters: true,
  sort: true,
  facets: true,
  typoFallback: false,
  vocabulary: true,
  cancellation: false,
};

export function sqliteFts5(): SearchBackend {
  return {
    id: "fts5",
    baseCapabilities: FTS5_BASE_CAPABILITIES,
    resolveCapabilities(ctx: CapabilityResolutionContext): EffectiveCapabilities {
      return resolveEffectiveCapabilities({ ...ctx, backend: FTS5_BASE_CAPABILITIES });
    },
    compilePhysicalManifest(ctx: IndexCompileContext): PhysicalSchemaManifest {
      return compileFts5PhysicalManifest(ctx);
    },
    classifyPhysicalChange(previous, next): PhysicalChange {
      return classifyPhysicalChange(previous, next);
    },
    compileSearch(ctx: SearchCompileContext) {
      return compileFts5Search(ctx);
    },
  };
}
