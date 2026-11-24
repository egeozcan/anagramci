import { readFileSync } from "fs";
import type { Reveal } from "../store/reveals";
import { NOTE_MAX, TITLE_MAX } from "../store/reveals";
import { buildPuzzle, encodePuzzle, isPuzzle, tileGlyphs } from "../reveal-puzzle";
import type { RevealPuzzle } from "../reveal-puzzle";
import { escapeHtml } from "./components";

// ---------------------------------------------------------------------------
// Vitrin templates: reveal page, standalone export, gallery, workspace hooks.
//
// Spoiler rule: on the reveal page the source exists ONLY inside the base64
// `data-puzzle` payload — never in visible text, <title>, tiles or other
// attributes. Fixed (punctuation) glyphs are filled in by reveal.js. The
// gallery's hidden `.card-source` is the one place plaintext source is served.
// ---------------------------------------------------------------------------

export const DEFAULT_TITLE = "Bir anagram";
export const SEND_MESSAGE =
  "Sana bir anagram bulmacası gönderdim 🧩 Ekteki dosyayı aç, kaynağı bul. 3 ipucu hakkın var — sonucunu bana geri yapıştır!";
const SCORE_TIP = "Harflerin ne kadar yer değiştirdiği (0 = hiç, 100 = tamamen ters)";
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bitter:wght@400;500;600;700&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">`;

const fileCache = new Map<string, string>();
function staticText(path: string): string {
  let text = fileCache.get(path);
  if (text === undefined) {
    text = readFileSync(path, "utf-8");
    fileCache.set(path, text);
  }
  return text;
}

/** Inline-safe: a literal `</script` / `</style` would end the element early. */
function inlineSafe(text: string, tag: "script" | "style"): string {
  return text.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
}

