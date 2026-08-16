import { describe, expect, test } from "bun:test";
import { ARABIC_NORMALIZATION_CORPUS, arabicBasic, normalizeIndexText } from "../src/index.ts";

describe("arabic normalization corpus", () => {
  test("every curated case matches the JavaScript profile", () => {
    for (const fixture of ARABIC_NORMALIZATION_CORPUS) {
      expect(normalizeIndexText(fixture.input, fixture.profiles)).toBe(fixture.expected);
      if (fixture.kind === "preserved") {
        expect(fixture.expected).toBe(fixture.input);
      }
    }
  });

  test("does not apply NFKC or excluded letter mappings", () => {
    expect(arabicBasic.normalize("\uFE8D")).not.toBe("ا");
    expect(arabicBasic.normalize("ة")).toBe("ة");
    expect(arabicBasic.normalize("ؤ")).toBe("ؤ");
    expect(arabicBasic.normalize("ئ")).toBe("ئ");
    expect("\uFE8D".normalize("NFKC")).toBe("ا");
  });
});
