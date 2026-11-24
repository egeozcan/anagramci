import {
  buildMappingNormalizer,
  computeCharMapping,
  computeRemainingPool,
  LETTER_RE,
  normalizeLetters,
  scrambleScore,
} from "./anagram";

/**
 * One cell of the hidden source: every non-space character of the tr-TR
 * lowercased source, punctuation included (the same index space as the
 * workspace `data-si`).
 *
 * - `g` display glyph (tr-TR uppercase)
 * - `n` normalized letter (letter cells only)
 * - `w` index of the whitespace-separated source token the cell belongs to
 * - `f` fixed (non-letter) cell: invisible until the reveal, never guessed
 */
export interface PuzzleCell { g: string; n?: string; w: number; f?: 1 }

export interface RevealPuzzle {
  v: 1;
  cells: PuzzleCell[];
  /** Source WORD index → its cell indices (letter-bearing tokens only; fixed groups excluded). */
  words: number[][];
  /** Letter-stream index → cell index. */
  letterCells: number[];
  /** Tile index (non-space chars of the chosen words) → cell index. */
  charMap: number[];
  /** Mapping pairs used for guess normalization. */
  map: [string, string][];
  /** Karışım %. */
  score: number;
}

export interface RevealLike {
  sourceText: string;
  words: string[];
  mappingPairs: [string, string][];
}

/** Collapse any whitespace so the cell / tile index spaces stay aligned. */
function cleanSource(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanWords(words: string[]): string[] {
  return words.flatMap((w) => w.split(/\s+/)).filter(Boolean);
}

/**
 * Build the playable puzzle for a reveal, or `{ error }` when the combination
 * is not perfect. This is THE perfect check: creation and rendering share it.
 * Perfect = at least one word, nothing overflows (stray punctuation the source
 * lacks overflows too), nothing remains, every source letter cell is hit,
 * the source has at least one letter, and the words are not just the source
 * words in source order (nothing to solve).
 */
export function buildPuzzle(r: RevealLike): RevealPuzzle | { error: string } {
  const source = cleanSource(r.sourceText);
  const words = cleanWords(r.words);
  if (words.length === 0) return { error: "Kombinasyonda kelime yok." };

  const normalizer = buildMappingNormalizer(r.mappingPairs);
  const { charMap, overflowIdxs } = computeCharMapping(source, words, normalizer);
  if (overflowIdxs.size > 0) return { error: "Kaynakta olmayan harf ya da işaret var." };
  if (computeRemainingPool(source, words, normalizer).size > 0) {
    return { error: "Kullanılmayan harfler kaldı." };
  }

  const cells: PuzzleCell[] = [];
  const puzzleWords: number[][] = [];
  const letterCells: number[] = [];
  const tokens = source.toLocaleLowerCase("tr-TR").split(" ");
  tokens.forEach((tok, ti) => {
    const chars = [...tok];
    const isWord = chars.some((c) => LETTER_RE.test(c));
    const wordCells: number[] = [];
    for (const ch of chars) {
      const idx = cells.length;
      if (LETTER_RE.test(ch)) {
        cells.push({ g: ch.toLocaleUpperCase("tr-TR"), n: normalizer.get(ch) ?? ch, w: ti });
        letterCells.push(idx);
      } else {
        cells.push({ g: ch, w: ti, f: 1 });
      }
      wordCells.push(idx);
    }
    if (isWord) puzzleWords.push(wordCells);
  });

  const tileCount = words.reduce((s, w) => s + [...w.toLocaleLowerCase("tr-TR")].length, 0);
  const map: number[] = [];
  for (let t = 0; t < tileCount; t++) map.push(charMap.get(t)!);

  if (letterCells.length === 0) return { error: "Kaynakta harf yok." };
  const mapped = new Set(map);
  if (letterCells.some((c) => !mapped.has(c))) return { error: "Kaynaktaki her harf kullanılmalı." };
  const letterKey = (ws: string[]) =>
    JSON.stringify(ws.map((w) => normalizeLetters(w, normalizer).join("")).filter(Boolean));
  if (letterKey(words) === letterKey(tokens)) return { error: "Kaynakla aynı dizilim." };

  // Dense letter space: i-th letter tile → letter-stream index of its cell.
  const letterIndexOfCell = new Map(letterCells.map((c, i) => [c, i]));
  const perm = map.filter((c) => !cells[c].f).map((c) => letterIndexOfCell.get(c)!);

  return { v: 1, cells, words: puzzleWords, letterCells, charMap: map, map: r.mappingPairs, score: scrambleScore(perm) };
}

export function isPuzzle(p: RevealPuzzle | { error: string }): p is RevealPuzzle {
  return !("error" in p);
}

/** Tile glyphs per chosen word (tr-TR uppercase, spaces dropped). Same order as the tile index space. */
export function tileGlyphs(words: string[]): string[][] {
  return cleanWords(words).map((w) => [...w.toLocaleLowerCase("tr-TR")].map((c) => c.toLocaleUpperCase("tr-TR")));
}

/**
 * Base64(UTF-8 JSON). Only guards against *accidental* spoilers — the payload
 * contains the answer. Client decode: JSON.parse(new TextDecoder().decode(
 * Uint8Array.from(atob(s), c => c.charCodeAt(0)))) — bare atob garbles ğüşıöç.
 */
export function encodePuzzle(p: RevealPuzzle): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64");
}

export function decodePuzzle(s: string): RevealPuzzle {
  return JSON.parse(Buffer.from(s, "base64").toString("utf8")) as RevealPuzzle;
}
