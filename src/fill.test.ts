import { describe, expect, test } from "bun:test";
import { DAWG } from "./dawg";
import { buildMappingNormalizer, textToPool, subtractWord } from "./anagram";
import { findFullAnagrams } from "./fill";

function solve(words: string[], text: string, opts = {}, pairs: [string, string][] = []) {
  const mapping = pairs.length ? buildMappingNormalizer(pairs) : undefined;
  const dawg = new DAWG(words);
  const pool = textToPool(text, mapping);
  const cands = dawg.findAvailable(new Map(pool), mapping);
  return { pool, mapping, res: findFullAnagrams(cands, pool, mapping, opts) };
}

const texts = (r: ReturnType<typeof solve>["res"]) =>
  r.solutions.map((s) => s.slots.map((x) => x.words[0]).join(" "));

describe("findFullAnagrams", () => {
  test("every solution consumes the pool exactly", () => {
    const words = ["kapasite", "test", "öf", "tef", "tös", "aseptik", "afet", "patates", "köftesi", "set", "pas"];
    const { pool, res } = solve(words, "patates köftesi");
    expect(res.solutions.length).toBeGreaterThan(0);
    for (const s of res.solutions) {
      let p = pool;
      for (const slot of s.slots) p = subtractWord(p, slot.words[0]);
      expect(p.size).toBe(0);
    }
  });

  test("fewer words rank first, then balance", () => {
    // "abcdefgh" can be: 4+4 (abcd efgh), 5+3 (abcde fgh), 3+3+2? (min 3, so no)
    const words = ["abcde", "fgh", "abcd", "efgh", "abc", "def", "gh"];
    const { res } = solve(words, "abcdefgh");
    expect(texts(res)).toEqual(["abcd efgh", "abcde fgh"]);
  });

  test("min length 3 excludes short words", () => {
    const words = ["ab", "cdef", "abcdef"];
    const { res } = solve(words, "abcdef");
    expect(texts(res)).toEqual(["abcdef"]);
    expect(solve(["ab"], "ab").res.solutions).toEqual([]);
  });

  test("anagram alternatives are grouped into one slot", () => {
    const words = ["abc", "cab", "xyz"];
    const { res } = solve(words, "abcxyz");
    expect(res.solutions.length).toBe(1);
    expect(res.solutions[0].slots.map((s) => s.words)).toEqual([["abc", "cab"], ["xyz"]]);
  });

  test("diversity cap limits results sharing the longest word", () => {
    // lead "abcdef" + many 3+3 tails of "ghijkl"? use 2-word tails of 6 letters
    const words = ["abcdef", "ghi", "jkl", "ghj", "ikl", "gik", "hjl", "gil", "hjk"];
    const { res } = solve(words, "abcdefghijkl", { maxPerLead: 2 });
    const withLead = res.solutions.filter((s) => s.slots[0].words[0] === "abcdef");
    expect(withLead.length).toBe(2);
  });

  test("letter mapping normalizes candidate words", () => {
    const words = ["çam", "kar"];
    const { res } = solve(words, "cam kar", {}, [["ç", "c"]]);
    expect(texts(res)).toEqual(["çam kar"]);
  });

  test("returns empty for pools smaller than minLen", () => {
    const { res } = solve(["ab"], "ab", { minLen: 3 });
    expect(res).toEqual({ solutions: [], truncated: false, totalFound: 0 });
  });

  test("tiny budget truncates without throwing", async () => {
    const file = await Bun.file("word-lists/turkce_kelime_listesi.txt").text();
    const words = file.split("\n").map((s) => s.trim()).filter(Boolean).map((w) => w.toLocaleLowerCase("tr-TR"));
    const { res } = solve(words, "ateş olmayan yerden duman çıkmaz", { budgetMs: 0, limit: 1e6 });
    expect(res.truncated).toBe(true);
    const full = solve(words, "ateş olmayan yerden duman çıkmaz");
    expect(full.res.solutions.length).toBeGreaterThan(0);
    expect(full.res.solutions.length).toBeLessThanOrEqual(30);
    // word counts are non-decreasing across the ranked list
    const ks = full.res.solutions.map((s) => s.lengths.length);
    expect(ks).toEqual([...ks].sort((a, b) => a - b));
  });
});

describe("findFullAnagrams edge cases", () => {
  test("punctuation does not count toward word length", () => {
    // "bağ-fiil" has 7 letters; with "abc" it should exactly cover the pool
    // DAWG's letterCount counts "-"; fill must count letters only.
    const pool = textToPool("bağfiil abc");
    const cands = [{ word: "bağ-fiil", letterCount: 8 }, { word: "abc", letterCount: 3 }];
    const res = findFullAnagrams(cands, pool, undefined);
    expect(res.solutions.map((s) => s.lengths)).toEqual([[7, 3]]);
  });
});
