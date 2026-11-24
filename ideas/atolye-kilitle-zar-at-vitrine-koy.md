# Atölye: Kilitle, Zar At, Vitrine Koy

> **Unchosen product direction** — saved for future reference.
>
> - **Direction key:** `flow`
> - **Iteration round:** 4
> - **Evaluator scores:** consistency 8.2 · design 7.4 · entertainment 7.3 · **avg 7.6**

## Evaluator's last critique

Average is about 7.6, below the 8.5 bar. The plan fits the codebase well, but it has a logic hole at the centre of its "slot machine" pitch, plus a conflict between the core loop and its own keyboard design.

STRENGTHS
- Fits the code. I checked these claims against it:
  - computeWorkspaceData (attempts.ts:73) has a clean extraction point for candidatesForPool.
  - renderAllBlocks/parseOpenParam already exist, and the data-all-blocks + pendingQueries restore loop (app.js:627-675) is exactly where a data-prev-ci lookup fits.
  - FillOptions already exposes minLen, limit, budgetMs and maxPerLead.
  - Locks/streaks as parallel arrays copy the bans pattern.
- Sound engineering choices:
  - asciiJson for HX-Trigger
  - 200 + toast for refusals, since HTMX ignores 4xx swaps
  - OOB toolbar on every mutation response
  - the argument that linear history keeps ci valid
- Testing is strong: the success-rate fixture and table tests for prevIndexMap.

MAIN PROBLEMS

1. The streak and celebration idea contradicts itself. A roll is always a full anagram, so the first roll from an imperfect state is always perfect.
   - Rule 8 says re-rolling an already-perfect block does not celebrate. So the toast can only ever say "1. zarda tuttu!". "3. zarda tuttu" can never happen, because undo also restores the streak to 0.
   - The "⚄n" badge therefore counts rerolls of an already-solved block. That means "how picky you were", not luck or skill. There is no chance of failure, so there is no slot-machine tension.
   - The plan's own integration test 4 expects anagram-perfect with rolls:2 on the second roll, which rule 8 forbids.
   - Fix: redefine the reward.
     - Option A: count rolls until the user *accepts*, via an explicit "Bu tamam" or lock-all action.
     - Option B: celebrate a new perfect phrase on each roll, with a "kombo" counter.
     - Option C: drop the luck framing and celebrate a newly found unique solution, e.g. "12 farklı çözüm keşfettin".
   - Make the test match whichever you pick.

2. ⌘Z versus focus retention.
   - The plan keeps focus in the word input after Enter and after ⌘Enter, but ⌘Z only works outside inputs.
   - So in the most common moment of the loop (type or roll, dislike it, undo), ⌘Z triggers the browser's text undo in an empty input and nothing else happens.
   - Fix: when the focused input is a .word-input whose value is empty (or has no text-undo history), route ⌘Z/⇧⌘Z to app undo. Also allow `r`, or Alt+R, from an empty word input.

3. There is no reason to lock.
   - Rolls with zero locks already give a perfect anagram of the whole source. So the "skill" of locking only means "keep the word I like".
   - Nothing makes rolling with locks more interesting than browsing Tamamla.
   - Consider a lightweight quality signal for each roll, such as the existing displacement metric shown as a delta, or a "nadir" tag when the roll includes a long word. That gives players something to chase.

4. Roll variety is underspecified.
   - The fill ranking puts fewer words first, and a uniform pick from the top 120 solutions under a diversity cap will cluster on 1–2-word solutions for short pools. Long sources truncate at 100 ms with no locks.
   - State the distribution: weight by k, or sample across k groups.
   - Add a test asserting that ≥N distinct keys appear in 10 rolls on a 15+ letter source.

5. Scope and risk.
   - Every mutation route moves to respond/commitBlock.
   - Delete-combination is rewritten, and so is the query-restore hook.
   - Three new modules, a new JS file, and an index-remapping layer.
   - That is a lot of surface for the minimal-impact rule.
   - Phase A (history) is a big refactor before any fun ships. Consider shipping roll + locks first, with a simple single-step "geri al" for the last roll, and generalizing after.

SMALLER ISSUES
- updatedAt changes on undo/redo, which reorders the home list. Decide whether that is intended.
- Locks stored by position plus a multiset check on PUT means a stale page can reorder duplicates oddly. That is acceptable, but say so.
- The capture-phase toggle tracking and the "most recently opened block" rule for `r` add hidden state. A visible marker on the active block would help.
- The 2 s-era budget is fine, but there is no client loading state beyond a 300 ms wobble. Roll latency can reach about 200 ms plus findAvailable.
- Badge on the home card: say how it looks for imperfect combinations with streak > 0, since streak resets only on manual edits.

---

# Atölye: Kilitle, Zar At, Vitrine Koy

A lock-and-reroll loop with scored discoveries, a showcase of finds, and undo, built on Tamamla.

## 1. Pitch

Anagramcı already finds the words. What it lacks is a loop worth repeating. Today:

- **Mistakes cost clicks.** Deletes are final.
- **Tamamla is a list.** You read through it; nothing surprises you.
- **Success is silent and unranked.** A perfect anagram only changes a CSS class. "ebabil bir kuştur" rearranged into itself counts the same as a brilliant scramble. The displacement number that could tell them apart is unexplained.

Atölye fixes all three with one loop:

1. **Zar at (⚄).** Every unlocked word is replaced by a random complete anagram of the leftover letters. It respects locks, bans and hidden words.
2. **Every roll is scored.** The result gets a **Puan** from 0 to 100 and a tier: *Sıradan*, *İyi*, *Nadir* or *Efsane*. The score is built from three things you can see in a tooltip:
   - how scrambled the letters are (the displacement metric, now explained)
   - how long the longest word is
   - how few words the phrase uses
   - Words copied straight from the source are penalised.
