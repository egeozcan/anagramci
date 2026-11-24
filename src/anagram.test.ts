import { describe, expect, test } from "bun:test";
import {
  textToPool,
  subtractWord,
  buildMappingNormalizer,
  computeRemainingPool,
} from "./anagram";

describe("textToPool", () => {
  test("creates frequency map from text, ignoring spaces", () => {
    const pool = textToPool("hello world");
    expect(pool.get("h")).toBe(1);
    expect(pool.get("l")).toBe(3);
    expect(pool.get("o")).toBe(2);
    expect(pool.has(" ")).toBe(false);
  });

  test("lowercases text with Turkish locale", () => {
    const pool = textToPool("İstanbul");
    expect(pool.get("i")).toBe(1); // İ -> i in Turkish
    expect(pool.get("s")).toBe(1);
    expect(pool.has("İ")).toBe(false);
  });

  test("ignores punctuation", () => {
    const pool = textToPool("merhaba!");
    expect(pool.has("!")).toBe(false);
    expect(pool.get("a")).toBe(2);

    const pool2 = textToPool("test? evet.");
    expect(pool2.has("?")).toBe(false);
    expect(pool2.has(".")).toBe(false);
    expect(pool2.get("e")).toBe(3);
  });

  test("applies letter mapping", () => {
    const mapping = new Map([["ç", "c"], ["ş", "s"]]);
    const pool = textToPool("çay şeker", mapping);
    expect(pool.get("c")).toBe(1); // from ç
    expect(pool.get("s")).toBe(1); // from ş
    expect(pool.has("ç")).toBe(false);
    expect(pool.has("ş")).toBe(false);
  });
});

describe("subtractWord", () => {
  test("subtracts word letters from pool", () => {
    const pool = new Map([["a", 3], ["b", 2], ["c", 1]]);
    const result = subtractWord(pool, "ab");
    expect(result.get("a")).toBe(2);
    expect(result.get("b")).toBe(1);
    expect(result.get("c")).toBe(1);
  });

  test("removes key when count hits 0", () => {
    const pool = new Map([["a", 1], ["b", 1]]);
    const result = subtractWord(pool, "a");
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toBe(1);
  });

  test("ignores spaces in word", () => {
    const pool = new Map([["a", 1], ["b", 2]]);
    const result = subtractWord(pool, "a b");
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toBe(1);
  });

  test("applies mapping when subtracting", () => {
    const pool = new Map([["c", 2]]);
    const mapping = new Map([["ç", "c"]]);
    const result = subtractWord(pool, "çay", mapping);
    expect(result.get("c")).toBe(1);
  });
});

describe("computeRemainingPool", () => {
  test("computes pool from source minus all chosen words", () => {
    const mapping = new Map<string, string>();
    const pool = computeRemainingPool("abcabc", ["ab", "c"], mapping);
    expect(pool.get("a")).toBe(1);
    expect(pool.get("b")).toBe(1);
    expect(pool.get("c")).toBe(1);
  });
});

describe("buildMappingNormalizer", () => {
  test("builds a Map from equivalence pairs", () => {
    const pairs: [string, string][] = [["ç", "c"], ["ş", "s"]];
    const mapping = buildMappingNormalizer(pairs);
    expect(mapping.get("ç")).toBe("c");
    expect(mapping.get("c")).toBe("c");
    expect(mapping.get("ş")).toBe("s");
    expect(mapping.get("s")).toBe("s");
  });
});

import { computeCharMapping, normalizeLetters, scrambleScore } from "./anagram";

describe("computeCharMapping", () => {
  const none = new Map<string, string>();

  test("identity mapping", () => {
    const { charMap, overflowIdxs, sourceOnlyIdxs } = computeCharMapping("abc", ["abc"], none);
    expect([...charMap.entries()]).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(overflowIdxs.size).toBe(0);
    expect(sourceOnlyIdxs.size).toBe(0);
  });

  test("overflow and source-only chars", () => {
    const { overflowIdxs, sourceOnlyIdxs } = computeCharMapping("ab c", ["ax"], none);
    expect([...overflowIdxs]).toEqual([1]);
    expect([...sourceOnlyIdxs]).toEqual([1, 2]);
  });

  test("punctuation keeps its own source index (İstanbul'a)", () => {
    const { charMap, sourceOnlyIdxs } = computeCharMapping("İstanbul'a", ["istanbula"], none);
    // i s t a n b u l ' a → apostrophe is source index 8
    expect(sourceOnlyIdxs.has(8)).toBe(true);
    expect(charMap.get(0)).toBe(0);
    expect(charMap.get(8)).toBe(9);
  });

  test("repeated letters: order-preserving and minimal (anana → naana)", () => {
    const src = "anana";
    const word = "naana";
    const { charMap } = computeCharMapping(src, [word], none);
    const assigned = [...word].map((_, i) => charMap.get(i)!);
    // a's: source 0,2,4 ; n's: source 1,3 — greedy keeps their order
    expect(assigned).toEqual([1, 0, 2, 3, 4]);
    const cost = (perm: number[]) => perm.reduce((s, p, i) => s + Math.abs(i - p), 0);

    // Brute force over every valid letter-preserving assignment.
    let best = Infinity;
    const permute = (rest: number[], acc: number[]) => {
      if (acc.length === word.length) { best = Math.min(best, cost(acc)); return; }
      for (let k = 0; k < rest.length; k++) {
        if (src[rest[k]] !== word[acc.length]) continue;
        permute([...rest.slice(0, k), ...rest.slice(k + 1)], [...acc, rest[k]]);
      }
    };
    permute([0, 1, 2, 3, 4], []);
    expect(cost(assigned)).toBe(best);
  });
});

describe("normalizeLetters", () => {
  test("tr-TR lowercase, punctuation dropped", () => {
    expect(normalizeLetters("İstanbul'a", new Map())).toEqual(["i", "s", "t", "a", "n", "b", "u", "l", "a"]);
  });
  test("applies mapping", () => {
    expect(normalizeLetters("âlem", buildMappingNormalizer([["â", "a"]]))).toEqual(["a", "l", "e", "m"]);
  });
  test("drops digits and punctuation", () => {
    expect(normalizeLetters("19-23 Iı!", new Map())).toEqual(["ı", "ı"]);
  });
});

describe("scrambleScore", () => {
  test("trivial cases", () => {
    expect(scrambleScore([])).toBe(0);
    expect(scrambleScore([0])).toBe(0);
    expect(scrambleScore([0, 1, 2, 3])).toBe(0);
  });
  test("reversal is 100", () => {
    expect(scrambleScore([4, 3, 2, 1, 0])).toBe(100);
    expect(scrambleScore([5, 4, 3, 2, 1, 0])).toBe(100);
  });
  test("one adjacent swap on n=10 is 4", () => {
    expect(scrambleScore([1, 0, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(4);
  });
});
