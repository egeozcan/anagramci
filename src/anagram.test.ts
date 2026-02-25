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