3. **New phrases go into the Vitrin** (showcase): "Yeni keşif · Nadir 72". Beating the attempt's best score triggers the big moment: "Yeni rekor! 87 ★", with mosaic tiles flipping across the phrase.
4. **Locks are the skill.** When a roll contains a word you love, for example a long rare one worth points, lock it and reroll the rest to climb towards *Efsane*. This is hill-climbing with dice. ⌘Enter with a word typed in the input adds it, locks it and rolls the rest in one stroke.
5. **Undo is the safety net.** Press ⌘Z (it works straight from the empty word input) and you are back where you were. Phrases you found stay in the Vitrin, so a roll never costs you anything and a find is never lost.
6. **Hand-made counts too.** A perfect phrase you build by hand goes into the Vitrin with a ✋ mark and a small bonus.

Why this fixes the previous revision's hole: the reward is no longer "you got a perfect anagram", which a roll guarantees. It is **which** perfect anagram you got: new or repeat, and its tier and score against your record. Each roll is a draw from a varied distribution, so there is real slot-machine tension, and locking has a purpose.

### Changes from the previous revision

- **Cut:**
  - the streak counter and the "⚄n" badge, which were self-contradictory
  - fork (Çatalla); the Vitrin's "Kullan" covers the same "keep this and keep exploring" need
  - the two kinds of history entry; there is now one snapshot kind
  - the in-process recent-roll memory; the persisted Vitrin does that job
- **Added:**
  - the score (`src/score.ts`) with its breakdown tooltip
  - the Vitrin, a persisted per-attempt log of finds with a record
  - stratified roll sampling across word counts, plus a `limitPerK` fill option
  - ⌘Enter as "add, lock and roll"
  - ⌘Z from an empty word input
  - a visible active-block marker
  - a spinning loading state
- **Re-phased:** Phase A ships the whole fun loop: locks, roll, score, Vitrin and block-level undo. Adding or deleting a combination simply clears history in Phase A. Phase B makes add and delete undoable with index remapping and adds "Kullan".

## 2. User experience, step by step

1. **Open a workspace.**
   - The header gains two things.
   - A toolbar: `↶ Geri al` and `↷ Yinele`.
     - Each tooltip names the step and its shortcut, for example "Geri al (⌘Z): zar atıldı: 'kuşu · ribat'".
     - When there is nothing to apply, the tooltip reads "Geri alınacak bir şey yok" and the button is shown disabled.
   - A collapsed **Vitrin** bar: "Vitrin · 0 keşif".
2. **Type and press Enter.** `ebabil` is added, and the cursor stays in the word input, which is now empty again.
3. **Roll.** Use any of:
   - click **⚄ Zar at** at the end of the word-input row
   - `r` with focus outside text fields
   - ⌘/Ctrl+Enter in the word input

   What you see:
   - While the request runs, the die spins and the button shows `aria-busy`.
   - The new word list is the locked words in order, followed by the rolled words. Rolled words drop in like tiles, staggered.
   - The block summary now shows a **tier chip** where the displacement number was, for example `Nadir 72`. Hovering it shows "Karışım 38 · Uzun kelime 19 · Az kelime 10 · Kaynak kelime ×0.6".
   - A new phrase shows the toast "Yeni keşif · Nadir 72" and a short tile flip. A new record shows "Yeni rekor! 87 ★" with the full tile wave and a green glow, and the Vitrin header pulses.
4. **⌘Enter with text.** Type `kuş` and press ⌘Enter.
   - `kuş` is appended and locked, and the rest is rolled, all as one undo step labelled "'kuş' kilitlendi + zar".
   - If `kuş` does not fit the pool, the words are added as with plain Enter and a toast explains why no roll happened.
5. **Lock.** A padlock next to each chosen word toggles its lock.
   - A locked word gets a stone-inlay style and a filled padlock in place of ×.
   - Double-click editing is disabled on it.
   - It can still be dragged, and the lock follows the word.
6. **Roll again.** Rolls prefer phrases not already in the Vitrin.
   - If every option has already been found, you get one anyway with the muted toast "Bunu daha önce bulmuştun · İyi 51" and no animation.
   - If the locked words use every letter, the toast reads "Tüm harfler kilitli kelimelerde".
   - If no solution exists even with 2-letter words, the toast reads "Bu kilitlerle tam çözüm bulunamadı — bir kilidi açmayı dene".
7. **Climb.** You see a roll containing "kurbağalı", lock it, and roll the rest. The score chip shows whether you climbed.
8. **Reorder.** Dragging the words of a perfect block changes the karışım. If the new order beats that find's stored score, you get the toast "Daha iyi sıralama: 72 → 78" and the Vitrin entry is updated. A lower score changes nothing.
9. **Undo and redo.** Use ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Y, or the toolbar.
   - The shortcuts work when focus is outside editable fields, **or in an empty `.word-input`**, which is where focus sits after Enter, a roll or ⌘Enter.
   - In a non-empty input, or in the inline editor, the browser's own text undo applies.
   - Undo covers add, remove, reorder, inline edit, roll, lock and unlock, and ban and unban; in Phase B it also covers adding and deleting a combination.
   - The affected block opens and flashes.
   - **Finds are not undone.** The Vitrin is a log of what you discovered.
