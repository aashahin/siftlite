import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const EXAMPLE_ROOT = join(import.meta.dir, "../../examples/bun-basic");

describe("examples/bun-basic", () => {
  test("searches through bun:sqlite and prints JSON hits", async () => {
    const process = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: EXAMPLE_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.trim()) as { hits: string[] };
    expect(payload.hits).toContain("p1");
  });
});
