# Anagram Creator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Bun + HTMX anagram creator that lets users iteratively build anagram phrases by selecting words from a DAWG-indexed Turkish word list.

**Architecture:** Bun server renders all HTML (full pages + HTMX fragments). A DAWG per word list enables fast available-word lookups with branch pruning. State lives on the server — attempts and mappings persisted as JSON files. Frontend is thin HTMX.

**Tech Stack:** Bun 1.3.9, TypeScript, HTMX (CDN), plain CSS, `bun:test` for testing.

**Word list notes:** The Turkish word list (`word-lists/turkce_kelime_listesi.txt`) has 76K entries. Some entries have spaces (e.g. "aba güreşi") — these are valid multi-word entries. Some have slashes ("a / e") — treat the whole line as one entry. Turkish special chars: ç, ş, ğ, ı, ö, ü (and uppercase İ, Ş, Ç, Ğ, Ö, Ü). Lowercasing must use Turkish locale rules (İ→i, I→ı).

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts` (minimal hello world server)

**Step 1: Create package.json**

```json
{
  "name": "anagramci",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
data/
.idea/
*.log
```

**Step 4: Install bun-types**

Run: `bun add -d bun-types`

**Step 5: Create minimal server**

Create `src/index.ts`:

```typescript
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("anagramci is running");
  },
});

console.log(`Server running at http://localhost:${server.port}`);
```

**Step 6: Verify server starts**

Run: `bun run src/index.ts &` then `curl http://localhost:3000` — expect "anagramci is running". Kill the server after.

**Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts bun.lock
git commit -m "chore: scaffold project with Bun server"
```

---

### Task 2: DAWG Data Structure

The DAWG is the core data structure. Build it with tests first.

**Files:**
- Create: `src/dawg.ts`
- Create: `src/dawg.test.ts`

**Step 1: Write failing tests for DAWG**

Create `src/dawg.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { DAWG } from "./dawg";