10. **Vitrin.** Expanding the bar shows the top 10 finds by score. Each row shows:
    - a tier chip and the score
    - the phrase
    - ✋ if it was built by hand
    - in Phase B, a **Kullan** button that loads the phrase into a new combination, which opens.

    The header reads "Vitrin · 12 keşif · 31 zar · Rekor 87".
11. **Home page.** An attempt card with finds shows "★ 87 · 12 keşif" next to the date. Cards without finds show nothing extra; no per-combination badges are added.
12. **Feedback.** Refused actions show a 3-second Turkish toast instead of failing silently. Examples:
    - removing a locked word from a stale page
    - deleting the last remaining combination
    - a PUT that drops a locked word

### Shortcuts

**Active block.** This is the block containing focus; otherwise the most recently opened block; otherwise the first open block. The active block is **visibly marked** with `.combination-block--active` (a 3 px accent bar on the left), so you always know where `r` will roll.

| Key | Where | Action |
|---|---|---|
| `Enter` | word input | Add the word(s); focus stays in the input |
| `⌘/Ctrl+Enter` | word input | Empty input: roll. With text: add, lock and roll |
| `r` | outside editable fields | Roll in the active block |
| `⌘Z` / `Ctrl+Z` | outside editable fields, or an empty word input | Undo |
| `⇧⌘Z` / `Ctrl+Y` | same | Redo |
| `Esc` | word input | Blur, so `r` works next |

**Guards.** `r` is ignored when:

- focus is in an input, textarea, select or contenteditable element
- `e.isComposing` is set
- any modifier key is held
- `e.repeat` is set

Undo and redo are ignored when `e.isComposing` is set.

Shortcut hints live in tooltips. There is no help dialog.

## 3. UI and visual design notes

- **Tier chips** (`.tier-chip--sade|iyi|nadir|efsane`) are small mosaic tiles that reuse the palette tokens:
  - Sıradan: stone grey
  - İyi: sand
  - Nadir: turquoise
  - Efsane: terracotta with a gold inset border

  The chip shows the label and the score. Its `title` carries the breakdown. It replaces `.combination-displacement` only when the block is perfect; imperfect blocks keep the raw number, which now has the tooltip "Yer değiştirme — mükemmel olunca puana dönüşür".
- **Roll button** (`.btn-roll`):
  - terracotta accent, label "⚄ Zar at"
  - `hx-disabled-elt="this"`
  - while `.htmx-request` is set, the die spins continuously and the block's summary phrase gets a 1.2 s shimmer, so latency up to about 250 ms reads as "rolling" rather than lag
- **Rolled items.** `.chosen-word-item--rolled` drops in with `translateY(-8px) rotateX(90deg)` → rest, delayed by `calc(var(--i) * 40ms)`.
- **Locked items.**
  - `.chosen-word-item--locked` gets an inset `--stone-dark` ring, a warmer background and a filled padlock.
  - The outline padlock on unlocked items appears on hover or focus-within, and is always visible under `@media (hover: none)`.
- **Celebrations** use the Web Animations API, which the hover morph already uses. There are three intensities:
  - repeat: toast only
  - new find: letter spans flip `rotateY` 0→180°, 300 ms, 15 ms stagger
  - new record: a full 0→360° wave that cycles the tile colours, 500 ms with a 25 ms stagger, plus a 1.2 s green outline glow and a pulse on `#vitrin-summary`
- **Vitrin.**
  - A `<details id="vitrin">` in `.workspace-header`, collapsed by default.
  - Rows are a compact list with the chip, the phrase in Bitter, ✋, and (Phase B) "Kullan" as `btn-sm btn-secondary`.
- **Toolbar.**
  - `#history-controls.workbench-tools` uses the `btn btn-sm btn-secondary` styles with the glyphs ↶ ↷.
  - A disabled button gets `aria-disabled="true"` and 40% opacity, and keeps its tooltip.
- **Toast.** `#toast` is a fixed stone card at the bottom right with `role="status"` and `aria-live="polite"`. A muted variant (`.toast--muted`) is used for repeats and refusals.
- **Flash and focus.**
  - The flash is `.combination-block--flash`, a 600 ms fade of the accent outline.
  - A 2 px `:focus-visible` accent ring appears on the roll button, padlocks, toolbar and Vitrin buttons.
- **Motion and placement.**
  - Under `prefers-reduced-motion`, every animation becomes a static glow plus the toast.
  - All new CSS goes in a `/* === Atölye === */` section at the end of `style.css`. Existing rules are not edited.
- **Strings.**
  - All new strings are proper Turkish.
  - Two touched strings are fixed:
    - "Degisik Bir Kombinasyon Ekle" → "Değişik Bir Kombinasyon Ekle"
    - "En az bir kombinasyon olmalidir" → "En az bir kombinasyon olmalıdır", now shown as a toast

## 4. Technical design

### 4.1 Data model (`src/store/attempts.ts`)

```ts
export interface Find {
  key: string;        // tr-TR-sorted words joined by " " (word-set identity)
  words: string[];    // best-scoring order seen
  score: number;      // 0..100
  hand: boolean;      // completed by a manual edit, not a roll
  at: string;         // ISO time first found
}
export interface Snapshot { combinations: string[][]; bans: string[][]; locks: number[][] }
export interface HistoryEntry {
  label: string;
  ci: number;                                   // block to open/flash
  before: Snapshot;
  shift?: { at: number; delta: 1 | -1 };        // Phase B: add/delete/use
}
export interface Attempt {
  // ...existing...
  locks?: number[][];
  finds?: Find[];
  rollCount?: number;
  history?: { past: HistoryEntry[]; future: HistoryEntry[] };
}
```

