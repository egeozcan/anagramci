import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

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

interface CreateAttemptInput {
  sourceText: string;
  wordListId: string;
  mappingSnapshot: [string, string][];
  mappingVersion: number;
}

const DEFAULT_DIR = "data/attempts";

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function attemptPath(id: string, dir: string): string {
  return join(dir, `${id}.json`);
}

/**
 * Create a new attempt with a unique ID, empty chosenWords, and persist it.
 */
export function createAttempt(input: CreateAttemptInput, dir: string = DEFAULT_DIR): Attempt {
  ensureDir(dir);

  const now = new Date().toISOString();
  const attempt: Attempt = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    sourceText: input.sourceText,
    wordListId: input.wordListId,
    mappingSnapshot: input.mappingSnapshot,
    mappingVersion: input.mappingVersion,
    chosenWords: [],
  };

  writeFileSync(attemptPath(attempt.id, dir), JSON.stringify(attempt, null, 2));
  return attempt;
}

/**
 * Get an attempt by ID, or null if it doesn't exist.
 */
export function getAttempt(id: string, dir: string = DEFAULT_DIR): Attempt | null {
  const filePath = attemptPath(id, dir);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf-8")) as Attempt;
}

/**
 * Update an attempt with partial fields. Updates the `updatedAt` timestamp.
 */
export function updateAttempt(
  id: string,
  partial: Partial<Omit<Attempt, "id" | "createdAt">>,
  dir: string = DEFAULT_DIR,
): Attempt {
  const attempt = getAttempt(id, dir);
  if (!attempt) {
    throw new Error(`Attempt not found: ${id}`);
  }

  const updated: Attempt = {
    ...attempt,
    ...partial,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(attemptPath(id, dir), JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * List all attempts, sorted by updatedAt descending (most recent first).
 */
export function listAttempts(dir: string = DEFAULT_DIR): Attempt[] {
  ensureDir(dir);

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const attempts: Attempt[] = files.map((file) => {
    const content = readFileSync(join(dir, file), "utf-8");
    return JSON.parse(content) as Attempt;
  });

  return attempts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Delete an attempt by ID.
 */
export function deleteAttempt(id: string, dir: string = DEFAULT_DIR): void {
  const filePath = attemptPath(id, dir);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
