import { describe, expect, test } from "bun:test";
import { runCli } from "../src/index.ts";

describe("@siftlite/cli", () => {
  test("help and version are noninteractive", () => {
    expect(runCli(["node", "siftlite", "help"]).status).toBe("ok");
    expect(runCli(["node", "siftlite", "version"]).message).toBe("0.1.0");
  });

  test("generate emits registry SQL", () => {
    const result = runCli(["node", "siftlite", "generate", "--name", "notes", "--search", "body"]);
    expect(result.status).toBe("ok");
    expect(result.message).toContain("__sift_registry");
    expect(result.message).toContain("notes");
  });

  test("drop refuses without acknowledgement", () => {
    const result = runCli(["node", "siftlite", "drop"]);
    expect(result.status).toBe("error");
    expect(result.message).toContain("--acknowledge");
  });

  test("check fails closed without a database", () => {
    expect(runCli(["node", "siftlite", "check"]).status).toBe("error");
  });
});