- **One kind of history entry: a full snapshot.**
  - An attempt's editable state is a handful of short string arrays, so 30 snapshots stay small, around 10–30 KB for a typical attempt.
  - Undo pops `past`, pushes the current snapshot onto `future` with the same label, `ci` and shift, then applies `before`.
  - Linear history plus "every forward action clears `future`" keeps `ci` valid by construction.
  - As a defence against hand-edited files, `ci` is still clamped when it is used.
- **Finds and the roll count sit outside history.** They are a discovery log: undo never removes a find.
  - Finds are capped at 300; on overflow the lowest score is evicted.
  - Record = `max(score)`.
- **`updatedAt` changes on undo and redo.** This is intentional: undo is an edit, so the attempt moves to the top of the home list.
- **Positional lock invariants**, enforced server-side:

| Operation | Effect on locks |
|---|---|
| choose (append) | unchanged |
| remove index i | refused (toast) if i is locked; otherwise indices > i shift down |
| roll | words = locked words in order + rolled; locks = `0..L-1` |
| roll with `add` | the added words are appended and locked first, then the roll proceeds |
| `PUT /chosen` | The client sends `locked_i=1` per `li[data-locked]`. Accepted only if the multiset of locked words is unchanged; otherwise 200 + the unchanged block + a toast. |
| lock / unlock | add or remove the index (validated in range) |

  **Stale duplicates.** With duplicate words, for example "a a" with one locked, a stale page can move the lock to the other copy of the same word. This is accepted, because the multiset check guarantees the same locked letters.

- **Store helpers:**
  - `getLocks(a, ci)`, which prunes out-of-range indices
  - `lockedWords(words, locks)`
  - `snapshot(a)` / `applySnapshot(a, s)`
  - `normalizeParallel(a)`, which pads bans and locks to `combinations.length` and replaces the ad-hoc padding in delete-combination
  - `commit(id, mutate: (a) => void, label, ci, shift?, dir)`: read, snapshot, mutate, `history.record`, write, synchronously
  - `updateAttempt` stays for refresh-mapping and for undo and redo themselves, which are not recorded

### 4.2 Pure modules (new, unit-tested, no fs)

**`src/score.ts`**

```ts
export type Tier = "sade" | "iyi" | "nadir" | "efsane";
export interface ScoreBreakdown { karisim: number; uzun: number; az: number; kaynakFactor: number; hand: number; total: number; tier: Tier }
export function scorePhrase(sourceText: string, words: string[], normalizer: Map<string,string>, hand: boolean): ScoreBreakdown
export function tierOf(score: number): Tier          // <40 sade, <60 iyi, <80 nadir, else efsane
export const TIER_LABEL: Record<Tier, string>         // Sıradan, İyi, Nadir, Efsane
```

- **Letter count.** `n` = the number of normalized letters in the source.
- **Karışım** = `50 × min(1, displacement / (n² / 3))`. `n²/3` is roughly the expected displacement of a random permutation, so a typical good scramble lands near 1.
  - Displacement comes from a shared `charMapping(sourceText, words, normalizer)` that is **extracted from the inline char-map loop in `combinationBlock`** (components.ts, around lines 280–325) into `anagram.ts`.
  - The template and the score then use the same function, so the summary number and the score can never disagree.
- **Uzun kelime** = `30 × longestWordLetters / n`.
- **Az kelime** = `20 × 1 / wordCount`.
- **Kaynak cezası.** The total is multiplied by `0.6^m`, where `m` is the number of chosen words that equal a source word (normalized, tr-TR lowercased). So the identity "anagram" scores near 0.
- **El yapımı.** `+8` when `hand`, with the total capped at 100.
- **Rounding.** The total is rounded to an integer.
- **Tuning.** The constants are tuned once in Phase A, against the calibration test in §5.

**`src/reroll.ts`**

- `rollPool(sourcePool, lockedWords, normalizer)` returns the leftover pool, or `null` if the locked words overflow it.
- `setKey(words)` returns the words sorted in tr-TR order and joined by a space.
- `pickRoll(solutions, lockedWords, avoid: Set<string>, rng = Math.random)` returns `{ words, repeat: boolean } | null`.
  - **Stratified sampling:**
    1. Bucket the solutions by `slots.length`, which is k.
    2. Pick a k uniformly among the non-empty buckets.
    3. Pick a solution uniformly within that bucket.
    4. Pick a random alternative in each slot.
    5. Fisher–Yates shuffle the slot order.

    This stops short pools from clustering on 1–2-word solutions.
  - **Avoidance:**
    - Redraw up to 12 times while `setKey([...locked, ...rolled])` is in `avoid`.
    - Then scan a shuffled copy of the solutions, using each slot's first alternative, for any key not in `avoid`.
    - If none is found, return the last draw with `repeat: true`.
  - Returns `null` for an empty list.

**`src/history.ts`**

- `HISTORY_CAP = 30`.
- `record(attempt, entry)` pushes onto `past`, trims to the cap and clears `future`.
- `undo(attempt)` / `redo(attempt)` return `{ attempt, entry } | null`.
- Phase B: `prevIndexMap(entry, direction, newCount): (number | null)[]` gives, for each resulting index, that block's index before the swap, or `null` if the block is new or restored.
  - Undoing a delete at `at`: `i<at→i`, `at→null`, `i>at→i-1`.
  - Undoing an insert: the inverse.
  - Redo mirrors both.
  - An entry without `shift` maps every index to itself.
- `openAfter(prevOpen, map, target)` returns the new indices whose previous index was open, plus `target`.

### 4.3 Fill option (`src/fill.ts`, a small change)

