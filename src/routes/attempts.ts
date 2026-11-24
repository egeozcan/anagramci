import {
  createAttempt,
  getAttempt,
  updateAttempt,
  deleteAttempt,
  getBans,
  withBans,
} from "../store/attempts";
import type { Attempt } from "../store/attempts";
import { getWordList } from "../store/wordlists";
import { getMappings } from "../store/mappings";
import { buildMappingNormalizer, computeRemainingPool } from "../anagram";
import type { DAWGResult } from "../dawg";
import {
  combinationBlock,
  fillSection,
  wordChipForm,
  suggestionsResults,
  workspaceContent,
} from "../templates/components";
import type { SuggestionsData } from "../templates/components";
import { findFullAnagrams } from "../fill";
import type { FillResult } from "../fill";
import { getHiddenWords, hideWord, unhideWord } from "../store/hidden";
import { lookupRevealSlug } from "../store/reveals";

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

export interface WorkspaceData {
  remainingPool: Map<string, number>;
  allResults: DAWGResult[];
  hiddenWords: string[];
  bannedWords: string[];
  fill: FillResult | undefined;
}

/**
 * Compute the remaining pool, available words (minus words hidden for the
 * word list and words banned for this combination) and, when requested, the
 * full-anagram "Tamamla" solutions for combination `ci`.
 */
export function computeWorkspaceData(attempt: Attempt, ci: number, withFill = false): WorkspaceData {
  const mapping = buildMappingNormalizer(attempt.mappingSnapshot);
  const chosenWords = attempt.combinations[ci] ?? [];
  const remainingPool = computeRemainingPool(attempt.sourceText, chosenWords, mapping);
  const hiddenWords = getHiddenWords(attempt.wordListId);
  const bannedWords = getBans(attempt, ci);
  const excluded = new Set([...hiddenWords, ...bannedWords]);

  const wordList = getWordList(attempt.wordListId);
  let allResults: DAWGResult[] = [];
  if (wordList) {
    allResults = wordList.dawg.findAvailable(new Map(remainingPool), mapping);
    if (excluded.size > 0) allResults = allResults.filter((r) => !excluded.has(r.word));
  }

  const fill = withFill ? findFullAnagrams(allResults, remainingPool, mapping) : undefined;
  return { remainingPool, allResults, hiddenWords, bannedWords, fill };
}

/**
 * Compute paginated suggestions data for a combination.
 */
export function computeSuggestionsData({ allResults, hiddenWords, bannedWords, fill }: WorkspaceData): SuggestionsData {
  const grouped = groupByLetterCount(allResults);
  const totalByGroup = new Map<number, number>();
  for (const [lc, arr] of grouped) {
    totalByGroup.set(lc, arr.length);
  }
  const paginated = new Map<number, DAWGResult[]>();
  for (const [lc, arr] of grouped) {
    paginated.set(lc, arr.slice(0, PAGE_SIZE));
  }
  return { results: paginated, totalByGroup, hiddenWords, bannedWords, fill };
}

/**
 * Render a full combination block for a specific combination index.
 * Open blocks get Tamamla computed inline; closed ones get a lazy placeholder.
 */
function renderCombinationBlock(
  attempt: Attempt,
  ci: number,
  open = true,
): string {
  const data = computeWorkspaceData(attempt, ci, open);
  const suggestions = computeSuggestionsData(data);
  const words = attempt.combinations[ci];
  const revealSlug = lookupRevealSlug(attempt.id, words);
  return combinationBlock(ci, words, data.remainingPool, attempt.id, attempt.combinations.length, suggestions, attempt.mappingSnapshot, attempt.sourceText, open, revealSlug);
}

/** Render every combination block, opening those whose index is in `open`. */
function renderAllBlocks(attempt: Attempt, open: Set<number>): string {
  return attempt.combinations.map((_, i) => renderCombinationBlock(attempt, i, open.has(i))).join("\n");
}

function parseOpenParam(raw: string | null): Set<number> {
  return new Set((raw ?? "").split(",").filter(Boolean).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)));
}

