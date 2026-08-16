import { describe, expect, test } from "bun:test";
import {
  and,
  DEFAULT_APPLICATION_LIMITS,
  eq,
  gt,
  inList,
  isFilterNode,
  isNull,
  not,
  or,
  validateFilter,
  type FilterNode,
} from "../src/index.ts";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFilter(random: () => number, depth: number): FilterNode {
  if (depth <= 0 || random() < 0.4) {
    const choice = random();
    if (choice < 0.25) {
      return eq("status", "active");
    }
    if (choice < 0.5) {
      return gt("price", Math.floor(random() * 100));
    }
    if (choice < 0.75) {
      return inList("status", ["a", "b"]);
    }
    return isNull("status");
  }
  if (random() < 0.3) {
    return not(randomFilter(random, depth - 1));
  }
  const childCount = 1 + Math.floor(random() * 3);
  const children = Array.from({ length: childCount }, () => randomFilter(random, depth - 1));
  return random() < 0.5 ? and(...children) : or(...children);
}

function countInValues(node: FilterNode): number {
  switch (node.op) {
    case "in":
    case "notIn":
      return node.values.length;
    case "and":
    case "or":
      return node.children.reduce((sum, child) => sum + countInValues(child), 0);
    case "not":
      return countInValues(node.child);
    default:
      return 0;
  }
}

describe("filter fuzz", () => {
  test("random legal trees stay user-filter nodes and respect IN limits", () => {
    const random = mulberry32(99);
    for (let i = 0; i < 200; i += 1) {
      const node = randomFilter(random, 3);
      expect(isFilterNode(node)).toBe(true);
      expect(JSON.stringify(node)).not.toContain("bound-scope");
      validateFilter(node, { limits: DEFAULT_APPLICATION_LIMITS });
      expect(countInValues(node)).toBeLessThanOrEqual(DEFAULT_APPLICATION_LIMITS.maxInValues);
    }
  });
});