Add `limitPerK?: number` to `FillOptions`.

- **When set:**
  - `limit` and `leadCount` apply **per word count k**, with the counters reset each k.
  - The k-loop no longer stops at the global `final.length < limit`; it still stops on budget, `maxWords` or `total < minLen*k`.
- **Why it is needed.** Today the loop ends as soon as k=1..2 fill `limit` (`for (let k = 1; ... && final.length < limit ...)`), so a roll could never see 3–4-word solutions.
- **Default behaviour is unchanged.** Existing tests guard this, and a new unit test asserts that higher-k solutions appear only with `limitPerK`.

### 4.4 Routes (`src/routes/attempts.ts`)

**`respond(attempt, body, events?)`** returns `html(body + historyControls(attempt, true) + vitrinOob(attempt))`.

- `vitrinOob` emits `#vitrin-summary` (`hx-swap-oob="true"`) and `#vitrin-body` (`hx-swap-oob="innerHTML"`), so the `<details>` keeps its open state.
- It sets `HX-Trigger: asciiJson({ "anagram-toast": {msg, muted}, "anagram-find": {ci, score, tier, label, isNew, isRecord, improved} })`, with each key included only when present.
- `asciiJson` escapes every non-ASCII code unit as `\uXXXX`, because headers must be ASCII.
- **Every** 200 response from attempt mutation routes uses it, including refusals, ban and unban, and hide and unhide.
- Refusals return 200 with the unchanged fragment and a toast, because HTMX ignores 4xx swaps.
- An unknown id stays 404. A malformed or out-of-range `ci` or `index` stays 400.

**`candidatesForPool(attempt, ci, pool)`** is extracted from `computeWorkspaceData` (attempts.ts:73): `findAvailable`, minus hidden words, minus bans. `computeWorkspaceData` calls it, so its behaviour is unchanged.

**`recordFind(attempt, ci, normalizer, hand)`** runs after every forward block edit.

- If the block is perfect (`isPerfect` moves into `anagram.ts`), compute `scorePhrase` and `setKey`.
  - **New key:** push a find; `isNew`; `isRecord` if the score is above the previous best.
  - **Existing key with a higher score:** update the order and score, and set `improved: {from, to}`.
  - **Otherwise:** nothing for non-roll routes. A roll with `repeat` produces a muted toast.
- Event rules:
  - The event fires **only when the block's word list changed** in that request, so lock or ban toggles on a perfect block stay silent.
  - It never fires from undo or redo.
- `isPerfect` also replaces the inline checks in `combinationBlock` (around components.ts:269) and on the home card (around components.ts:105–117). The home card keeps using the current mapping, as an explicit non-goal.

**Changed routes (Phase A)**

| Route | Recording | Label |
|---|---|---|
| `POST /:id/choose` | `commit` + `recordFind(hand)` | `'w1 w2' eklendi` |
| `DELETE /:id/chosen/:index` | refused if locked; shifts locks | `'w' çıkarıldı` |
| `PUT /:id/chosen` | lock-multiset check; `recordFind(hand)` | `sıralama değişti` / `'old' → 'new' düzenlendi` |
| `POST/DELETE /:id/ban` | `commit` | `'w' yasaklandı` / `'w' yasağı kaldırıldı` |
| `POST /:id/combinations`, `DELETE /:id/combinations/:ci` | **Phase A: clear history** (indices shift); B: `commit` with a shift | B: `yeni kombinasyon` / `(n) silindi` |
| `POST/DELETE /:id/hide` | not recorded; goes through `respond` | — |

The "Sil" button gains `data-all-blocks`, so `open=` is sent.

**New routes**

| Route | Phase | Behaviour |
|---|---|---|
| `POST` / `DELETE /:id/lock` (`ci`, `index`) | A | Lock or unlock. Labels `'w' kilitlendi` / `'w' kilidi açıldı`. Returns the block. |
| `POST /:id/combinations/:ci/roll` (`add?`) | A | See §4.4.1. Returns the block with `rolledFrom = L`. |
| `POST /:id/undo`, `POST /:id/redo` (`open=`) | A | Apply and save with `updateAttempt`. Return all blocks, open = `openAfter(...)`, with `data-flash` on the clamped `entry.ci`. Empty history: unchanged blocks + toast "Geri alınacak bir şey yok" / "Yinelenecek bir şey yok". |
| `POST /:id/finds/use` (`key`, `open=`) | B | Append a combination with the find's words (`commit` with shift `{at:n, delta:+1}`, label `vitrinden alındı`); the new block is open with `data-focus-input`. |

#### 4.4.1 Roll algorithm

1. **Normalizer.** Build it from `mappingSnapshot`.
2. **`add` words.** If `add` is non-empty, split it on whitespace.
   - If the words fit the remaining pool, append them and add their indices to the locks.
   - Otherwise, fall back to plain choose semantics with the toast "'x' sığmıyor — eklendi ama zar atılmadı", and stop.
3. **Leftover pool.** `L = lockedWords(...)`, `pool = rollPool(textToPool(source), L, normalizer)`.
   - `null` → toast, no change.
   - Empty → toast "Tüm harfler kilitli kelimelerde", no change.
4. **Candidates.** `candidates = candidatesForPool(attempt, ci, pool)`.
5. **Pass 1:** `findFullAnagrams(candidates, pool, normalizer, { minLen: total <= 2 ? 1 : 3, limit: 25, limitPerK: 25, maxPerLead: 2, budgetMs: 120 })`.
6. **Pass 2:** only if pass 1 found nothing and `total > 2`, repeat with `minLen: 2` and `budgetMs: 80`. Hidden junk is already filtered out.
7. **Pick.** `pick = pickRoll(solutions, L, new Set(finds.map(f => f.key)), rng)`.
   - `null` → toast "Bu kilitlerle tam çözüm bulunamadı — bir kilidi açmayı dene", and **no history entry**.