export async function handleAttemptRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // POST /attempts — Create new attempt
  if (method === "POST" && path === "/attempts") {
    const formData = await req.formData();
    const sourceText = ((formData.get("sourceText") as string) ?? "").trim();
    const wordListId = (formData.get("wordListId") as string) ?? "";

    if (!sourceText || !wordListId) {
      return html("<p>Kaynak metin ve kelime listesi gereklidir.</p>", 400);
    }
    if (!getWordList(wordListId)) {
      return html("<p>Bilinmeyen kelime listesi.</p>", 400);
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
    const raw = ((formData.get("word") as string) ?? "").trim().toLocaleLowerCase("tr-TR");
    const ci = parseInt((formData.get("ci") as string) ?? "0", 10);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }

    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return html(renderCombinationBlock(attempt, ci));
    }

    const combinations = attempt.combinations.map((c) => [...c]);
    if (ci >= 0 && ci < combinations.length) {
      combinations[ci].push(...words);
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

    const { remainingPool, allResults } = computeWorkspaceData(attempt, ci);
    let remainingLetterCount = 0;
    for (const count of remainingPool.values()) remainingLetterCount += count;

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
      const isCompleteGroup = remainingLetterCount > 0 && groupFilter === remainingLetterCount;
      // Return just the word chips for appending
      const wordChips = pageResults.map((r) => wordChipForm(r.word, attempt.id, ci, isCompleteGroup)).join("");

      const hasMore = start + PAGE_SIZE < groupResults.length;
      const loadMore = hasMore
        ? `<button class="btn btn-load-more"
  hx-get="/attempts/${encodeURIComponent(attempt.id)}/suggestions?q=${encodeURIComponent(query)}&page=${page + 1}&group=${groupFilter}&ci=${ci}"
  hx-swap="outerHTML">Daha fazla...</button>`
        : "";

      return html(wordChips + loadMore);
    }

    // Paginate each group
    const paginated = new Map<number, DAWGResult[]>();
    for (const [lc, arr] of grouped) {
      paginated.set(lc, arr.slice(0, PAGE_SIZE));
    }

    return html(suggestionsResults(paginated, query, page, attempt.id, totalByGroup, ci, remainingLetterCount));
  }

  // GET /attempts/:id/fill?ci= — Tamamla (full-anagram) section fragment
  const fillMatch = path.match(/^\/attempts\/([^/]+)\/fill$/);
  if (method === "GET" && fillMatch) {
    const id = decodeURIComponent(fillMatch[1]);
    const ci = parseInt(url.searchParams.get("ci") ?? "0", 10);
    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }
    if (!Number.isInteger(ci) || ci < 0 || ci >= attempt.combinations.length) {
      return html("<p>Geçersiz kombinasyon.</p>", 400);
    }
    const { remainingPool, fill } = computeWorkspaceData(attempt, ci, true);
    return html(fillSection(fill, remainingPool, attempt.combinations[ci], attempt.id, ci));
  }

  // POST /attempts/:id/ban (word, ci) — ban a word from one combination
  // DELETE /attempts/:id/ban?word=&ci= — unban it
  // Bans are per combination, so only that block is re-rendered.
  const banMatch = path.match(/^\/attempts\/([^/]+)\/ban$/);
  if ((method === "POST" || method === "DELETE") && banMatch) {
    const id = decodeURIComponent(banMatch[1]);
    const params = method === "POST" ? await req.formData() : url.searchParams;
    const word = ((params.get("word") as string | null) ?? "").trim().toLocaleLowerCase("tr-TR");
    const ci = parseInt((params.get("ci") as string | null) ?? "0", 10);

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }
    if (!Number.isInteger(ci) || ci < 0 || ci >= attempt.combinations.length) {
      return html("<p>Geçersiz kombinasyon.</p>", 400);
    }
    if (!word) return html(renderCombinationBlock(attempt, ci));

    const bans = withBans(attempt, ci, (current) =>
      method === "POST" ? [...current, word] : current.filter((w) => w !== word),
    );
    const updated = updateAttempt(id, { bans });
    return html(renderCombinationBlock(updated, ci));
  }

  // POST /attempts/:id/hide (word, open) — hide a word for this word list
  // DELETE /attempts/:id/hide?word=&open= — unhide it
  // Both re-render all blocks, since hidden words affect every combination.
  const hideMatch = path.match(/^\/attempts\/([^/]+)\/hide$/);
  if ((method === "POST" || method === "DELETE") && hideMatch) {
    const id = decodeURIComponent(hideMatch[1]);
    let word: string;
    let open: Set<number>;
    if (method === "POST") {
      const formData = await req.formData();
      word = (formData.get("word") as string) ?? "";
      open = parseOpenParam(formData.get("open") as string | null);
    } else {
      word = url.searchParams.get("word") ?? "";
      open = parseOpenParam(url.searchParams.get("open"));
    }

    const attempt = getAttempt(id);
    if (!attempt) {
      return html("<p>Deneme bulunamadi.</p>", 404);
    }
    if (method === "POST") hideWord(attempt.wordListId, word);
    else unhideWord(attempt.wordListId, word);

    return html(renderAllBlocks(attempt, open));
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
    const bans = attempt.combinations.map((_, i) => getBans(attempt, i));
    if (ci >= 0 && ci < combinations.length) {
      combinations.splice(ci, 1);
      bans.splice(ci, 1);
    }
    const updated = updateAttempt(id, { combinations, bans });

    // Return ALL remaining combination blocks (handles index shifting)
    const blocks = updated.combinations.map((_, i) => renderCombinationBlock(updated, i, true)).join("\n");
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
      const data = computeWorkspaceData(updated, i);
      remainingPools.push(data.remainingPool);
      suggestionsPerCombination.push(computeSuggestionsData(data));
    }

    const wordList = getWordList(updated.wordListId);
    const wordListName = wordList ? wordList.name : "Bilinmeyen liste";

    const revealSlugs = updated.combinations.map((words) => lookupRevealSlug(updated.id, words));
    return html(workspaceContent(updated, remainingPools, wordListName, false, suggestionsPerCombination, revealSlugs));
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
