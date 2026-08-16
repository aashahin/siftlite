import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { runArabicNormalizationCorpus } from "@siftlite/testing";
import { d1Adapter } from "../src/index.ts";

interface D1TestEnv {
  readonly DB: Parameters<typeof d1Adapter>[0];
}

const testEnv = env as unknown as D1TestEnv;

describe("D1 Workers-runtime Arabic corpus", () => {
  it("matches JS and SQL outputs for the linked-mode profile", async () => {
    const adapter = d1Adapter(testEnv.DB);
    await runArabicNormalizationCorpus(adapter);
    expect(adapter.id).toBe("d1");
  });
});
