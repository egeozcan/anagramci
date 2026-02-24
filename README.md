# Anagramci

Turkish anagram solver. Enter text, get word combinations from a Turkish word list, and assemble them into anagrams.

Server-rendered with HTMX — no SPA framework, no build step.

## Setup

Requires [Bun](https://bun.sh/).

```bash
bun install
bun run dev     # http://localhost:3000
```

## How it works

1. Enter source text (e.g. a name or phrase)
2. The app finds all Turkish words that can be spelled from the available letters
3. Pick words to build anagram combinations
4. Letter pool updates in real-time as you add/remove words
5. A perfect anagram uses every letter exactly once

## Tech stack

- **Bun** — runtime, bundler, test runner
- **HTMX** — server-rendered partials swapped into the DOM
- **DAWG** — directed acyclic word graph for fast word lookup
- **Vanilla JS/CSS** — no frameworks, no build tools

## Testing

```bash
bun test
```

## Project structure

```
src/
  index.ts          Server entry point
  anagram.ts        Letter pool math
  dawg.ts           DAWG trie for word search
  routes/           Request handlers
  store/            Persistence (JSON on disk)
  templates/        HTML template functions
static/             Client JS + CSS
word-lists/         Turkish word list
```
