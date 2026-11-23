import { describe, expect, test, beforeEach } from "bun:test";
import { rmSync } from "fs";
import { getHiddenWords, hideWord, unhideWord } from "./hidden";

const TEST_DIR = "data/test-hidden";

describe("Hidden words store", () => {
  beforeEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  test("empty for unknown word list", () => {
    expect(getHiddenWords("nope", TEST_DIR)).toEqual([]);
  });

  test("hide is idempotent, lowercases with Turkish locale, and sorts", () => {
    hideWord("tr", "zıt", TEST_DIR);
    hideWord("tr", "İz", TEST_DIR);
    hideWord("tr", "zıt", TEST_DIR);
    expect(getHiddenWords("tr", TEST_DIR)).toEqual(["iz", "zıt"]);
  });

  test("unhide removes the word", () => {
    hideWord("tr", "abc", TEST_DIR);
    hideWord("tr", "def", TEST_DIR);
    unhideWord("tr", "abc", TEST_DIR);
    expect(getHiddenWords("tr", TEST_DIR)).toEqual(["def"]);
  });
});

describe("Hidden words store safety", () => {
  test("rejects path-like word list ids", () => {
    expect(() => hideWord("../evil", "x", TEST_DIR)).toThrow();
    expect(getHiddenWords("../../package", TEST_DIR)).toEqual([]);
  });

  test("corrupt file falls back to empty", async () => {
    const { mkdirSync, writeFileSync } = await import("fs");
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(`${TEST_DIR}/bad.json`, "{not json");
    expect(getHiddenWords("bad", TEST_DIR)).toEqual([]);
  });
});
