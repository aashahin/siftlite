#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  defineIndex,
  physicalIndexIdFor,
  type CheckReport,
  type DoctorReport,
} from "@siftlite/core";
import { compileIndexLifecycleSql, createFts5Engine } from "@siftlite/fts5";
import { runBackfill } from "./commands/backfill.js";
import { runDrop } from "./commands/drop.js";
import { runMerge } from "./commands/merge.js";
import { runRebuild } from "./commands/rebuild.js";
import { loadSiftLiteConfig, SiftLiteConfigError } from "./config.js";
import { SIFTLITE_CLI_PACKAGE } from "./index.js";
import { SiftLiteInitError, writeInitConfig } from "./init.js";

export interface CliResult {
  readonly status: "ok" | "error";
  readonly command: string;
  readonly message: string;
  readonly data?: unknown;
}

export interface CliRunOptions {
  readonly cwd?: string;
}

const HELP_MESSAGE =
  "siftlite <help|version|init|generate|check|doctor|backfill|rebuild|merge|drop> [--config <path>] [--name <index>] [--json] [--dry-run] [--acknowledge] [--force]";

export async function runCli(
  argv: readonly string[],
  options: CliRunOptions = {},
): Promise<CliResult> {
  const args = argv.slice(2);
  const command = args[0] ?? "help";
  const json = args.includes("--json");
  const acknowledge = args.includes("--acknowledge");
  const dryRun = args.includes("--dry-run");
  const cwd = resolveCwd(options);

  if (command === "help" || command === "--help" || command === "-h") {
    return { status: "ok", command: "help", message: HELP_MESSAGE };
  }
  if (command === "version" || command === "--version") {
    return { status: "ok", command: "version", message: SIFTLITE_CLI_PACKAGE.version };
  }
  if (command === "generate") {
    const name = flagValue(args, "--name") ?? "products";
    const table = flagValue(args, "--table") ?? name;
    const search = flagValue(args, "--search") ?? "title";
    const definition = defineIndex({
      name,
      mode: "linked",
      source: { table, primaryKey: { field: "id", type: "string" } },
      searchable: { [search]: { weight: 1 } },
    });
    const statements = compileIndexLifecycleSql(definition, physicalIndexIdFor(name), 1);
    return result("generate", "ok", dryRun ? "dry-run generate" : statements.join(";\n"), {
      ...(json ? { data: { statements } } : {}),
    });
  }
  if (command === "init") {
    try {
      const configPath = flagValue(args, "--config");
      const written = writeInitConfig({
        cwd,
        force: args.includes("--force"),
        ...(configPath === undefined ? {} : { path: configPath }),
      });
      return result("init", "ok", `wrote ${written.path}`, { data: { path: written.path } });
    } catch (error) {
      return commandError("init", error);
    }
  }
  if (command === "check" || command === "doctor") {
    return runInspect(command, args, cwd);
  }
  if (
    command === "drop" ||
    command === "rebuild" ||
    command === "backfill" ||
    command === "merge"
  ) {
    return runMutating(command, args, cwd, { dryRun, json, acknowledge });
  }
  return { status: "error", command, message: `unknown command ${command}` };
}

async function runMutating(
  command: "backfill" | "rebuild" | "merge" | "drop",
  args: readonly string[],
  cwd: string,
  flags: { readonly dryRun: boolean; readonly json: boolean; readonly acknowledge: boolean },
): Promise<CliResult> {
  if (!flags.acknowledge && !flags.dryRun) {
    return {
      status: "error",
      command,
      message: `${command} is destructive or mutating; pass --acknowledge`,
    };
  }
  try {
    const configPath = flagValue(args, "--config");
    const name = flagValue(args, "--name");
    const loaded = await loadSiftLiteConfig({
      cwd,
      ...(configPath === undefined ? {} : { configPath }),
      ...(name === undefined ? {} : { name }),
    });
    const context = {
      adapter: loaded.adapter,
      definition: loaded.definition,
      dryRun: flags.dryRun,
      json: flags.json,
      acknowledge: flags.acknowledge,
    };
    if (command === "backfill") {
      return runBackfill(args, context);
    }
    if (command === "rebuild") {
      return runRebuild(args, context);
    }
    if (command === "merge") {
      return runMerge(args, context);
    }
    return runDrop(args, context);
  } catch (error) {
    return commandError(command, error);
  }
}

