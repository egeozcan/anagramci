import { describe, expect, test, beforeAll } from "bun:test";
import { buildMappingNormalizer, normalizeLetters } from "./anagram";
import { buildPuzzle, encodePuzzle, isPuzzle, tileGlyphs } from "./reveal-puzzle";

// static/reveal.js exposes its pure helpers when there is no DOM.
let api: any;
beforeAll(async () => {
  const file = "../static/reveal.js"; // plain script, no type declarations
  await import(file);
  api = (globalThis as any).__anagramciReveal;
});

describe("reveal.js pure helpers", () => {
  test("shortcuts: letters are guesses unless armed by Esc; Çöz never fires by accident", () => {
    // Focus fell to <body> after a click on the slots: 'harap' must type, not hint/forfeit.
    for (const k of ["h", "a", "r", "R", "n", "İ"]) expect(api.shortcutFor(k, false, false)).toBe("type");
    expect(api.shortcutFor(" ", false, false)).toBeNull();
    expect(api.shortcutFor("Enter", false, false)).toBeNull();
    // After Esc: H/R are shortcuts, other letters still type.
    expect(api.shortcutFor("h", false, true)).toBe("hint");
    expect(api.shortcutFor("R", false, true)).toBe("coz");
    expect(api.shortcutFor("a", false, true)).toBe("type");
    // After the solve: replay / next only.
    expect(api.shortcutFor("r", true, false)).toBe("replay");
    expect(api.shortcutFor("n", true, false)).toBe("next");
    expect(api.shortcutFor("h", true, true)).toBeNull();
    expect(api.shortcutFor("a", true, false)).toBeNull();
  });

  test("star thresholds", () => {
    expect(api.stars({ by: "play", misses: 0, hints: 0 })).toBe(3);
    expect(api.stars({ by: "play", misses: 2, hints: 0 })).toBe(3);
    expect(api.stars({ by: "play", misses: 3, hints: 0 })).toBe(2);
    expect(api.stars({ by: "play", misses: 5, hints: 1 })).toBe(2);
    expect(api.stars({ by: "play", misses: 6, hints: 1 })).toBe(1);
    expect(api.stars({ by: "play", misses: 0, hints: 2 })).toBe(1);
    expect(api.stars({ by: "coz", misses: 0, hints: 0 })).toBe(0);
    expect(api.starText(2)).toBe("⭐⭐☆");
  });

  test("result line squares and stars", () => {
    const line = api.resultLine("Deneme", ["player", "player", "hint"], { by: "play", misses: 2, hints: 1 });
    expect(line).toBe("Anagramcı · Deneme\n🟩🟩🟨 ⭐⭐ · 2 ıska · 1 ipucu");
    const coz = api.resultLine("", ["player", null], { by: "coz", misses: 0, hints: 0 });
    expect(coz.split("\n")[0]).toBe("Anagramcı · Bir anagram");
    expect(coz).toContain("🟩⬛");
  });

  test("normalizeGuess matches normalizeLetters", () => {
    const pairs: [string, string][] = [["â", "a"], ["î", "i"], ["û", "u"]];
    const norm = buildMappingNormalizer(pairs);
    for (const s of ["İstanbul'a", "IĞDIR", "âlem", "Kâğıt-Kalem", "ÇÖŞÜ ığü", "19 Mayıs", "îmân"]) {
      expect(api.normalizeGuess(s, pairs)).toEqual(normalizeLetters(s, norm));
    }
  });

  test("decodePuzzle matches the server encoding", () => {
    const p = buildPuzzle({ sourceText: "ğüşıöç İı", words: ["çöışüğ", "ıi"], mappingPairs: [] });
    if (!isPuzzle(p)) throw new Error(p.error);
    expect(api.decodePuzzle(encodePuzzle(p))).toEqual(p);
  });

  test("queue puts unsolved first and caps at 7", () => {
    const best: Record<string, { stars: number }> = { a: { stars: 3 }, b: { stars: 3 } };
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const q = api.buildQueue(slugs, (s: string) => best[s] ?? null, 7);
    expect(q.length).toBe(7);
    expect(q).not.toContain("a");
    expect(q).not.toContain("b");
    const small = api.buildQueue(["a", "c"], (s: string) => best[s] ?? null, 7);
    expect(small).toEqual(["c", "a"]);
  });

  test("best score comparison", () => {
    expect(api.betterThan({ stars: 2, misses: 9, hints: 1 }, { stars: 1, misses: 0, hints: 0 })).toBe(true);
    expect(api.betterThan({ stars: 2, misses: 3, hints: 1 }, { stars: 2, misses: 2, hints: 1 })).toBe(false);
    expect(api.betterThan({ stars: 0, misses: 0, hints: 0 }, null)).toBe(true);
  });

  test("stream shortcut also solves a single remaining word typed with spaces", () => {
    // "eski şehir" → normalized stream "eskişehir" against one open word
    expect(api.streamSolves("eskişehir", ["eskişehir"])).toBe(true);
    expect(api.streamSolves("karaelma", ["kara", "elma"])).toBe(true);
    expect(api.streamSolves("elmakara", ["kara", "elma"])).toBe(false);
    expect(api.streamSolves("", [])).toBe(false);
  });

  test("a round scores each puzzle index once (Back + re-solve)", () => {
    const round: any = { idx: 0, streak: 0, bestStreakRound: 0, solved: 0, stars: 0, scored: -1, done: {} };
    expect(api.scoreRound(round, 0, "play", 3)).toBe(true);
    expect(api.scoreRound(round, 1, "play", 2)).toBe(true);
    expect(api.scoreRound(round, 0, "play", 3)).toBe(false); // went Back to puzzle 0
    expect(api.scoreRound(round, 1, "play", 2)).toBe(false);
    expect(round.solved).toBe(2);
    expect(round.stars).toBe(5);
    expect(round.streak).toBe(2);
    // Legacy round objects without `done` still work
    const old: any = { idx: 0, streak: 1, bestStreakRound: 1, solved: 1, stars: 3, scored: -1 };
    expect(api.scoreRound(old, 0, "coz", 0)).toBe(true);
    expect(old.streak).toBe(0);
    expect(old.bestStreakRound).toBe(1);
  });

  test("play-mode reload restores the saved locks as they were, not by replaying hints", () => {
    // Player locked word 1 (the longest), then hint 3 placed word 0.
    const live = { slug: "x", misses: 2, hints: 3, locked: { "1": "player", "0": "hint" }, hinted: [0, 4, 9] };
    const back = api.parseLive(JSON.parse(JSON.stringify(live)), 3);
    expect(back).toEqual({ misses: 2, hints: 3, locked: { "0": "hint", "1": "player" }, hinted: { 0: true, 4: true, 9: true } });
    // Old entries (misses + hints only) and junk stay safe.
    expect(api.parseLive({ slug: "x", misses: 1, hints: 2 }, 3)).toEqual({ misses: 1, hints: 2, locked: {}, hinted: {} });
    expect(api.parseLive(null, 3)).toEqual({ misses: 0, hints: 0, locked: {}, hinted: {} });
    const junk = api.parseLive({ misses: -1, hints: 9, locked: { "5": "player", "a": "hint", "2": "x" }, hinted: "0" }, 3);
    expect(junk).toEqual({ misses: 0, hints: 0, locked: {}, hinted: {} });
  });

  // Tile groups as the template renders them: one .reveal-word per chosen word.
  function groupsOf(words: string[]): number[][] {
    let t = 0;
    return tileGlyphs(words).map((g) => g.map(() => t++));
  }
  const spentIdx = (s: boolean[]) => s.flatMap((v, i) => (v ? [i] : []));

  test("spent tiles follow the anagram's word groups, not the greedy charMap", () => {
    const words = ["geldim", "istanbul'a"];
    const p = buildPuzzle({ sourceText: "İstanbul'a geldim", words, mappingPairs: [] });
    if (!isPuzzle(p)) throw new Error(p.error);
    const groups = groupsOf(words);
    // Nothing locked: only the apostrophe tile (index 14) is spent.
    expect(spentIdx(api.spentTiles(p, [], groups))).toEqual([14]);
    // Lock GELDİM (source word 1): exactly its own group fades.
    expect(spentIdx(api.spentTiles(p, [1], groups))).toEqual([0, 1, 2, 3, 4, 5, 14]);
    expect(spentIdx(api.spentTiles(p, [0], groups))).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(api.spentTiles(p, [0, 1], groups).every(Boolean)).toBe(true);
  });

  test("standalone punctuation tiles are spent from the start", () => {
    const words = ["b-a"];
    const p = buildPuzzle({ sourceText: "a - b", words, mappingPairs: [] });
    if (!isPuzzle(p)) throw new Error(p.error);
    expect(api.spentTiles(p, [], groupsOf(words))).toEqual([false, true, false]);
    expect(api.spentTiles(p, [0, 1], groupsOf(words)).every(Boolean)).toBe(true);
  });

  test("hint 3 never places the last open word", () => {
    expect(api.canHint(0, 1)).toBe(true);
    expect(api.canHint(1, 1)).toBe(true);
    expect(api.canHint(2, 1)).toBe(false); // one-word puzzle: no free star
    expect(api.canHint(2, 2)).toBe(true);
    expect(api.canHint(3, 5)).toBe(false);
    expect(api.canHint(0, 0)).toBe(false);
  });

  test("copy label survives a quick double click", async () => {
    const btn: any = { dataset: {}, textContent: "Kopyala" };
    api.flashCopied(btn);
    api.flashCopied(btn);
    expect(btn.textContent).toBe("Kopyalandı ✓");
    expect(btn.dataset.label).toBe("Kopyala");
    await new Promise((r) => setTimeout(r, 1600));
    expect(btn.textContent).toBe("Kopyala");
  });
});