8. **Commit.**
   - words = `[...L, ...pick.words]`, locks = `0..L.length-1`
   - `rollCount++`
   - label `zar atıldı: 'a · b · c'`, with `'x' kilitlendi + ` as a prefix when `add` was used
   - then `recordFind(hand: false)`, with `repeat` → muted toast
9. **Latency.** A truncated result is fine, because a roll needs only one solution. The worst case is about 200 ms plus `findAvailable`; the spinner and shimmer cover it, and `hx-disabled-elt` stops rolls from stacking.

`rng` comes from a module-level `let rollRng = Math.random`, with an exported `setRollRng` that only tests use.

### 4.5 Templates

**New `src/templates/workbench.ts`:**

- `historyControls(attempt, oob)`
  - ids `undo-btn` and `redo-btn`
  - `hx-post`, `hx-target=".combinations-container"`, `hx-swap="innerHTML"`, `data-all-blocks`
  - tooltips built from the label and the shortcut
- `vitrin(attempt)` / `vitrinOob(attempt)`: the top 10 by score, the summary counts and the record
- `tierChip(breakdown)`: label, score, and the breakdown as the `title`
- `lockButton(id, ci, index, locked)`, `rollButton(id, ci)`, `toastRegion()`
- `homeFindsBadge(attempt)`: "★ 87 · 12 keşif"

**Hooks in `components.ts`:**

- `combinationBlock` gains one trailing `opts: { locks?, rolledFrom?, flash?, focusInput?, prevCi?, score? }`.
  - When the block is perfect, it renders `tierChip` in place of the displacement span.
  - It renders the attributes `data-flash`, `data-focus-input` and `data-prev-ci` (Phase B).
- `chosenWordsPanel` receives `locks` and `rolledFrom`.
  - It renders `data-locked`, the lock button, `--i`, `.chosen-word-item--rolled` and `id="word-input-${ci}"`.
  - It renders the roll button with `hx-include` of the input, named `add`, so the server sees the typed text on ⌘Enter. The plain click sends an empty `add` because `keys.js` clears it; see §4.6.
- `workspaceContent` adds the toolbar, the Vitrin and the toast region.
- The home card appends `homeFindsBadge`.

### 4.6 Client JS

**New `static/keys.js`.** A vanilla IIFE with `defer`, loaded after `app.js` in `layout.ts`. Every listener is delegated on `document`.

- **`keydown`.** Implements the shortcut table and its guards by calling `.click()` on the server-rendered buttons: `#undo-btn`, `#redo-btn` and the active block's `.btn-roll`.
  - ⌘Enter in a word input sets `data-roll-add` from the input value, clears the input and clicks the roll button.
  - A plain click sends `add` as empty: the `htmx:configRequest` handler sets `add` from `data-roll-add` only when present, then removes it.
  - The undo routing check is `isEditable(el) && !(el.matches(".word-input") && el.value === "")`; it handles the input when that is false.
- **Active block.**
  - A capture-phase `toggle` listener, plus `focusin`, sets `.combination-block--active` on exactly one block.
  - On `htmx:afterSettle` the class is re-applied by index, through `data-prev-ci` when present.
- **Focus restore.**
  - On `htmx:beforeRequest`, remember N when `#word-input-N` has focus.
  - On `htmx:afterSettle`, focus it again, or focus the input inside `[data-focus-input]`.
- **Toast.** On `anagram-toast`, call `showToast(msg, muted)`, which clears any previous timer.
- **Find events.** `anagram-find` is stashed; on the next `htmx:afterSettle` the celebration plays on `#combination-<ci> .combination-preview span`:
  - repeat: toast only
  - new: flip plus the toast "Yeni keşif · {label} {score}"
  - record: wave, glow, Vitrin pulse, and the toast "Yeni rekor! {score} ★"
  - improved: the toast "Daha iyi sıralama: {from} → {to}"

  With reduced motion, every case shows only the glow and the toast.
- **Flash.** On `htmx:afterSettle`, `[data-flash]` gets the flash class and scrolls into view with `block: "nearest"`.

**Hooks in `app.js`.** Four small changes, each marked `// Atölye hook`:

1. The dblclick inline edit returns early on `li[data-locked]`.
2. Both PUT builders add `locked_i: "1"` for each `li[data-locked]`, keeping a plain object.
3. The summary-button click-stop selector also matches the Vitrin's "Kullan" button and the tier chip.
4. **Phase B, query restore.** In the `afterSettle` restore loop (app.js around 655–675), look up `.combination-block[data-prev-ci="ci"]` before falling back to `#combination-ci`, then use that block's current index.

### 4.7 Files touched

