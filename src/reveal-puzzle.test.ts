import { describe, expect, test } from "bun:test";
import { buildPuzzle, decodePuzzle, encodePuzzle, isPuzzle, tileGlyphs } from "./reveal-puzzle";
import type { RevealPuzzle } from "./reveal-puzzle";

function ok(r: Parameters<typeof buildPuzzle>[0]): RevealPuzzle {
  const p = buildPuzzle(r);
  if (!isPuzzle(p)) throw new Error(p.error);
  return p;
}

describe("buildPuzzle", () => {
  test("perfect two-word case", () => {
    const p = ok({ sourceText: "kuş tabelası", words: ["tabela", "kuşsı"], mappingPairs: [] });
    expect(p.cells.length).toBe(11);
    expect(p.letterCells).toEqual([...Array(11).keys()]);
    expect([...p.charMap].sort((a, b) => a - b)).toEqual([...Array(11).keys()]);
    expect(p.words.map((w) => w.length)).toEqual([3, 8]);
    expect(p.cells[0]).toEqual({ g: "K", n: "k", w: 0 });
  });

  test("in-word punctuation is a fixed cell of that word", () => {
    const p = ok({ sourceText: "istanbul'a", words: ["sunabilta"], mappingPairs: [] });
    expect(p.cells[8]).toEqual({ g: "'", w: 0, f: 1 });
    expect(p.letterCells).not.toContain(8);
    expect(p.words).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);
  });

  test("standalone punctuation is a fixed group, excluded from words", () => {
    const p = ok({ sourceText: "ab - cd", words: ["dcba"], mappingPairs: [] });
    expect(p.cells.map((c) => c.w)).toEqual([0, 0, 1, 2, 2]);
    expect(p.cells[2].f).toBe(1);
    expect(p.words).toEqual([[0, 1], [3, 4]]);
  });

  test("mapping makes âlem / elma perfect", () => {
    const p = ok({ sourceText: "âlem", words: ["elma"], mappingPairs: [["â", "a"]] });
    expect(p.cells[0]).toEqual({ g: "Â", n: "a", w: 0 });
    expect(p.map).toEqual([["â", "a"]]);
  });

  test("refuses stray punctuation the source lacks", () => {
    expect(isPuzzle(buildPuzzle({ sourceText: "elma", words: ["el'ma"], mappingPairs: [] }))).toBe(false);
  });

  test("refuses an imperfect pool and empty words", () => {
    expect(isPuzzle(buildPuzzle({ sourceText: "ebabil", words: ["bal"], mappingPairs: [] }))).toBe(false);
    expect(isPuzzle(buildPuzzle({ sourceText: "ebabil", words: [], mappingPairs: [] }))).toBe(false);
  });

  test("refuses a source with no letters (nothing to guess)", () => {
    expect(buildPuzzle({ sourceText: "1923", words: ["9231"], mappingPairs: [] })).toEqual({ error: "Kaynakta harf yok." });
  });

  test("refuses the source words in source order", () => {
    const err = { error: "Kaynakla aynı dizilim." };
    expect(buildPuzzle({ sourceText: "İstanbul'a geldim", words: ["istanbul'a", "geldim"], mappingPairs: [] })).toEqual(err);
    expect(buildPuzzle({ sourceText: "âlem", words: ["alem"], mappingPairs: [["â", "a"]] })).toEqual(err);
    // Same letter order but different word boundaries is still a (weak) puzzle.
    expect(isPuzzle(buildPuzzle({ sourceText: "ab cd", words: ["abc", "d"], mappingPairs: [] }))).toBe(true);
  });

  test("score is 0 for identity letter order and > 0 for a real scramble", () => {
    expect(ok({ sourceText: "ab cd", words: ["abc", "d"], mappingPairs: [] }).score).toBe(0);
    expect(ok({ sourceText: "et", words: ["te"], mappingPairs: [] }).score).toBe(100);
  });
});

describe("encode / decode", () => {
  const p = ok({ sourceText: "ğüşıöç İı", words: ["çöışüğ", "ıi"], mappingPairs: [] });

  test("round-trips and hides Turkish letters", () => {
    const enc = encodePuzzle(p);
    expect(decodePuzzle(enc)).toEqual(p);
    for (const ch of "ğüşıöçİıĞÜŞÖÇ") expect(enc).not.toContain(ch);
  });

  test("matches the client decode expression", () => {
    const enc = encodePuzzle(p);
    const client = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(enc), (c) => c.charCodeAt(0))));
    expect(client).toEqual(p);
  });
});

describe("tileGlyphs", () => {
  test("tr-TR uppercase, spaces dropped", () => {
    expect(tileGlyphs(["iz", "ıl ık"])).toEqual([["İ", "Z"], ["I", "L"], ["I", "K"]]);
  });
});
