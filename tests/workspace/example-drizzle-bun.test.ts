import { describe, expect, test } from "bun:test";

describe("examples/drizzle-bun", () => {
  test("resolves @siftlite/drizzle and searches through triggers", async () => {
    const proc = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: `${import.meta.dir}/../../examples/drizzle-bun`,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exit = await proc.exited;
    expect(exit).toBe(0);
    expect(output).toContain('"a1"');
  });
});
