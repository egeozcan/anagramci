import {
  createAttempt,
  getAttempt,
  updateAttempt,
  deleteAttempt,
} from "../store/attempts";
import type { Attempt } from "../store/attempts";
import { getWordList } from "../store/wordlists";
import { getMappings } from "../store/mappings";
import { buildMappingNormalizer, computeRemainingPool } from "../anagram";
import type { DAWGResult } from "../dawg";
import {
  escapeHtml,
  combinationBlock,
  suggestionsResults,
  workspaceContent,
} from "../templates/components";
import type { SuggestionsData } from "../templates/components";

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
 * Compute the remaining pool and available words for a single combination.
 */
function computeWorkspaceData(
  sourceText: string,
  chosenWords: string[],
  mappingSnapshot: [string, string][],
  wordListId: string,
) {
  const mapping = buildMappingNormalizer(mappingSnapshot);
  const remainingPool = computeRemainingPool(sourceText, chosenWords, mapping);

  const wordList = getWordList(wordListId);
  let allResults: DAWGResult[] = [];
  if (wordList) {
    allResults = wordList.dawg.findAvailable(remainingPool, mapping);
  }

  // Re-compute pool after findAvailable (it restores pool state internally)
  const freshPool = computeRemainingPool(sourceText, chosenWords, mapping);

  return { remainingPool: freshPool, allResults };
}

/**
 * Compute paginated suggestions data for a combination.
 */
function computeSuggestionsData(allResults: DAWGResult[]): SuggestionsData {
  const grouped = groupByLetterCount(allResults);
  const totalByGroup = new Map<number, number>();
  for (const [lc, arr] of grouped) {
    totalByGroup.set(lc, arr.length);
  }
  const paginated = new Map<number, DAWGResult[]>();
  for (const [lc, arr] of grouped) {
    paginated.set(lc, arr.slice(0, PAGE_SIZE));
  }
  return { results: paginated, totalByGroup };
}

/**
 * Render a full combination block for a specific combination index.
 */
