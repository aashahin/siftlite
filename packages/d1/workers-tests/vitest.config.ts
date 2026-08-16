import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./workers-tests/wrangler.jsonc",
      },
    }),
  ],
  test: {
    include: ["workers-tests/**/*.workers.ts"],
  },
});
