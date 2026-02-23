import { describe, expect, test } from "bun:test";
import { DAWG } from "./dawg";

describe("DAWG", () => {
  test("builds from word list and finds exact words", () => {
    const dawg = new DAWG(["cat", "car", "card", "care", "bat"]);
    expect(dawg.contains("cat")).toBe(true);
    expect(dawg.contains("car")).toBe(true);
    expect(dawg.contains("card")).toBe(true);
    expect(dawg.contains("dog")).toBe(false);
    expect(dawg.contains("ca")).toBe(false);
  });

  test("finds all words formable from a letter pool", () => {
    const dawg = new DAWG(["cat", "car", "act", "at", "a", "cart", "bat"]);
    const pool = new Map([["c", 1], ["a", 1], ["t", 1]]);
    const results = dawg.findAvailable(pool);
    const words = results.map(r => r.word).sort();
    expect(words).toEqual(["a", "act", "at", "cat"]);
  });

  test("respects letter counts in pool", () => {
    const dawg = new DAWG(["aa", "aaa", "a"]);
    const pool = new Map([["a", 2]]);
    const results = dawg.findAvailable(pool);
    const words = results.map(r => r.word).sort();
    expect(words).toEqual(["a", "aa"]);
  });

  test("finds words with letter mapping", () => {
    const dawg = new DAWG(["çay", "cay", "say"]);
    const mapping = new Map([["ç", "c"]]);
    const pool = new Map([["c", 1], ["a", 1], ["y", 1]]);
    const results = dawg.findAvailable(pool, mapping);
    const words = results.map(r => r.word).sort();
    expect(words).toEqual(["cay", "çay"]);
  });

  test("handles multi-word entries (spaces ignored)", () => {
    const dawg = new DAWG(["ab", "a b", "abc"]);
    const pool = new Map([["a", 1], ["b", 1]]);
    const results = dawg.findAvailable(pool);
    const words = results.map(r => r.word).sort();
    expect(words).toEqual(["a b", "ab"]);
  });

  test("handles empty pool", () => {
    const dawg = new DAWG(["a", "b"]);
    const pool = new Map<string, number>();
    const results = dawg.findAvailable(pool);
    expect(results).toEqual([]);
  });

  test("handles large word list efficiently", () => {
    const words: string[] = [];
    for (let i = 0; i < 10000; i++) {
      const len = Math.floor(Math.random() * 8) + 2;
      let word = "";
      for (let j = 0; j < len; j++) {
        word += String.fromCharCode(97 + Math.floor(Math.random() * 26));
      }
      words.push(word);
    }
    const dawg = new DAWG(words);
    const pool = new Map([["a", 2], ["b", 1], ["c", 1], ["e", 1]]);
    const start = performance.now();
    const results = dawg.findAvailable(pool);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    for (const r of results) {
      const freq = new Map<string, number>();
      for (const ch of r.word) {
        freq.set(ch, (freq.get(ch) || 0) + 1);
      }
      for (const [ch, count] of freq) {
        expect(pool.get(ch)! >= count).toBe(true);
      }
    }
  });
});
