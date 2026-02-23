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
    if (ch === " ") continue;
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
    if (ch === " ") continue;
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
      if (ch === " ") {
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
