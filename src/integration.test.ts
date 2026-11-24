import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { loadWordLists } from "./store/wordlists";
import { handlePageRoute } from "./routes/pages";
import { handleAttemptRoute } from "./routes/attempts";
import { handleSettingsRoute } from "./routes/settings";
import { handleRevealRoute } from "./routes/reveals";
import { listSeeds } from "./store/reveals";

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

let server: ReturnType<typeof Bun.serve>;

/**
 * Remove all JSON files created by integration tests from the default data dirs.
 * We track attempt IDs and mapping word list IDs to clean up only what we created,
 * but for safety we also record them during the test run.
 */
const createdAttemptIds: string[] = [];
const createdMappingIds: string[] = [];

function cleanupTestData() {
  // Clean up attempt files we created
  for (const id of createdAttemptIds) {
    try {
      rmSync(join("data/attempts", `${id}.json`), { force: true });
    } catch {
      // ignore
    }
  }
  // Clean up mapping files we created
  for (const id of createdMappingIds) {
    try {
      rmSync(join("data/mappings", `${id}.json`), { force: true });
    } catch {
      // ignore
    }
  }
}

beforeAll(async () => {
  // Ensure data directories exist
  mkdirSync("data/attempts", { recursive: true });
  mkdirSync("data/mappings", { recursive: true });

  // Load word lists (module-level singleton, only loads once)
  await loadWordLists("word-lists");

  // Start test server
  server = Bun.serve({
    port: PORT,
    async fetch(req) {
      try {
        const response =
          handlePageRoute(req) ??
          (await handleAttemptRoute(req)) ??
          (await handleSettingsRoute(req)) ??
          (await handleRevealRoute(req));

        if (response) return response;
        return new Response("Not Found", { status: 404 });
      } catch (e) {
        console.error("Integration test server error:", e);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  });
});

afterAll(() => {
  cleanupTestData();
  server.stop(true);
});

// ---------------------------------------------------------------------------
// 1. Home page
// ---------------------------------------------------------------------------

describe("Home page", () => {
  test("GET / returns 200 and contains Anagramci", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const body = await res.text();
    expect(body).toContain("Anagramcı");
  });

  test("GET / contains new attempt form", async () => {
    const res = await fetch(`${BASE}/`);
    const body = await res.text();
    expect(body).toContain("sourceText");
    expect(body).toContain("wordListId");
    expect(body).toContain("turkce_kelime_listesi");
  });
});

// ---------------------------------------------------------------------------
// 2. Create attempt and choose words
// ---------------------------------------------------------------------------

describe("Attempt flow", () => {
  let attemptId: string;

  test("POST /attempts creates attempt and returns redirect", async () => {
    const form = new FormData();
    form.set("sourceText", "merhaba");
    form.set("wordListId", "turkce_kelime_listesi");

    const res = await fetch(`${BASE}/attempts`, {
      method: "POST",
      body: form,
      redirect: "manual",
    });

    expect(res.status).toBe(204);

    const redirectHeader = res.headers.get("HX-Redirect");
    expect(redirectHeader).toBeTruthy();
    expect(redirectHeader!).toMatch(/^\/attempts\/.+/);

    // Extract attempt ID from redirect path
    attemptId = decodeURIComponent(redirectHeader!.replace("/attempts/", ""));
    createdAttemptIds.push(attemptId);
  });

  test("POST /attempts with missing fields returns 400", async () => {
    const form = new FormData();
    form.set("sourceText", "");
    form.set("wordListId", "turkce_kelime_listesi");

    const res = await fetch(`${BASE}/attempts`, {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(400);
  });

  test("GET /attempts/:id loads workspace page", async () => {
    const res = await fetch(`${BASE}/attempts/${encodeURIComponent(attemptId)}`);
    expect(res.status).toBe(200);

    const body = await res.text();
    // Should contain the source text
    expect(body).toContain("merhaba");
    // Should contain workspace structure
    expect(body).toContain("workspace");
    // Should contain remaining letters panel
    expect(body).toContain("Kalan Harfler");
    // Should contain chosen words panel
    expect(body).toContain("Seçilen Kelimeler");
    // Should contain combination block
    expect(body).toContain("combination-0");
    expect(body).toContain("(1)");
  });

  test("GET /attempts/:id for non-existent attempt returns 404", async () => {
    const res = await fetch(`${BASE}/attempts/non-existent-id-12345`);
    expect(res.status).toBe(404);
  });

  test("GET /attempts/:id/suggestions returns suggestions HTML", async () => {
    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/suggestions?q=&ci=0`,
    );
    expect(res.status).toBe(200);

    const body = await res.text();
    // Should contain suggestion groups (inner content, not full panel wrapper)
    expect(body).toContain("suggestion-group");
  });

  test("POST /attempts/:id/choose adds word and returns updated combination block", async () => {
    // "her" is a common Turkish word that should exist and can be formed from "merhaba"
    const form = new FormData();
    form.set("word", "her");
    form.set("ci", "0");

    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/choose`,
      {
        method: "POST",
        body: form,
      },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // Should contain combination block with panels
    expect(body).toContain("combination-0");
    expect(body).toContain("chosen-words-0");
    expect(body).toContain("remaining-letters-0");
    expect(body).toContain("suggestions-0");
    // The chosen word should appear
    expect(body).toContain("her");
  });

  test("GET workspace after choosing word shows updated state", async () => {
    const res = await fetch(`${BASE}/attempts/${encodeURIComponent(attemptId)}`);
    expect(res.status).toBe(200);

    const body = await res.text();
    // Source text should still be present
    expect(body).toContain("merhaba");
    // Chosen word "her" should appear
    expect(body).toContain("her");
  });

  test("DELETE /attempts/:id/chosen/0?ci=0 removes first word", async () => {
    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/chosen/0?ci=0`,
      { method: "DELETE" },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // Should return updated combination block
    expect(body).toContain("combination-0");
    expect(body).toContain("chosen-words-0");
    expect(body).toContain("remaining-letters-0");
  });

  test("DELETE /attempts/:id deletes the attempt", async () => {
    // Create a throwaway attempt to delete
    const form = new FormData();
    form.set("sourceText", "test silme");
    form.set("wordListId", "turkce_kelime_listesi");

    const createRes = await fetch(`${BASE}/attempts`, {
      method: "POST",
      body: form,
      redirect: "manual",
    });
    const redirectHeader = createRes.headers.get("HX-Redirect")!;
    const deleteId = decodeURIComponent(redirectHeader.replace("/attempts/", ""));
    createdAttemptIds.push(deleteId);

    const deleteRes = await fetch(
      `${BASE}/attempts/${encodeURIComponent(deleteId)}`,
      { method: "DELETE" },
    );

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.headers.get("HX-Redirect")).toBe("/");

    // Verify it is actually gone
    const getRes = await fetch(`${BASE}/attempts/${encodeURIComponent(deleteId)}`);
    expect(getRes.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 3. Multiple combinations
// ---------------------------------------------------------------------------

describe("Multiple combinations", () => {
  let attemptId: string;

  test("setup: create attempt", async () => {
    const form = new FormData();
    form.set("sourceText", "merhaba dünya");
    form.set("wordListId", "turkce_kelime_listesi");

    const res = await fetch(`${BASE}/attempts`, {
      method: "POST",
      body: form,
      redirect: "manual",
    });

    const redirectHeader = res.headers.get("HX-Redirect")!;
    attemptId = decodeURIComponent(redirectHeader.replace("/attempts/", ""));
    createdAttemptIds.push(attemptId);
  });

  test("POST /attempts/:id/combinations adds a new combination", async () => {
    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/combinations`,
      { method: "POST" },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // Should return the new combination block
    expect(body).toContain("combination-1");
    expect(body).toContain("(2)");
  });

  test("POST /attempts/:id/choose works on combination 1", async () => {
    const form = new FormData();
    form.set("word", "her");
    form.set("ci", "1");

    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/choose`,
      {
        method: "POST",
        body: form,
      },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain("combination-1");
    expect(body).toContain("chosen-words-1");
    expect(body).toContain("her");
  });

  test("GET workspace shows both combinations", async () => {
    const res = await fetch(`${BASE}/attempts/${encodeURIComponent(attemptId)}`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain("combination-0");
    expect(body).toContain("combination-1");
    expect(body).toContain("(1)");
    expect(body).toContain("(2)");
  });

  test("DELETE /attempts/:id/combinations/0 removes combination and re-indexes", async () => {
    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/combinations/0`,
      { method: "DELETE" },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // The remaining combination should now be at index 0
    expect(body).toContain("combination-0");
    // It should contain the word from the old combination-1
    expect(body).toContain("her");
  });

  test("DELETE /attempts/:id/combinations fails when only 1 combination left", async () => {
    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/combinations/0`,
      { method: "DELETE" },
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Settings: mappings
// ---------------------------------------------------------------------------

describe("Settings mappings", () => {
  const testWordListId = "integration_test_wl";

  afterAll(() => {
    createdMappingIds.push(testWordListId);
  });

  test("GET /settings/mappings/:wordListId returns empty editor for new list", async () => {
    const res = await fetch(
      `${BASE}/settings/mappings/${encodeURIComponent(testWordListId)}`,
    );
    expect(res.status).toBe(200);

    const body = await res.text();
    // Should contain the mapping editor
    expect(body).toContain("mapping-editor");
    // Version should be 0 for a new mapping
    expect(body).toContain("Sürüm: 0");
  });

  test("PUT /settings/mappings/:wordListId saves mapping pairs", async () => {
    const form = new FormData();
    form.append("from", "ç");
    form.append("to", "c");
    form.append("from", "ş");
    form.append("to", "s");

    const res = await fetch(
      `${BASE}/settings/mappings/${encodeURIComponent(testWordListId)}`,
      {
        method: "PUT",
        body: form,
      },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // Should return updated editor
    expect(body).toContain("mapping-editor");
    // Version should now be 1
    expect(body).toContain("Sürüm: 1");
    // Should contain the saved pairs
    expect(body).toContain("ç");
    expect(body).toContain("ş");
  });

  test("GET /settings/mappings/:wordListId returns saved mapping", async () => {
    const res = await fetch(
      `${BASE}/settings/mappings/${encodeURIComponent(testWordListId)}`,
    );
    expect(res.status).toBe(200);

    const body = await res.text();
    // Version should still be 1
    expect(body).toContain("Sürüm: 1");
    // Pairs should be present
    expect(body).toContain("ç");
    expect(body).toContain("ş");
  });

  test("PUT /settings/mappings/:wordListId bumps version on second save", async () => {
    const form = new FormData();
    form.append("from", "ç");
    form.append("to", "c");
    form.append("from", "ş");
    form.append("to", "s");
    form.append("from", "ğ");
    form.append("to", "g");

    const res = await fetch(
      `${BASE}/settings/mappings/${encodeURIComponent(testWordListId)}`,
      {
        method: "PUT",
        body: form,
      },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // Version should now be 2
    expect(body).toContain("Sürüm: 2");
    // All three pairs should be present
    expect(body).toContain("ğ");
  });

  test("GET /settings page loads with word lists", async () => {
    const res = await fetch(`${BASE}/settings`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain("Ayarlar");
    // Should contain the word list name
    expect(body).toContain("turkce_kelime_listesi");
  });
});

// ---------------------------------------------------------------------------
// 5. 404 handling
// ---------------------------------------------------------------------------

describe("404 handling", () => {
  test("unknown route returns 404", async () => {
    const res = await fetch(`${BASE}/nonexistent-page`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tamamla (fill the rest) + hidden words
// ---------------------------------------------------------------------------

describe("Tamamla", () => {
  let attemptId: string;
  const hiddenFile = "data/hidden/turkce_kelime_listesi.json";
  const hiddenFileExisted = existsSync(hiddenFile);
  afterAll(() => {
    if (!hiddenFileExisted) rmSync(hiddenFile, { force: true });
  });
  const words = (body: string) => [...body.matchAll(/data-words="([^"]*)"/g)].map((m) => m[1]);

  beforeAll(async () => {
    const form = new FormData();
    form.set("sourceText", "hayat güzel sevince");
    form.set("wordListId", "turkce_kelime_listesi");
    const res = await fetch(`${BASE}/attempts`, { method: "POST", body: form, redirect: "manual" });
    attemptId = decodeURIComponent(res.headers.get("HX-Redirect")!.replace("/attempts/", ""));
    createdAttemptIds.push(attemptId);
  });

  test("workspace page renders a lazy placeholder", async () => {
    const body = await (await fetch(`${BASE}/attempts/${attemptId}`)).text();
    expect(body).toContain(`hx-get="/attempts/${attemptId}/fill?ci=0"`);
    expect(body).toContain("Hesaplanıyor");
  });

  test("GET /fill returns solutions grouped by word count", async () => {
    const body = await (await fetch(`${BASE}/attempts/${attemptId}/fill?ci=0`)).text();
    expect(body).toContain('class="fill-row"');
    expect(body).toMatch(/data-k="2"/);
    expect(words(body).length).toBeGreaterThan(0);
  });

  test("choosing a word re-renders the block with updated solutions", async () => {
    const form = new FormData();
    form.set("word", "hayalet");
    form.set("ci", "0");
    const body = await (await fetch(`${BASE}/attempts/${attemptId}/choose`, { method: "POST", body: form })).text();
    expect(body).toContain('data-phrase="hayalet ');
    // every solution phrase starts with the chosen word
    for (const m of body.matchAll(/data-phrase="([^"]*)"/g)) expect(m[1].startsWith("hayalet ")).toBe(true);
  });

  test("adding a whole solution completes the combination", async () => {
    const fillBody = await (await fetch(`${BASE}/attempts/${attemptId}/fill?ci=0`)).text();
    const first = fillBody.match(/aria-label="Tümünü ekle: ([^"]*)"/)![1];
    const form = new FormData();
    form.set("word", first);
    form.set("ci", "0");
    const body = await (await fetch(`${BASE}/attempts/${attemptId}/choose`, { method: "POST", body: form })).text();
    expect(body).toContain("combination-preview--perfect");
    expect(body).toContain("fill-section--empty");
  });

  test("hide removes a word from fill + suggestions for all blocks; unhide restores", async () => {
    // reset to a single chosen word
    const reset = new FormData();
    reset.set("ci", "0");
    reset.set("word_0", "hayalet");
    await fetch(`${BASE}/attempts/${attemptId}/chosen`, { method: "PUT", body: reset });

    const before = await (await fetch(`${BASE}/attempts/${attemptId}/fill?ci=0`)).text();
    const target = words(before)[0].split(" ")[0];

    const hide = new FormData();
    hide.set("word", target);
    hide.set("open", "0");
    const hidden = await (await fetch(`${BASE}/attempts/${attemptId}/hide`, { method: "POST", body: hide })).text();
    try {
      expect(hidden).toContain('id="combination-0"');
      expect(hidden).toContain("Gizlenenler (");
      expect(words(hidden).flatMap((w) => w.split(" "))).not.toContain(target);
      expect(hidden).not.toContain(`<button type="submit" class="word-chip">${target}</button>`);
    } finally {
      const restored = await (
        await fetch(`${BASE}/attempts/${attemptId}/hide?word=${encodeURIComponent(target)}&open=0`, { method: "DELETE" })
      ).text();
      expect(words(restored).flatMap((w) => w.split(" "))).toContain(target);
    }
  });
});

describe("Per-combination bans", () => {
  let attemptId: string;
  const words = (body: string) => [...body.matchAll(/data-words="([^"]*)"/g)].flatMap((m) => m[1].split(" "));
  const chip = (w: string) => `<button type="submit" class="word-chip">${w}</button>`;

  beforeAll(async () => {
    const form = new FormData();
    form.set("sourceText", "hayat güzel sevince");
    form.set("wordListId", "turkce_kelime_listesi");
    const res = await fetch(`${BASE}/attempts`, { method: "POST", body: form, redirect: "manual" });
    attemptId = decodeURIComponent(res.headers.get("HX-Redirect")!.replace("/attempts/", ""));
    createdAttemptIds.push(attemptId);
    await fetch(`${BASE}/attempts/${attemptId}/combinations`, { method: "POST" });
    await fetch(`${BASE}/attempts/${attemptId}/combinations`, { method: "POST" });
  });

  const ban = (word: string, ci: number) => {
    const f = new FormData();
    f.set("word", word);
    f.set("ci", String(ci));
    return fetch(`${BASE}/attempts/${attemptId}/ban`, { method: "POST", body: f }).then((r) => r.text());
  };

  test("ban removes a word from that combination's suggestions + Tamamla only", async () => {
    const before = await (await fetch(`${BASE}/attempts/${attemptId}/fill?ci=1`)).text();
    const target = words(before)[0];

    const banned = await ban(target, 1);
    expect(banned).toContain('id="combination-1"');
    expect(banned).toContain("Bu çözümde yasaklananlar (1)");
    expect(words(banned)).not.toContain(target);
    expect(banned).not.toContain(chip(target));

    const sugg1 = await (await fetch(`${BASE}/attempts/${attemptId}/suggestions?ci=1&q=${encodeURIComponent(target)}`)).text();
    expect(sugg1).not.toContain(chip(target));

    // other combinations are unaffected
    expect(words(await (await fetch(`${BASE}/attempts/${attemptId}/fill?ci=0`)).text())).toContain(target);
    const sugg0 = await (await fetch(`${BASE}/attempts/${attemptId}/suggestions?ci=0&q=${encodeURIComponent(target)}`)).text();
    expect(sugg0).toContain(chip(target));

    // deleting combination 0 shifts the ban along with combination 1 → 0
    const afterDelete = await (await fetch(`${BASE}/attempts/${attemptId}/combinations/0`, { method: "DELETE" })).text();
    expect(afterDelete).toContain("Bu çözümde yasaklananlar (1)");
    expect(words(await (await fetch(`${BASE}/attempts/${attemptId}/fill?ci=0`)).text())).not.toContain(target);
    expect(words(await (await fetch(`${BASE}/attempts/${attemptId}/fill?ci=1`)).text())).toContain(target);

    const restored = await (
      await fetch(`${BASE}/attempts/${attemptId}/ban?word=${encodeURIComponent(target)}&ci=0`, { method: "DELETE" })
    ).text();
    expect(restored).not.toContain("Bu çözümde yasaklananlar");
    expect(words(restored)).toContain(target);
  });

  test("ban rejects out-of-range combination index", async () => {
    const f = new FormData();
    f.set("word", "hayat");
    f.set("ci", "9");
    const res = await fetch(`${BASE}/attempts/${attemptId}/ban`, { method: "POST", body: f });
    expect(res.status).toBe(400);
  });
});

describe("Validation", () => {
  test("POST /attempts rejects unknown word list ids", async () => {
    const form = new FormData();
    form.set("sourceText", "abc");
    form.set("wordListId", "../../package");
    const res = await fetch(`${BASE}/attempts`, { method: "POST", body: form, redirect: "manual" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Vitrin: reveals, standalone export, gallery, seeds
// ---------------------------------------------------------------------------

describe("Vitrin", () => {
  const REVEALS = "data/test-reveals";
  const prevDir = process.env.REVEALS_DIR;
  const slugRe = /\/r\/([a-z2-9]{6})/;
  const revealFiles = () => (existsSync(REVEALS) ? readdirSync(REVEALS).length : 0);

  async function attemptWith(sourceText: string, words: string[]): Promise<string> {
    const form = new FormData();
    form.set("sourceText", sourceText);
    form.set("wordListId", "turkce_kelime_listesi");
    const res = await fetch(`${BASE}/attempts`, { method: "POST", body: form, redirect: "manual" });
    const id = decodeURIComponent(res.headers.get("HX-Redirect")!.replace("/attempts/", ""));
    createdAttemptIds.push(id);
    await setWords(id, words);
    return id;
  }

  async function setWords(id: string, words: string[]) {
    const f = new FormData();
    f.set("ci", "0");
    words.forEach((w, i) => f.set(`word_${i}`, w));
    return fetch(`${BASE}/attempts/${id}/chosen`, { method: "PUT", body: f });
  }

  async function sergile(id: string, fields: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return fetch(`${BASE}/attempts/${id}/reveals`, { method: "POST", body: f });
  }

  let attemptId: string;
  let slug: string;
  const seed = listSeeds()[0];

  beforeAll(async () => {
    process.env.REVEALS_DIR = REVEALS;
    rmSync(REVEALS, { recursive: true, force: true });
    attemptId = await attemptWith("zebra kuşu", ["zur", "kuşbea"]);
  });

  afterAll(() => {
    rmSync(REVEALS, { recursive: true, force: true });
    if (prevDir === undefined) delete process.env.REVEALS_DIR;
    else process.env.REVEALS_DIR = prevDir;
  });

  test("1. perfect workspace offers Sergile; imperfect does not", async () => {
    const body = await (await fetch(`${BASE}/attempts/${attemptId}`)).text();
    expect(body).toContain("btn-sergile");
    expect(body).toContain('id="reveal-slot-0"');
    expect(body).toContain("Çalışma Alanı");
    const other = await attemptWith("ebabil", ["bal"]);
    expect(await (await fetch(`${BASE}/attempts/${other}`)).text()).not.toContain("btn-sergile");
  });

  test("2. reveal form fragment; bad ci is an alert", async () => {
    const form = await (await fetch(`${BASE}/attempts/${attemptId}/reveal-form?ci=0`)).text();
    expect(form).toContain('name="title"');
    expect(form).toContain('name="note"');
    const bad = await fetch(`${BASE}/attempts/${attemptId}/reveal-form?ci=9`);
    expect(bad.status).toBe(200);
    expect(await bad.text()).toContain('role="alert"');
  });

  test("3. POST creates a reveal with an OOB badge", async () => {
    const res = await sergile(attemptId, { ci: "0", title: "Deneme" });
    expect(res.status).toBe(200);
    const body = await res.text();
    slug = body.match(slugRe)![1];
    expect(body).toContain('id="reveal-mark-0"');
    expect(body).toContain('hx-swap-oob="true"');
    expect(existsSync(`${REVEALS}/${slug}.json`)).toBe(true);
    // Idempotent for the same words
    expect((await (await sergile(attemptId, { ci: "0" })).text()).match(slugRe)![1]).toBe(slug);
    expect(revealFiles()).toBe(1);
  });

  test("3b. re-showcasing the same words says the existing reveal was kept", async () => {
    const body = await (await sergile(attemptId, { ci: "0", title: "Yeni başlık" })).text();
    expect(body).toContain("zaten sergilenmiş");
    expect(revealFiles()).toBe(1);
  });

  test("3c. traversal attempt ids are rejected", async () => {
    const res = await fetch(`${BASE}/attempts/..%2Freveals%2F${slug}/reveal-form?ci=0`);
    expect(res.status).toBe(404);
  });

  test("4. badge on reload; editing the words removes it", async () => {
    const body = await (await fetch(`${BASE}/attempts/${attemptId}`)).text();
    expect(body).toContain(`class="reveal-badge" href="/r/${slug}"`);
    expect(body).not.toContain("btn-sergile");
    const edited = await (await setWords(attemptId, ["kuşbea", "zur"])).text();
    expect(edited).not.toContain("reveal-badge");
    expect(edited).toContain("btn-sergile");
    const back = await (await setWords(attemptId, ["zur", "kuşbea"])).text();
    expect(back).toContain(`href="/r/${slug}"`);
  });

  test("5. imperfect and stray punctuation are refused without writing", async () => {
    const before = revealFiles();
    const imperfect = await attemptWith("ebabil", ["bal"]);
    const r1 = await sergile(imperfect, { ci: "0" });
    expect(r1.status).toBe(200);
    expect(await r1.text()).toContain('role="alert"');
    const punct = await attemptWith("elma", ["el'ma"]);
    expect(await (await sergile(punct, { ci: "0" })).text()).toContain('role="alert"');
    expect(await (await sergile(attemptId, { ci: "0", title: "x".repeat(61) })).text()).toContain('role="alert"');
    expect(revealFiles()).toBe(before);
  });

  test("6. unknown attempt is 404", async () => {
    expect((await sergile("nope", { ci: "0" })).status).toBe(404);
  });

  test("7. reveal page hides the source", async () => {
    const res = await fetch(`${BASE}/r/${slug}`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("reveal-stage");
    expect(body).toContain("Deneme");
    expect(body).toContain("data-puzzle");
    expect(body.toLocaleLowerCase("tr-TR")).not.toContain("zebra");
    expect(await (await fetch(`${BASE}/r/${slug}?oyun=1`)).text()).toContain('data-mode="oyun"');
  });

  test("8. standalone export", async () => {
    const res = await fetch(`${BASE}/r/${slug}/bulmaca.html`);
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="anagram-${slug}.html"`);
    const body = await res.text();
    for (const s of ["<style>", "<script>", "data-puzzle"]) expect(body).toContain(s);
    for (const s of ["unpkg.com/htmx", "/static/", "hx-"]) expect(body).not.toContain(s);
    expect(body.toLocaleLowerCase("tr-TR")).not.toContain("zebra");
  });

  test("9. gallery lists user and seed cards; sources only in hidden spans", async () => {
    const body = await (await fetch(`${BASE}/vitrin`)).text();
    expect(body).toContain(`data-slug="${slug}"`);
    expect(body).toContain("Hazır bulmacalar");
    for (const s of listSeeds()) expect(body).toContain(`data-slug="${s.slug}"`);
    expect(body).toContain("Kendini sına");
    expect(body).toContain("/static/reveal.js");
    const re = /<span class="card-source">[\s\S]*?<\/span>/g;
    const rest = body.replace(re, "");
    expect(rest).not.toContain("zebra kuşu");
    for (const s of listSeeds()) expect(rest).not.toContain(s.sourceText);
    expect((body.match(re) ?? []).join("")).toContain("zebra kuşu");
  });

  test("10. seeds play and cannot be deleted", async () => {
    expect((await fetch(`${BASE}/r/${seed.slug}`)).status).toBe(200);
    expect((await fetch(`${BASE}/r/${seed.slug}`, { method: "DELETE" })).status).toBe(404);
    expect((await fetch(`${BASE}/r/${seed.slug}`)).status).toBe(200);
  });

  test("11. home card links the reveal", async () => {
    const body = await (await fetch(`${BASE}/`)).text();
    expect(body).toContain(`class="reveal-badge" href="/r/${slug}"`);
    // never nested inside the card's own link
    expect(body).not.toMatch(/<a\b[^>]*attempt-card-link[^>]*>(?:(?!<\/a>)[\s\S])*reveal-badge/);
  });

  test("P2. share card SVG", async () => {
    const res = await fetch(`${BASE}/r/${slug}/card.svg`);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(await res.text()).toContain("ZEBRA KUŞU");
    const gizli = await fetch(`${BASE}/r/${slug}/card.svg?gizli=1&indir=1`);
    expect(gizli.headers.get("Content-Disposition")).toBe(`attachment; filename="anagram-${slug}-bilmece.svg"`);
    expect((await gizli.text()).toLocaleLowerCase("tr-TR")).not.toContain("zebra");
    expect((await fetch(`${BASE}/r/AAAAAA/card.svg`)).status).toBe(404);
    expect(await (await fetch(`${BASE}/r/${slug}`)).text()).toContain(`/r/${slug}/card.svg?gizli=1&amp;indir=1`);
  });

  test("12. delete a user reveal", async () => {
    const res = await fetch(`${BASE}/r/${slug}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    // Main swap empties the card; OOB keeps the header count in sync.
    const body = await res.text();
    expect(body.startsWith('<span class="gallery-count" id="gallery-count" hx-swap-oob="true">')).toBe(true);
    expect(body).not.toContain("gallery-card");
    const gone = await fetch(`${BASE}/r/${slug}`);
    expect(gone.status).toBe(404);
    const page = await gone.text();
    expect(page).toContain("Anagram bulunamadı");
    expect(page).toContain("/static/reveal.js");
  });

  test("13. bad slugs are 404", async () => {
    for (const p of ["/r/AAAAAA", "/r/..%2F..%2Fetc", "/r/abc", "/r/AAAAAA/bulmaca.html", "/r/%E0%A4", "/r/%ZZ", "/r/%ZZ/card.svg"]) {
      expect((await fetch(`${BASE}${p}`)).status).toBe(404);
    }
  });
});
