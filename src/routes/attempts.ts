import {
  createAttempt,
  getAttempt,
  updateAttempt,
  deleteAttempt,
} from "../store/attempts";
import { getWordList } from "../store/wordlists";
import { getMappings } from "../store/mappings";
import { buildMappingNormalizer, computeRemainingPool } from "../anagram";
import type { DAWGResult } from "../dawg";
import {
  escapeHtml,
  chosenWordsPanel,
  remainingLettersDisplay,
  suggestionsPanel,
  workspaceContent,
} from "../templates/components";

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

const PAGE_SIZE = 50;

/**
 * Group DAWG results by letterCount.
 */
function groupByLetterCount(results: DAWGResult[]): Map<number, DAWGResult[]> {
  const groups = new Map<number, DAWGResult[]>();
  for (const r of results) {
    let arr = groups.get(r.letterCount);
    if (!arr) {
      arr = [];
      groups.set(r.letterCount, arr);
    }
    arr.push(r);
  }
  return groups;
}

/**
 * Filter results by a substring query (case-insensitive, Turkish locale).
 */
function filterByQuery(results: DAWGResult[], query: string): DAWGResult[] {
  if (!query) return results;
  const q = query.toLocaleLowerCase("tr-TR");
  return results.filter((r) => r.word.toLocaleLowerCase("tr-TR").includes(q));
}

/**
 * Build OOB swap HTML for the 3 workspace panels.
 */
function oobPanels(
  attempt: { id: string; sourceText: string; chosenWords: string[]; mappingSnapshot: [string, string][] },
  remainingPool: Map<string, number>,
  results: Map<number, DAWGResult[]>,
  totalByGroup: Map<number, number>,
): string {
  return [
    chosenWordsPanel(attempt.chosenWords, attempt.id),
    remainingLettersDisplay(remainingPool),
    suggestionsPanel(results, "", 1, attempt.id, totalByGroup),
  ].join("\n");
}

/**
 * Compute the remaining pool, find available words, group and paginate them.
 */
function computeWorkspaceData(attempt: {
  sourceText: string;
  chosenWords: string[];
  mappingSnapshot: [string, string][];
  wordListId: string;
}) {
  const mapping = buildMappingNormalizer(attempt.mappingSnapshot);
  const remainingPool = computeRemainingPool(
    attempt.sourceText,
    attempt.chosenWords,
    mapping,
  );

  const wordList = getWordList(attempt.wordListId);
  let allResults: DAWGResult[] = [];
  if (wordList) {
    allResults = wordList.dawg.findAvailable(remainingPool, mapping);
  }

  // Re-compute pool after findAvailable (it restores pool state internally)
  const freshPool = computeRemainingPool(
    attempt.sourceText,
    attempt.chosenWords,
    mapping,
  );

  return { remainingPool: freshPool, allResults };
}