function revealPath(slug: string): string {
  return `/r/${encodeURIComponent(slug)}`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Minimal shell for reveal pages (no HTMX). Unlike `layout()`, it escapes the
 * title. `standalone` inlines style.css, reveal.css and reveal.js so the page
 * works from file:// with no server references.
 */
export function revealLayout(opts: { title: string; body: string; standalone?: boolean }): string {
  const title = escapeHtml(opts.title || DEFAULT_TITLE);
  const head = opts.standalone
    ? `<style>\n${inlineSafe(staticText("static/style.css"), "style")}\n${inlineSafe(staticText("static/reveal.css"), "style")}\n</style>`
    : `<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png">
  <link rel="stylesheet" href="/static/style.css">
  <link rel="stylesheet" href="/static/reveal.css">`;
  const nav = opts.standalone
    ? `<nav><span class="reveal-brand">Anagramcı</span></nav>`
    : `<nav>
    <a href="/" class="logo"><img src="/static/logo.svg" alt="Anagramcı" height="28"></a>
    <div class="nav-links">
      <a href="/vitrin">Vitrin</a>
    </div>
  </nav>`;
  const script = opts.standalone
    ? `<script>\n${inlineSafe(staticText("static/reveal.js"), "script")}\n</script>`
    : `<script src="/static/reveal.js" defer></script>`;
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Anagramcı</title>
  ${FONTS}
  ${head}
</head>
<body class="reveal-page">
  ${nav}
  <main class="reveal-main">${opts.body}</main>
  ${script}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Reveal stage
// ---------------------------------------------------------------------------

/** "Bulmacayı gönder" panel: download the standalone file, copy the message. */
export function sendPanel(slug: string): string {
  return `<details class="send-panel">
  <summary class="btn btn-secondary">Bulmacayı gönder (.html)</summary>
  <div class="send-panel-body">
    <a class="btn btn-primary" href="${revealPath(slug)}/bulmaca.html" download="anagram-${escapeHtml(slug)}.html">Dosyayı indir</a>
    <button type="button" class="btn btn-secondary btn-copy" data-copy="${escapeHtml(SEND_MESSAGE)}">Mesajı kopyala</button>
    <p class="send-note">Dosya internetsiz de açılır; skorun o tarayıcıda saklanır.</p>
  </div>
</details>`;
}

/** Longest group length, so CSS can shrink tiles/slots to fit long words. */
function maxLen(groups: unknown[][]): number {
  return Math.max(1, ...groups.map((g) => g.length));
}

export function revealStage(
  reveal: Reveal,
  puzzle: RevealPuzzle,
  opts: { mode?: "tek" | "oyun"; standalone?: boolean } = {},
): string {
  const title = reveal.title || DEFAULT_TITLE;
  const standalone = !!opts.standalone;
  const mode = !standalone && opts.mode === "oyun" ? "oyun" : "tek";

  let ti = 0;
  const glyphGroups = tileGlyphs(reveal.words);
  const tiles = glyphGroups
    .map((glyphs) => `<span class="reveal-word">${glyphs
      .map((g) => `<button type="button" class="tile" data-ti="${ti++}" aria-label="${escapeHtml(g)}">${escapeHtml(g)}</button>`)
      .join("")}</span>`)
    .join("");

  // Group cells by source token; letter-less tokens are fixed groups.
  const tokens: number[][] = [];
  puzzle.cells.forEach((c, i) => (tokens[c.w] ??= []).push(i));
  const shape: number[] = [];
  const slots = tokens
    .map((cellIdxs) => {
      const fixedGroup = cellIdxs.every((i) => puzzle.cells[i].f);
      if (!fixedGroup) shape.push(cellIdxs.filter((i) => !puzzle.cells[i].f).length);
      const spans = cellIdxs
        .map((i) => `<span class="slot${puzzle.cells[i].f ? " slot--fixed" : ""}" data-cell="${i}"></span>`)
        .join("");
      return `<span class="slot-word${fixedGroup ? " slot-word--fixed" : ""}">${spans}</span>`;
    })
    .join("");

  const note = reveal.note ? `<p class="reveal-note">${escapeHtml(reveal.note)}</p>` : "";
  const footer = standalone
    ? ""
    : `<footer class="reveal-footer">
    <button type="button" class="btn btn-secondary btn-copy" data-copy-path="${revealPath(reveal.slug)}">Bağlantıyı kopyala</button>
    ${sendPanel(reveal.slug)}
  </footer>`;

  return `<section class="reveal-stage" data-slug="${escapeHtml(reveal.slug)}" data-mode="${mode}" data-title="${escapeHtml(title)}"${standalone ? " data-standalone" : ""} data-puzzle="${escapeHtml(encodePuzzle(puzzle))}" style="--tile-n:${maxLen(glyphGroups)};--slot-n:${maxLen(tokens)}">
  <p class="play-bar" hidden></p>
  <header class="reveal-head">
    <h1 class="reveal-title">${escapeHtml(title)}</h1>
    ${note}
  </header>
  <div class="reveal-tiles" role="group" aria-label="Karışık harfler — dokunarak yaz">${tiles}</div>
  <div class="reveal-slots" aria-label="Gizli kaynak: ${shape.join(" · ")} harf">${slots}</div>
  <form class="guess-form" autocomplete="off">
    <label class="visually-hidden" for="guess-input">Tahmin</label>
    <input id="guess-input" class="guess-input" name="guess" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Kaynaktan bir kelime yaz…" autofocus>
    <button type="submit" class="btn btn-primary btn-dene">Dene</button>
  </form>
  <div class="reveal-controls">
    <button type="button" class="btn btn-secondary btn-tap-back" aria-label="Son harfi sil">⌫</button>
    <button type="button" class="btn btn-secondary btn-tap-space">␣ Boşluk</button>
    <button type="button" class="btn btn-secondary btn-hint">İpucu 0/3</button>
    <button type="button" class="btn btn-secondary btn-solve">Çöz</button>
  </div>
  <p class="reveal-status"><span>Iska: <b class="miss-count">0</b></span><span class="reveal-feedback" aria-live="polite"></span></p>
  <div class="reveal-result" hidden>
    <p class="result-score" title="${SCORE_TIP}"></p>
    <p class="result-line"></p>
    <div class="result-actions">
      <button type="button" class="btn btn-primary btn-copy-result">Sonucu kopyala</button>
      <button type="button" class="btn btn-secondary btn-replay">Tekrar oynat</button>
      <button type="button" class="btn btn-primary btn-next" hidden>Sıradaki →</button>
      ${standalone ? "" : shareMenu(reveal.slug)}
    </div>
    <div class="round-summary" hidden></div>
  </div>
  <p class="reveal-keys">Kısayollar: <kbd>Boşluk</kbd>/<kbd>Enter</kbd> dene · <kbd>Esc</kbd> sonra <kbd>H</kbd> ipucu · <kbd>R</kbd> çöz / tekrar${mode === "oyun" ? " · <kbd>N</kbd> sıradaki" : ""}</p>
  ${footer}
</section>`;
}

export function revealNotFound(): string {
  return `<section class="reveal-missing">
  <h1 class="reveal-title">Anagram bulunamadı</h1>
  <p>Bu bağlantı silinmiş ya da hiç var olmamış olabilir.</p>
  <p><a class="btn btn-primary" href="/vitrin">Vitrine dön</a></p>
</section>`;
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export function galleryCard(r: Reveal): string {
  const p = buildPuzzle(r);
  const puzzle = isPuzzle(p) ? p : null;
  const glyphGroups = tileGlyphs(r.words);
  const mosaic = glyphGroups
    .map((glyphs) => `<span class="mini-word">${glyphs.map((g) => `<span class="mini-tile">${escapeHtml(g)}</span>`).join("")}</span>`)
    .join("");
  const meta: string[] = [];
  if (r.seed) {
    if (r.note) meta.push(`<span>${escapeHtml(r.note)}</span>`);
  } else {
    meta.push(`<span>${new Date(r.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</span>`);
  }
  if (puzzle) {
    meta.push(`<span>${puzzle.letterCells.length} harf</span>`);
    meta.push(`<span title="${SCORE_TIP}">Karışım %${puzzle.score}</span>`);
  }
  const remove = r.seed
    ? ""
    : `<button type="button" class="btn btn-danger btn-sm card-remove"
    hx-delete="${revealPath(r.slug)}"
    hx-confirm="Bu anagram vitrinden kaldırılsın mı?"
    hx-target="closest .gallery-card"
    hx-swap="outerHTML">Kaldır</button>`;
  return `<article class="gallery-card" data-slug="${escapeHtml(r.slug)}">
  <div class="card-mosaic" aria-hidden="true" style="--mini-n:${maxLen(glyphGroups)}">${mosaic}</div>
  <h3 class="card-title"><a class="card-link" href="${revealPath(r.slug)}">${escapeHtml(r.title || DEFAULT_TITLE)}</a></h3>
  <span class="card-source">${escapeHtml(r.sourceText)}</span>
  <p class="card-meta">${meta.join('<span aria-hidden="true"> · </span>')}</p>
  <div class="card-foot">
    <span class="card-stars" data-slug="${escapeHtml(r.slug)}" title="En iyi skorun">—</span>
    ${remove}
  </div>
</article>`;
}

function galleryCount(total: number, oob = false): string {
  return `<span class="gallery-count" id="gallery-count"${oob ? ' hx-swap-oob="true"' : ""}>· ${total} anagram</span>`;
}

function userRevealsSection(userReveals: Reveal[], oob = false): string {
  const inner = userReveals.length > 0
    ? `<div class="gallery-grid">${userReveals.map(galleryCard).join("\n")}</div>`
    : `<p class="empty-state">Henüz sergilenen bir anagram yok. Bir kombinasyonu mükemmel hale getirip ✦ Sergile'ye bas.</p>`;
  return `<div id="user-reveals"${oob ? ' hx-swap-oob="true"' : ""}>${inner}</div>`;
}

/** OOB updates sent with DELETE /r/:slug: header count, and the empty state once no user reveal is left. */
export function galleryAfterDelete(userReveals: Reveal[], seeds: Reveal[]): string {
  const count = galleryCount(userReveals.length + seeds.length, true);
  return userReveals.length > 0 ? count : count + userRevealsSection(userReveals, true);
}

export function galleryContent(userReveals: Reveal[], seeds: Reveal[]): string {
  const total = userReveals.length + seeds.length;
  const userGrid = userRevealsSection(userReveals);
  const seedGrid = seeds.length > 0 ? `<div class="gallery-grid">${seeds.map(galleryCard).join("\n")}</div>` : "";
  return `<section class="gallery">
  <header class="gallery-head">
    <h2>Vitrin ${galleryCount(total)}</h2>
    <label class="gallery-toggle"><input type="checkbox" id="show-sources"> Kaynakları göster</label>
    <button type="button" class="btn btn-primary btn-kendini-sina">✦ Kendini sına</button>
  </header>
  <h3 class="gallery-section-title">Senin anagramların</h3>
  ${userGrid}
  ${seeds.length > 0 ? `<h3 class="gallery-section-title">Hazır bulmacalar</h3>\n  ${seedGrid}` : ""}
</section>`;
}

// ---------------------------------------------------------------------------
// Workspace hooks (Sergile flow)
// ---------------------------------------------------------------------------

export function sergileButton(attemptId: string, ci: number): string {
  return `<button type="button" class="btn btn-sm btn-sergile"
    hx-get="/attempts/${encodeURIComponent(attemptId)}/reveal-form?ci=${ci}"
    hx-target="#reveal-slot-${ci}"
    hx-swap="innerHTML"
    title="Bu anagramı vitrine koy">✦ Sergile</button>`;
}

export function revealBadge(slug: string): string {
  return `<a class="reveal-badge" href="${revealPath(slug)}" title="Sergilendi — aç" aria-label="Sergilendi — aç">✦</a>`;
}

/** The summary marker span: badge when a reveal exists, Sergile otherwise. */
export function revealMark(attemptId: string, ci: number, slug: string | null, oob = false): string {
  return `<span id="reveal-mark-${ci}" class="reveal-mark"${oob ? ' hx-swap-oob="true"' : ""}>${slug ? revealBadge(slug) : sergileButton(attemptId, ci)}</span>`;
}

export function revealForm(attemptId: string, ci: number): string {
  return `<form class="reveal-form"
  hx-post="/attempts/${encodeURIComponent(attemptId)}/reveals"
  hx-target="#reveal-slot-${ci}"
  hx-swap="innerHTML">
  <input type="hidden" name="ci" value="${ci}">
  <div class="form-group">
    <label for="reveal-title-${ci}">Başlık <span class="form-optional">(isteğe bağlı)</span></label>
    <input type="text" id="reveal-title-${ci}" name="title" maxlength="${TITLE_MAX}" placeholder="${DEFAULT_TITLE}" autocomplete="off">
  </div>
  <div class="form-group">
    <label for="reveal-note-${ci}">Not <span class="form-optional">(isteğe bağlı)</span></label>
    <input type="text" id="reveal-note-${ci}" name="note" maxlength="${NOTE_MAX}" placeholder="Ör. bir ipucu ya da ithaf" autocomplete="off">
  </div>
  <div class="reveal-form-actions">
    <button type="submit" class="btn btn-primary">✦ Sergile</button>
    <button type="button" class="btn btn-secondary btn-reveal-cancel">Vazgeç</button>
  </div>
</form>`;
}

export function revealError(message: string): string {
  return `<div class="reveal-error" role="alert">${escapeHtml(message)} <button type="button" class="btn btn-secondary btn-sm btn-reveal-cancel">Kapat</button></div>`;
}

export function revealCreated(reveal: Reveal, reused = false): string {
  const path = revealPath(reveal.slug);
  const reuseNote = reused
    ? `\n  <p class="reveal-created-note">Bu kombinasyon zaten sergilenmiş; mevcut başlık ve not korundu.</p>`
    : "";
  return `<div class="reveal-created">
  <p class="reveal-created-title">Sergilendi ✦ <a href="${path}">${escapeHtml(path)}</a></p>${reuseNote}
  <div class="reveal-created-actions">
    <a class="btn btn-primary btn-sm" href="${path}" target="_blank" rel="noopener">Aç</a>
    <button type="button" class="btn btn-secondary btn-sm btn-copy" data-copy-path="${path}">Bağlantıyı kopyala</button>
    ${sendPanel(reveal.slug)}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Share card (SVG; PNG is rasterized client-side from it)
// ---------------------------------------------------------------------------

export const CARD_W = 1200;
export const CARD_H = 630;
const CARD_CONTENT_W = 1040;
const CARD_MAX_LINES = 3;

export type CardLayout =
  | { mode: "tiles"; size: number; lines: number[][] }
  | { mode: "text" };

const tileGap = (size: number) => Math.round(size * 0.1);
const wordGap = (size: number) => Math.round(size * 0.5);
const wordWidth = (len: number, size: number) => len * size + (len - 1) * tileGap(size);

/**
 * Fit the anagram's words as tile rows into the card's content box: tiles
 * start at 64px and shrink by 4px down to 28px, at most 3 lines, words never
 * break. Returns `{ mode: "text" }` when nothing fits.
 */
export function layoutCardTiles(wordLengths: number[]): CardLayout {
  for (let size = 64; size >= 28; size -= 4) {
    if (wordLengths.some((len) => wordWidth(len, size) > CARD_CONTENT_W)) continue;
    const lines: number[][] = [];
    let width = 0;
    wordLengths.forEach((len, i) => {
      const w = wordWidth(len, size);
      const cur = lines[lines.length - 1];
      if (cur && width + wordGap(size) + w <= CARD_CONTENT_W) {
        cur.push(i);
        width += wordGap(size) + w;
      } else {
        lines.push([i]);
        width = w;
      }
    });
    if (lines.length <= CARD_MAX_LINES) return { mode: "tiles", size, lines };
  }
  return { mode: "text" };
}

/** Wrap words into at most `maxLines` lines of ~`perLine` chars, "…" when cut. */
function wrapText(words: string[], perLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && [...last].length + 1 + [...w].length <= perLine) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]} …`;
    return kept;
  }
  return lines;
}

const CARD_COLORS = {
  bg: "#f0ebe3",
  surface: "#faf7f2",
  text: "#2c2520",
  muted: "#9e9184",
  secondary: "#6b5e52",
  border: "#b0a494",
  primary: "#5a7c65",
  fills: ["#f2e8dd", "#e4ede7", "#f5eddf", "#ece6db"],
};

/**
 * 1200×630 share card: title, the anagram as mosaic tiles (or wrapped text
 * when it doesn't fit), and the source in italic — or "?" groups with
 * `hideSource` (a teaser that doesn't spoil). All text is escaped.
 */
export function revealCardSvg(r: Reveal, opts: { hideSource?: boolean } = {}): string {
  const c = CARD_COLORS;
  const glyphs = tileGlyphs(r.words);
  const layout = layoutCardTiles(glyphs.map((g) => g.length));
  const parts: string[] = [];
  const midY = 300;

  if (layout.mode === "tiles") {
    const { size, lines } = layout;
    const lineH = size + Math.round(size * 0.3);
    const top = midY - (lines.length * lineH - (lineH - size)) / 2;
    lines.forEach((wordIdxs, li) => {
      const widths = wordIdxs.map((i) => wordWidth(glyphs[i].length, size));
      const total = widths.reduce((s, w) => s + w, 0) + wordGap(size) * (wordIdxs.length - 1);
      let x = (CARD_W - total) / 2;
      const y = top + li * lineH;
      wordIdxs.forEach((wi, k) => {
        glyphs[wi].forEach((g, gi) => {
          const tx = x + gi * (size + tileGap(size));
          parts.push(`<rect x="${tx.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" rx="${Math.round(size * 0.08)}" fill="${c.fills[gi % 4]}" stroke="${c.border}" stroke-width="1.5"/>`);
          parts.push(`<text x="${(tx + size / 2).toFixed(1)}" y="${(y + size * 0.68).toFixed(1)}" font-size="${Math.round(size * 0.52)}" text-anchor="middle" font-family="Bitter, Georgia, serif" font-weight="600" fill="${c.text}">${escapeHtml(g)}</text>`);
        });
        x += widths[k] + wordGap(size);
      });
    });
  } else {
    const lines = wrapText(glyphs.map((g) => g.join("")), 36, CARD_MAX_LINES);
    const lineH = 62;
    const top = midY - ((lines.length - 1) * lineH) / 2 + 18;
    parts.push(`<text text-anchor="middle" font-family="Bitter, Georgia, serif" font-weight="600" font-size="48" letter-spacing="4" fill="${c.text}">${lines
      .map((l, i) => `<tspan x="${CARD_W / 2}" y="${top + i * lineH}">${escapeHtml(l)}</tspan>`)
      .join("")}</text>`);
  }

  const sourceText = opts.hideSource
    ? r.sourceText.split(/\s+/).filter(Boolean).map((w) => "?".repeat([...w].length)).join(" · ")
    : r.sourceText.toLocaleUpperCase("tr-TR");
  const source = wrapText(sourceText.split(/(?<=\S)\s+/), 48, 1)[0] ?? "";
  const title = r.title || DEFAULT_TITLE;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<rect width="${CARD_W}" height="${CARD_H}" fill="${c.bg}"/>
<rect x="40" y="40" width="${CARD_W - 80}" height="${CARD_H - 80}" rx="16" fill="${c.surface}" stroke="${c.border}" stroke-width="2"/>
<text x="${CARD_W / 2}" y="118" text-anchor="middle" font-family="Bitter, Georgia, serif" font-weight="600" font-size="40" letter-spacing="2" fill="${c.text}">${escapeHtml(title)}</text>
${parts.join("\n")}
<text x="${CARD_W / 2}" y="510" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="30" letter-spacing="${opts.hideSource ? 4 : 1}" fill="${opts.hideSource ? c.muted : c.secondary}">${opts.hideSource ? "" : "= "}${escapeHtml(source)}</text>
<text x="${CARD_W - 72}" y="${CARD_H - 62}" text-anchor="end" font-family="Bitter, Georgia, serif" font-weight="700" font-size="22" fill="${c.primary}">Anagramcı</text>
</svg>`;
}

/** Share-menu entries for the result area (server pages only). */
export function shareMenu(slug: string): string {
  const card = `${revealPath(slug)}/card.svg`;
  const s = escapeHtml(slug);
  return `<details class="send-panel share-menu">
  <summary class="btn btn-secondary">Kartı paylaş</summary>
  <div class="send-panel-body">
    <button type="button" class="btn btn-secondary btn-sm btn-card-png" data-src="${card}" data-name="anagram-${s}.png">Kartı indir (PNG)</button>
    <a class="btn btn-secondary btn-sm" href="${card}?indir=1" download="anagram-${s}.svg">Kartı indir (SVG)</a>
    <a class="btn btn-secondary btn-sm" href="${card}?gizli=1&amp;indir=1" download="anagram-${s}-bilmece.svg">Bilmece kartı (SVG)</a>
  </div>
</details>`;
}
