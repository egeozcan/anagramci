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
