import { getAttempt } from "../store/attempts";
import {
  createReveal,
  deleteReveal,
  getReveal,
  listReveals,
  listSeeds,
  NOTE_MAX,
  lookupRevealSlug,
  TITLE_MAX,
} from "../store/reveals";
import { buildPuzzle, isPuzzle } from "../reveal-puzzle";
import { layout } from "../templates/layout";
import {
  galleryAfterDelete,
  galleryContent,
  revealCreated,
  revealError,
  revealForm,
  revealLayout,
  revealMark,
  revealNotFound,
  revealCardSvg,
  revealStage,
} from "../templates/reveal";

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

function notFoundPage(): Response {
  return html(revealLayout({ title: "Anagram bulunamadı", body: revealNotFound() }), 404);
}

const REVEAL_HEAD = `<link rel="stylesheet" href="/static/reveal.css">
  <script src="/static/reveal.js" defer></script>`;

/** decodeURIComponent that yields "" (never matches a safe id/slug) on malformed input. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}

/** Parse `ci` and check it indexes an existing combination. */
function parseCi(raw: string | null, count: number): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const ci = parseInt(raw, 10);
  return ci < count ? ci : null;
}

export async function handleRevealRoute(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // GET /attempts/:id/reveal-form?ci= — Sergile form fragment
  const formMatch = path.match(/^\/attempts\/([^/]+)\/reveal-form$/);
  if (method === "GET" && formMatch) {
    const attempt = getAttempt(safeDecode(formMatch[1]));
    if (!attempt) return html("<p>Deneme bulunamadı.</p>", 404);
    const ci = parseCi(url.searchParams.get("ci"), attempt.combinations.length);
    if (ci === null) return html(revealError("Geçersiz kombinasyon."));
    return html(revealForm(attempt.id, ci));
  }

  // POST /attempts/:id/reveals (ci, title, note) — create a reveal.
  // Failures are 200 + role="alert" because HTMX ignores 4xx swaps.
  const createMatch = path.match(/^\/attempts\/([^/]+)\/reveals$/);
  if (method === "POST" && createMatch) {
    const attempt = getAttempt(safeDecode(createMatch[1]));
    if (!attempt) return html("<p>Deneme bulunamadı.</p>", 404);
    const form = await req.formData();
    const ci = parseCi((form.get("ci") as string | null) ?? null, attempt.combinations.length);
    if (ci === null) return html(revealError("Geçersiz kombinasyon."));
    const title = ((form.get("title") as string | null) ?? "").trim();
    const note = ((form.get("note") as string | null) ?? "").trim();
    if ([...title].length > TITLE_MAX) return html(revealError(`Başlık en fazla ${TITLE_MAX} karakter olabilir.`));
    if ([...note].length > NOTE_MAX) return html(revealError(`Not en fazla ${NOTE_MAX} karakter olabilir.`));

    const words = attempt.combinations[ci];
    const puzzle = buildPuzzle({ sourceText: attempt.sourceText, words, mappingPairs: attempt.mappingSnapshot });
    if (!isPuzzle(puzzle)) return html(revealError(`Sergilenemez: ${puzzle.error}`));

    // Idempotent: a reveal with exactly these words already exists → reuse it.
    const existing = lookupRevealSlug(attempt.id, words);
    const reused = existing ? getReveal(existing) : null;
    const reveal = reused || createReveal({
      attemptId: attempt.id,
      ci,
      wordListId: attempt.wordListId,
      sourceText: attempt.sourceText,
      words,
      mappingPairs: attempt.mappingSnapshot,
      title,
      note,
    });
    return html(revealCreated(reveal, !!reused) + revealMark(attempt.id, ci, reveal.slug, true));
  }

  // GET /vitrin — gallery
  if (method === "GET" && path === "/vitrin") {
    return html(layout("Vitrin", galleryContent(listReveals(), listSeeds()), { extraHead: REVEAL_HEAD }));
  }

  // GET /r/:slug/bulmaca.html — standalone, offline puzzle file
  const fileMatch = path.match(/^\/r\/([^/]+)\/bulmaca\.html$/);
  if (method === "GET" && fileMatch) {
    const reveal = getReveal(safeDecode(fileMatch[1]));
    const puzzle = reveal && buildPuzzle(reveal);
    if (!reveal || !puzzle || !isPuzzle(puzzle)) return notFoundPage();
    const body = revealLayout({
      title: reveal.title ?? "",
      body: revealStage(reveal, puzzle, { standalone: true }),
      standalone: true,
    });
    return html(body, 200, { "Content-Disposition": `attachment; filename="anagram-${reveal.slug}.html"` });
  }

  // GET /r/:slug/card.svg[?gizli=1][&indir=1] — share card (gizli hides the source)
  const cardMatch = path.match(/^\/r\/([^/]+)\/card\.svg$/);
  if (method === "GET" && cardMatch) {
    const reveal = getReveal(safeDecode(cardMatch[1]));
    if (!reveal) return notFoundPage();
    const hide = url.searchParams.get("gizli") === "1";
    const headers: Record<string, string> = { "Content-Type": "image/svg+xml; charset=utf-8" };
    if (url.searchParams.get("indir") === "1") {
      headers["Content-Disposition"] = `attachment; filename="anagram-${reveal.slug}${hide ? "-bilmece" : ""}.svg"`;
    }
    return new Response(revealCardSvg(reveal, { hideSource: hide }), { headers });
  }

  // GET /r/:slug — reveal page;  DELETE /r/:slug — remove a user reveal
  const pageMatch = path.match(/^\/r\/([^/]+)$/);
  if (pageMatch) {
    const slug = safeDecode(pageMatch[1]);
    if (method === "DELETE") {
      return deleteReveal(slug) ? html(galleryAfterDelete(listReveals(), listSeeds())) : html("", 404);
    }
    if (method === "GET") {
      const reveal = getReveal(slug);
      const puzzle = reveal && buildPuzzle(reveal);
      if (!reveal || !puzzle || !isPuzzle(puzzle)) return notFoundPage();
      const mode = url.searchParams.get("oyun") === "1" ? "oyun" : "tek";
      return html(revealLayout({ title: reveal.title ?? "", body: revealStage(reveal, puzzle, { mode }) }));
    }
  }

  return null;
}
