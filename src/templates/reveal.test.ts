import { describe, expect, test } from "bun:test";
import { buildPuzzle, decodePuzzle, isPuzzle } from "../reveal-puzzle";
import type { RevealPuzzle } from "../reveal-puzzle";
import type { Reveal } from "../store/reveals";
import { galleryAfterDelete, galleryContent, revealCreated, revealForm, revealLayout, revealStage } from "./reveal";

function reveal(over: Partial<Reveal> = {}): Reveal {
  return {
    slug: "abcdef",
    createdAt: "2026-11-24T10:00:00.000Z",
    attemptId: "a1",
    ci: 0,
    wordListId: "tr",
    sourceText: "zebra kuşu",
    words: ["zur", "kuşbea"],
    mappingPairs: [],
    title: "Hayvanat",
    ...over,
  };
}

function puzzleOf(r: Reveal): RevealPuzzle {
  const p = buildPuzzle(r);
  if (!isPuzzle(p)) throw new Error(p.error);
  return p;
}

/** Remove every hidden source span (the gallery's one allowed plaintext source). */
function stripSources(html: string): { rest: string; stripped: string } {
  const re = /<span class="card-source">[\s\S]*?<\/span>/g;
  return { rest: html.replace(re, ""), stripped: (html.match(re) ?? []).join("") };
}

describe("revealStage", () => {
  const r = reveal();
  const p = puzzleOf(r);
  const page = revealLayout({ title: r.title!, body: revealStage(r, p) });

  test("source never appears outside the payload", () => {
    const lower = page.toLocaleLowerCase("tr-TR");
    expect(lower).not.toContain("zebra");
    expect(lower).not.toContain("kuşu");
  });

  test("data-puzzle decodes back to the puzzle", () => {
    const m = page.match(/data-puzzle="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(decodePuzzle(m![1])).toEqual(p);
  });

  test("tiles carry no data-cell; slots do", () => {
    expect(page).not.toMatch(/class="tile"[^>]*data-cell/);
    expect((page.match(/class="slot"/g) ?? []).length).toBe(9);
    expect((page.match(/class="tile"/g) ?? []).length).toBe(9);
  });

  test("title and note are escaped, <title> included", () => {
    const evil = reveal({ title: `<script>"&`, note: `<img src=x onerror="1">` });
    const html = revealLayout({ title: evil.title!, body: revealStage(evil, puzzleOf(evil)) });
    expect(html).not.toContain("<script>\"&");
    expect(html).toContain("<title>&lt;script&gt;&quot;&amp; - Anagramcı</title>");
    expect(html).not.toContain("<img src=x");
  });

  test("mode and standalone", () => {
    expect(revealStage(r, p, { mode: "oyun" })).toContain('data-mode="oyun"');
    const solo = revealStage(r, p, { standalone: true, mode: "oyun" });
    expect(solo).toContain('data-mode="tek"');
    expect(solo).toContain("data-standalone");
    expect(solo).not.toContain("send-panel");
    expect(solo).not.toContain("Bağlantıyı kopyala");
    expect(revealStage(r, p)).toContain("send-panel");
  });

  test("standalone layout inlines assets and has no server references", () => {
    const html = revealLayout({ title: "x", body: revealStage(r, p, { standalone: true }), standalone: true });
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
    expect(html).not.toContain("/static/");
    expect(html).not.toContain("hx-");
    expect(html).not.toContain("unpkg.com/htmx");
  });
});

describe("gallery", () => {
  const user = reveal({ slug: "user22", title: "Benim" });
  const seed = reveal({ slug: "seed22", seed: true, attemptId: null, ci: null, sourceText: "et", words: ["te"], title: "Tohum", note: "Atasözü" });
  const html = galleryContent([user], [seed]);

  test("source is only inside hidden card-source spans", () => {
    const { rest, stripped } = stripSources(html);
    expect(rest).not.toContain("zebra kuşu");
    expect(stripped).toContain("zebra kuşu");
  });

  test("seed cards have no delete; no button inside a link", () => {
    const seedCard = html.slice(html.indexOf('data-slug="seed22"'));
    expect(seedCard).not.toContain("hx-delete");
    expect(html).toContain('hx-delete="/r/user22"');
    expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/);
  });

  test("sections, count and the play button", () => {
    expect(html).toContain("Vitrin <span class=\"gallery-count\" id=\"gallery-count\">· 2 anagram</span>");
    expect(html).toContain("Hazır bulmacalar");
    expect(html).toContain("Kendini sına");
    expect(galleryContent([], [seed])).toContain("Henüz sergilenen bir anagram yok");
  });
});

