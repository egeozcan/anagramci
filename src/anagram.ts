export const LETTER_RE = /\p{L}/u;

export function buildMappingNormalizer(
  pairs: [string, string][]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [from, to] of pairs) {
    map.set(from, to);
    if (!map.has(to)) {
      map.set(to, to);
    }
  }
  return map;
}

function normalizeChar(ch: string, mapping?: Map<string, string>): string {
  if (!mapping) return ch;
  return mapping.get(ch) ?? ch;
}

export function textToPool(
  text: string,
  mapping?: Map<string, string>
): Map<string, number> {
  const pool = new Map<string, number>();
  const lower = text.toLocaleLowerCase("tr-TR");
  for (const ch of lower) {
    if (!LETTER_RE.test(ch)) continue;
    const normalized = normalizeChar(ch, mapping);
    pool.set(normalized, (pool.get(normalized) || 0) + 1);
  }
  return pool;
}

export function subtractWord(
  pool: Map<string, number>,
  word: string,
  mapping?: Map<string, string>
): Map<string, number> {
  const result = new Map(pool);
  const lower = word.toLocaleLowerCase("tr-TR");
  for (const ch of lower) {
    if (!LETTER_RE.test(ch)) continue;
    const normalized = normalizeChar(ch, mapping);
    const count = result.get(normalized) || 0;
    if (count <= 1) {
      result.delete(normalized);
    } else {
      result.set(normalized, count - 1);
    }
  }
  return result;
}

export function computeRemainingPool(
  sourceText: string,
  chosenWords: string[],
  mapping: Map<string, string>
): Map<string, number> {
  let pool = textToPool(sourceText, mapping);
  for (const word of chosenWords) {
    pool = subtractWord(pool, word, mapping);
  }
  return pool;
}

/**
 * For each chosen word, returns a per-character boolean array indicating
 * whether that character overflows the available pool at that point.
 * Earlier words consume from the pool first, so order matters.
 */
export function charOverflowMasks(
  sourceText: string,
  chosenWords: string[],
  mapping: Map<string, string>,
): boolean[][] {
  let pool = textToPool(sourceText, mapping);
  return chosenWords.map((word) => {
    const lower = word.toLocaleLowerCase("tr-TR");
    // Track how many of each normalized letter we've consumed within this word
    const used = new Map<string, number>();
    const masks: boolean[] = [];
    for (const ch of lower) {
      if (!LETTER_RE.test(ch)) {
        masks.push(false);
        continue;
      }
      const normalized = normalizeChar(ch, mapping);
      const usedCount = used.get(normalized) || 0;
      const available = pool.get(normalized) || 0;
      masks.push(usedCount >= available);
      used.set(normalized, usedCount + 1);
    }
    pool = subtractWord(pool, word, mapping);
    return masks;
  });
}

/**
 * Compute a mapping from each chosen-word character index to a source-text
 * character index.  Also identifies overflow chars (in chosen but not source)
 * and source-only chars (in source but not chosen).
 *
 * Index spaces: every non-space character of the tr-TR-lowercased source
 * (punctuation included — the workspace `data-si` / reveal "cell" space) and
 * every non-space character of the chosen words (the `data-ci` / reveal "tile"
 * space).
 *
 * Greedy is optimal, not an artifact: for each letter, the k-th occurrence in
 * the chosen words is assigned to the k-th unused occurrence in the source.
 * That order-preserving matching is exactly the minimum-L1 assignment between
 * two sequences of equal letters, so the summed |chosen − source| displacement
 * (workspace number, reveal flight paths, Karışım %) is the minimal one and is
 * deterministic.
 *
 * Returns: { charMap: Map<chosenIdx, sourceIdx>, overflowIdxs: Set<chosenIdx>, sourceOnlyIdxs: Set<sourceIdx> }
 */
export function computeCharMapping(
  sourceText: string,
  chosenWords: string[],
  normalizer: Map<string, string>,
): { charMap: Map<number, number>; overflowIdxs: Set<number>; sourceOnlyIdxs: Set<number> } {
  const srcChars = [...sourceText.toLocaleLowerCase("tr-TR")].filter(c => c !== " ");
  const chosenChars = chosenWords.flatMap(w => [...w.toLocaleLowerCase("tr-TR")]).filter(c => c !== " ");

  const norm = (ch: string) => normalizer.get(ch) ?? ch;

  const usedSource = new Set<number>();
  const charMap = new Map<number, number>();

  for (let ci = 0; ci < chosenChars.length; ci++) {
    const nch = norm(chosenChars[ci]);
    for (let si = 0; si < srcChars.length; si++) {
      if (!usedSource.has(si) && norm(srcChars[si]) === nch) {
        charMap.set(ci, si);
        usedSource.add(si);
        break;
      }
    }
  }

  const overflowIdxs = new Set<number>();
  for (let ci = 0; ci < chosenChars.length; ci++) {
    if (!charMap.has(ci)) overflowIdxs.add(ci);
  }

  const sourceOnlyIdxs = new Set<number>();
  for (let si = 0; si < srcChars.length; si++) {
    if (!usedSource.has(si)) sourceOnlyIdxs.add(si);
  }

  return { charMap, overflowIdxs, sourceOnlyIdxs };
}

/**
 * The letters of `text` as the pool sees them: tr-TR lowercase, mapping
 * applied, punctuation / digits / spaces dropped. Mirrored client-side by
 * `normalizeGuess` in static/reveal.js (parity is tested).
 */
export function normalizeLetters(text: string, normalizer: Map<string, string>): string[] {
  const out: string[] = [];
  for (const ch of text.toLocaleLowerCase("tr-TR")) {
    if (!LETTER_RE.test(ch)) continue;
    out.push(normalizeChar(ch, normalizer));
  }
  return out;
}

/**
 * Karışım %: how far letters moved, 0 (identity) … 100 (full reversal).
 * `perm[i]` is the source letter index of the i-th anagram letter (dense
 * letter space). ⌊n²/2⌋ is the maximum total displacement of a permutation of
 * n, reached by the reversal.
 */
export function scrambleScore(perm: number[]): number {
  const n = perm.length;
  if (n <= 1) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.abs(i - perm[i]);
  return Math.round((100 * total) / Math.floor((n * n) / 2));
}