| File | Change |
|---|---|
| `src/score.ts` (new) | `scorePhrase`, `tierOf`, `TIER_LABEL` |
| `src/reroll.ts` (new) | `rollPool`, `setKey`, stratified `pickRoll` |
| `src/history.ts` (new) | `record`, `undo`, `redo`, cap; Phase B: `prevIndexMap`, `openAfter` |
| `src/fill.ts` | `limitPerK` option |
| `src/anagram.ts` | `isPerfect`, `charMapping` (extracted) |
| `src/store/attempts.ts` | `locks`, `finds`, `rollCount`, `history`; `snapshot`, `applySnapshot`, `commit`, `normalizeParallel` |
| `src/routes/attempts.ts` | `respond`, `asciiJson`, `candidatesForPool`, `recordFind`; recorded mutations; lock, roll, undo and redo routes; Phase B: `finds/use` |
| `src/templates/workbench.ts` (new) | Toolbar, Vitrin, tier chip, lock and roll buttons, toast, home badge |
| `src/templates/components.ts` | Opts object, `charMapping` and `isPerfect` use, chip, input id, two string fixes |
| `src/templates/layout.ts` | `keys.js` script tag |
| `static/keys.js` (new) | Shortcuts, active block, focus, toast, celebrations, flash |
| `static/app.js` | Four marked hooks |
| `static/style.css` | Atölye section at the end |
| `scripts/smoke-atolye.sh` (new) | Browser smoke test |
| `CLAUDE.md` | Locks, finds and score, the snapshot history, `respond` and "refusal = 200 + toast", ASCII `HX-Trigger`, `limitPerK`, `keys.js`; Phase B: `data-prev-ci` |

### 4.8 Phases

Each phase ends with `bun test` green and a `feat:` commit.

- **A. The loop.**
  - Covers: score, Vitrin, locks, roll (including `add`), `limitPerK`, toast and celebrations, block-level undo and redo, the shortcuts, the active-block marker and refusal toasts.
  - Adding or deleting a combination clears history.
  - Done when integration tests 1–9 and 11–13 pass and the smoke script passes.
- **B. Structural undo and Vitrin "Kullan".**
  - Covers: `commit` with shift for adding and deleting a combination and for `finds/use`, `prevIndexMap`, `openAfter`, `data-prev-ci` and app.js hook 4.
  - Done when integration test 10 passes and the smoke step "undo the delete of block 1 keeps block 2's search text" passes.

## 5. Test plan

### Unit tests (`bun test`)

**`src/score.test.ts`**

- The identity phrase ("ebabil bir kuştur" → the same words) scores below 10.
- A single-word perfect anagram of a 6-letter source scores at least 80.
- The source-word penalty applies once per matching word.
- The hand bonus is capped at 100.
- Tier boundaries: 39/40/59/60/79/80.
- The breakdown parts multiply out to the total.
- `charMapping`-based displacement equals the number currently rendered for existing fixtures. This is a regression guard for the extraction.

**`src/reroll.test.ts`**

- `rollPool` handles locks, the â→a mapping and overflow (`null`).
- `pickRoll` with a seeded rng is deterministic.
- On a fixture with 100 k=2 solutions and 5 k=3 solutions, 40 draws include k=3 at least 12 times (stratification).
- Both et and te appear across seeds.
- Keys in `avoid` are skipped when an alternative exists, including through the scan fallback.
- When everything is avoided, the result has `repeat: true`.
- An empty list returns `null`.

**`src/history.test.ts`**

- `record` pushes and clears `future`.
- The cap of 30 drops the oldest entry.
- Undo and redo restore snapshots exactly.
- Undo on empty history returns `null`.
- Deep-copy isolation.
- Phase B: `prevIndexMap` table tests:
  - undo of a delete at 1 with 3 resulting blocks gives `[0, null, 1]`
  - undo of an insert at 2 with 2 resulting blocks gives `[0, 1]`
  - redo mirrors both
  - an entry without a shift gives the identity map
- Phase B: `openAfter` with a clamped target.

**`src/fill.test.ts`**

- With `limitPerK`, a pool that has more than 25 2-word solutions still returns 3-word solutions; the same call without it does not.
- Defaults are unchanged.

**`src/store/attempts.test.ts`**

- `getLocks` prunes out-of-range indices.
- `lockedWords` handles duplicates.
- `commit` snapshots before the change and updates `updatedAt`.
- A legacy file without the new fields loads.
- `normalizeParallel` pads short arrays.
- Finds are capped at 300 by evicting the lowest score.

**Misc**

- `asciiJson` output is ASCII, and Turkish strings round-trip through `JSON.parse`.
- `isPerfect` matches the existing perfect fixtures, and the block and home-card classes render the same as before.

### Integration tests (`src/integration.test.ts`, describe "Atölye")

1. **First roll.** On "ebabil bir kuştur" with "ebabil" locked:
   - the result is perfect, with "ebabil" first and locked
   - the rolled words all come from `candidatesForPool`
   - `HX-Trigger` has `anagram-find` with `isNew` and `isRecord` both true
   - the response contains the OOB `#vitrin-summary` showing "1 keşif"
   - `rollCount` is 1
2. **Second roll.** It gives a different `setKey` than the first (avoidance through the Vitrin) and `isNew: true`. `isRecord` is true exactly when the score is above the first one's.
3. **Roll with `add=kuş`.** "kuş" is appended and locked, the rest is rolled, and there is exactly one history entry whose label contains "kilitlendi + zar".
4. **Variety.** On a source of 19 letters with no locks, 10 rolls give at least 7 distinct keys and at least 2 distinct word counts.
5. **Success rate.** On five real phrases, each with its first word locked, at least 4 roll successfully.
6. **2-letter fallback.** A leftover that only works with a 2-letter word (a source built as `<word> ve`) rolls successfully.
7. **Unsolvable rolls.** An unsolvable leftover returns the words unchanged, a toast, no history entry and an unchanged `rollCount`. When the locked words use every letter, the response is a toast.
8. **Hand-made finds.**
   - Building a perfect phrase by hand creates a find with `hand: true` and the +8 bonus.
   - A PUT reorder that raises the score sends `improved` and updates the find.
   - A lowering reorder changes nothing.
   - Toggling a lock on a perfect block fires no `anagram-find`.
