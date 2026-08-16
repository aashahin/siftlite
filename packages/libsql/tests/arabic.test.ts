import { describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { runArabicNormalizationCorpus } from "@siftlite/testing";
import { libsqlAdapter, wrapLibsqlClient } from "../src/index.ts";

describe("@siftlite/libsql Arabic corpus", () => {
  test("JS and SQL corpus outputs are identical on local libSQL", async () => {
    const client = createClient({ url: ":memory:" });
    const adapter = libsqlAdapter(wrapLibsqlClient(client), { kind: "local" });
    await runArabicNormalizationCorpus(adapter);
  });
});