export async function handleAttemptRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // POST /attempts — Create new attempt
  if (method === "POST" && path === "/attempts") {
    const formData = await req.formData();
    const sourceText = (formData.get("sourceText") as string) ?? "";
    const wordListId = (formData.get("wordListId") as string) ?? "";

    if (!sourceText || !wordListId) {
      return html("<p>Kaynak metin ve kelime listesi gereklidir.</p>", 400);
    }

    // Load current mapping for snapshot
    const currentMapping = getMappings(wordListId);

    const attempt = createAttempt({
      sourceText,
      wordListId,
      mappingSnapshot: currentMapping.pairs,
      mappingVersion: currentMapping.version,
    });

    return new Response("", {
      status: 204,
      headers: { "HX-Redirect": `/attempts/${encodeURIComponent(attempt.id)}` },
    });
  }

  // POST /attempts/:id/choose — Add a word
  const chooseMatch = path.match(/^\/attempts\/([^/]+)\/choose$/);
  if (method === "POST" && chooseMatch) {
    const id = decodeURIComponent(chooseMatch[1]);
    const formData = await req.formData();
    const word = (formData.get("word") as string) ?? "";

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const updatedChosenWords = [...attempt.chosenWords, word];
    const updated = updateAttempt(id, { chosenWords: updatedChosenWords });

    const { remainingPool, allResults } = computeWorkspaceData(updated);
    const grouped = groupByLetterCount(allResults);
    const totalByGroup = new Map<number, number>();
    for (const [lc, arr] of grouped) {
      totalByGroup.set(lc, arr.length);
    }
    // Paginate: first page
    const paginated = new Map<number, DAWGResult[]>();
    for (const [lc, arr] of grouped) {
      paginated.set(lc, arr.slice(0, PAGE_SIZE));
    }

    return html(oobPanels(updated, remainingPool, paginated, totalByGroup));
  }

  // DELETE /attempts/:id/chosen/:index — Remove word at index
  const removeChosenMatch = path.match(/^\/attempts\/([^/]+)\/chosen\/(\d+)$/);
  if (method === "DELETE" && removeChosenMatch) {
    const id = decodeURIComponent(removeChosenMatch[1]);
    const index = parseInt(removeChosenMatch[2], 10);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const updatedChosenWords = [...attempt.chosenWords];
    if (index >= 0 && index < updatedChosenWords.length) {
      updatedChosenWords.splice(index, 1);
    }
    const updated = updateAttempt(id, { chosenWords: updatedChosenWords });

    const { remainingPool, allResults } = computeWorkspaceData(updated);
    const grouped = groupByLetterCount(allResults);
    const totalByGroup = new Map<number, number>();
    for (const [lc, arr] of grouped) {
      totalByGroup.set(lc, arr.length);
    }
    const paginated = new Map<number, DAWGResult[]>();
    for (const [lc, arr] of grouped) {
      paginated.set(lc, arr.slice(0, PAGE_SIZE));
    }

    return html(oobPanels(updated, remainingPool, paginated, totalByGroup));
  }

  // PUT /attempts/:id/chosen — Reorder chosen words
  const reorderMatch = path.match(/^\/attempts\/([^/]+)\/chosen$/);
  if (method === "PUT" && reorderMatch) {
    const id = decodeURIComponent(reorderMatch[1]);
    const formData = await req.formData();

    // Collect the reordered words from form
    const words: string[] = [];
    let i = 0;
    while (formData.has(`word_${i}`)) {
      words.push(formData.get(`word_${i}`) as string);
      i++;
    }
    // Fallback: try "words" field as comma-separated or "word[]"
    if (words.length === 0) {
      const allWords = formData.getAll("word");
      for (const w of allWords) {
        words.push(w as string);
      }
    }

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const updated = updateAttempt(id, { chosenWords: words });

    const { remainingPool, allResults } = computeWorkspaceData(updated);
    const grouped = groupByLetterCount(allResults);
    const totalByGroup = new Map<number, number>();
    for (const [lc, arr] of grouped) {
      totalByGroup.set(lc, arr.length);
    }
    const paginated = new Map<number, DAWGResult[]>();
    for (const [lc, arr] of grouped) {
      paginated.set(lc, arr.slice(0, PAGE_SIZE));
    }

    return html(oobPanels(updated, remainingPool, paginated, totalByGroup));
  }

  // GET /attempts/:id/suggestions?q=&page=&group= — Suggestions fragment
  const suggestionsMatch = path.match(/^\/attempts\/([^/]+)\/suggestions$/);
  if (method === "GET" && suggestionsMatch) {
    const id = decodeURIComponent(suggestionsMatch[1]);
    const query = url.searchParams.get("q") ?? "";
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const groupFilter = url.searchParams.get("group")
      ? parseInt(url.searchParams.get("group")!, 10)
      : null;

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const { remainingPool, allResults } = computeWorkspaceData(attempt);

    // Filter by query
    const filtered = filterByQuery(allResults, query);

    // Group
    const grouped = groupByLetterCount(filtered);

    // Compute totals before pagination
    const totalByGroup = new Map<number, number>();
    for (const [lc, arr] of grouped) {
      totalByGroup.set(lc, arr.length);
    }

    // If requesting a specific group for "load more", return just those extra items
    if (groupFilter !== null) {
      const groupResults = grouped.get(groupFilter) ?? [];
      const start = (page - 1) * PAGE_SIZE;
      const pageResults = groupResults.slice(start, start + PAGE_SIZE);
      // Return just the word chips for appending
      const wordChips = pageResults
        .map(
          (r) => `<form class="word-chip-form" style="display:inline"
  hx-post="/attempts/${encodeURIComponent(attempt.id)}/choose"
  hx-target=".workspace-panels"
  hx-swap="innerHTML">
  <input type="hidden" name="word" value="${escapeHtml(r.word)}">
  <button type="submit" class="word-chip">${escapeHtml(r.word)}</button>
</form>`,
        )
        .join("");

      const hasMore = start + PAGE_SIZE < groupResults.length;
      const loadMore = hasMore
        ? `<button class="btn btn-load-more"
  hx-get="/attempts/${encodeURIComponent(attempt.id)}/suggestions?q=${encodeURIComponent(query)}&page=${page + 1}&group=${groupFilter}"
  hx-target="#suggestion-group-${groupFilter} .suggestion-words"
  hx-swap="beforeend">Daha fazla...</button>`
        : "";

      return html(wordChips + loadMore);
    }

    // Paginate each group
    const paginated = new Map<number, DAWGResult[]>();
    for (const [lc, arr] of grouped) {
      paginated.set(lc, arr.slice(0, PAGE_SIZE));
    }

    return html(suggestionsPanel(paginated, query, page, attempt.id, totalByGroup));
  }

  // POST /attempts/:id/refresh-mapping — Refresh mapping snapshot
  const refreshMatch = path.match(/^\/attempts\/([^/]+)\/refresh-mapping$/);
  if (method === "POST" && refreshMatch) {
    const id = decodeURIComponent(refreshMatch[1]);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const currentMapping = getMappings(attempt.wordListId);
    const updated = updateAttempt(id, {
      mappingSnapshot: currentMapping.pairs,
      mappingVersion: currentMapping.version,
    });

    const mapping = buildMappingNormalizer(updated.mappingSnapshot);
    const remainingPool = computeRemainingPool(
      updated.sourceText,
      updated.chosenWords,
      mapping,
    );

    const wordList = getWordList(updated.wordListId);
    const wordListName = wordList ? wordList.name : "Bilinmeyen liste";

    return html(workspaceContent(updated, remainingPool, wordListName, false));
  }

  // DELETE /attempts/:id — Delete an attempt
  const deleteMatch = path.match(/^\/attempts\/([^/]+)$/);
  if (method === "DELETE" && deleteMatch) {
    const id = decodeURIComponent(deleteMatch[1]);
    deleteAttempt(id);

    return new Response("", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "HX-Redirect": "/",
      },
    });
  }

  return null;
}

