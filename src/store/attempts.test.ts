import { describe, expect, test, beforeEach } from "bun:test";
import {
  createAttempt,
  getAttempt,
  updateAttempt,
  listAttempts,
  deleteAttempt,
  getBans,
  withBans,
} from "./attempts";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

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
    expect(a.combinations).toEqual([[]]);

    const loaded = getAttempt(a.id, TEST_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.sourceText).toBe("merhaba dünya");
  });

  test("updates an attempt (add word to combination)", () => {
    const a = createAttempt({
      sourceText: "test",
      wordListId: "turkce",
      mappingSnapshot: [],
      mappingVersion: 0,
    }, TEST_DIR);
    updateAttempt(a.id, { combinations: [["te"]] }, TEST_DIR);
    const loaded = getAttempt(a.id, TEST_DIR);
    expect(loaded!.combinations).toEqual([["te"]]);
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

  test("migrates legacy chosenWords to combinations", () => {
    // Write a legacy attempt with chosenWords instead of combinations
    const legacyAttempt = {
      id: "legacy-test-id",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceText: "merhaba",
      wordListId: "turkce",
      mappingSnapshot: [],
      mappingVersion: 0,
      chosenWords: ["her", "ama"],
    };
    writeFileSync(join(TEST_DIR, "legacy-test-id.json"), JSON.stringify(legacyAttempt, null, 2));

    // getAttempt should migrate
    const loaded = getAttempt("legacy-test-id", TEST_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.combinations).toEqual([["her", "ama"]]);
    expect((loaded as any).chosenWords).toBeUndefined();

    // Verify migration was persisted
    const reloaded = getAttempt("legacy-test-id", TEST_DIR);
    expect(reloaded!.combinations).toEqual([["her", "ama"]]);
  });

  test("migrates legacy attempts in listAttempts", () => {
    const legacyAttempt = {
      id: "legacy-list-id",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceText: "test",
      wordListId: "turkce",
      mappingSnapshot: [],
      mappingVersion: 0,
      chosenWords: ["te"],
    };
    writeFileSync(join(TEST_DIR, "legacy-list-id.json"), JSON.stringify(legacyAttempt, null, 2));

    const all = listAttempts(TEST_DIR);
    expect(all.length).toBe(1);
    expect(all[0].combinations).toEqual([["te"]]);
  });

  test("withBans aligns bans with combinations and dedupes/sorts the target", () => {
    const a = createAttempt({ sourceText: "abc", wordListId: "turkce", mappingSnapshot: [], mappingVersion: 1 }, TEST_DIR);
    const three = updateAttempt(a.id, { combinations: [[], [], []] }, TEST_DIR);
    expect(getBans(three, 1)).toEqual([]);
    const bans = withBans(three, 1, (cur) => [...cur, "şeker", "çay", "çay"]);
    expect(bans).toEqual([[], ["çay", "şeker"], []]);
    const saved = updateAttempt(a.id, { bans }, TEST_DIR);
    expect(getBans(saved, 1)).toEqual(["çay", "şeker"]);
    expect(withBans(saved, 1, (cur) => cur.filter((w) => w !== "çay"))[1]).toEqual(["şeker"]);
  });

  test("getAttempt refuses ids that could escape the directory", () => {
    mkdirSync(`${TEST_DIR}/sub`, { recursive: true });
    writeFileSync(`${TEST_DIR}/sub/x.json`, JSON.stringify({ id: "x", combinations: [[]] }));
    writeFileSync("data/outside-attempt.json", JSON.stringify({ id: "o", combinations: [[]] }));
    try {
      expect(getAttempt("../outside-attempt", TEST_DIR)).toBeNull();
      expect(getAttempt("sub/x", TEST_DIR)).toBeNull();
    } finally {
      rmSync("data/outside-attempt.json", { force: true });
    }
  });
});
