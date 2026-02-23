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
  combinations: string[][];
}

interface CreateAttemptInput {
  sourceText: string;
  wordListId: string;
  mappingSnapshot: [string, string][];
  mappingVersion: number;
}

const DEFAULT_DIR = "data/attempts";

/**
 * Migrate legacy attempts that have `chosenWords` instead of `combinations`.
 */
function migrateAttempt(raw: Record<string, unknown>, filePath: string): Attempt {
  const attempt = raw as unknown as Attempt;
  if ("chosenWords" in raw && !("combinations" in raw)) {
    const chosenWords = raw.chosenWords as string[];
    (attempt as any).combinations = [chosenWords];
    delete (attempt as any).chosenWords;
    writeFileSync(filePath, JSON.stringify(attempt, null, 2));
  }
  return attempt;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function attemptPath(id: string, dir: string): string {
  return join(dir, `${id}.json`);
}

/**
 * Create a new attempt with a unique ID, one empty combination, and persist it.
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
    combinations: [[]],
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
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  return migrateAttempt(raw, filePath);
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
    const filePath = join(dir, file);
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return migrateAttempt(raw, filePath);
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
