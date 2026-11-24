import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

/** An immutable snapshot of a perfect combination, playable at /r/:slug. */
export interface Reveal {
  slug: string;
  createdAt: string;
  attemptId: string | null; // null for seeds
  ci: number | null;
  wordListId: string | null;
  sourceText: string;
  words: string[];
  mappingPairs: [string, string][]; // attempt.mappingSnapshot at creation
  title?: string; // trimmed, ≤ TITLE_MAX
  note?: string; // trimmed, ≤ NOTE_MAX
  seed?: true;
}

export type CreateRevealInput = Omit<Reveal, "slug" | "createdAt" | "seed">;

export const SAFE_SLUG = /^[a-z2-9]{6}$/;
export const TITLE_MAX = 60;
export const NOTE_MAX = 140;
const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz23456789";
const SEEDS_FILE = "seeds/hazir-bulmacalar.json";

/** Read at call time so tests can point it elsewhere after import. */
export function revealsDir(): string {
  return process.env.REVEALS_DIR ?? "data/reveals";
}

let seedCache: Reveal[] | null = null;

/** Curated, tracked seed puzzles (repo root `seeds/`), read once. */
export function listSeeds(): Reveal[] {
  if (seedCache) return seedCache;
  try {
    const raw = JSON.parse(readFileSync(SEEDS_FILE, "utf-8"));
    seedCache = (Array.isArray(raw) ? raw : []).filter(isRevealShape).map((r) => ({ ...r, seed: true as const }));
  } catch {
    seedCache = [];
  }
  return seedCache;
}

function randomSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

function clip(s: string | undefined, max: number): string | undefined {
  const t = (s ?? "").trim();
  return t ? [...t].slice(0, max).join("") : undefined;
}

export function createReveal(input: CreateRevealInput, dir: string = revealsDir(), seeds: Reveal[] = listSeeds()): Reveal {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const seedSlugs = new Set(seeds.map((s) => s.slug));
  let slug = "";
  for (let i = 0; i < 5; i++) {
    const candidate = randomSlug();
    if (!seedSlugs.has(candidate) && !existsSync(join(dir, `${candidate}.json`))) {
      slug = candidate;
      break;
    }
  }
  if (!slug) throw new Error("Could not allocate a reveal slug");

  const reveal: Reveal = {
    slug,
    createdAt: new Date().toISOString(),
    attemptId: input.attemptId,
    ci: input.ci,
    wordListId: input.wordListId,
    sourceText: input.sourceText,
    words: [...input.words],
    mappingPairs: input.mappingPairs,
  };
  const title = clip(input.title, TITLE_MAX);
  const note = clip(input.note, NOTE_MAX);
  if (title) reveal.title = title;
  if (note) reveal.note = note;
  writeFileSync(join(dir, `${slug}.json`), JSON.stringify(reveal, null, 2), "utf-8");
  indexCache = null;
  return reveal;
}

export function getReveal(slug: string, dir: string = revealsDir(), seeds: Reveal[] = listSeeds()): Reveal | null {
  if (!SAFE_SLUG.test(slug)) return null;
  const seed = seeds.find((s) => s.slug === slug);
  if (seed) return seed;
  const filePath = join(dir, `${slug}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const r = JSON.parse(readFileSync(filePath, "utf-8"));
    return isRevealShape(r) ? r : null;
  } catch {
    return null;
  }
}

function isRevealShape(r: any): r is Reveal {
  return (
    !!r &&
    typeof r.slug === "string" &&
    SAFE_SLUG.test(r.slug) &&
    typeof r.createdAt === "string" &&
    typeof r.sourceText === "string" &&
    Array.isArray(r.words) &&
    r.words.every((w: unknown) => typeof w === "string") &&
    Array.isArray(r.mappingPairs) &&
    r.mappingPairs.every(
      (p: unknown) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === "string"),
    ) &&
    (r.title === undefined || typeof r.title === "string") &&
    (r.note === undefined || typeof r.note === "string")
  );
}

/** User reveals only, newest first. Malformed files are skipped. */
export function listReveals(dir: string = revealsDir()): Reveal[] {
  if (!existsSync(dir)) return [];
  const out: Reveal[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const r = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      if (isRevealShape(r)) out.push(r);
    } catch {
      // skip unreadable files
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Seeds and unknown slugs are refused (false). */
export function deleteReveal(slug: string, dir: string = revealsDir(), seeds: Reveal[] = listSeeds()): boolean {
  if (!SAFE_SLUG.test(slug) || seeds.some((s) => s.slug === slug)) return false;
  const filePath = join(dir, `${slug}.json`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  indexCache = null;
  return true;
}

/** attemptId → (JSON of exact word array → slug). Build once per request. */
export type RevealIndex = Map<string, Map<string, string>>;

export function buildRevealIndex(reveals: Reveal[]): RevealIndex {
  const index: RevealIndex = new Map();
  for (const r of reveals) {
    if (!r.attemptId) continue;
    let byWords = index.get(r.attemptId);
    if (!byWords) index.set(r.attemptId, (byWords = new Map()));
    const key = JSON.stringify(r.words);
    if (!byWords.has(key)) byWords.set(key, r.slug); // reveals arrive newest first
  }
  return index;
}

let indexCache: { dir: string; index: RevealIndex } | null = null;

/**
 * Index of `dir`'s reveals, cached across requests so block re-renders don't
 * re-read every file. createReveal / deleteReveal invalidate it.
 */
export function cachedRevealIndex(dir: string = revealsDir()): RevealIndex {
  if (indexCache?.dir !== dir) indexCache = { dir, index: buildRevealIndex(listReveals(dir)) };
  return indexCache.index;
}

/** attemptId + exact words → existing reveal slug, from the cached index. */
export function lookupRevealSlug(attemptId: string, words: string[]): string | null {
  return revealSlugFor(cachedRevealIndex(), attemptId, words);
}

export function revealSlugFor(index: RevealIndex, attemptId: string, words: string[]): string | null {
  return index.get(attemptId)?.get(JSON.stringify(words)) ?? null;
}
