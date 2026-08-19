import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFts5Engine } from "@siftlite/fts5";
import { importSiftLiteConfig, resolveIndexDefinition, runCli } from "../src/index.ts";

const testsDir = dirname(fileURLToPath(import.meta.url));
const tmpRoot = join(testsDir, "tmp");
const tmpDirs: string[] = [];

function tempDir(): string {
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(join(tmpRoot, "case-"));
  tmpDirs.push(dir);
  return dir;
}

function writeBunConfig(dir: string, indexesSource: string): string {
  const path = join(dir, "siftlite.config.mjs");
  writeFileSync(
    path,
    `import { Database } from "bun:sqlite";
import { bunSqliteAdapter } from "@siftlite/bun";
import { defineIndex } from "@siftlite/core";
import { createFts5Engine } from "@siftlite/fts5";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export function createAdapter() {
  return bunSqliteAdapter(new Database(join(dir, "siftlite.sqlite")));
}

export const indexes = ${indexesSource};
`,
    "utf8",
  );
  return path;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("@siftlite/cli", () => {
  test("help and version are noninteractive", async () => {
    expect((await runCli(["node", "siftlite", "help"])).status).toBe("ok");
    expect((await runCli(["node", "siftlite", "version"])).message).toBe("0.1.0");
  });

  test("generate emits registry SQL", async () => {
    const result = await runCli([
      "node",
      "siftlite",
      "generate",
      "--name",
      "notes",
      "--search",
      "body",
    ]);
    expect(result.status).toBe("ok");
    expect(result.message).toContain("__sift_registry");
    expect(result.message).toContain("notes");
  });

  test("drop refuses without acknowledgement", async () => {
    const result = await runCli(["node", "siftlite", "drop"]);
    expect(result.status).toBe("error");
    expect(result.message).toContain("--acknowledge");
  });

  test("check fails closed without a config", async () => {
    const result = await runCli(["node", "siftlite", "check"], { cwd: tempDir() });
    expect(result.status).toBe("error");
    expect(result.message).toContain("no siftlite config found");
  });

  test("check fails closed when --config is missing", async () => {
    const result = await runCli([
      "node",
      "siftlite",
      "check",
      "--config",
      join(tempDir(), "siftlite.config.mjs"),
    ]);
    expect(result.status).toBe("error");
    expect(result.message).toContain("config file not found");
  });

  test("init scaffolds a config and refuses overwrite without --force", async () => {
    const cwd = tempDir();
    const created = await runCli(["node", "siftlite", "init"], { cwd });
    expect(created.status).toBe("ok");
    expect(created.message).toContain("siftlite.config.mjs");
    const scaffold = readFileSync(join(cwd, "siftlite.config.mjs"), "utf8");
    expect(scaffold).toContain("@siftlite/node");
    expect(scaffold).toContain("@siftlite/bun");
    expect(scaffold).toContain("defineIndex");

    const refused = await runCli(["node", "siftlite", "init"], { cwd });
    expect(refused.status).toBe("error");
    expect(refused.message).toContain("--force");

    const forced = await runCli(["node", "siftlite", "init", "--force"], { cwd });
    expect(forced.status).toBe("ok");
  });

  test("check is ok after creating an index from a bun:sqlite config", async () => {
    const cwd = tempDir();
    const configPath = writeBunConfig(
      cwd,
      `defineIndex({
  name: "notes",
  mode: "manual",
  searchable: { body: { weight: 1 } },
})`,
    );
    const config = await importSiftLiteConfig(configPath);
    const { definition } = resolveIndexDefinition(config.indexes);
    const adapter = await config.createAdapter();
    await createFts5Engine({ adapter }).index(definition).create();

    const checked = await runCli(["node", "siftlite", "check", "--config", configPath], { cwd });
    expect(checked.status).toBe("ok");
    expect(checked.message).toContain("check: ok");

    const doctor = await runCli(["node", "siftlite", "doctor", "--json", "--config", configPath], {
      cwd,
    });
    expect(doctor.status).toBe("ok");
    expect(doctor.data).toMatchObject({ healthy: true });
  });

  test("check --name selects one index from a record", async () => {
    const cwd = tempDir();
    const configPath = writeBunConfig(
      cwd,
      `{
  notes: defineIndex({
    name: "notes",
    mode: "manual",
    searchable: { body: { weight: 1 } },
  }),
  extra: defineIndex({
    name: "extra",
    mode: "manual",
    searchable: { title: { weight: 1 } },
  }),
}`,
    );
    const missingName = await runCli(["node", "siftlite", "check", "--config", configPath], { cwd });
    expect(missingName.status).toBe("error");
    expect(missingName.message).toContain("multiple indexes");

    const config = await importSiftLiteConfig(configPath);
    const { definition } = resolveIndexDefinition(config.indexes, "notes");
    await createFts5Engine({ adapter: await config.createAdapter() }).index(definition).create();

    const checked = await runCli(
      ["node", "siftlite", "check", "--config", configPath, "--name", "notes"],
      { cwd },
    );
    expect(checked.status).toBe("ok");
  });

  test("check exits non-zero on error findings", async () => {
    const cwd = tempDir();
    const configPath = writeBunConfig(
      cwd,
      `defineIndex({
  name: "notes",
  mode: "manual",
  searchable: { body: { weight: 1 } },
})`,
    );
    const result = await runCli(["node", "siftlite", "check", "--config", configPath], { cwd });
    expect(result.status).toBe("error");
    expect(result.message).toContain("index-missing");
  });
});
