# Anagram Creator - Design Document

## Overview

A Bun-based web application for creating anagrams from Turkish (and potentially other language) word lists. Users input a phrase, then iteratively build an anagram by selecting real words from the available letter pool.

## Architecture

**Stack:** Bun server + HTMX frontend (server-rendered HTML fragments). All logic, state, word filtering, and persistence live on the server. The frontend is thin HTML with HTMX attributes for interactivity.

**Key data structure:** DAWG (Directed Acyclic Word Graph) per word list for fast available-word lookups with branch pruning.

## Data Model

### Word Lists
- Loaded from `word-lists/*.txt` at startup
- Each word on its own line; multi-word entries (e.g. "aba guesi") are valid
- One DAWG built per word list, kept in memory
- Pre-computed letter frequency map per word

### Letter Mappings
- Stored per word list as JSON on disk (`data/mappings/<wordlist-id>.json`)
- A mapping is a set of equivalence pairs, e.g. `[["c","c"], ["s","s"]]`
- Versioned: each save bumps a version counter
- Applied at DAWG traversal time (DAWG stores original letters)

### Anagram Attempts
- Persisted to `data/attempts/<id>.json`
- Fields: `id`, `createdAt`, `updatedAt`, `sourceText`, `wordListId`, `mappingSnapshot` (frozen at creation), `mappingVersion`, `chosenWords` (ordered array), `remainingLetters` (computed)
- Active attempts kept in memory for fast access, synced to disk on changes
- If the mapping settings are updated after an attempt is created, an "update mapping" button appears in the UI

## Core Algorithm

### DAWG Construction
- Built once per word list at startup
- Stores words with original (un-mapped) letters
- Identical suffix branches are merged for space efficiency

### Available Word Search (DAWG Traversal)
1. Source text normalized: lowercased, spaces removed, letter mappings applied -> produces a letter pool (frequency map)
2. When a word is chosen, its mapped letter frequencies are subtracted from the pool
3. To find available words, traverse the DAWG:
   - At each node, try each child edge
   - Normalize the edge letter through the active mapping
   - If the normalized letter is available in the pool, decrement count and recurse
   - If a node marks end-of-word, collect it as a match
   - Backtrack and restore the pool count
   - This prunes entire branches early (if "b" isn't in pool, all "b" words are skipped)
4. Results are grouped by word length and paginated

### Editing Chosen Words
- Removing/reordering chosen words triggers a full recompute of the pool from source text minus all remaining chosen words, then a fresh DAWG traversal

## API Routes

### Pages (full HTML)
- `GET /` - Home: list of saved attempts + "new attempt" form
- `GET /attempts/:id` - Anagram workspace
- `GET /settings` - Manage letter mappings per word list

### HTMX Endpoints (HTML fragments)
- `POST /attempts` - Create new attempt -> redirect to workspace
- `POST /attempts/:id/choose` - Add a word to chosen list
- `DELETE /attempts/:id/chosen/:index` - Remove a chosen word
- `PUT /attempts/:id/chosen` - Reorder chosen words
- `GET /attempts/:id/suggestions?q=&page=&group=` - Search/filter available words, paginated, grouped by length
- `POST /attempts/:id/refresh-mapping` - Apply updated mapping

### Settings
- `GET /settings/mappings/:wordListId` - Get mappings
- `PUT /settings/mappings/:wordListId` - Update mappings (bumps version)

## UI Layout

### Home Page
- Saved attempts list (source text preview, date, word list)
- "New Attempt" button -> form: text input, word list dropdown, mapping dropdown

### Workspace (3-panel)
- **Top bar**: Source text (read-only), word list name, mapping info + update button if stale
- **Left panel - Chosen Words**: Ordered list with remove (X) buttons, inline editing, shows built anagram phrase
- **Center - Remaining Letters**: Visual letter display with counts
- **Right panel - Available Words**: Search box, results grouped by letter count (collapsible), paginated per group, click to add

### Settings
- Word list selector, mapping pair editor (add/remove pairs), save button

## Project Structure

```
anagramci/
├── src/
│   ├── index.ts              # Bun server entry, route registration
│   ├── dawg.ts               # DAWG construction and traversal
│   ├── anagram.ts            # Letter pool logic, word matching
│   ├── routes/
│   │   ├── pages.ts          # Full page routes
│   │   ├── attempts.ts       # HTMX fragment routes for attempts
│   │   └── settings.ts       # Mapping CRUD routes
│   ├── store/
│   │   ├── wordlists.ts      # Load & index word lists
│   │   ├── attempts.ts       # Attempt persistence
│   │   └── mappings.ts       # Mapping persistence
│   └── templates/
│       ├── layout.ts         # Base HTML layout
│       └── components.ts     # Reusable HTML fragment renderers
├── word-lists/
│   └── turkce_kelime_listesi.txt
├── data/                     # Runtime data (gitignored)
│   ├── attempts/
│   └── mappings/
├── static/
│   └── style.css
├── package.json
├── tsconfig.json
└── bunfig.toml
```

## Tech Decisions

- **Templates**: TypeScript functions returning HTML strings (no template engine)
- **HTMX**: Loaded from CDN
- **Styling**: Plain CSS, minimal and clean
- **Persistence**: JSON files on disk (no database)
- **No build step**: Bun runs TypeScript directly
