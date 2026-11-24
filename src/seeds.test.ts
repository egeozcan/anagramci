import { describe, expect, test } from "bun:test";
import { listSeeds, SAFE_SLUG } from "./store/reveals";
import { buildPuzzle } from "./reveal-puzzle";

describe("Seed puzzles", () => {
  const seeds = listSeeds();

  test("ships 8–12 seeds", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(8);
    expect(seeds.length).toBeLessThanOrEqual(12);
  });

  test("every seed is a perfect puzzle", () => {
    for (const s of seeds) expect({ slug: s.slug, r: buildPuzzle(s) }).not.toMatchObject({ r: { error: expect.anything() } });
  });

  test("slugs are unique and valid; seeds are flagged and titled", () => {
    expect(new Set(seeds.map((s) => s.slug)).size).toBe(seeds.length);
    for (const s of seeds) {
      expect(s.slug).toMatch(SAFE_SLUG);
      expect(s.seed).toBe(true);
      expect(s.title?.length).toBeGreaterThan(0);
      expect(s.title!.toLocaleLowerCase("tr-TR")).not.toContain(s.sourceText.toLocaleLowerCase("tr-TR"));
    }
  });
});
