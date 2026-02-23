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
    expect(wl!.dawg.contains("araba")).toBe(true);
  });

  test("getWordList returns null for unknown list", async () => {
    const wl = getWordList("nonexistent");
    expect(wl).toBeNull();
  });
});
