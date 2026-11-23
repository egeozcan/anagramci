import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DEFAULT_DIR = "data/hidden";

/** Word list ids are file stems; reject anything that could escape `dir`. */
const SAFE_ID = /^[\p{L}\p{N}_-]+$/u;

/**
 * Words the user hid from suggestions and Tamamla, per word list
 * (junk in a list is junk for every attempt). Stored lowercased (tr-TR).
 */
export function getHiddenWords(wordListId: string, dir: string = DEFAULT_DIR): string[] {
  if (!SAFE_ID.test(wordListId)) return [];
  const filePath = join(dir, `${wordListId}.json`);
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as { words?: unknown };
    return Array.isArray(data.words) ? data.words.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}

function save(wordListId: string, words: string[], dir: string): void {
  if (!SAFE_ID.test(wordListId)) throw new Error(`Invalid word list id: ${wordListId}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const sorted = [...new Set(words)].sort((a, b) => a.localeCompare(b, "tr-TR"));
  writeFileSync(join(dir, `${wordListId}.json`), JSON.stringify({ words: sorted }, null, 2), "utf-8");
}

export function hideWord(wordListId: string, word: string, dir: string = DEFAULT_DIR): void {
  const w = word.trim().toLocaleLowerCase("tr-TR");
  if (!w) return;
  save(wordListId, [...getHiddenWords(wordListId, dir), w], dir);
}

export function unhideWord(wordListId: string, word: string, dir: string = DEFAULT_DIR): void {
  const w = word.trim().toLocaleLowerCase("tr-TR");
  save(wordListId, getHiddenWords(wordListId, dir).filter((x) => x !== w), dir);
}