describe("workspace fragments", () => {
  test("form and created fragments escape user strings", () => {
    expect(revealForm("a<b", 1)).toContain('hx-post="/attempts/a%3Cb/reveals"');
    const created = revealCreated(reveal({ title: "<b>x</b>" }));
    expect(created).toContain("/r/abcdef");
    expect(created).not.toContain("<b>x</b>");
  });
});

import { layoutCardTiles, revealCardSvg } from "./reveal";

describe("layoutCardTiles", () => {
  test("10 letters fit at 64px on one line", () => {
    expect(layoutCardTiles([10])).toEqual({ mode: "tiles", size: 64, lines: [[0]] });
  });

  test("40 letters across 6 words: ≤ 3 lines, size ≥ 28", () => {
    const l = layoutCardTiles([8, 7, 6, 7, 6, 6]);
    expect(l.mode).toBe("tiles");
    if (l.mode !== "tiles") return;
    expect(l.lines.length).toBeLessThanOrEqual(3);
    expect(l.size).toBeGreaterThanOrEqual(28);
    expect(l.lines.flat()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("120 letters and a 35-letter word fall back to text", () => {
    expect(layoutCardTiles(Array(20).fill(6)).mode).toBe("text");
    expect(layoutCardTiles([35]).mode).toBe("text");
  });
});

describe("revealCardSvg", () => {
  const r: Reveal = {
    slug: "abcdef", createdAt: "2026-11-24T10:00:00.000Z", attemptId: null, ci: null, wordListId: null,
    sourceText: "zebra kuşu", words: ["zur", "kuşbea"], mappingPairs: [], title: `<Kuş & "zebra">`,
  };

  /** Every opened tag is closed (self-closing tags excluded). */
  function balanced(svg: string): boolean {
    const stack: string[] = [];
    for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
      if (m[3]) continue;
      if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
    }
    return stack.length === 0;
  }

  test("1200×630, balanced, escaped", () => {
    const svg = revealCardSvg(r);
    expect(svg).toContain('width="1200" height="630"');
    expect(balanced(svg)).toBe(true);
    expect(svg).toContain("&lt;Kuş &amp; &quot;zebra&quot;&gt;");
    expect(svg).not.toContain("<Kuş");
  });

  test("source shown by default, hidden with hideSource", () => {
    expect(revealCardSvg(r)).toContain("ZEBRA KUŞU");
    const hidden = revealCardSvg({ ...r, title: "x" }, { hideSource: true });
    expect(hidden.toLocaleLowerCase("tr-TR")).not.toContain("zebra");
    expect(hidden).toContain("????? · ????");
    expect(balanced(hidden)).toBe(true);
  });

  test("text fallback stays balanced and escaped", () => {
    const long = { ...r, sourceText: "a".repeat(40), words: ["<a>" + "a".repeat(37)] };
    const svg = revealCardSvg(long);
    expect(svg).toContain("<tspan");
    expect(balanced(svg)).toBe(true);
    expect(svg).toContain("&lt;A&gt;");
  });
});

describe("gallery after Kaldır", () => {
  test("OOB count update, plus the empty state once no user reveal is left", () => {
    const seed = reveal({ slug: "seed11", seed: true });
    const left = galleryAfterDelete([reveal()], [seed]);
    expect(left).toContain('id="gallery-count" hx-swap-oob="true">· 2 anagram');
    expect(left).not.toContain("user-reveals");
    const none = galleryAfterDelete([], [seed]);
    expect(none).toContain('<div id="user-reveals" hx-swap-oob="true"><p class="empty-state">');
    // The page renders the same targets the OOB swaps address.
    const page = galleryContent([reveal()], [seed]);
    expect(page).toContain('id="gallery-count"');
    expect(page).toContain('<div id="user-reveals">');
  });

  test("stage and mosaic carry the longest-word length for tile sizing", () => {
    const r = reveal({ words: ["zur", "kuşbea"] });
    expect(revealStage(r, puzzleOf(r))).toContain("--tile-n:6;--slot-n:5");
    expect(galleryContent([r], [])).toContain('style="--mini-n:6"');
  });
});
