import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { loadWordLists } from "./store/wordlists";
import { handlePageRoute } from "./routes/pages";
import { handleAttemptRoute } from "./routes/attempts";
import { handleSettingsRoute } from "./routes/settings";

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
          (await handleSettingsRoute(req));

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
  });

  test("GET /attempts/:id for non-existent attempt returns 404", async () => {
    const res = await fetch(`${BASE}/attempts/non-existent-id-12345`);
    expect(res.status).toBe(404);
  });

  test("GET /attempts/:id/suggestions returns suggestions HTML", async () => {
    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/suggestions?q=`,
    );
    expect(res.status).toBe(200);

    const body = await res.text();
    // Should contain suggestions panel structure
    expect(body).toContain("suggestions");
  });

  test("POST /attempts/:id/choose adds word and returns updated panels", async () => {
    // "her" is a common Turkish word that should exist and can be formed from "merhaba"
    const form = new FormData();
    form.set("word", "her");

    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/choose`,
      {
        method: "POST",
        body: form,
      },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // Should contain OOB swap panels
    expect(body).toContain("chosen-words");
    expect(body).toContain("remaining-letters");
    expect(body).toContain("suggestions");
    // The chosen word should appear in the chosen words panel
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

  test("DELETE /attempts/:id/chosen/0 removes first word", async () => {
    const res = await fetch(
      `${BASE}/attempts/${encodeURIComponent(attemptId)}/chosen/0`,
      { method: "DELETE" },
    );

    expect(res.status).toBe(200);

    const body = await res.text();
    // Should return updated panels
    expect(body).toContain("chosen-words");
    expect(body).toContain("remaining-letters");
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
// 3. Settings: mappings
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
// 4. 404 handling
// ---------------------------------------------------------------------------

describe("404 handling", () => {
  test("unknown route returns 404", async () => {
    const res = await fetch(`${BASE}/nonexistent-page`);
    expect(res.status).toBe(404);
  });
});
