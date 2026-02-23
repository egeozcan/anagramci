import { listAttempts, getAttempt } from "../store/attempts";
import { listWordLists, getWordList } from "../store/wordlists";
import { listMappings, getMappings } from "../store/mappings";
import { buildMappingNormalizer, computeRemainingPool } from "../anagram";
import type { DAWGResult } from "../dawg";
import { layout } from "../templates/layout";
import {
  homePageContent,
  workspaceContent,
  settingsPageContent,
} from "../templates/components";
import type { SuggestionsData } from "../templates/components";
import type { MappingData } from "../store/mappings";

const PAGE_SIZE = 50;

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function handlePageRoute(req: Request): Response | null {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // GET / — Home page
  if (method === "GET" && path === "/") {
    const attempts = listAttempts();
    const wordLists = listWordLists();
    const allMappings = listMappings();

    const mappingsByList = new Map<string, MappingData>();
    for (const m of allMappings) {
      mappingsByList.set(m.wordListId, { pairs: m.pairs, version: m.version });
    }

    const body = layout("Ana Sayfa", homePageContent(attempts, wordLists, mappingsByList));
    return html(body);
  }

  // GET /attempts/:id — Workspace page
  const attemptMatch = path.match(/^\/attempts\/([^/]+)$/);
  if (method === "GET" && attemptMatch) {
    const id = decodeURIComponent(attemptMatch[1]);
    const attempt = getAttempt(id);
    if (!attempt) {
      return html(layout("Bulunamadı", "<p>Deneme bulunamadı.</p>"), 404);
    }

    const wordList = getWordList(attempt.wordListId);
    const wordListName = wordList ? wordList.name : "Bilinmeyen liste";

    const mapping = buildMappingNormalizer(attempt.mappingSnapshot);
    const remainingPools: Map<string, number>[] = [];
    const suggestionsPerCombination: SuggestionsData[] = [];

    for (const chosenWords of attempt.combinations) {
      const pool = computeRemainingPool(attempt.sourceText, chosenWords, mapping);
      remainingPools.push(pool);

      let allResults: DAWGResult[] = [];
      if (wordList) {
        allResults = wordList.dawg.findAvailable(pool, mapping);
      }
      // Re-compute pool (findAvailable may mutate internally)
      const freshPool = computeRemainingPool(attempt.sourceText, chosenWords, mapping);
      remainingPools[remainingPools.length - 1] = freshPool;

      const grouped = new Map<number, DAWGResult[]>();
      for (const r of allResults) {
        let arr = grouped.get(r.letterCount);
        if (!arr) { arr = []; grouped.set(r.letterCount, arr); }
        arr.push(r);
      }
      const totalByGroup = new Map<number, number>();
      const paginated = new Map<number, DAWGResult[]>();
      for (const [lc, arr] of grouped) {
        totalByGroup.set(lc, arr.length);
        paginated.set(lc, arr.slice(0, PAGE_SIZE));
      }
      suggestionsPerCombination.push({ results: paginated, totalByGroup });
    }

    // Check if mapping is stale
    const currentMapping = getMappings(attempt.wordListId);
    const mappingStale = currentMapping.version !== attempt.mappingVersion;

    const body = layout(
      "Calisma Alani",
      `<div class="workspace">${workspaceContent(attempt, remainingPools, wordListName, mappingStale, suggestionsPerCombination)}</div>`,
    );
    return html(body);
  }

  // GET /settings — Settings page
  if (method === "GET" && path === "/settings") {
    const wordLists = listWordLists();
    const requestedListId = url.searchParams.get("list");
    const currentListId = requestedListId ?? (wordLists.length > 0 ? wordLists[0].id : null);

    let currentMapping: MappingData | null = null;
    if (currentListId) {
      currentMapping = getMappings(currentListId);
    }

    const body = layout(
      "Ayarlar",
      settingsPageContent(wordLists, currentListId, currentMapping),
    );
    return html(body);
  }

  // GET /static/* — Serve static files
  if (method === "GET" && path.startsWith("/static/")) {
    const filePath = path.slice(1); // Remove leading slash: "static/..."
    const file = Bun.file(filePath);

    // Determine content type from extension
    const ext = path.substring(path.lastIndexOf("."));
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  }

  return null;
}
