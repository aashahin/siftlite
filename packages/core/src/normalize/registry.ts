import { SearchError } from "../errors/search-error.js";
import type { IndexMode } from "../definition/types.js";
import { arabicBasic } from "./arabic-basic.js";
import { numericArabic } from "./numeric-arabic.js";
import type { PortableNormalizer, PortableNormalizerId } from "./types.js";

export const LINKED_NORMALIZER_IDS = ["arabic-basic", "numeric-arabic"] as const;

const REGISTRY: Readonly<Record<PortableNormalizerId, PortableNormalizer>> = {
  "arabic-basic": arabicBasic,
  "numeric-arabic": numericArabic,
};

export function isPortableNormalizerId(value: string): value is PortableNormalizerId {
  return value === "arabic-basic" || value === "numeric-arabic";
}

export function getPortableNormalizer(id: string): PortableNormalizer {
  if (!isPortableNormalizerId(id)) {
    throw new SearchError({
      code: "SEARCH_CONFIG_INVALID",
      message: `unknown normalization profile ${id}`,
      details: { reason: "unknown-normalizer", id },
    });
  }
  return REGISTRY[id];
}

export function validateNormalizationProfiles(
  profiles: readonly string[],
  mode: IndexMode,
): readonly PortableNormalizerId[] {
  const seen = new Set<string>();
  const resolved: PortableNormalizerId[] = [];
  for (const id of profiles) {
    if (typeof id !== "string" || id.length === 0) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: "normalization profiles must be non-empty strings",
        details: { reason: "invalid-normalization" },
      });
    }
    if (seen.has(id)) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `normalization profile ${id} is duplicated`,
        details: { reason: "duplicate-normalizer", id },
      });
    }
    seen.add(id);
    if (!isPortableNormalizerId(id)) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `unknown normalization profile ${id}`,
        details: { reason: "unknown-normalizer", id },
      });
    }
    const normalizer = REGISTRY[id];
    if (mode === "linked" && !normalizer.linkedMode) {
      throw new SearchError({
        code: "SEARCH_CONFIG_INVALID",
        message: `normalization profile ${id} is not available in linked mode`,
        details: { reason: "manual-only-normalizer", id },
      });
    }
    resolved.push(id);
  }
  return resolved;
}
