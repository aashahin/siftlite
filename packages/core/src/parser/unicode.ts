/** Unicode code-point helpers. Length semantics use code points, not UTF-16. */

export function codePoints(input: string): readonly string[] {
  return [...input];
}

export function codePointLength(input: string): number {
  return codePoints(input).length;
}

export function isWhitespaceCodePoint(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0b ||
    code === 0x0c ||
    code === 0x0d ||
    code === 0x20 ||
    code === 0x85 ||
    code === 0xa0 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

export function isCombiningMark(code: number): boolean {
  return (
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x064b && code <= 0x065f) ||
    code === 0x0670 ||
    (code >= 0x06d6 && code <= 0x06ed) ||
    (code >= 0x08d3 && code <= 0x08e1) ||
    (code >= 0x08e3 && code <= 0x08ff) ||
    (code >= 0xfe70 && code <= 0xfe7f)
  );
}

/**
 * Punctuation treated as a portable token boundary. This is parser intent, not
 * an FTS5/Tantivy tokenizer clone.
 */
export function isBoundaryPunctuation(code: number): boolean {
  if (code === 0x22) {
    return false;
  }
  if (code <= 0x7f) {
    return (
      (code >= 0x21 && code <= 0x2f) ||
      (code >= 0x3a && code <= 0x40) ||
      (code >= 0x5b && code <= 0x60) ||
      (code >= 0x7b && code <= 0x7e)
    );
  }
  return (
    code === 0x060c || // Arabic comma
    code === 0x061b || // Arabic semicolon
    code === 0x061f || // Arabic question mark
    code === 0x066a || // Arabic percent
    code === 0x00ab ||
    code === 0x00bb ||
    code === 0x2018 ||
    code === 0x2019 ||
    code === 0x201c ||
    code === 0x201d ||
    code === 0x2026 ||
    code === 0x2039 ||
    code === 0x203a ||
    code === 0x3001 ||
    code === 0x3002 ||
    code === 0xff0c ||
    code === 0xff0e ||
    code === 0xff1a ||
    code === 0xff1b ||
    code === 0xff1f
  );
}