describe("DAWG", () => {
  test("builds from word list and finds exact words", () => {
    const dawg = new DAWG(["cat", "car", "card", "care", "bat"]);
    expect(dawg.contains("cat")).toBe(true);
    expect(dawg.contains("car")).toBe(true);
    expect(dawg.contains("card")).toBe(true);
    expect(dawg.contains("dog")).toBe(false);
    expect(dawg.contains("ca")).toBe(false); // prefix, not a word
  });

  test("finds all words formable from a letter pool", () => {
    const dawg = new DAWG(["cat", "car", "act", "at", "a", "cart", "bat"]);
    // Pool: c=1, a=1, t=1 -> can form "cat", "act", "at", "a"
    const pool = new Map([["c", 1], ["a", 1], ["t", 1]]);
    const results = dawg.findAvailable(pool);
    const words = results.map(r => r.word).sort();
    expect(words).toEqual(["a", "act", "at", "cat"]);
  });

  test("respects letter counts in pool", () => {
    const dawg = new DAWG(["aa", "aaa", "a"]);
    const pool = new Map([["a", 2]]);
    const results = dawg.findAvailable(pool);
    const words = results.map(r => r.word).sort();
    expect(words).toEqual(["a", "aa"]);
  });

  test("finds words with letter mapping", () => {
    const dawg = new DAWG(["çay", "cay", "say"]);
    // Mapping: ç -> c (both map to "c")
    const mapping = new Map([["ç", "c"]]);
    // Pool after mapping: c=1, a=1, y=1
    const pool = new Map([["c", 1], ["a", 1], ["y", 1]]);
    const results = dawg.findAvailable(pool, mapping);
    const words = results.map(r => r.word).sort();
    // Both "çay" and "cay" should match since ç maps to c
    expect(words).toEqual(["cay", "çay"]);
  });

  test("handles multi-word entries (spaces ignored)", () => {
    const dawg = new DAWG(["ab", "a b", "abc"]);
    const pool = new Map([["a", 1], ["b", 1]]);
    const results = dawg.findAvailable(pool);
    const words = results.map(r => r.word).sort();
    expect(words).toEqual(["a b", "ab"]);
  });

  test("handles empty pool", () => {
    const dawg = new DAWG(["a", "b"]);
    const pool = new Map<string, number>();
    const results = dawg.findAvailable(pool);
    expect(results).toEqual([]);
  });

  test("handles large word list efficiently", () => {
    // Generate a list of 10000 random words
    const words: string[] = [];
    for (let i = 0; i < 10000; i++) {
      const len = Math.floor(Math.random() * 8) + 2;
      let word = "";
      for (let j = 0; j < len; j++) {
        word += String.fromCharCode(97 + Math.floor(Math.random() * 26));
      }
      words.push(word);
    }
    const dawg = new DAWG(words);
    const pool = new Map([["a", 2], ["b", 1], ["c", 1], ["e", 1]]);
    const start = performance.now();
    const results = dawg.findAvailable(pool);
    const elapsed = performance.now() - start;
    // Should be well under 100ms
    expect(elapsed).toBeLessThan(100);
    // Every result should be formable from the pool
    for (const r of results) {
      const freq = new Map<string, number>();
      for (const ch of r.word) {
        freq.set(ch, (freq.get(ch) || 0) + 1);
      }
      for (const [ch, count] of freq) {
        expect(pool.get(ch)! >= count).toBe(true);
      }
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/dawg.test.ts`
Expected: FAIL — module `./dawg` not found.

**Step 3: Implement the DAWG**

Create `src/dawg.ts`. The DAWG stores words in a trie structure with suffix merging. For multi-word entries, spaces are stored in the original word but skipped during letter matching.

Key implementation details:
- `DAWGNode` has `children: Map<string, DAWGNode>` and `isEnd: boolean`, plus `word: string | null` at end nodes
- Constructor: insert all words into a trie. For multi-word entries, insert letter-by-letter skipping spaces in the trie structure, but store the full original word at the end node.
- `contains(word)`: traverse the trie checking each non-space character
- `findAvailable(pool, mapping?)`: recursive DFS traversal. At each node, try each child edge. Normalize the edge character through the mapping. If the normalized char is in the pool with count > 0, decrement and recurse. If a node is an end-of-word, collect it. Backtrack by restoring the count.
- For the mapping: build a `normalize` function that maps each character. Both sides of a mapping pair map to the same canonical form (the "target" side). E.g., mapping `[["ç","c"]]` means `ç→c` and `c` stays `c`.
- DAWG suffix compression (optional optimization): after building the trie, merge nodes that have identical subtrees. This is the "directed acyclic" part. Use a signature-based approach: compute a hash for each subtree bottom-up, merge nodes with identical hashes.

```typescript
export interface DAWGResult {
  word: string;       // original word (with spaces if multi-word)
  letterCount: number; // number of letters (excluding spaces)
}

class DAWGNode {
  children = new Map<string, DAWGNode>();
  isEnd = false;
  word: string | null = null;

  signature(): string {
    // For DAWG compression: compute a unique signature for this subtree
    const parts: string[] = [];
    if (this.isEnd) parts.push("$");
    for (const [ch, child] of [...this.children.entries()].sort()) {
      parts.push(ch + ":" + child.signature());
    }
    return parts.join("|");
  }
}

export class DAWG {
  private root: DAWGNode;

  constructor(words: string[]) {
    this.root = new DAWGNode();
    for (const word of words) {
      this.insert(word);
    }
    this.compress();
  }

  private insert(word: string): void {
    let node = this.root;
    const letters = [...word].filter(ch => ch !== " ");
    for (const ch of letters) {
      if (!node.children.has(ch)) {
        node.children.set(ch, new DAWGNode());
      }
      node = node.children.get(ch)!;
    }
    node.isEnd = true;
    node.word = word;
  }

  private compress(): void {
    // Bottom-up: merge nodes with identical signatures
    const signatureMap = new Map<string, DAWGNode>();
    this.compressNode(this.root, signatureMap);
  }

  private compressNode(
    node: DAWGNode,
    signatureMap: Map<string, DAWGNode>
  ): DAWGNode {
    // First compress all children
    for (const [ch, child] of node.children) {
      const compressed = this.compressNode(child, signatureMap);
      node.children.set(ch, compressed);
    }
    // Check if an equivalent node already exists
    const sig = node.signature();
    const existing = signatureMap.get(sig);
    if (existing && !node.isEnd) {
      // Can merge non-end nodes with same structure
      return existing;
    }
    signatureMap.set(sig, node);
    return node;
  }

  contains(word: string): boolean {
    let node = this.root;
    const letters = [...word].filter(ch => ch !== " ");
    for (const ch of letters) {
      if (!node.children.has(ch)) return false;
      node = node.children.get(ch)!;
    }
    return node.isEnd;
  }

  findAvailable(
    pool: Map<string, number>,
    mapping?: Map<string, string>
  ): DAWGResult[] {
    const results: DAWGResult[] = [];
    const normalize = (ch: string): string => {
      if (!mapping) return ch;
      return mapping.get(ch) ?? ch;
    };
    this.dfs(this.root, pool, normalize, results);
    return results;
  }

  private dfs(
    node: DAWGNode,
    pool: Map<string, number>,
    normalize: (ch: string) => string,
    results: DAWGResult[]
  ): void {
    if (node.isEnd && node.word) {
      const letterCount = [...node.word].filter(ch => ch !== " ").length;
      results.push({ word: node.word, letterCount });
    }
    for (const [ch, child] of node.children) {
      const mapped = normalize(ch);
      const count = pool.get(mapped) || 0;
      if (count > 0) {
        pool.set(mapped, count - 1);
        this.dfs(child, pool, normalize, results);
        pool.set(mapped, count); // backtrack
      }
    }
  }
}
```

**Note on DAWG compression:** The signature-based compression above works but may be slow for 76K words because computing string signatures is O(n) per node. If build time is too slow (>2 seconds), simplify by skipping compression and using a plain trie — the traversal performance is the same, just uses more memory. The trie for 76K Turkish words will be ~5-15MB which is fine.

**Step 4: Run tests**

Run: `bun test src/dawg.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/dawg.ts src/dawg.test.ts
git commit -m "feat: implement DAWG with construction, lookup, and available-word search"
```

---

### Task 3: Letter Pool & Anagram Logic

**Files:**
- Create: `src/anagram.ts`
- Create: `src/anagram.test.ts`

**Step 1: Write failing tests**

Create `src/anagram.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  textToPool,
  subtractWord,
  buildMappingNormalizer,
  computeRemainingPool,
} from "./anagram";

describe("textToPool", () => {
  test("creates frequency map from text, ignoring spaces", () => {
    const pool = textToPool("hello world");
    expect(pool.get("h")).toBe(1);
    expect(pool.get("l")).toBe(3);
    expect(pool.get("o")).toBe(2);
    expect(pool.has(" ")).toBe(false);
  });

  test("lowercases text with Turkish locale", () => {
    const pool = textToPool("İstanbul");
    expect(pool.get("i")).toBe(1); // İ -> i in Turkish
    expect(pool.get("s")).toBe(1);
    expect(pool.has("İ")).toBe(false);
  });

  test("applies letter mapping", () => {
    const mapping = new Map([["ç", "c"], ["ş", "s"]]);
    const pool = textToPool("çay şeker", mapping);
    // ç maps to c, ş maps to s
    expect(pool.get("c")).toBe(1); // from ç
    expect(pool.get("s")).toBe(1); // from ş
    expect(pool.has("ç")).toBe(false);
    expect(pool.has("ş")).toBe(false);
  });
});

describe("subtractWord", () => {
  test("subtracts word letters from pool", () => {
    const pool = new Map([["a", 3], ["b", 2], ["c", 1]]);
    const result = subtractWord(pool, "ab");
    expect(result.get("a")).toBe(2);
    expect(result.get("b")).toBe(1);
    expect(result.get("c")).toBe(1);
  });

  test("removes key when count hits 0", () => {
    const pool = new Map([["a", 1], ["b", 1]]);
    const result = subtractWord(pool, "a");
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toBe(1);
  });

  test("ignores spaces in word", () => {
    const pool = new Map([["a", 1], ["b", 2]]);
    const result = subtractWord(pool, "a b");
    expect(result.has("a")).toBe(false);
    expect(result.get("b")).toBe(1);
  });

  test("applies mapping when subtracting", () => {
    const pool = new Map([["c", 2]]); // pool already normalized
    const mapping = new Map([["ç", "c"]]);
    const result = subtractWord(pool, "çay", mapping);
    // ç -> c, so subtracts 1 c, 1 a, 1 y (a and y not in pool but that's fine for partial test)
    expect(result.get("c")).toBe(1);
  });
});

describe("computeRemainingPool", () => {
  test("computes pool from source minus all chosen words", () => {
    const mapping = new Map<string, string>();
    const pool = computeRemainingPool("abcabc", ["ab", "c"], mapping);
    // source: a=2, b=2, c=2. minus "ab": a=1, b=1, c=2. minus "c": a=1, b=1, c=1
    expect(pool.get("a")).toBe(1);
    expect(pool.get("b")).toBe(1);
    expect(pool.get("c")).toBe(1);
  });
});

describe("buildMappingNormalizer", () => {
  test("builds a Map from equivalence pairs", () => {
    const pairs: [string, string][] = [["ç", "c"], ["ş", "s"]];
    const mapping = buildMappingNormalizer(pairs);
    expect(mapping.get("ç")).toBe("c");
    // The target letter should also be in the map (maps to itself)
    // so that pool normalization is consistent
    expect(mapping.get("c")).toBe("c");
    expect(mapping.get("ş")).toBe("s");
    expect(mapping.get("s")).toBe("s");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `bun test src/anagram.test.ts`
Expected: FAIL.

**Step 3: Implement anagram.ts**

```typescript
/**
 * Build a normalizer Map from equivalence pairs.
 * Each pair [a, b] means a → b. We also ensure b → b so that
 * normalization is idempotent.
 */
export function buildMappingNormalizer(
  pairs: [string, string][]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [from, to] of pairs) {
    map.set(from, to);
    if (!map.has(to)) {
      map.set(to, to);
    }
  }
  return map;
}

function normalizeChar(ch: string, mapping?: Map<string, string>): string {
  if (!mapping) return ch;
  return mapping.get(ch) ?? ch;
}

/**
 * Convert text to a letter frequency pool.
 * Lowercases with Turkish locale, removes spaces, applies mapping.
 */
export function textToPool(
  text: string,
  mapping?: Map<string, string>
): Map<string, number> {
  const pool = new Map<string, number>();
  const lower = text.toLocaleLowerCase("tr-TR");
  for (const ch of lower) {
    if (ch === " ") continue;
    const normalized = normalizeChar(ch, mapping);
    pool.set(normalized, (pool.get(normalized) || 0) + 1);
  }
  return pool;
}

/**
 * Subtract a word's letters from the pool. Returns a new Map.
 * Spaces in the word are ignored. Mapping is applied.
 */
export function subtractWord(
  pool: Map<string, number>,
  word: string,
  mapping?: Map<string, string>
): Map<string, number> {
  const result = new Map(pool);
  const lower = word.toLocaleLowerCase("tr-TR");
  for (const ch of lower) {
    if (ch === " ") continue;
    const normalized = normalizeChar(ch, mapping);
    const count = result.get(normalized) || 0;
    if (count <= 1) {
      result.delete(normalized);
    } else {
      result.set(normalized, count - 1);
    }
  }
  return result;
}

/**
 * Compute remaining pool from source text after removing all chosen words.
 */
export function computeRemainingPool(
  sourceText: string,
  chosenWords: string[],
  mapping: Map<string, string>
): Map<string, number> {
  let pool = textToPool(sourceText, mapping);
  for (const word of chosenWords) {
    pool = subtractWord(pool, word, mapping);
  }
  return pool;
}
```

**Step 4: Run tests**

Run: `bun test src/anagram.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/anagram.ts src/anagram.test.ts
git commit -m "feat: implement letter pool and anagram computation logic"
```

---

### Task 4: Word List Store

**Files:**
- Create: `src/store/wordlists.ts`
- Create: `src/store/wordlists.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, expect, test } from "bun:test";
import { loadWordLists, getWordList, listWordLists } from "./wordlists";

describe("Word List Store", () => {
  test("loads word lists from directory", async () => {
    await loadWordLists("word-lists");
    const lists = listWordLists();
    expect(lists.length).toBeGreaterThan(0);
    expect(lists[0].id).toBe("turkce_kelime_listesi");
    expect(lists[0].name).toBe("turkce_kelime_listesi");
    expect(lists[0].wordCount).toBeGreaterThan(70000);
  });

  test("getWordList returns a loaded word list with DAWG", async () => {
    await loadWordLists("word-lists");
    const wl = getWordList("turkce_kelime_listesi");
    expect(wl).not.toBeNull();
    expect(wl!.dawg).toBeDefined();
    // Spot check: "araba" should be in the list
    expect(wl!.dawg.contains("araba")).toBe(true);
  });

  test("getWordList returns null for unknown list", async () => {
    const wl = getWordList("nonexistent");
    expect(wl).toBeNull();
  });
});
```

**Step 2: Run to verify failure**

Run: `bun test src/store/wordlists.test.ts`

**Step 3: Implement**

`src/store/wordlists.ts`:
- `loadWordLists(dir)`: reads all `.txt` files from `dir`, parses lines, builds a DAWG per file. Stores in a module-level Map.
- `listWordLists()`: returns `{ id, name, wordCount }[]`
- `getWordList(id)`: returns `{ id, name, words: string[], dawg: DAWG, wordCount }` or null
- ID derived from filename without extension.
- Lines are trimmed. Empty lines are skipped. Lines are stored as-is (original casing preserved for display), but the DAWG receives lowercased versions.

**Step 4: Run tests**

Run: `bun test src/store/wordlists.test.ts`
Expected: PASS. Note: DAWG construction for 76K words may take 1-5 seconds — that's acceptable at startup.

**Step 5: Commit**

```bash
git add src/store/wordlists.ts src/store/wordlists.test.ts
git commit -m "feat: word list store with file loading and DAWG indexing"
```

---

### Task 5: Mapping Store

**Files:**
- Create: `src/store/mappings.ts`
- Create: `src/store/mappings.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, expect, test, beforeEach } from "bun:test";
import { getMappings, saveMappings, listMappings } from "./mappings";
import { rmSync, mkdirSync } from "fs";

const TEST_DIR = "data/test-mappings";

describe("Mapping Store", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  test("returns empty mapping for unknown word list", () => {
    const m = getMappings("unknown", TEST_DIR);
    expect(m.pairs).toEqual([]);
    expect(m.version).toBe(0);
  });

  test("saves and loads mappings", () => {
    const pairs: [string, string][] = [["ç", "c"], ["ş", "s"]];
    saveMappings("turkce", pairs, TEST_DIR);
    const m = getMappings("turkce", TEST_DIR);
    expect(m.pairs).toEqual(pairs);
    expect(m.version).toBe(1);
  });

  test("bumps version on each save", () => {
    saveMappings("turkce", [["ç", "c"]], TEST_DIR);
    saveMappings("turkce", [["ç", "c"], ["ş", "s"]], TEST_DIR);
    const m = getMappings("turkce", TEST_DIR);
    expect(m.version).toBe(2);
    expect(m.pairs.length).toBe(2);
  });

  test("listMappings returns all saved mappings", () => {
    saveMappings("list1", [["a", "b"]], TEST_DIR);
    saveMappings("list2", [["c", "d"]], TEST_DIR);
    const all = listMappings(TEST_DIR);
    expect(all.length).toBe(2);
  });
});
```

**Step 2: Run to verify failure**

**Step 3: Implement**

`src/store/mappings.ts`:
- Stores as `{dir}/{wordListId}.json` containing `{ pairs: [string,string][], version: number }`
- `getMappings(wordListId, dir?)` — reads file, returns `{ pairs, version }`. Returns `{ pairs: [], version: 0 }` if not found.
- `saveMappings(wordListId, pairs, dir?)` — reads current version, increments, writes file.
- `listMappings(dir?)` — lists all `.json` files in dir, returns summaries.
- Default dir: `data/mappings`

**Step 4: Run tests, verify PASS**

**Step 5: Commit**

```bash
git add src/store/mappings.ts src/store/mappings.test.ts
git commit -m "feat: mapping store with versioned persistence"
```

---

### Task 6: Attempt Store

**Files:**
- Create: `src/store/attempts.ts`
- Create: `src/store/attempts.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, expect, test, beforeEach } from "bun:test";
import {
  createAttempt,
  getAttempt,
  updateAttempt,
  listAttempts,
  deleteAttempt,
} from "./attempts";
import { rmSync, mkdirSync } from "fs";

const TEST_DIR = "data/test-attempts";

describe("Attempt Store", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  test("creates and retrieves an attempt", () => {
    const a = createAttempt({
      sourceText: "merhaba dünya",
      wordListId: "turkce",
      mappingSnapshot: [["ç", "c"]],
      mappingVersion: 1,
    }, TEST_DIR);
    expect(a.id).toBeDefined();
    expect(a.sourceText).toBe("merhaba dünya");
    expect(a.chosenWords).toEqual([]);

    const loaded = getAttempt(a.id, TEST_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.sourceText).toBe("merhaba dünya");
  });

  test("updates an attempt (add chosen word)", () => {
    const a = createAttempt({
      sourceText: "test",
      wordListId: "turkce",
      mappingSnapshot: [],
      mappingVersion: 0,
    }, TEST_DIR);
    updateAttempt(a.id, { chosenWords: ["te"] }, TEST_DIR);
    const loaded = getAttempt(a.id, TEST_DIR);
    expect(loaded!.chosenWords).toEqual(["te"]);
  });

  test("lists all attempts", () => {
    createAttempt({ sourceText: "a", wordListId: "t", mappingSnapshot: [], mappingVersion: 0 }, TEST_DIR);
    createAttempt({ sourceText: "b", wordListId: "t", mappingSnapshot: [], mappingVersion: 0 }, TEST_DIR);
    const all = listAttempts(TEST_DIR);
    expect(all.length).toBe(2);
  });

  test("deletes an attempt", () => {
    const a = createAttempt({ sourceText: "x", wordListId: "t", mappingSnapshot: [], mappingVersion: 0 }, TEST_DIR);
    deleteAttempt(a.id, TEST_DIR);
    expect(getAttempt(a.id, TEST_DIR)).toBeNull();
  });
});
```

**Step 2: Run to verify failure**

**Step 3: Implement**

`src/store/attempts.ts`:

Types:
```typescript
export interface Attempt {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceText: string;
  wordListId: string;
  mappingSnapshot: [string, string][];
  mappingVersion: number;
  chosenWords: string[];
}
```

Functions:
- `createAttempt(input, dir?)` — generates UUID id, sets timestamps, empty chosenWords, writes JSON, returns Attempt.
- `getAttempt(id, dir?)` — reads JSON file, returns Attempt or null.
- `updateAttempt(id, partial, dir?)` — reads, merges fields, updates `updatedAt`, writes.
- `listAttempts(dir?)` — reads all JSON files, returns sorted by updatedAt desc.
- `deleteAttempt(id, dir?)` — deletes the JSON file.
- Default dir: `data/attempts`

**Step 4: Run tests, verify PASS**

**Step 5: Commit**

```bash
git add src/store/attempts.ts src/store/attempts.test.ts
git commit -m "feat: attempt store with CRUD and persistence"
```

---

### Task 7: HTML Templates

**Files:**
- Create: `src/templates/layout.ts`
- Create: `src/templates/components.ts`

No tests for templates — they produce HTML strings. We'll verify visually.

**Step 1: Implement layout.ts**

```typescript
export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Anagramcı</title>
  <link rel="stylesheet" href="/static/style.css">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
</head>
<body>
  <nav>
    <a href="/">Anagramcı</a>
    <a href="/settings">Ayarlar</a>
  </nav>
  <main>${body}</main>
</body>
</html>`;
}
```

**Step 2: Implement components.ts**

Key template functions (all return HTML strings):
- `homePageContent(attempts, wordLists, mappingsByList)` — renders the home page with attempt list and new attempt form
- `workspaceContent(attempt, remainingPool, wordListName, mappingStale)` — renders the full workspace (chosen words panel, remaining letters, available words panel)
- `chosenWordsPanel(chosenWords, attemptId)` — renders chosen word list with X buttons
- `remainingLettersDisplay(pool)` — renders letter counts visually
- `suggestionsPanel(results, query, page, attemptId)` — renders grouped/paginated available words
- `settingsPageContent(wordLists, currentMapping)` — renders settings page
- `mappingEditor(pairs, wordListId)` — renders the mapping pair editor

Each component is self-contained and can be returned as an HTMX fragment (no layout wrapper) or composed into a full page.

**Step 3: Commit**

```bash
git add src/templates/layout.ts src/templates/components.ts
git commit -m "feat: HTML template functions for layout and components"
```

---

### Task 8: Routes — Pages

**Files:**
- Create: `src/routes/pages.ts`
- Modify: `src/index.ts` (add routing)

**Step 1: Implement page routes**

`src/routes/pages.ts` exports a function that takes a `Request` and returns `Response | null`:

- `GET /` — loads attempts, word lists, renders home page with layout
- `GET /attempts/:id` — loads attempt, computes remaining pool, queries DAWG for initial suggestions, renders workspace with layout
- `GET /settings` — loads word lists and mappings, renders settings with layout
- `GET /static/*` — serves files from `static/` directory

**Step 2: Update index.ts with router**

Replace the hello world handler with a simple URL-based router that delegates to page routes and HTMX routes:

```typescript
import { loadWordLists } from "./store/wordlists";

// Load word lists at startup
await loadWordLists("word-lists");

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    // Try page routes, then HTMX routes, then 404
    // ...
  }
});
```

No framework needed — just `url.pathname` matching with simple if/else or a small router helper.

**Step 3: Commit**

```bash
git add src/routes/pages.ts src/index.ts
git commit -m "feat: page routes for home, workspace, and settings"
```

---

### Task 9: Routes — HTMX Attempt Endpoints

**Files:**
- Create: `src/routes/attempts.ts`

**Step 1: Implement HTMX routes**

These routes return HTML fragments (no layout wrapper):

- `POST /attempts` — create attempt from form data, redirect (HX-Redirect) to `/attempts/:id`
- `POST /attempts/:id/choose` — form body has `word`. Add to chosenWords, recompute pool, save. Return updated chosen words panel + remaining letters + suggestions panel (multi-target swap with `hx-swap-oob`).
- `DELETE /attempts/:id/chosen/:index` — remove word at index, recompute, save. Return updated panels.
- `PUT /attempts/:id/chosen` — receives reordered word list from drag-and-drop. Recompute, save. Return updated panels.
- `GET /attempts/:id/suggestions?q=&page=&group=` — query DAWG with current pool + search filter + pagination. Return suggestions panel fragment.
- `POST /attempts/:id/refresh-mapping` — load latest mapping from store, update attempt's snapshot and version, recompute pool. Return full workspace content.
- `DELETE /attempts/:id` — delete attempt, redirect to home.

**Step 2: Wire into index.ts router**

**Step 3: Commit**

```bash
git add src/routes/attempts.ts src/index.ts
git commit -m "feat: HTMX routes for attempt CRUD and word suggestions"
```

---

### Task 10: Routes — Settings

**Files:**
- Create: `src/routes/settings.ts`

**Step 1: Implement settings routes**

- `GET /settings/mappings/:wordListId` — return mapping editor fragment for HTMX
- `PUT /settings/mappings/:wordListId` — parse form body for pairs, save to mapping store, return updated mapping editor

**Step 2: Wire into index.ts**

**Step 3: Commit**

```bash
git add src/routes/settings.ts src/index.ts
git commit -m "feat: settings routes for mapping management"
```

---

### Task 11: CSS Styling

**Files:**
- Create: `static/style.css`

**Step 1: Write CSS**

Clean, minimal styling:
- CSS custom properties for colors (light theme)
- Nav bar styling
- 3-panel workspace layout using CSS Grid
- Chosen words list (with hover-to-reveal X button)
- Remaining letters: inline blocks with letter + superscript count
- Suggestions: collapsible groups, clickable word chips
- Settings: form styling for mapping pairs
- Responsive: stack panels vertically on narrow screens
- HTMX loading indicator styles (`.htmx-request` opacity)

**Step 2: Commit**

```bash
git add static/style.css
git commit -m "feat: CSS styling for all pages"
```

---

### Task 12: Integration Test — Full Flow

**Files:**
- Create: `src/integration.test.ts`

**Step 1: Write integration test**

Test the full flow programmatically using Bun's fetch against a test server:

```typescript
import { describe, expect, test, beforeAll, afterAll } from "bun:test";

describe("Integration: full anagram flow", () => {
  let server: any;
  const BASE = "http://localhost:3001";

  beforeAll(async () => {
    // Start server on test port
    // ...
  });

  afterAll(() => {
    server.stop();
  });

  test("home page loads", async () => {
    const res = await fetch(BASE + "/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Anagramcı");
  });

  test("create attempt and choose words", async () => {
    // POST /attempts with sourceText and wordListId
    // Verify redirect to workspace
    // GET workspace, verify remaining letters shown
    // POST /attempts/:id/choose with a word
    // Verify chosen words updated and remaining letters decreased
  });

  test("settings: save and load mappings", async () => {
    // PUT mapping, GET mapping, verify version bumped
  });
});
```

**Step 2: Run integration tests**

Run: `bun test src/integration.test.ts`

**Step 3: Commit**

```bash
git add src/integration.test.ts
git commit -m "test: integration tests for full anagram flow"
```

---

### Task 13: Final Polish & README

**Step 1: Create data directories on startup**

In `src/index.ts`, ensure `data/attempts` and `data/mappings` directories exist at startup using `mkdirSync({ recursive: true })`.

**Step 2: Add word-lists to git (if not already tracked)**

```bash
git add word-lists/turkce_kelime_listesi.txt
```

**Step 3: Add CLAUDE.md and existing files**

```bash
git add CLAUDE.md
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final polish, data dir setup, track word list"
```

**Step 5: Test full run**

Run: `bun run dev` — visit http://localhost:3000, create an attempt, verify word suggestions load and the full flow works.
