## Project: AnagramCI

Turkish anagram solver — server-rendered with HTMX-driven partial updates.

### Tech Stack
- **Runtime**: Bun (native TypeScript, no bundler)
- **Server**: `Bun.serve` — no framework, plain request routing
- **Frontend**: HTMX 2.0.4 + vanilla JS (`static/app.js`) + CSS custom properties (`static/style.css`)
- **Persistence**: JSON files on disk (`data/attempts/`, `data/mappings/`)
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
  routes/
    pages.ts                   # GET routes for pages + static files
    attempts.ts                # Attempt CRUD + word manipulation
    settings.ts                # Mapping editor routes
  store/
    attempts.ts                # Attempt persistence (JSON)
    mappings.ts                # Letter mapping persistence (JSON)
    wordlists.ts               # In-memory word list loader + DAWG build
  templates/
    layout.ts                  # HTML shell with nav
    components.ts              # All component templates (string functions)
static/
  app.js                       # Client JS: hover highlights, drag-and-drop, inline edit
  style.css                    # Full stylesheet with CSS custom properties
word-lists/
  turkce_kelime_listesi.txt    # Turkish word list (one word per line)
```

### Data Model
- **Attempt**: `{ id, sourceText, wordListId, mappingSnapshot, combinations: string[][] }` — each attempt can have multiple combination groups
- **Combination index (`ci`)**: 0-based index into `combinations[]` — threaded through routes, templates, and frontend as `?ci=` param or `data-ci` attribute
- **Mapping**: `{ pairs: [from, to][], version }` — normalizes similar Turkish characters (ç→c, î→i)
- **DAWG**: Trie with suffix compression, built on startup per word list

### Architecture Patterns
- **Fragment returns**: Routes return HTML fragments, HTMX swaps them into the DOM (`hx-target`, `hx-swap="outerHTML"`)
- **Template functions**: Pure string-returning functions in `components.ts` — no template engine
- **Event delegation**: All client JS uses `document.addEventListener` (not per-element)
- **Drag handle**: Drag-and-drop uses a dedicated `.drag-handle` element; a `mousedown` listener tracks handle origin since `dragstart` fires on the `<li>`, not the child. Inline edit disables `draggable` on the `<li>` to allow text selection.
- **Pool subtraction**: `textToPool(source) → subtractWord(pool, word) → remaining` — order matters for overflow detection
- **`PUT /attempts/:id/chosen`**: Accepts `ci` + `word_0, word_1, ...` form fields, replaces full word list, returns re-rendered combination block. Used by both drag-and-drop reorder and inline edit.

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