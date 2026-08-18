import { describe, expect, test } from "bun:test";

describe("examples/libsql-basic", () => {
  test("searches through a temporary file: database", async () => {
    const proc = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: `${import.meta.dir}/../../examples/libsql-basic`,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, exit] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(exit).toBe(0);
    const payload = JSON.parse(output.trim()) as { hits: string[] };
    expect(payload.hits).toContain("a1");
  });
});
