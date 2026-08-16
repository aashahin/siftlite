import type {
  CapabilityResolutionContext,
  CapabilityWarning,
  EffectiveCapabilities,
  SearchCapabilities,
} from "./types.js";

export function resolveEffectiveCapabilities(
  ctx: CapabilityResolutionContext,
): EffectiveCapabilities {
  const warnings: CapabilityWarning[] = [...(ctx.probes.warnings ?? [])];
  const costSensitive = ctx.policy.costSensitive === true || ctx.runtime.costSensitive === true;
  const typoFallback = resolveTypoFallback(ctx, costSensitive, warnings);

  const features: SearchCapabilities = {
    fullText: ctx.backend.fullText,
    phrase: ctx.backend.phrase,
    prefix: ctx.backend.prefix,
    weightedRanking: ctx.backend.weightedRanking,
    highlight: ctx.backend.highlight,
    snippet: ctx.backend.snippet,
    filters: ctx.backend.filters,
    sort: ctx.backend.sort,
    facets: ctx.backend.facets,
    typoFallback,
    vocabulary: ctx.backend.vocabulary && ctx.probes.fts5Vocab === true,
    nativeVector: false,
    cancellation: ctx.backend.cancellation && ctx.runtime.cancellation,
  };

  if (ctx.backend.vocabulary && ctx.probes.fts5Vocab !== true) {
    warnings.push({
      code: "vocabulary-unproven",
      message: "vocabulary support is unproven by runtime probes",
    });
  }

  return {
    features,
    limits: ctx.runtime.limits,
    consistency: ctx.runtime.consistency,
    warnings,
  };
}

function resolveTypoFallback(
  ctx: CapabilityResolutionContext,
  costSensitive: boolean,
  warnings: CapabilityWarning[],
): boolean {
  if (!ctx.backend.typoFallback) {
    return false;
  }
  if (ctx.probes.trigramTokenizer !== true) {
    warnings.push({
      code: "trigram-unproven",
      message: "typo fallback requires a proven trigram tokenizer probe",
    });
    return false;
  }
  if (ctx.policy.typoFallback === "disabled") {
    return false;
  }
  if (ctx.policy.typoFallback === "disabled-on-cost-sensitive-runtimes" && costSensitive) {
    warnings.push({
      code: "typo-disabled-cost-policy",
      message: "typo fallback disabled by cost-sensitive runtime policy",
    });
    return false;
  }
  return (
    ctx.policy.typoFallback === "enabled" ||
    ctx.policy.typoFallback === "disabled-on-cost-sensitive-runtimes"
  );
}
