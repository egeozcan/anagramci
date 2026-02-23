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
    const pairs: [string, string][] = [["c\u0327", "c"], ["s\u0327", "s"]];
    saveMappings("turkce", pairs, TEST_DIR);
    const m = getMappings("turkce", TEST_DIR);
    expect(m.pairs).toEqual(pairs);
    expect(m.version).toBe(1);
  });

  test("bumps version on each save", () => {
    saveMappings("turkce", [["c\u0327", "c"]], TEST_DIR);
    saveMappings("turkce", [["c\u0327", "c"], ["s\u0327", "s"]], TEST_DIR);
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
