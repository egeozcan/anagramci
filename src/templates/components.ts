import type { Attempt } from "../store/attempts";
import type { MappingData } from "../store/mappings";
import type { DAWGResult } from "../dawg";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

interface WordListMeta {
  id: string;
  name: string;
  wordCount: number;
}

export function homePageContent(
  attempts: Attempt[],
  wordLists: WordListMeta[],
  mappingsByList: Map<string, MappingData>,
): string {
  const attemptCards = attempts.length > 0
    ? attempts.map((a) => {
        const wl = wordLists.find((w) => w.id === a.wordListId);
        const wordListName = wl ? escapeHtml(wl.name) : "Bilinmeyen liste";
        const date = new Date(a.updatedAt).toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const chosenPreview = a.chosenWords.length > 0
          ? escapeHtml(a.chosenWords.join(" "))
          : "<em>Henüz kelime seçilmedi</em>";

        return `<div class="attempt-card">
  <a href="/attempts/${encodeURIComponent(a.id)}" class="attempt-card-link">
    <div class="attempt-source">${escapeHtml(a.sourceText)}</div>
    <div class="attempt-preview">${chosenPreview}</div>
    <div class="attempt-meta">
      <span class="attempt-wordlist">${wordListName}</span>
      <span class="attempt-date">${date}</span>
    </div>
  </a>
  <button class="btn btn-danger btn-sm"
    hx-delete="/attempts/${encodeURIComponent(a.id)}"
    hx-target="closest .attempt-card"
    hx-swap="outerHTML"
    hx-confirm="Bu denemeyi silmek istediğinize emin misiniz?">Sil</button>
</div>`;
      }).join("\n")
    : `<p class="empty-state">Henüz bir deneme yok. Aşağıdan yeni bir deneme başlatın.</p>`;

  // Build mappings JSON for the word-list-to-mappings relationship so the
  // frontend can populate the mapping dropdown when the word list changes.
  const mappingsJson: Record<string, { version: number; pairCount: number }> = {};
  for (const [listId, data] of mappingsByList) {
    mappingsJson[listId] = { version: data.version, pairCount: data.pairs.length };
  }

  const wordListOptions = wordLists
    .map((wl) => `<option value="${escapeHtml(wl.id)}">${escapeHtml(wl.name)} (${wl.wordCount} kelime)</option>`)
    .join("\n");

  return `<section class="attempts-list">
  <h2>Denemeler</h2>
  ${attemptCards}
</section>

<section class="new-attempt">
  <h2>Yeni Deneme</h2>
  <form hx-post="/attempts" hx-target=".attempts-list" hx-swap="innerHTML" class="new-attempt-form">
    <div class="form-group">
      <label for="sourceText">Kaynak Metin</label>
      <input type="text" id="sourceText" name="sourceText" required
        placeholder="Anagram yapılacak metin..." autocomplete="off">
    </div>
    <div class="form-group">
      <label for="wordListId">Kelime Listesi</label>
      <select id="wordListId" name="wordListId" required>
        <option value="" disabled selected>Bir liste seçin</option>
        ${wordListOptions}
      </select>
    </div>
    <button type="submit" class="btn btn-primary">Denemeyi Başlat</button>
  </form>
</section>`;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function workspaceContent(
  attempt: Attempt,
  remainingPool: Map<string, number>,
  wordListName: string,
  mappingStale: boolean,
): string {
  const staleWarning = mappingStale
    ? `<div class="mapping-stale-warning">
  <span>Harf eşleşmeleri güncellenmiş. Yenilemek ister misiniz?</span>
  <button class="btn btn-warning btn-sm"
    hx-post="/attempts/${encodeURIComponent(attempt.id)}/refresh-mapping"
    hx-target=".workspace"
    hx-swap="innerHTML">Eşleşmeyi Güncelle</button>
</div>`
    : "";

  return `<div class="workspace-header">
  <div class="workspace-source">
    <strong>Kaynak:</strong> ${escapeHtml(attempt.sourceText)}
  </div>
  <div class="workspace-meta">
    <span class="workspace-wordlist">${escapeHtml(wordListName)}</span>
  </div>
  ${staleWarning}
</div>
<div class="workspace-panels">
  ${chosenWordsPanel(attempt.chosenWords, attempt.id)}
  ${remainingLettersDisplay(remainingPool)}
  ${suggestionsPanel(new Map(), "", 1, attempt.id, new Map())}
</div>`;
}

// ---------------------------------------------------------------------------
// Chosen words panel
// ---------------------------------------------------------------------------

export function chosenWordsPanel(chosenWords: string[], attemptId: string): string {
  const phrase = chosenWords.length > 0
    ? `<div class="chosen-phrase">${escapeHtml(chosenWords.join(" "))}</div>`
    : "";

  let wordItems: string;
  if (chosenWords.length === 0) {
    wordItems = `<p class="empty-state">Henüz kelime seçilmedi. Sağ panelden kelime ekleyin.</p>`;
  } else {
    wordItems = `<ol class="chosen-words-list">
${chosenWords
  .map(
    (w, i) => `  <li class="chosen-word-item">
    <span class="chosen-word-text">${escapeHtml(w)}</span>
    <button class="btn btn-remove"
      hx-delete="/attempts/${encodeURIComponent(attemptId)}/chosen/${i}"
      hx-target=".workspace-panels"
      hx-swap="innerHTML"
      title="Kaldır">&times;</button>
  </li>`,
  )
  .join("\n")}
</ol>`;
  }

  return `<div id="chosen-words" class="panel panel-chosen">
  <h3>Seçilen Kelimeler</h3>
  ${phrase}
  ${wordItems}
</div>`;
}

// ---------------------------------------------------------------------------
// Remaining letters display
// ---------------------------------------------------------------------------

export function remainingLettersDisplay(pool: Map<string, number>): string {
  if (pool.size === 0) {
    return `<div id="remaining-letters" class="panel panel-remaining">
  <h3>Kalan Harfler</h3>
  <p class="empty-state">Kalan harf yok</p>
</div>`;
  }

  const sorted = [...pool.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr-TR"));

  const chips = sorted
    .map(
      ([letter, count]) =>
        `<span class="letter-chip">${escapeHtml(letter)}<sup>${count}</sup></span>`,
    )
    .join("");

  return `<div id="remaining-letters" class="panel panel-remaining">
  <h3>Kalan Harfler</h3>
  <div class="letter-chips">${chips}</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Suggestions panel
// ---------------------------------------------------------------------------

export function suggestionsPanel(
  results: Map<number, DAWGResult[]>,
  query: string,
  page: number,
  attemptId: string,
  totalByGroup: Map<number, number>,
): string {
  const escapedQuery = escapeHtml(query);

  const searchBox = `<div class="suggestions-search">
  <input type="search" name="q" value="${escapedQuery}"
    placeholder="Kelime ara..."
    autocomplete="off"
    hx-get="/attempts/${encodeURIComponent(attemptId)}/suggestions"
    hx-trigger="keyup changed delay:300ms"
    hx-target="#suggestions"
    hx-swap="innerHTML"
    hx-indicator=".suggestions-loading">
  <span class="suggestions-loading htmx-indicator">Aranıyor...</span>
</div>`;

  let groupsHtml: string;
  if (results.size === 0 && query === "") {
    groupsHtml = `<p class="empty-state">Arama yaparak kelime önerilerini görüntüleyin.</p>`;
  } else if (results.size === 0) {
    groupsHtml = `<p class="empty-state">Sonuç bulunamadı.</p>`;
  } else {
    const sortedGroups = [...results.entries()].sort((a, b) => b[0] - a[0]);

    groupsHtml = sortedGroups
      .map(([letterCount, words]) => {
        const total = totalByGroup.get(letterCount) ?? words.length;
        const hasMore = words.length < total;

        const wordChips = words
          .map(
            (r) => `<form class="word-chip-form" style="display:inline"
  hx-post="/attempts/${encodeURIComponent(attemptId)}/choose"
  hx-target=".workspace-panels"
  hx-swap="innerHTML">
  <input type="hidden" name="word" value="${escapeHtml(r.word)}">
  <button type="submit" class="word-chip">${escapeHtml(r.word)}</button>
</form>`,
          )
          .join("");

        const loadMore = hasMore
          ? `<button class="btn btn-load-more"
  hx-get="/attempts/${encodeURIComponent(attemptId)}/suggestions?q=${encodeURIComponent(query)}&page=${page + 1}&group=${letterCount}"
  hx-target="#suggestion-group-${letterCount} .suggestion-words"
  hx-swap="beforeend">Daha fazla...</button>`
          : "";

        return `<details class="suggestion-group" id="suggestion-group-${letterCount}" open>
  <summary>${letterCount} harf <span class="suggestion-count">(${total} kelime)</span></summary>
  <div class="suggestion-words">
    ${wordChips}
    ${loadMore}
  </div>
</details>`;
      })
      .join("\n");
  }

  return `<div id="suggestions" class="panel panel-suggestions">
  <h3>Öneriler</h3>
  ${searchBox}
  <div class="suggestion-groups">
    ${groupsHtml}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export function settingsPageContent(
  wordLists: WordListMeta[],
  currentListId: string | null,
  currentMapping: MappingData | null,
): string {
  const listTabs = wordLists
    .map((wl) => {
      const active = wl.id === currentListId ? " active" : "";
      return `<button class="tab${active}"
  hx-get="/settings/mappings/${encodeURIComponent(wl.id)}"
  hx-target="#mapping-editor"
  hx-swap="innerHTML">${escapeHtml(wl.name)}</button>`;
    })
    .join("\n");

  const editorContent =
    currentListId && currentMapping
      ? mappingEditor(currentMapping.pairs, currentListId, currentMapping.version)
      : `<div id="mapping-editor"><p class="empty-state">Düzenlemek için bir kelime listesi seçin.</p></div>`;

  return `<section class="settings">
  <h2>Ayarlar</h2>
  <p class="settings-description">Kelime listelerine göre harf eşleşmelerini yönetin. Eşleşmeler, benzer harflerin (ör. ç &rarr; c) aynı havuzda sayılmasını sağlar.</p>

  <div class="settings-layout">
    <div class="tab-bar">
      ${listTabs}
    </div>
    ${editorContent}
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Mapping editor
// ---------------------------------------------------------------------------

export function mappingEditor(
  pairs: [string, string][],
  wordListId: string,
  version: number,
): string {
  const pairRows = pairs.length > 0
    ? pairs
        .map(
          ([from, to], i) => `<div class="mapping-pair" data-index="${i}">
  <input type="text" name="from" value="${escapeHtml(from)}"
    class="mapping-input mapping-from" placeholder="Kaynak" maxlength="5">
  <span class="mapping-arrow">&rarr;</span>
  <input type="text" name="to" value="${escapeHtml(to)}"
    class="mapping-input mapping-to" placeholder="Hedef" maxlength="5">
  <button type="button" class="btn btn-remove mapping-remove"
    onclick="this.closest('.mapping-pair').remove()"
    title="Kaldır">&times;</button>
</div>`,
        )
        .join("\n")
    : `<p class="empty-state">Henüz eşleşme tanımlanmamış.</p>`;

  return `<div id="mapping-editor">
  <form hx-put="/settings/mappings/${encodeURIComponent(wordListId)}"
    hx-target="#mapping-editor"
    hx-swap="innerHTML"
    class="mapping-form">
    <input type="hidden" name="version" value="${version}">
    <div class="mapping-pairs" id="mapping-pairs">
      ${pairRows}
    </div>
    <div class="mapping-actions">
      <button type="button" class="btn btn-secondary" id="add-pair-btn"
        onclick="addMappingPair()">+ Çift Ekle</button>
      <button type="submit" class="btn btn-primary">Kaydet</button>
      <span class="mapping-version">Sürüm: ${version}</span>
    </div>
  </form>
  <script>
  function addMappingPair() {
    const container = document.getElementById('mapping-pairs');
    // Remove empty-state message if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const div = document.createElement('div');
    div.className = 'mapping-pair';
    div.innerHTML = \`
      <input type="text" name="from" value=""
        class="mapping-input mapping-from" placeholder="Kaynak" maxlength="5">
      <span class="mapping-arrow">&rarr;</span>
      <input type="text" name="to" value=""
        class="mapping-input mapping-to" placeholder="Hedef" maxlength="5">
      <button type="button" class="btn btn-remove mapping-remove"
        onclick="this.closest('.mapping-pair').remove()"
        title="Kaldır">&times;</button>
    \`;
    container.appendChild(div);
  }
  </script>
</div>`;
}
