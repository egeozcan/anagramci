import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "fs";
import {
  buildRevealIndex,
  cachedRevealIndex,
  createReveal,
  deleteReveal,
  getReveal,
  listReveals,
  revealSlugFor,
  SAFE_SLUG,
} from "./reveals";
import type { Reveal } from "./reveals";

const TEST_DIR = "data/test-reveals-store";

const input = {
  attemptId: "att-1",
  ci: 0,
  wordListId: "tr",
  sourceText: "et",
  words: ["te"],
  mappingPairs: [] as [string, string][],
};

const fakeSeed: Reveal = {
  slug: "seed22",
  createdAt: "2026-01-01T00:00:00.000Z",
  attemptId: null,
  ci: null,
  wordListId: null,
  sourceText: "ab",
  words: ["ba"],
  mappingPairs: [],
  title: "Tohum",
  seed: true,
};

describe("Reveal store", () => {
  beforeEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));
  afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  test("create / get round-trip with a safe slug", () => {
    const r = createReveal({ ...input, title: "  Deneme  " }, TEST_DIR, []);
    expect(r.slug).toMatch(SAFE_SLUG);
    expect(existsSync(`${TEST_DIR}/${r.slug}.json`)).toBe(true);
    expect(getReveal(r.slug, TEST_DIR, [])).toEqual(r);
    expect(r.title).toBe("Deneme");
    expect(r.note).toBeUndefined();
  });

  test("slug avoids seed slugs", () => {
    // Every random draw would hit a seed if the seed list covered the space;
    // with a single fake seed we just assert it's never returned.
    for (let i = 0; i < 50; i++) {
      expect(createReveal(input, TEST_DIR, [fakeSeed]).slug).not.toBe("seed22");
    }
  });

  test("unsafe and unknown slugs return null", () => {
    expect(getReveal("../attempts/x", TEST_DIR, [])).toBeNull();
    expect(getReveal("AAAAAA", TEST_DIR, [])).toBeNull();
    expect(getReveal("zzzzzz", TEST_DIR, [])).toBeNull();
  });

  test("seeds resolve through getReveal", () => {
    expect(getReveal("seed22", TEST_DIR, [fakeSeed])?.title).toBe("Tohum");
  });

  test("listReveals is newest first", async () => {
    const a = createReveal(input, TEST_DIR, []);
    await Bun.sleep(5);
    const b = createReveal(input, TEST_DIR, []);
    expect(listReveals(TEST_DIR).map((r) => r.slug)).toEqual([b.slug, a.slug]);
  });

  test("delete works for user reveals and is refused for seeds / unknown", () => {
    const r = createReveal(input, TEST_DIR, []);
    expect(deleteReveal("seed22", TEST_DIR, [fakeSeed])).toBe(false);
    expect(deleteReveal("zzzzzz", TEST_DIR, [])).toBe(false);
    expect(deleteReveal(r.slug, TEST_DIR, [])).toBe(true);
    expect(getReveal(r.slug, TEST_DIR, [])).toBeNull();
  });

  test("title and note are trimmed and capped", () => {
    const r = createReveal({ ...input, title: " " + "ş".repeat(80), note: "n".repeat(200) + " " }, TEST_DIR, []);
    expect(r.title).toBe("ş".repeat(60));
    expect(r.note).toBe("n".repeat(140));
    expect(createReveal({ ...input, title: "   " }, TEST_DIR, []).title).toBeUndefined();
  });

  test("revealSlugFor matches exact word arrays only", () => {
    const r = createReveal({ ...input, words: ["ab", "cd"] }, TEST_DIR, []);
    const index = buildRevealIndex(listReveals(TEST_DIR));
    expect(revealSlugFor(index, "att-1", ["ab", "cd"])).toBe(r.slug);
    expect(revealSlugFor(index, "att-1", ["cd", "ab"])).toBeNull();
    expect(revealSlugFor(index, "att-1", ["ab"])).toBeNull();
    expect(revealSlugFor(index, "other", ["ab", "cd"])).toBeNull();
  });

  test("listReveals skips files missing required fields", () => {
    const ok = createReveal(input, TEST_DIR, []);
    writeFileSync(`${TEST_DIR}/bad222.json`, JSON.stringify({ slug: "bad222", words: ["x"] }));
    writeFileSync(`${TEST_DIR}/null22.json`, "null");
    expect(listReveals(TEST_DIR).map((r) => r.slug)).toEqual([ok.slug]);
  });

  test("malformed files (no mappingPairs) are skipped by list and get", () => {
    const ok = createReveal(input, TEST_DIR, []);
    const { mappingPairs: _, ...legacy } = { ...ok, slug: "old222" };
    writeFileSync(`${TEST_DIR}/old222.json`, JSON.stringify(legacy));
    expect(listReveals(TEST_DIR).map((r) => r.slug)).toEqual([ok.slug]);
    expect(getReveal("old222", TEST_DIR, [])).toBeNull();
  });

  test("bad mappingPairs entries or non-string title/note are skipped", () => {
    const ok = createReveal(input, TEST_DIR, []);
    writeFileSync(`${TEST_DIR}/map222.json`, JSON.stringify({ ...ok, slug: "map222", mappingPairs: [null] }));
    writeFileSync(`${TEST_DIR}/map333.json`, JSON.stringify({ ...ok, slug: "map333", mappingPairs: [["a", 1]] }));
    writeFileSync(`${TEST_DIR}/ttl222.json`, JSON.stringify({ ...ok, slug: "ttl222", title: 42 }));
    writeFileSync(`${TEST_DIR}/not222.json`, JSON.stringify({ ...ok, slug: "not222", note: {} }));
    expect(listReveals(TEST_DIR).map((r) => r.slug)).toEqual([ok.slug]);
    expect(getReveal("ttl222", TEST_DIR, [])).toBeNull();
  });

  test("cachedRevealIndex is invalidated by create and delete", () => {
    expect(cachedRevealIndex(TEST_DIR).size).toBe(0);
    const r = createReveal(input, TEST_DIR, []);
    expect(revealSlugFor(cachedRevealIndex(TEST_DIR), input.attemptId!, input.words)).toBe(r.slug);
    deleteReveal(r.slug, TEST_DIR, []);
    expect(revealSlugFor(cachedRevealIndex(TEST_DIR), input.attemptId!, input.words)).toBeNull();
  });
});