async function runInspect(
  command: "check" | "doctor",
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  try {
    const configPath = flagValue(args, "--config");
    const name = flagValue(args, "--name");
    const loaded = await loadSiftLiteConfig({
      cwd,
      ...(configPath === undefined ? {} : { configPath }),
      ...(name === undefined ? {} : { name }),
    });
    const handle = createFts5Engine({ adapter: loaded.adapter }).index(loaded.definition);
    if (command === "check") {
      const report = await handle.check();
      return inspectResult(command, report.ok, report.findings, report);
    }
    const report = await handle.doctor();
    return inspectResult(command, report.healthy, report.findings, report);
  } catch (error) {
    return commandError(command, error);
  }
}

function inspectResult(
  command: "check" | "doctor",
  ok: boolean,
  findings: CheckReport["findings"] | DoctorReport["findings"],
  data: CheckReport | DoctorReport,
): CliResult {
  const hasError = !ok || findings.some((finding) => finding.severity === "error");
  return result(command, hasError ? "error" : "ok", formatFindings(command, !hasError, findings), {
    data,
  });
}

function formatFindings(
  command: string,
  ok: boolean,
  findings: CheckReport["findings"] | DoctorReport["findings"],
): string {
  if (findings.length === 0) {
    return `${command}: ok`;
  }
  const noun = findings.length === 1 ? "finding" : "findings";
  const lines = [`${command}: ${ok ? "ok" : "error"} (${findings.length} ${noun})`];
  for (const finding of findings) {
    lines.push(`  ${finding.severity} ${finding.code}: ${finding.message}`);
  }
  return lines.join("\n");
}

function result(
  command: string,
  status: "ok" | "error",
  message: string,
  extra: { readonly data?: unknown } = {},
): CliResult {
  if (extra.data === undefined) {
    return { status, command, message };
  }
  return { status, command, message, data: extra.data };
}

function commandError(command: string, error: unknown): CliResult {
  const message =
    error instanceof SiftLiteConfigError ||
    error instanceof SiftLiteInitError ||
    error instanceof Error
      ? error.message
      : String(error);
  return { status: "error", command, message };
}

function resolveCwd(options: CliRunOptions): string {
  if (options.cwd !== undefined) {
    return options.cwd;
  }
  const runtime = globalThis as { process?: { cwd(): string } };
  if (runtime.process) {
    return runtime.process.cwd();
  }
  throw new Error("cwd is required when process is unavailable");
}

export function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) {
    return undefined;
  }
  return value;
}

function isDirectInvocation(): boolean {
  if ((import.meta as ImportMeta & { main?: boolean }).main === true) {
    return true;
  }
  const runtime = globalThis as { process?: { argv: string[] } };
  const argv1 = runtime.process?.argv[1];
  if (argv1 === undefined) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

const runtime = globalThis as {
  process?: { argv: string[]; stdout: { write(chunk: string): void }; exitCode?: number };
};
if (isDirectInvocation() && runtime.process) {
  const argv = runtime.process.argv;
  const write = (chunk: string): void => {
    runtime.process?.stdout.write(chunk);
  };
  void runCli(argv)
    .then((cliResult) => {
      if (argv.includes("--json")) {
        write(`${JSON.stringify(cliResult)}\n`);
      } else {
        write(`${cliResult.message}\n`);
      }
      if (runtime.process) {
        runtime.process.exitCode = cliResult.status === "ok" ? 0 : 1;
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (argv.includes("--json")) {
        write(`${JSON.stringify({ status: "error", command: "cli", message })}\n`);
      } else {
        write(`${message}\n`);
      }
      if (runtime.process) {
        runtime.process.exitCode = 1;
      }
    });
}
