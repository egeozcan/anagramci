import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const DEFAULT_DIR = "data/mappings";

export interface MappingData {
  pairs: [string, string][];
  version: number;
}

/**
 * Read mappings for a word list. Returns { pairs: [], version: 0 } if no
 * mapping file exists yet.
 */
export function getMappings(wordListId: string, dir: string = DEFAULT_DIR): MappingData {
  const filePath = join(dir, `${wordListId}.json`);

  if (!existsSync(filePath)) {
    return { pairs: [], version: 0 };
  }

  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as MappingData;
  return data;
}

/**
 * Save mappings for a word list. Reads the current version (if any),
 * increments it, and writes the file.
 */
export function saveMappings(
  wordListId: string,
  pairs: [string, string][],
  dir: string = DEFAULT_DIR,
): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const current = getMappings(wordListId, dir);
  const nextVersion = current.version + 1;

  const data: MappingData = { pairs, version: nextVersion };
  const filePath = join(dir, `${wordListId}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * List all saved mappings in the directory. Returns a summary array with
 * the word list ID, pair count, and version for each mapping file.
 */
export function listMappings(dir: string = DEFAULT_DIR): MappingData & { wordListId: string }[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  return files.map((file) => {
    const wordListId = file.replace(/\.json$/, "");
    const data = getMappings(wordListId, dir);
    return { wordListId, ...data };
  });
}
