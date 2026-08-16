import type {
  BackendScoreSemantics,
  MaintenanceVisibility,
  SearchCapabilities,
} from "@siftlite/core";
import { DISABLED_SEARCH_CAPABILITIES } from "@siftlite/core";

export const TURSO_NATIVE_SCORE: BackendScoreSemantics = {
  nativeDirection: "higher-is-better",
  weightsPhysical: true,
  highlight: true,
  snippet: false,
};

export const TURSO_NATIVE_VISIBILITY: MaintenanceVisibility = {
  preCommitSearchVisible: false,
  postCommitSearchVisible: true,
  optimizeCommand: "OPTIMIZE INDEX",
  incrementalMergeSupported: false,
};

export const TURSO_NATIVE_BASE_CAPABILITIES: SearchCapabilities = {
  ...DISABLED_SEARCH_CAPABILITIES,
  fullText: true,
  phrase: true,
  prefix: true,
  weightedRanking: true,
  highlight: true,
  snippet: false,
  filters: true,
  sort: true,
  facets: true,
  typoFallback: false,
  vocabulary: false,
};