9. **Undo and redo.**
   - Choose two words, then undo: one word is left, and the response has the OOB `id="history-controls"`.
   - Redo restores the second word.
   - Undo after a roll restores the previous words while the find stays in the Vitrin.
   - Undo on a fresh attempt returns 200 with a toast.
   - Hide and unhide are not recorded but do carry the OOB toolbar.
   - In Phase A, adding or deleting a combination clears history: the undo button is `aria-disabled`.
10. **Phase B structural undo.**
    - Undoing the delete of block 1 with `open=0,1` (two blocks left) gives three blocks, blocks 0 and 1 open, `data-prev-ci` values `0, absent, 1`, and the flash on block 1.
    - `finds/use` appends an open block holding the find's words, and undoing it removes the block.
11. **Locks.**
    - After a lock, the item has `data-locked` and no remove button.
    - A DELETE on a locked index returns 200, the words unchanged and a toast.
    - A PUT that drops a locked word is refused.
    - A PUT that reorders with matching `locked_i` is accepted, and the lock follows the word.
    - With "a a" and only the second locked, removing index 0 moves the lock to 0.
12. **Home card and calibration.**
    - The home card shows "★ {best} · {n} keşif" after rolls, and nothing for an attempt without finds.
    - **Calibration:** 5 phrases × 12 rolls produce at least 3 distinct tiers, Efsane is at most 25% of rolls, and Sıradan is at most 50%. This test is what the score constants are tuned against.
13. **Validation.** An out-of-range `ci` or `index` on the new routes returns 400. An unknown id returns 404. Deleting the last combination returns 200, a toast and an unchanged block count.

### Browser smoke (`scripts/smoke-atolye.sh`)

The script uses `playwright-cli` against `bun run src/index.ts` on a temporary port. It is committed but is not part of `bun test`. It asserts:

- After Enter, `#word-input-0` has focus and an empty value.
- **⌘Z pressed in that empty input** removes the word just added.
- Pressing `r` after Esc adds `.chosen-word-item--rolled` items, shows a `.tier-chip`, and shows a toast matching `/keşif|rekor/`.
- ⌘Enter with "kuş" typed leaves `kuş` locked in the result.
- Exactly one `.combination-block--active` exists, and it moves when a second block is opened.
- Phase B: after typing a search in block 2, deleting block 1 and undoing, the search text is still in the same block.
- There are no console errors.
- At 390 px width, the toolbar, padlock, roll and Vitrin controls are visible and can be tapped.

The 76 existing tests stay green.

## 6. Scope boundaries and non-goals

- **Cut, listed as follow-ups:**
  - fork (the Vitrin's "Kullan" covers it)
  - a side-by-side comparison panel (the Vitrin is the lightweight comparison)
  - using the score to rank suggestions or Tamamla rows (a natural follow-up)
  - the pop route and Backspace peeling
  - j/k navigation, a lock shortcut, a help dialog
  - "fewer or more words" roll controls
- **No semantic or grammar scoring.** The score is purely structural and explained by its tooltip.
- **No global or shared state.** No leaderboard, daily puzzle or cross-attempt records.
- **Not undoable:** finds and the roll count (a discovery log), hide and unhide (they have their own bar), mapping refresh, attempt deletion, and home-page actions.
- **History:** linear, capped at 30, persisted per attempt. No tree or timeline.
- **Locks** apply to whole words, not letters.
- **Not addressed:**
  - touch drag-and-drop
  - the duplicated pool logic in app.js versus anagram.ts
  - the home preview using the current mapping
  - the dead home-form `hx-target`
  - ASCII strings other than the two named in §3

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The score feels arbitrary or badly balanced | Three visible components in a tooltip; one shared `charMapping` with the displayed number; a calibration integration test bounds the tier distribution; constants are tuned once in Phase A |
| Rolls cluster on 1–2-word solutions | `limitPerK` plus k-stratified `pickRoll`; unit test on the stratification and integration test on variety |
| Rolls repeat | Avoidance draws on the persisted Vitrin keys (works across undo and restarts); a repeat is surfaced honestly as a muted "daha önce bulmuştun" |
| Rolls fail | minLen 3 → 2 fallback, hidden-word filter, success-rate fixture; failure never records history |
| ⌘Z gets swallowed by the input | Routed to app undo from an empty `.word-input`; covered by a smoke assertion |
| Hidden active-block state | A visible `.combination-block--active` marker, kept across swaps |
| Roll latency (about 200 ms worst case) | Bounded passes; continuous spinner plus shimmer; `hx-disabled-elt` |
| Turkish text breaks the `HX-Trigger` header | `asciiJson`, with a unit test |
| History indices go wrong after a shift | Phase A clears history on add and delete; Phase B adds a table-tested `prevIndexMap` and `data-prev-ci`; history is linear |
| OOB Vitrin swap collapses the open `<details>` | Only the inner `#vitrin-body` and `#vitrin-summary` are swapped |
| Celebration spam on lock or ban toggles | `anagram-find` fires only when the word list changed in that request, and never on undo or redo |
| A stale page drops or edits a locked word | Lock-multiset validation; locked removes refused; 200 + toast + current block |
| JSON growth | Snapshots are small string arrays with a cap of 30; finds are capped at 300 |
| Read-modify-write races from rapid keys | `hx-disabled-elt`, the `e.repeat` guard, per-element HTMX queueing, synchronous store calls |
| `components.ts` and `style.css` keep growing | New templates in `workbench.ts`, new CSS in an isolated section, `combinationBlock` takes an opts object |
