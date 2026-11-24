## Project: AnagramCI

Turkish anagram solver — server-rendered with HTMX-driven partial updates.

### Tech Stack
- **Runtime**: Bun (native TypeScript, no bundler)
- **Server**: `Bun.serve` — no framework, plain request routing
- **Frontend**: HTMX 2.0.4 + vanilla JS (`static/app.js`) + CSS custom properties (`static/style.css`)
- **Persistence**: JSON files on disk (`data/attempts/`, `data/mappings/`, `data/hidden/`, `data/reveals/`); tracked seed puzzles in `seeds/`
- **Testing**: `bun test`

### Commands
```bash
bun run --watch src/index.ts   # Dev server (port 3000)
bun test                       # Run tests
```

### Structure
```
src/
  index.ts                     # Entry point, server setup
  anagram.ts                   # Pool math: textToPool, subtractWord, charOverflowMasks
  dawg.ts                      # DAWG trie for word search
  fill.ts                      # "Tamamla": full multi-word anagrams of remaining letters
  reveal-puzzle.ts             # Vitrin: buildPuzzle (THE perfect check), tileGlyphs, encode/decodePuzzle
  routes/
    pages.ts                   # GET routes for pages + static files
    attempts.ts                # Attempt CRUD + word manipulation
    settings.ts                # Mapping editor routes
    reveals.ts                 # Vitrin: Sergile form/create, /r/:slug, bulmaca.html, card.svg, /vitrin
  store/
    attempts.ts                # Attempt persistence (JSON)
    mappings.ts                # Letter mapping persistence (JSON)
    hidden.ts                  # Hidden (junk) words per word list (JSON)
    reveals.ts                 # Reveal persistence + seeds + attemptId→words→slug index
    wordlists.ts               # In-memory word list loader + DAWG build
  templates/
    layout.ts                  # HTML shell with nav (optional extraHead)
    components.ts              # All workspace/home/settings templates (string functions)
    reveal.ts                  # Reveal page shell/stage, standalone export, gallery, Sergile fragments, share card SVG
static/
  app.js                       # Client JS: hover highlights, drag-and-drop, inline edit, Sergile/copy
  reveal.js                    # Reveal game, gallery stars, "Kendini sına" rounds (no HTMX; inlined in exports)
  style.css                    # Full stylesheet with CSS custom properties
  reveal.css                   # Reveal page + gallery styles (tokens from style.css only)
seeds/
  hazir-bulmacalar.json        # Curated seed puzzles (fixed slugs, seed: true)
word-lists/
  turkce_kelime_listesi.txt    # Turkish word list (one word per line)
```

### Data Model
- **Attempt**: `{ id, sourceText, wordListId, mappingSnapshot, combinations: string[][] }` — each attempt can have multiple combination groups
- **Combination index (`ci`)**: 0-based index into `combinations[]` — threaded through routes, templates, and frontend as `?ci=` param or `data-ci` attribute
- **Mapping**: `{ pairs: [from, to][], version }` — normalizes similar Turkish characters (ç→c, î→i)
- **Reveal**: `{ slug, createdAt, attemptId|null, ci|null, wordListId|null, sourceText, words, mappingPairs, title?, note?, seed? }` — immutable snapshot of a perfect combination; slug `/^[a-z2-9]{6}$/`
- **DAWG**: Trie with suffix compression, built on startup per word list

### Architecture Patterns
- **Fragment returns**: Routes return HTML fragments, HTMX swaps them into the DOM (`hx-target`, `hx-swap="outerHTML"`)
- **Template functions**: Pure string-returning functions in `components.ts` — no template engine
- **Event delegation**: All client JS uses `document.addEventListener` (not per-element)
- **Drag handle**: Drag-and-drop uses a dedicated `.drag-handle` element; a `mousedown` listener tracks handle origin since `dragstart` fires on the `<li>`, not the child. Inline edit disables `draggable` on the `<li>` to allow text selection.
- **Pool subtraction**: `textToPool(source) → subtractWord(pool, word) → remaining` — order matters for overflow detection
- **`PUT /attempts/:id/chosen`**: Accepts `ci` + `word_0, word_1, ...` form fields, replaces full word list, returns re-rendered combination block. Used by both drag-and-drop reorder and inline edit.
- **Tamamla (fill)**: `findFullAnagrams(candidates, pool, mapping)` groups candidates by letter signature (anagram alternatives share a slot), iterates word count k=1..6, and the last word of each tuple is a hash lookup of the leftover signature. 80ms budget. Rendered inline by `renderCombinationBlock` for open blocks; closed blocks / page load get a lazy `hx-trigger="intersect once"` placeholder → `GET /attempts/:id/fill?ci=`.
- **Hidden words**: per word list, filtered out of candidates in `computeWorkspaceData` (affects suggestions and Tamamla). `POST`/`DELETE /attempts/:id/hide` re-render *all* blocks; elements with `data-all-blocks` get an `open=` param (open block indices) added client-side in `htmx:configRequest`.

- **Vitrin (reveals)**: a combination that passes `buildPuzzle` (no overflow, nothing remaining, every source letter cell mapped) gets `#reveal-mark-<ci>` in its summary (✦ Sergile button, or ✦ badge when a reveal with exactly these words exists) and an empty `#reveal-slot-<ci>` at the top of its panels. `POST /attempts/:id/reveals` returns the confirmation plus an OOB `reveal-mark`; validation failures are **200 + `role="alert"`** (HTMX ignores 4xx swaps). Callers resolve slugs via `lookupRevealSlug(attemptId, words)` backed by `cachedRevealIndex(dir)` (cleared on create/delete; hand-deleted files linger until then).
- **Reveal puzzle index spaces**: cells = non-space chars of the tr-TR-lowercased source (= `data-si`), tiles = non-space chars of the chosen words (= `data-ci`), `charMap[tile] = cell` from `computeCharMapping` (greedy = minimal displacement). Letter-less tokens are fixed groups; in-word punctuation is a fixed cell of its word.
- **Spoiler rule**: on `/r/:slug` the source lives only in base64 `data-puzzle` (no `data-cell` on tiles, not in `<title>`); the gallery's hidden `.card-source` is the only plaintext source. Tests strip-and-assert this.
- **reveal.js**: plain IIFE with no HTMX, also inlined into `/r/:slug/bulmaca.html` (which must contain no `/static/` or `hx-`). Pure helpers (`normalizeGuess`, `stars`, `resultLine`, …) are exposed on `globalThis.__anagramciReveal` when `document` is undefined; `normalizeGuess` mirrors `normalizeLetters` (parity tested). All storage access is try/catch.
- **`REVEALS_DIR`**: `revealsDir()` reads the env at call time (integration tests use `data/test-reveals`).

### Critical Conventions
- **Turkish locale**: Always `toLocaleLowerCase("tr-TR")` — never bare `.toLowerCase()` (İ→i, not I)
- **`escapeHtml()`**: Required for all user input rendered in templates
- **`htmx.ajax()` values**: Must be a plain object `{ key: value }`, not a URL-encoded string
- **Mapping normalization**: `buildMappingNormalizer(pairs)` → `Map<string, string>`, applied in pool/subtraction functions

---

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.