function renderCombinationBlock(attempt: Attempt, ci: number): string {
  const { remainingPool, allResults } = computeWorkspaceData(
    attempt.sourceText,
    attempt.combinations[ci],
    attempt.mappingSnapshot,
    attempt.wordListId,
  );
  const suggestions = computeSuggestionsData(allResults);
  return combinationBlock(ci, attempt.combinations[ci], remainingPool, attempt.id, attempt.combinations.length, suggestions);
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

  // POST /attempts/:id/choose — Add a word to a combination
  const chooseMatch = path.match(/^\/attempts\/([^/]+)\/choose$/);
  if (method === "POST" && chooseMatch) {
    const id = decodeURIComponent(chooseMatch[1]);
    const formData = await req.formData();
    const word = (formData.get("word") as string) ?? "";
    const ci = parseInt((formData.get("ci") as string) ?? "0", 10);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const combinations = attempt.combinations.map((c) => [...c]);
    if (ci >= 0 && ci < combinations.length) {
      combinations[ci].push(word);
    }
    const updated = updateAttempt(id, { combinations });

    return html(renderCombinationBlock(updated, ci));
  }

  // DELETE /attempts/:id/chosen/:index?ci= — Remove word at index from a combination
  const removeChosenMatch = path.match(/^\/attempts\/([^/]+)\/chosen\/(\d+)$/);
  if (method === "DELETE" && removeChosenMatch) {
    const id = decodeURIComponent(removeChosenMatch[1]);
    const index = parseInt(removeChosenMatch[2], 10);
    const ci = parseInt(url.searchParams.get("ci") ?? "0", 10);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const combinations = attempt.combinations.map((c) => [...c]);
    if (ci >= 0 && ci < combinations.length) {
      if (index >= 0 && index < combinations[ci].length) {
        combinations[ci].splice(index, 1);
      }
    }
    const updated = updateAttempt(id, { combinations });

    return html(renderCombinationBlock(updated, ci));
  }

  // PUT /attempts/:id/chosen — Reorder chosen words in a combination
  const reorderMatch = path.match(/^\/attempts\/([^/]+)\/chosen$/);
  if (method === "PUT" && reorderMatch) {
    const id = decodeURIComponent(reorderMatch[1]);
    const formData = await req.formData();
    const ci = parseInt((formData.get("ci") as string) ?? "0", 10);

    // Collect the reordered words from form
    const words: string[] = [];
    let i = 0;
    while (formData.has(`word_${i}`)) {
      words.push(formData.get(`word_${i}`) as string);
      i++;
    }
    // Fallback: try "word[]"
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

    const combinations = attempt.combinations.map((c) => [...c]);
    if (ci >= 0 && ci < combinations.length) {
      combinations[ci] = words;
    }
    const updated = updateAttempt(id, { combinations });

    return html(renderCombinationBlock(updated, ci));
  }

  // GET /attempts/:id/suggestions?q=&page=&group=&ci= — Suggestions fragment
  const suggestionsMatch = path.match(/^\/attempts\/([^/]+)\/suggestions$/);
  if (method === "GET" && suggestionsMatch) {
    const id = decodeURIComponent(suggestionsMatch[1]);
    const query = url.searchParams.get("q") ?? "";
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const ci = parseInt(url.searchParams.get("ci") ?? "0", 10);
    const groupFilter = url.searchParams.get("group")
      ? parseInt(url.searchParams.get("group")!, 10)
      : null;

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const chosenWords = attempt.combinations[ci] ?? [];
    const { allResults } = computeWorkspaceData(
      attempt.sourceText,
      chosenWords,
      attempt.mappingSnapshot,
      attempt.wordListId,
    );

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
  hx-target="#combination-${ci}"
  hx-swap="outerHTML">
  <input type="hidden" name="word" value="${escapeHtml(r.word)}">
  <input type="hidden" name="ci" value="${ci}">
  <button type="submit" class="word-chip">${escapeHtml(r.word)}</button>
</form>`,
        )
        .join("");

      const hasMore = start + PAGE_SIZE < groupResults.length;
      const loadMore = hasMore
        ? `<button class="btn btn-load-more"
  hx-get="/attempts/${encodeURIComponent(attempt.id)}/suggestions?q=${encodeURIComponent(query)}&page=${page + 1}&group=${groupFilter}&ci=${ci}"
  hx-target="#suggestion-group-${ci}-${groupFilter} .suggestion-words"
  hx-swap="beforeend">Daha fazla...</button>`
        : "";

      return html(wordChips + loadMore);
    }

    // Paginate each group
    const paginated = new Map<number, DAWGResult[]>();
    for (const [lc, arr] of grouped) {
      paginated.set(lc, arr.slice(0, PAGE_SIZE));
    }

    return html(suggestionsResults(paginated, query, page, attempt.id, totalByGroup, ci));
  }

  // POST /attempts/:id/combinations — Add a new empty combination
  const addCombinationMatch = path.match(/^\/attempts\/([^/]+)\/combinations$/);
  if (method === "POST" && addCombinationMatch) {
    const id = decodeURIComponent(addCombinationMatch[1]);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const combinations = [...attempt.combinations, []];
    const updated = updateAttempt(id, { combinations });

    const newCi = updated.combinations.length - 1;
    return html(renderCombinationBlock(updated, newCi));
  }

  // DELETE /attempts/:id/combinations/:ci — Remove a combination
  const deleteCombinationMatch = path.match(/^\/attempts\/([^/]+)\/combinations\/(\d+)$/);
  if (method === "DELETE" && deleteCombinationMatch) {
    const id = decodeURIComponent(deleteCombinationMatch[1]);
    const ci = parseInt(deleteCombinationMatch[2], 10);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    // Must keep at least 1 combination
    if (attempt.combinations.length <= 1) {
      return html("<p>En az bir kombinasyon olmalidir.</p>", 400);
    }

    const combinations = [...attempt.combinations];
    if (ci >= 0 && ci < combinations.length) {
      combinations.splice(ci, 1);
    }
    const updated = updateAttempt(id, { combinations });

    // Return ALL remaining combination blocks (handles index shifting)
    const blocks = updated.combinations.map((_, i) =>
      renderCombinationBlock(updated, i),
    ).join("\n");
    return html(blocks);
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

    const remainingPools: Map<string, number>[] = [];
    const suggestionsPerCombination: SuggestionsData[] = [];
    for (let i = 0; i < updated.combinations.length; i++) {
      const { remainingPool, allResults } = computeWorkspaceData(
        updated.sourceText,
        updated.combinations[i],
        updated.mappingSnapshot,
        updated.wordListId,
      );
      remainingPools.push(remainingPool);
      suggestionsPerCombination.push(computeSuggestionsData(allResults));
    }

    const wordList = getWordList(updated.wordListId);
    const wordListName = wordList ? wordList.name : "Bilinmeyen liste";

    return html(workspaceContent(updated, remainingPools, wordListName, false, suggestionsPerCombination));
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
