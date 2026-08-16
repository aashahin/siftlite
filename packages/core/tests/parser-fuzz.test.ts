import { describe, expect, test } from "bun:test";
import {
  collectTextTerms,
  DEFAULT_APPLICATION_LIMITS,
  isTextQuery,
  parsePlainTextQuery,
  walkTextQuery,
} from "../src/index.ts";

const OPERATORS = ["AND", "OR", "NOT", "NEAR", "MATCH", "*", ":", "(", ")", "^", "-", "title:foo"];

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

function randomQuery(random: () => number): string {
  const alphabet = [
    "a",
    "b",
    "iphone",
    "ايفون",
    "pro",
    " ",
    '"',
    ...OPERATORS,
    ",",
    "،",
    "؟",
    "é",
    "📱",
    "\u064e",
    "foo*",
    "body:bar",
  ];
  const length = 1 + Math.floor(random() * 12);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(random() * alphabet.length)] ?? "";
    if (random() < 0.3) {
      out += " ";
    }
  }
  return out;
}

describe("parser fuzz", () => {
  test("ordinary user text cannot inject extra AST operators or field selectors", () => {
    const random = mulberry32(20260816);
    let parsed = 0;
    for (let i = 0; i < 400; i += 1) {
      const input = randomQuery(random);
      try {
        const ast = parsePlainTextQuery(input, { limits: DEFAULT_APPLICATION_LIMITS });
        parsed += 1;
        expect(isTextQuery(ast)).toBe(true);
        walkTextQuery(ast, (node) => {
          expect(["empty", "term", "phrase", "and", "or"]).toContain(node.kind);
          if (node.kind === "term") {
            expect(node.field).toBeUndefined();
          }
          if (node.kind === "phrase") {
            expect(node.field).toBeUndefined();
          }
        });
        for (const term of collectTextTerms(ast)) {
          expect(term.includes("\u0000")).toBe(false);
        }
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
    expect(parsed).toBeGreaterThan(50);
  });
});
