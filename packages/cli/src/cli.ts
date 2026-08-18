#!/usr/bin/env node
import { defineIndex, physicalIndexIdFor } from "@siftlite/core";
import { compileIndexLifecycleSql } from "@siftlite/fts5";
import { SIFTLITE_CLI_PACKAGE } from "./index.js";

export interface CliResult {
  readonly status: "ok" | "error";
  readonly command: string;
  readonly message: string;
  readonly data?: unknown;
}

export function runCli(argv: readonly string[]): CliResult {
  const args = argv.slice(2);
  const command = args[0] ?? "help";
  const json = args.includes("--json");
  const acknowledge = args.includes("--acknowledge");
  const dryRun = args.includes("--dry-run");

  if (command === "help" || command === "--help" || command === "-h") {
    return {
      status: "ok",
      command: "help",
      message:
        "siftlite <help|generate|check|doctor|backfill|rebuild|merge|drop> [--json] [--dry-run] [--acknowledge]",
    };
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
    return {
      status: "ok",
      command: "generate",
      message: dryRun ? "dry-run generate" : statements.join(";\n"),
      data: json ? { statements } : undefined,
    };
  }
  if (command === "check" || command === "doctor") {
    return {
      status: "error",
      command,
      message: `${command} requires a host-provided database adapter; refusing to invent a connection`,
    };
  }
  if (command === "drop" || command === "rebuild" || command === "backfill" || command === "merge") {
    if (!acknowledge) {
      return {
        status: "error",
        command,
        message: `${command} is destructive or mutating; pass --acknowledge`,
      };
    }
    return {
      status: "error",
      command,
      message: `${command} requires a host-provided database adapter`,
    };
  }
  return { status: "error", command, message: `unknown command ${command}` };
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

const invokedDirectly = (import.meta as ImportMeta & { main?: boolean }).main === true;
const runtime = globalThis as {
  process?: { argv: string[]; stdout: { write(chunk: string): void }; exitCode?: number };
};
if (invokedDirectly && runtime.process) {
  const result = runCli(runtime.process.argv);
  if (runtime.process.argv.includes("--json")) {
    runtime.process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    runtime.process.stdout.write(`${result.message}\n`);
  }
  runtime.process.exitCode = result.status === "ok" ? 0 : 1;
}
