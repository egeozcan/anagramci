import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DAWG } from "../dawg";

interface WordListEntry {
  id: string;
  name: string;
  words: string[];
  dawg: DAWG;
  wordCount: number;
}

const store = new Map<string, WordListEntry>();

/**
 * Load all `.txt` word list files from the given directory.
 * Each file becomes a word list entry keyed by filename (without extension).
 * Lines are trimmed; empty lines are skipped. Original casing is preserved
 * for display, but the DAWG receives lowercased words (Turkish locale).
 */
export async function loadWordLists(dir: string): Promise<void> {
  const files = await readdir(dir);
  const txtFiles = files.filter((f) => f.endsWith(".txt")).sort();

  for (const file of txtFiles) {
    const id = file.replace(/\.txt$/, "");
    const filePath = join(dir, file);
    const content = await Bun.file(filePath).text();
    const lines = content.split("\n");
    const words: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        words.push(trimmed);
      }
    }

    const lowercasedWords = words.map((w) => w.toLocaleLowerCase("tr-TR"));
    const dawg = new DAWG(lowercasedWords);

    store.set(id, {
      id,
      name: id,
      words,
      dawg,
      wordCount: words.length,
    });
  }
}

/**
 * Return metadata for all loaded word lists.
 */
export function listWordLists(): { id: string; name: string; wordCount: number }[] {
  return [...store.values()].map(({ id, name, wordCount }) => ({
    id,
    name,
    wordCount,
  }));
}

/**
 * Get a loaded word list by ID, or null if not found.
 */
export function getWordList(id: string): WordListEntry | null {
  return store.get(id) ?? null;
}
