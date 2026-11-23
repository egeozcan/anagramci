import { LETTER_RE } from "./anagram";
import type { DAWGResult } from "./dawg";

/** One position in a solution; `words` are anagrams of each other (same letters). */
export interface FillSlot {
  words: string[];
}

export interface FillSolution {
  /** Ordered longest first. */
  slots: FillSlot[];
  lengths: number[];
}

export interface FillResult {
  solutions: FillSolution[];
  /** True when the time budget or raw cap cut the search short. */
  truncated: boolean;
  /** Raw distinct solutions seen (before diversity cap / limit). */
  totalFound: number;
}

export interface FillOptions {
  minLen?: number;
  limit?: number;
  budgetMs?: number;
  maxWords?: number;
  /** Max results sharing the same longest word (by letter signature). */
  maxPerLead?: number;
}

interface Group {
  sig: string;
  words: string[];
  len: number;
  vec: Int16Array;
}

const RAW_CAP_PER_K = 20000;

/**
 * Find multi-word solutions that use up exactly the letters in `pool`.
 *
 * Ranking: fewer words first; within a word count, the most balanced
 * (largest shortest word, then smallest longest word); at most `maxPerLead`
 * results share the same longest word.
 */
export function findFullAnagrams(
  candidates: DAWGResult[],
  pool: Map<string, number>,
  mapping: Map<string, string> | undefined,
  opts: FillOptions = {},
): FillResult {
  const minLen = opts.minLen ?? 3;
  const limit = opts.limit ?? 30;
  const budgetMs = opts.budgetMs ?? 80;
  const maxWords = opts.maxWords ?? 6;
  const maxPerLead = opts.maxPerLead ?? 2;
  const t0 = performance.now();

  const letters = [...pool.keys()].sort();
  const L = letters.length;
  const letterIdx = new Map(letters.map((l, i) => [l, i]));
  const total = [...pool.values()].reduce((a, b) => a + b, 0);
  const empty: FillResult = { solutions: [], truncated: false, totalFound: 0 };
  if (total < minLen) return empty;

  const sigOf = (v: Int16Array): string => {
    let s = "";
    for (let i = 0; i < L; i++) if (v[i] > 0) s += letters[i].repeat(v[i]);
    return s;
  };

  // Group candidates by letter signature.
  const bySig = new Map<string, Group>();
  for (const c of candidates) {
    // Count letters only (DAWG letterCount includes punctuation like "-").
    const vec = new Int16Array(L);
    let len = 0;
    let ok = true;
    for (const ch of c.word) {
      if (!LETTER_RE.test(ch)) continue;
      const i = letterIdx.get(mapping?.get(ch) ?? ch);
      if (i === undefined) { ok = false; break; }
      vec[i]++;
      len++;
    }
    if (!ok || len < minLen) continue;
    const sig = sigOf(vec);
    const g = bySig.get(sig);
    if (g) {
      if (!g.words.includes(c.word)) g.words.push(c.word);
    } else {
      bySig.set(sig, { sig, words: [c.word], len, vec });
    }
  }
  for (const g of bySig.values()) g.words.sort((a, b) => a.localeCompare(b, "tr-TR"));

  // Longest first; index order dedupes permutations.
  const groups = [...bySig.values()].sort((a, b) => b.len - a.len || (a.sig < b.sig ? -1 : 1));
  const order = new Map(groups.map((g, i) => [g, i]));
  const lens = groups.map((g) => g.len);
  // first index whose len <= x (lens is non-increasing)
  const firstAtMost = (x: number): number => {
    let lo = 0, hi = lens.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (lens[m] <= x) hi = m; else lo = m + 1; }
    return lo;
  };
  // last index whose len >= x, i.e. firstAtMost(x - 1) - 1
  const lastAtLeast = (x: number): number => firstAtMost(x - 1) - 1;

  const rem = new Int16Array(L);
  letters.forEach((l, i) => (rem[i] = pool.get(l)!));
  const fits = (v: Int16Array) => {
    for (let i = 0; i < L; i++) if (v[i] > rem[i]) return false;
    return true;
  };

  let truncated = false;
  let nodes = 0;
  let totalFound = 0;
  const final: FillSolution[] = [];
  const leadCount = new Map<string, number>();

  for (let k = 1; k <= maxWords && final.length < limit && !truncated; k++) {
    if (total < minLen * k) break;
    const raw: Group[][] = [];
    const stack: Group[] = [];

    const rec = (start: number, left: number, slots: number): void => {
      if (truncated || raw.length >= RAW_CAP_PER_K) return;
      if (slots === 1) {
        const g = bySig.get(sigOf(rem));
        if (g && order.get(g)! >= start) raw.push([...stack, g]);
        return;
      }
      if (++nodes % 512 === 0 && performance.now() - t0 > budgetMs) { truncated = true; return; }
      // This word is the longest of the rest: len >= ceil(left/slots),
      // and leaves room for (slots-1) words of minLen.
      const maxL = left - minLen * (slots - 1);
      const minL = Math.ceil(left / slots);
      const lo = Math.max(start, firstAtMost(maxL));
      const hi = lastAtLeast(minL);
      // Shortest valid first → most balanced solutions are found before budget runs out.
      for (let i = hi; i >= lo; i--) {
        const g = groups[i];
        if (!fits(g.vec)) continue;
        for (let j = 0; j < L; j++) rem[j] -= g.vec[j];
        stack.push(g);
        rec(i, left - g.len, slots - 1);
        stack.pop();
        for (let j = 0; j < L; j++) rem[j] += g.vec[j];
        if (truncated || raw.length >= RAW_CAP_PER_K) return;
      }
    };
    rec(0, total, k);
    if (raw.length >= RAW_CAP_PER_K) truncated = true;
    totalFound += raw.length;

    const keyed = raw.map((gs) => ({
      gs,
      min: gs[gs.length - 1].len,
      max: gs[0].len,
      text: gs.map((g) => g.words[0]).join(" "),
    }));
    keyed.sort((a, b) => b.min - a.min || a.max - b.max || a.text.localeCompare(b.text, "tr-TR"));

    for (const s of keyed) {
      if (final.length >= limit) break;
      const lead = s.gs[0].sig;
      const n = leadCount.get(lead) ?? 0;
      if (n >= maxPerLead) continue;
      leadCount.set(lead, n + 1);
      final.push({
        slots: s.gs.map((g) => ({ words: g.words })),
        lengths: s.gs.map((g) => g.len),
      });
    }
  }

  return { solutions: final, truncated, totalFound };
}
