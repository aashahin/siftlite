import { describe, expect, test } from "bun:test";
import {
  DISABLED_SEARCH_CAPABILITIES,
  resolveEffectiveCapabilities,
  type RuntimeCapabilities,
  type SearchCapabilities,
} from "../src/index.ts";

const backend: SearchCapabilities = {
  ...DISABLED_SEARCH_CAPABILITIES,
  fullText: true,
  phrase: true,
  prefix: true,
  filters: true,
  typoFallback: true,
  vocabulary: true,
  cancellation: true,
};

const runtime: RuntimeCapabilities = {
  id: "test",
  dialect: "sqlite",
  limits: { maxBindParameters: 100 },
  consistency: {
    transactionReadYourWrites: true,
    postCommitReadYourWrites: true,
    sessionAware: false,
    sequentialSessionConsistency: false,
    readReplicaEligible: false,
  },
  transactions: true,
  batch: true,
  cancellation: false,
  costSensitive: true,
};

describe("effective capabilities", () => {
  test("intersect backend, probes, runtime, and policy", () => {
    const effective = resolveEffectiveCapabilities({
      backend,
      runtime,
      probes: { trigramTokenizer: true, fts5Vocab: false },
      policy: { typoFallback: "disabled-on-cost-sensitive-runtimes" },
    });
    expect(effective.features.fullText).toBe(true);
    expect(effective.features.typoFallback).toBe(false);
    expect(effective.features.vocabulary).toBe(false);
    expect(effective.features.cancellation).toBe(false);
    expect(effective.limits.maxBindParameters).toBe(100);
    expect(effective.consistency.sessionAware).toBe(false);
    expect(effective.warnings.some((warning) => warning.code === "typo-disabled-cost-policy")).toBe(
      true,
    );
  });

  test("does not enable typo fallback from backend identity alone", () => {
    const effective = resolveEffectiveCapabilities({
      backend,
      runtime: { ...runtime, costSensitive: false },
      probes: {},
      policy: { typoFallback: "enabled" },
    });
    expect(effective.features.typoFallback).toBe(false);
  });
});
