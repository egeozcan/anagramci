# Günün Bulmacası: a daily anagram hunt

> **Unchosen product direction** — saved for future reference.
>
> - **Direction key:** `game`
> - **Iteration round:** 3
> - **Evaluator scores:** consistency 8.6 · design 8.4 · entertainment 8.2 · **avg 8.4**

## Evaluator's last critique

Average 8.4, just under the 8.5 target. The plan is strong and mostly ready to build. I checked its claims against the code.
- src/fill.ts confirms the limit behaviour. The outer k-loop exits on `final.length >= limit` without setting `truncated`, so treating "hit the limit" as a reject is correct.
- `FillSolution.slots[].words` already groups variants by signature, so groupKey-from-slots is sound.
- The two `combinationBlock` call sites (attempts.ts:115, components.ts:206) are correct.
- Reusing Attempt, top-level OOB toasts over HX-Trigger, and the separate challenge.css all fit the conventions well.

Remaining weaknesses, with what would raise each score:

1. Hint scoring can be gamed (DESIGN, ENTERTAINMENT). Level 2 reveals a whole word for −3. If you take level 2 on every slot of a known solution and then type it, you still collect the full scoreKnown (18+) and progress toward Anagramcı. Hints become a net-positive points machine and the rank stops meaning anything. Fix: a find on a solution that has hints earns reduced points (e.g. 50% at level 1, 0 base points once fully revealed, but it still counts toward x/N), or hint costs scale with the target's points. Also state whether a fully revealed solution still counts for Anagramcı, or caps the rank at Ustabaşı.

2. "Bunu zaten buldun" toast spam (DESIGN). Every drag-reorder, inline edit, or remove-and-re-add on an already-counted perfect block re-evaluates to `dup` and fires a toast. Fix: show the dup toast only when the exactKey was first found in a *different* combination, or when the block was not already perfect before the mutation. You can compare the pre- and post-mutation renderStatus inside afterWordMutation.

3. Hidden words versus known finds (CONSISTENCY). The dictionary check in evaluate step 3 runs before the known check in step 6. If the user hides a word in Settings or a normal attempt after a puzzle is generated, a frozen known solution becomes `invalid`. Fix: check the frozen `known` groupKey/exactKey before the dictionary check, or skip the hidden filter for words already in the puzzle's known set.

4. Feasibility of the curated list (CONSISTENCY, risk). Hand-authoring about 2,500 lemmas is a large, quality-sensitive step 1. It is also unclear that 2.5k words with maxPerLead 3 and maxWords 3 can produce 6 or more groups for 8–9 letter pools. The gate catches failure but the plan has no fallback lever.
   - Name the levers ahead of time: raise maxPerLead for kolay, allow 4 words for zor, or a larger list target.
   - Note that step 1 can be validated quickly by measuring candidate density per pool before the list is finished.

5. Engagement for a single-user app (ENTERTAINMENT). With streaks and share cut, the only thing pulling you back daily is the hero card. Add one cheap carry-over hook that needs no new store, derived from existing challenge attempts:
   - a "son 7 gün" strip of tiles on the hero card, filled by rank per day, or
   - a lifetime "Anagramcı unvanı" count.

   Also consider a "son harf" micro-celebration when remaining reaches 1–2 letters, to build tension before the find.

6. Minor specification gaps (DESIGN).
   - `GET /gunluk` creates state on a GET. It is acceptable, but say so explicitly, or make the hero button a POST.
   - The assist routes return a 403 with an empty body. The 403 is fine (the lazy fill placeholder is never rendered while gated), but confirm that `data-all-blocks` hide/ban forms are not rendered at all in challenge blocks, so nothing triggers silently.
   - State whether a practice puzzle's difficulty chip and the daily weekday mapping use Europe/Istanbul consistently in templates as well, not just in todayKey.
   - Define what the completion banner's "elapsed time" shows when finds happened across several days of play.

Fixing 1 and 2, and adding the small carry-over hook from 5, would likely lift DESIGN to about 8.8 and ENTERTAINMENT to about 8.7, clearing the threshold.

---

# Günün Bulmacası (v1): a daily anagram hunt that uses only words people know

## 1. Pitch

Anagramcı is a workbench. You bring a phrase and the machine helps you assemble it. Two things are missing: nothing brings you back tomorrow, and the best moment, when the last letter clicks into place, passes without any reaction from the app.

**Günün Bulmacası** turns the solver into a five-minute game built around that moment.

- **One puzzle per day, plus practice on demand.** You get 8–13 scrambled letter tiles, such as `R K E A T L İ S O N`.
- **The game knows the answers, and every answer is guessable.** Answers come from a curated list of everyday Turkish words that is committed to the repo (about 2,500 lemmas such as *kalem, deniz, sevgi, kartal, okumak*), not from the 76k-line dictionary full of words like *santrhaf* and *tirlin*.
  - Each puzzle has a small, fixed target: 6, 8 or 10 solutions, depending on difficulty.
  - "8 / 8" is therefore realistic, and the top rank is something you can earn.
- **You do the finding yourself.** Suggestions and Tamamla are locked. You have the tiles, the remaining-letter chips, the live phrase and hints. The first hint is free; after that each hint costs points.
- **The find is the payoff.** When you land a perfect anagram:
  - the letters ripple
  - the existing morph animation plays by itself, sliding your phrase back into the scramble
  - a toast reports "+18 puan · Kalfa oldun!"
  - finding the hidden *seed phrase*, the words the puzzle was built from, triggers a gold "Tohumu buldun!" moment.
- **Anything valid still counts.** A correct anagram that uses rarer dictionary words, or an everyday solution outside the target set, is a **"Bonus bulgu"**. It adds points but is never required.
- **Progress works like Spelling Bee.** You see a score, six craft ranks from *Çaylak* to *Anagramcı*, and an "x / N çözüm" counter. Trivial variants (et/te, kartel/kalter) belong to one solution and earn only +1 each.
- **"Pes et" (give up)** reveals every target solution and unlocks the full workbench, so every session ends with something learned.

Under the hood, a puzzle is an Attempt with a `challenge` field. It reuses the DAWG, `findFullAnagrams` (whose `FillSolution.slots` already groups variants), the pool math and the combination blocks.

**What changed from the previous plan, and why**
- **Words.** A real "everyday" signal, the curated list, replaces the regex heuristic, which would have let obscure TDK lemmas through.
- **Target size.** The known set is capped to the top N ranked groups, so the target is always small. Everything else becomes bonus.
- **Generator.** Acceptance now uses `totalFound` and treats both truncation and hitting the limit as rejects. The fallback can never produce a huge puzzle.
- **Suffixes.** Lemma-only friction is designed for: a how-to card, a suffix-aware error and a free first hint.
- **Scope.** Goals, streaks, archive, share and junk flagging are cut and moved to "later".

---

## 2. User-facing experience

### 2.1 Home (`/`)

A hero card, **"Günün Bulmacası · 24 Kasım"**, sits above "Yeni Deneme". It shows:
- face-down tiles for the letter count
- the difficulty chip (by weekday: Pzt/Sal kolay, Çar/Per/Cum orta, Cmt/Paz zor)
- one button, whose label depends on state:
  - **Başla**
  - **Devam et · 3/8 · Kalfa**
  - **Tamamlandı · Anagramcı · 112 puan**
  - **Açıklandı · 5/8** (after Pes et)

The button uses `hx-get="/gunluk"`, `hx-indicator` ("Hazırlanıyor…") and `hx-disabled-elt`. Today's puzzle is also pre-generated in the background at server start, so the button is normally instant.

A small "Pratik" form sits under the button: a select (Kolay 8–9 harf / Orta 10–11 / Zor 12–13) and **"Yeni pratik"**.

Challenge attempts are removed from "Denemeler" and listed in a separate collapsible **"Bulmacalar"** `<details>` (closed by default, 10 most recent). Each card shows:
- a badge ("Günlük · 24 Kas" or "Pratik · Zor")
- "rank · score · x/N" in place of the scramble
- the usual "Sil" button. For challenge cards its `hx-confirm` reads "Bu bulmacadaki ilerlemen silinir."

### 2.2 Starting

- `GET /gunluk` finds or creates today's daily, then sends `HX-Redirect` (for HTMX requests) or a 303 (for plain requests) to `/attempts/:id`.
- A **"Günün Bulmacası"** nav link sits next to "Ayarlar".
- "Yeni pratik" first deletes *untouched* practice puzzles: no words in any combination, no finds and no hints. Then it creates a new one.

### 2.3 Challenge workspace

**Header.** It shows:
- the title and date
- the letters as large mosaic tiles
- the Günlük or Pratik badge
- the difficulty.

**First-run card "Nasıl oynanır?"** (a dismissible `<details open>`). It is shown open until you make your first find in any puzzle; the state comes from the server, see 4.1. It has three lines plus an example:
> Tüm harfleri kullan. · Kelimeler en az 3 harf, sözlükteki **yalın** hâliyle (ek yok): *kitap* ✓, *kitabı* ✗ · Her kelime ayrı yazılır.
> Örnek: `E L M A K A L E M` → **elma kalem**

**Challenge panel (`#challenge-panel`), above the blocks.** It contains:
- **Rank meter:** six tiles that fill with ochre, plus "Kalfa · 34 puan · sonraki: Usta (52)".
- **Progress:** "3 / 8 çözüm", and "+1 bonus · +2 varyant" when those are non-zero.
- **Finds:** chips in the perfect style with a points badge. Variants are nested under their solution, and bonus finds are outlined chips tagged "bonus".
- **Hints:** a list of revealed patterns.
- **Actions:**
  - **İpucu**. The label shows the cost: "İpucu (ücretsiz)" for the first, then "İpucu (−3)".
  - **Pes et**, with `hx-confirm`.

**Combination blocks** work as they do today: add words, drag to reorder, inline edit, the live phrase, remaining letters and multiple combinations. The displacement number is hidden in challenge blocks, because the source is a scramble and the number would be noise.

**The "Oyun" aside.** In each block, the Öneriler and Tamamla panel is replaced by a small aside with the short rules and the current hint patterns. It has no buttons.

### 2.4 Finding an anagram

On every word mutation (add, edit, reorder or remove), the server evaluates that combination. It is "perfect" when the remaining pool is empty and nothing overflows.

| Outcome | Block style | Toast | Points |
|---|---|---|---|
| New known (target) solution | `combination--counted` + ripple + auto-morph | "+18 puan" (+ "· Kalfa oldun!" on rank-up) | scored |
| The seed solution, first time | counted + gold glow on header tiles | "Tohumu buldun! +18 +5" | scored + 5 |
| New exact words for an already found solution | counted | "Varyant · +1" | +1 |
| A valid solution that is not in the target set | counted | "Bonus bulgu! +5" | +5 |
| The same words as an earlier find (any order, any block) | counted | "Bunu zaten buldun" | 0 |
| A word not in the dictionary | `combination--invalid` | "Sözlükte yok: *kitabı*. Ek almış olabilir mi? Yalın hâlini dene." | 0 |
| A word shorter than 3 letters | `combination--invalid` | "Kelimeler en az 3 harf olmalı" | 0 |
| A perfect combination after Pes et | counted | "Bulundu (puan yok)" | 0 |

- **`combination--invalid`** overrides `.perfect`. It shows a dashed danger border, a muted phrase and a reason line in the summary ("Sayılmaz: *kitabı* sözlükte yok"). The status is recomputed on every render, so the style is still correct after a reload.
- **Removing a word** never takes back a find. Finds are a log.
- **Bonus and variant points** count toward the score. They never count toward "x / N", and on their own they can never reach *Anagramcı*.

### 2.5 Hints

**Target solution.** The hint targets the unfound known solution with the fewest words; ties go to the lower index. It stays the target until it is found or fully revealed.

**Which slot gets the hint.** The first slot of the target, longest first, that meets both conditions:
- it is not fully revealed
- its letter-signature does not match any word currently placed in any block of this attempt.

Placing *any* variant of a slot counts as placed, because the comparison is by signature. If every unrevealed slot is already placed, the hint goes to the first unrevealed slot.

**Levels.**
- Level 1 shows the first letter and the length: **"K _ _ _ _ _ (6)"**.
- Level 2, on the same slot, shows one variant in full.

**Cost.** The first hint of each puzzle is free; after that each hint costs −3.

**When hints run out.** The button is disabled and reads "İpucu kalmadı" when every known solution is found or fully revealed.

### 2.6 Pes et

`POST reveal` sets `revealedAt` and sends `HX-Refresh`. After the reload:
- the panel lists every known solution with all of its variants
- your finds are marked
- the seed is tagged "tohum"
- suggestions and Tamamla are unlocked in every block
- scoring stops.

### 2.7 Completion

When every known solution is found, the rank becomes **Anagramcı**. A banner then shows "Hepsini buldun!", the elapsed time from the first move to the last find, and the hint count.

---

## 3. UI and visual design notes

- **Tiles.** They reuse the mosaic logo motif. Each letter is a large square tile in Bitter 600, uppercased with `toLocaleUpperCase("tr-TR")`. Tiles use the stone-palette tokens and an inset border, and they wrap on mobile.
- **Rank meter.**
  - It is six tiles; reached ranks fill with the accent/ochre token, and the current tile pulses once on rank-up.
  - It is marked up with `role="meter"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and `aria-valuetext="Kalfa, 34 puan"`.
  - The threshold scores are written under the tiles, so nothing depends on hover.
- **Find moment.**
  - `data-just-found` on the swapped block triggers a CSS ripple across the phrase letters, staggered by `--i`.
  - app.js then runs the morph once on the summary preview, whether the block is open or closed, because the summary is always visible.
  - A seed find also adds a 1.2 s gold glow on the header tiles.
  - Under `prefers-reduced-motion` there is no ripple, morph or pulse, only a static highlight.
- **Invalid state.** A dashed border in the danger tone, a muted phrase and one reason line. Its selectors (`.combination.combination--invalid …`) are more specific than `.perfect`, so it always wins.
- **Toast.** There is a single `#toast` (`role="status"`, `aria-live="polite"`):
  - it sits bottom-center on mobile and bottom-right on desktop
  - a CSS-only keyframe fades it in, holds for 2.5 s and fades it out
  - each OOB swap replaces the node, which restarts the animation without a JS timer.
- **Layout.**
  - Desktop: the panel is a horizontal band of columns (meter, progress and finds, hints and actions).
  - Under 768 px the columns stack.
  - Under 480 px the actions become a full-width row.
- **How-to card.** A muted inset card. The ✓ and ✗ examples use the success and danger tokens.
- **No hover-only information.** Every challenge element is visible, or reachable by click or keyboard.
- **CSS file.** All new styles go in a new `static/challenge.css`, linked from `layout.ts` and reusing the `:root` tokens. Nothing is added to `style.css`.
- **Copy.** All new strings use proper Turkish characters, with no ASCII transliteration.

---

## 4. Technical design

### 4.1 Data model: a field on the Attempt, no new store

`src/store/attempts.ts`:
- `Attempt` and `CreateAttemptInput` gain `challenge?: Challenge`, as a type-only import from `src/challenge.ts`.
- Nothing else changes, and legacy attempts are unaffected.

```ts
type ChallengeKind = "daily" | "practice";
type Difficulty = "kolay" | "orta" | "zor";

interface KnownSolution {
  groupKey: string;      // sorted slot signatures, e.g. "aeklrt nios"
  slots: string[][];     // variants per slot (from FillSolution.slots), longest first
  points: number;
  isSeed: boolean;
}
interface Find {
  exactKey: string;      // sorted normalized words
  groupKey: string;
  words: string[];       // as typed
  kind: "known" | "variant" | "bonus";
  points: number;        // includes +5 seed bonus where applicable
  at: string;            // ISO
}
interface Hint { groupKey: string; slot: number; level: 1 | 2 }

interface Challenge {
  kind: ChallengeKind;
  date?: string;         // "YYYY-MM-DD" Europe/Istanbul (daily only)
  difficulty: Difficulty;
  seedWords: string[];
  known: KnownSolution[];   // frozen at generation, size ≤ TARGET_N[difficulty]
  knownMax: number;         // Σ known.points (rank denominator)
  finds: Find[];
  hints: Hint[];
  startedAt?: string;
  revealedAt?: string;
}
```

- **`sourceText`** is a seeded shuffle of the seed letters, as one token. Pool math, the remaining-letter chips and the morph all work unchanged.
- **Today's daily** is `listAttempts().find(a => a.challenge?.kind === "daily" && a.challenge.date === date)`. The app is single-user, so no index is needed.
- **The first-run card's state** is derived: it is shown when no challenge attempt has any find. There is no extra storage.

### 4.2 The everyday word list (new committed data)

**File.** `src/challenge/yaygin.txt` holds about 2,500 everyday Turkish lemmas, one per line, lowercase, single token, 3–9 letters. It sits outside `word-lists/`, so it is not loaded as a word list.

**How it is built** (implementation step 1):
- The implementer authors it by hand, by category: body, home, family, food, nature, animals, city, time, colours, emotions, common adjectives, and about 300 common verbs in their dictionary form (*gelmek, okumak*). No external download or licensing is involved.
- A scratchpad script then intersects it with `turkce_kelime_listesi.txt`:
  - words missing from the dictionary are dropped and the list of dropped words is printed
  - the committed file holds only the intersection.
- A unit test asserts that every line is in the dictionary, matches `/^\p{Ll}{3,9}$/u`, and is not a duplicate.

**Loading.** `loadEveryday(mapping)` returns a `Set` of normalized forms. It is lazy, and cached by `JSON.stringify(pairs)`.

**What it is for:**
- choosing seed words
- deciding which solutions can be *known*.

It has no other effect. Dictionary membership for validating finds still uses the full word list, so rarer words are fine as bonus finds.

### 4.3 Pure logic: `src/challenge.ts` (new)

**Dates and randomness**
- `todayKey(now)` returns `now.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })`.
- `rngFromSeed(str)` is FNV-1a feeding mulberry32. `shuffle(arr, rng)` is a Fisher–Yates shuffle.
- `difficultyFor(date)`, `LETTER_RANGE = { kolay: [8, 9], orta: [10, 11], zor: [12, 13] }` and `TARGET_N = { kolay: 6, orta: 8, zor: 10 }`. These values are provisional until step 2's measurement.

**Normalization and keys.** These are token-based and mapping-aware, and the same functions are used for generation and for player input.
- `normWord(w, mapping)`: for each character, `toLocaleLowerCase("tr-TR")` and then the mapping, keeping only `LETTER_RE` characters.
- `signature`: the characters of `normWord`, sorted.
- `exactKey(words)`: the normalized words sorted with `localeCompare(…, "tr")` and joined with spaces.
- `groupKey(words)`: the signatures, sorted and joined.

**Dictionary.** `getDictionary(listId, mapping)` returns a `Set` of the normalized single-token entries. It is lazy and cached.
- `isDictionaryWord(dict, w, hidden)` is an O(1) lookup that excludes hidden words.
- Multi-word dictionary entries (*hava yolu*) are not in the set, and the player's input is split on whitespace. So *hava yolu* typed as two tokens counts only if *hava* and *yolu* are each standalone entries. A unit test pins this behaviour.

**Scoring and ranks**
- `scoreKnown(k, longest)` returns `10 + ({ 1: 15, 2: 8, 3: 3 }[k] ?? 0) + 2 * Math.max(0, longest - 5)`, with explicit parentheses.
- `VARIANT_PTS = 1`, `BONUS_PTS = 5` and `SEED_PTS = 5`.
- `hintCost(i)` is 0 for `i === 0` and 3 otherwise.
- `currentScore(ch)` returns `max(0, Σ finds.points − Σ hintCost(i))`.
- `RANKS`: Çaylak 0, Çırak 0.10, Kalfa 0.25, Usta 0.50, Ustabaşı 0.75 (each a fraction of `knownMax`), then Anagramcı.
- `rankFor(ch)`:
  - returns `{ index, name, nextAt }`
  - divides safely when `knownMax` is 0
  - gives Anagramcı only when `allKnownFound(ch)`; otherwise the rank is capped at Ustabaşı.
- The rank thresholds are fixed only after step 2 confirms the distribution of N and the point totals.

**Evaluation.** `evaluateCombination(ch, words, perfect, dict, hidden, mapping)` checks in this order:
1. Not perfect: `not-perfect`.
2. A token shorter than 3 letters: `short`.
3. A token not in the dictionary: `invalid` (with that word).
4. Revealed: `after-reveal`.
5. The `exactKey` is already among the finds: `dup`.
6. The `groupKey` is in `known`:
   - `known` if that group has no find yet, plus `seed: isSeed`
   - otherwise `variant`.
7. Otherwise: `bonus`.

`renderStatus(...)` is the same check without side effects. It returns `counted`, `invalid` (with a reason) or `none`, and drives the block class on every render.

**Hints.** `nextHint(ch, placedSignatures: Set<string>)` implements the rules in 2.5 and returns a `Hint` or `null`. `hintPattern(ch, hint)` renders the hint text, for example "K _ _ _ _ _ (6)" or the full word.

**Generation.** `generatePuzzle({ dawg, dict, everyday, mapping, hidden, rng, difficulty })`.

1. **Seed pool:** everyday words of 4–8 letters that are not hidden. It is cached per mapping.
2. **Tries.** Up to `MAX_TRIES = 60` deterministic tries. Each try:
   - picks a length L from the range
   - picks seed word a and then word b with |b| = L − |a|, or, when L ≤ 9 and the rng picks it, a single seed word
   - builds the pool.
3. **Known candidates.** `dawg.findAvailable(pool, mapping)` filtered to `everyday ∩ ¬hidden`. This is a small set because the list has about 2.5k words.
4. **Search.** `findFullAnagrams(cands, pool, mapping, { minLen: 3, limit: 300, budgetMs: 1000, maxWords: 3, maxPerLead: 3 })`.
5. **Acceptance.** It depends only on the rng sequence and the inputs. A try is accepted when all of these hold:
   - `!truncated`
   - `solutions.length < limit`. Hitting the limit can silently drop k=3 solutions, because the loop stops on `final.length >= limit` without setting `truncated`, so hitting it is a reject.
   - `solutions.length >= MIN_GROUPS` (kolay 3, orta 4, zor 5)
   - at least one solution has 2 words or fewer
   - the seed's group is present.
6. **Known set.** It is the first `TARGET_N` solutions in fill's own order (fewer words, then balanced, then alphabetical). The seed group is always included: if it falls outside the top N, it replaces the last entry.
7. **Size is bounded by construction.** The known set is at most N groups. Everyday solutions outside the top N simply become bonus finds when the player finds them, so no puzzle can have 200 targets.
8. **Fallback.** If all 60 tries fail, the deterministic fallback is the try with the most groups that is not truncated, still capped to N. If every try was truncated, generation throws, the route returns 500, and the error is logged. The measurement step must show this never happens.
9. **Result.** Each `FillSolution` maps to a `KnownSolution`, with `groupKey` built from the slot signatures, so variants are collapsed by construction. The function returns `{ sourceText, seedWords, known, knownMax }`.

**Determinism, stated honestly.** The same date, word list, mapping, hidden words and `yaygin.txt` give the same puzzle. A persisted puzzle never changes. There is no claim of matching puzzles across installs.

**Yielding.** `generatePuzzleAsync` wraps the loop and calls `await Bun.sleep(0)` every 10 tries, so pre-generation at startup never blocks the event loop for long.

### 4.4 Routes: `src/routes/challenge.ts` (new, chained before `handleAttemptRoute` in `index.ts`)

| Method and path | Behaviour |
|---|---|
| `GET /gunluk` | Find or create today's daily, using seed `date + "\|" + listId`, then `HX-Redirect` or a 303. |
| `GET /gunluk/:date` | Test and dev only, for deterministic integration tests on past dates. 404 if the date is invalid or in the future. Not linked in the UI; a full archive is a non-goal. |
| `POST /pratik` (`difficulty`) | 400 if the difficulty is invalid. Delete untouched practice puzzles, create a new one with seed `crypto.randomUUID()`, then `HX-Redirect`. |
| `POST /attempts/:id/hint` | 400 if the attempt is not a challenge, is revealed, or has no hint left. Otherwise persist the hint and return `challengePanel` plus OOB `challengeBlockAside` (`#challenge-aside-N`) for every block. |
| `POST /attempts/:id/reveal` | Set `revealedAt`, persist, and return `HX-Refresh: true`. |

- **Word list.** Dailies use the first entry of `listWordLists()`, with the mapping snapshotted the same way `POST /attempts` does it.
- **Pre-generation.** `index.ts` calls `setTimeout(() => ensureDaily(todayKey()).catch(log), 0)` after `Bun.serve`.
- **Exported hook.** `afterWordMutation(attempt, ci) → { attempt, extraHtml, justFound }`:
  - it evaluates the combination
  - on `known`, `variant` or `bonus`, it appends the find and persists
  - it always sets `startedAt` on the first mutation.
  - **No HX-Trigger header.** `extraHtml` is a top-level OOB `<div id="toast" hx-swap-oob="true" …>`, plus OOB `challengePanel` when the finds changed. Feedback travels as HTML, so non-ASCII text such as Ç, ı and ş never goes into an HTTP header.

### 4.5 Changes to `src/routes/attempts.ts`

1. **Word mutations.** `POST /:id/choose`, `PUT /:id/chosen` and `DELETE /:id/chosen/:index` check `if (attempt.challenge)` and call `afterWordMutation`. They return `renderCombinationBlock(..., { justFound }) + extraHtml`. HTMX 2 processes top-level OOB elements before the main `outerHTML` swap.
2. **`computeWorkspaceData`.** When `isChallengeActive(attempt)` (a challenge that has not been revealed), it skips `findAvailable` and fill and returns empty results. This prevents spoilers and makes the call cheaper.
3. **`renderCombinationBlock`.** For a challenge it passes `{ asideHtml, stateClass, stateReason, justFound, hideDisplacement: true }`. The aside is passed only while the challenge is active; the state class is passed for any challenge.
4. **Assist routes are gated.**
   - `GET suggestions`, `GET fill`, `POST/DELETE ban` and `POST/DELETE hide` return 403 with an empty body while the challenge is active.
   - `POST refresh-mapping` returns 400 for any challenge, because a puzzle is frozen to its snapshot.

### 4.6 Templates

**`components.ts`. Explicit signature changes; existing positional parameters are untouched.**
- **`combinationBlock(..., opts: CombinationBlockOpts = {})`**, where the opts are `{ asideHtml?, stateClass?, stateReason?, justFound?, hideDisplacement? }`.
  - `asideHtml` replaces `suggestionsPanel` when it is set.
  - The class and `data-just-found` go on the root `<details>`.
  - The reason line goes in the summary.
  - Displacement is omitted when `hideDisplacement` is set.
  - Both call sites are updated: `attempts.ts:115` and `components.ts:206`.
- **`workspaceContent(..., challenge?: { header; panel; howTo; blockOpts: CombinationBlockOpts[] })`**.
- **`homePageContent(..., extras?: { hero: string; challengeSection: string })`**. Challenge attempts are filtered out of "Denemeler" by the caller, `pages.ts`.

**`src/templates/challenge.ts` (new).** Every dictionary and user string goes through `escapeHtml`.
- `dailyHeroCard`, `practiceForm`, `challengeSection`/`challengeCard`, `challengeHeader`, `howToCard`
- `challengePanel(attempt, { oob? })`, composed of `rankMeter`, `progressLine`, `findList`, `hintList`, `challengeActions`, `revealList` and `completionBanner`
- `challengeBlockAside(attempt, ci)`, `toast(result)` and `challengeBadge`.

**`layout.ts`** adds the nav link, `<link rel="stylesheet" href="/static/challenge.css">`, and an empty `<div id="toast" role="status" aria-live="polite"></div>`.

### 4.7 Client JS: `static/app.js` (one new delegated section, about 25 lines)

- **Factor out the morph.** The morph routine moves out of its hover handler into `runMorph(previewEl)`, with no change in behaviour.
- **Auto-morph.** An `htmx:afterSwap` listener on `document` finds `[data-just-found]` in the swapped content. Unless reduced motion is requested, it calls `runMorph` on that block's summary preview, then removes the attribute.
- **No new pool math.** Nothing duplicated drifts further.

---

## 5. Test plan

### Unit tests: `src/challenge.test.ts` (new)

- **Everyday list:** every line is in the real dictionary, matches `/^\p{Ll}{3,9}$/u` and is unique; the list has at least 2,000 entries.
- **Keys:**
  - tr-TR casing (`İ`→`i`, `I`→`ı`), mapping (`â`→`a`) and dropping non-letters
  - et/te share a `groupKey` but not an `exactKey`
  - the multi-word fixture: when *hava yolu* is an entry but *yolu* is not, `["hava", "yolu"]` returns `invalid` with *yolu*.
- **Scoring:**
  - `scoreKnown` for k = 1, 2 and 3 plus the long-word bonus
  - `currentScore`: the first hint is free, then −3, with the floor at 0.
- **Ranks:**
  - each threshold
  - capped at Ustabaşı with a large bonus score but not every known solution found
  - Anagramcı when all are found
  - `knownMax = 0` is safe.
- **Evaluation:** every status (not-perfect, short, invalid, known, seed, variant, bonus, dup by reorder, after-reveal), with `renderStatus` agreeing with `evaluateCombination`.
- **Hints:**
  - targets the fewest-word unfound solution
  - skips a slot when a *different variant* of it is placed
  - goes level 1, then level 2, then the next slot, then the next solution
  - returns `null` when exhausted.
- **Dates and rng:**
  - `todayKey("2026-11-24T21:30Z")` is "2026-11-25"
  - the date validator rejects future dates, 2021-02-29 and garbage
  - `rngFromSeed` is deterministic.
- **`generatePuzzle`**, with a fixture DAWG of about 80 words and a fixture everyday set:
  - two runs give deep-equal output, including one run with a stubbed slow `performance.now`, so acceptance does not depend on the wall clock
  - `sourceText` is a permutation of the seed letters
  - the seed is present and flagged
  - `known.length <= TARGET_N`
  - every known word is in the everyday set
  - every solution empties the pool (checked with `computeRemainingPool`)
  - the group keys are unique
  - a fixture where `limit` is hit is rejected
  - with every try truncated, generation throws.

### Store test

The `challenge` field round-trips through create, get and update.

### Integration tests: `describe("Günün Bulmacası")` in `src/integration.test.ts`

All of these use 2020 dates, track the ids they create, and clean them up.

**Routing**
- `GET /gunluk/2020-02-29` returns a 303 to `/attempts/:id`, and a repeat call returns the same id.
- With `HX-Request`, it returns `HX-Redirect`.
- A future date returns 404, and so does garbage.

**Gating**
- The workspace contains `#challenge-panel`, the how-to card and `challenge-aside-0`, and no suggestions markup.
- `suggestions`, `fill` and `hide` return 403; `refresh-mapping` returns 400.

**Known find**
- `POST choose` with the first variant of `known[0]` (read from disk).
- The response contains `hx-swap-oob` `#toast` with the points, an OOB `#challenge-panel` and `data-just-found`.
- There is no `HX-Trigger`, and every header is ASCII.
- On disk there is one find, of kind `known`.

**Dedupe and variants**
- The same words in reverse, in a new combination, give a "zaten" toast and leave the finds unchanged.
- If a slot of `known[0]` has two or more variants, choosing the other one gives `variant` and +1.

**Bonus**
- Construct a valid dictionary solution that is not in `known`: search the full dictionary for one in the test setup, and skip the test if none exists. It gives `bonus` and +5.

**Invalid**
- The scramble as a single token renders `combination--invalid` and the "Yalın hâlini dene" toast, and records nothing.
- The class persists after `GET /attempts/:id`.

**Hints**
- The first `POST hint` leaves the score unchanged and shows a `_` pattern and OOB asides.
- The second costs 3.
- The third reaches level 2 and shows a full word.

**Reveal**
- `POST reveal` returns `HX-Refresh`.
- The workspace then lists every known solution and the seed tag, suggestions return 200, and a new perfect combination scores 0.

**Practice**
- `POST /pratik difficulty=kolay` gives 8–9 letters and `kind: "practice"`.
- A second request deletes the untouched first puzzle but keeps one that has a hint.
- An invalid difficulty returns 400.

**Home**
- The hero and the "Bulmacalar" section render, and challenge attempts are not in "Denemeler".

**Regression**
- All 76 existing tests pass.

### Measurement gate (step 2: a scratchpad script, not committed, run before the scoring and rank constants are fixed)

Generate 50 dates per difficulty against the real list. Record:
- latency (p50, p95, max)
- the acceptance rate without the fallback
- the distribution of solutions found before capping
- the distribution of `known.length`
- the share of puzzles with a 1-word or 2-word solution.

**Pass criteria:**
- generation p95 under 300 ms
- at least 95% accepted without the fallback
- at least 90% of puzzles reach `known.length === TARGET_N`
- zero throws.

**Word quality:** for 15 sampled puzzles, the implementer reads every known word. More than one unfamiliar word in total means the list is pruned and the test is re-run. Since known words come only from the curated list, this checks the list itself.

If the gate fails, tune `LETTER_RANGE`, `MIN_GROUPS`, `TARGET_N` and the seed-length range, then re-run. Only after that are the `RANKS` thresholds and point values frozen.

### Manual Playwright pass

Play `/gunluk/2020-03-01`:
- check the how-to card
- find a known solution: the toast, ripple, auto-morph and meter
- find a variant
- trigger the invalid state with a suffixed word
- take the free hint and then a paid one
- run Pes et
- check a 375 px viewport and reduced-motion emulation.

---

## 6. Implementation order

1. [ ] Author `src/challenge/yaygin.txt` and intersect it with the dictionary; add the list unit test.
2. [ ] Write `generatePuzzle` with its fixture tests and run the **measurement gate**; tune the constants.
3. [ ] Write the pure functions (keys, dictionary, scoring, ranks, evaluate, hints) with tests, then freeze the rank and point values.
4. [ ] Add the `Challenge` type on `Attempt`, with the store test.
5. [ ] Add `src/routes/challenge.ts`, the chain entry and the pre-generation in `index.ts`.
6. [ ] Add the gating and `afterWordMutation` in `attempts.ts`.
7. [ ] Make the template signature changes, write `templates/challenge.ts`, and update `layout.ts` and `pages.ts`.
8. [ ] Write `static/challenge.css` and the `runMorph` refactor plus auto-morph.
9. [ ] Write the integration tests, run the full `bun test`, then the Playwright pass.

---

## 7. Scope boundaries and non-goals

- **Cut from v1 and deferred** (to be saved as ideas): daily goals, streaks, a public archive UI, share text, post-reveal junk flagging, timers, leaderboards.
  - **Streaks and share** were cut because they are weak for a local, single-user app whose puzzles differ between installs.
  - **Junk flagging** was cut because it writes to the global hidden list and changes normal attempts. It is also unnecessary now that known words come from a curated list.
- **Out of scope:**
  - accounts and multiplayer
  - external frequency corpora or downloads
  - new general word lists or a list-management UI
  - touch drag-and-drop and keyboard shortcuts for the workbench
  - fixing the dead `hx-target` on the new-attempt form
  - changing how the home preview handles mappings.
- **Not changed:**
  - the behaviour of normal attempts (positional template parameters are kept)
  - the internals of fill and the DAWG (only `findFullAnagrams` options are used)
  - `style.css`.
- **Puzzles are frozen:** mapping changes and edits to the list never alter a puzzle that is already persisted.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Obscure words make the target unfair | Known words come only from the curated, committed everyday list. The target is capped at 6, 8 or 10 groups, and the step-2 quality check has an explicit pass threshold. Rarer valid answers are bonus finds and never required. |
| The curated list is too small, so puzzles have too few solutions | The measurement gate checks that 90% of puzzles reach N, and `MIN_GROUPS` and the letter ranges are tuned against it. Adding words is a one-line change validated by the unit test. |
| Lemma-only rules frustrate players who think in suffixes | The how-to card shows the ✓/✗ example, the error is suffix-aware ("Yalın hâlini dene"), the rules repeat in every block aside, and the first hint is free. |
| Silent loss of results at the search limit | Acceptance requires `solutions.length < limit` and `!truncated`. The known set is a top-N slice, so its size is bounded by construction. |
| Generation is slow or blocks the event loop | The candidate set is small (about 2.5k-word list, at most 3 words). The async loop yields every 10 tries, and the latency gate is p95 under 300 ms. |
| Results depend on the wall clock | A fixed 60-try rng sequence; truncation means reject. A test stubs a slow clock to prove it. |
| Multi-word keys drift between generation and input | Generation excludes multi-word entries, and both sides use the same token-based keys. A dedicated test covers it. |
| Non-ASCII text in headers | Feedback is OOB HTML, never `HX-Trigger`. A test asserts every header is ASCII. |
| Mixed signals from the perfect style | `combination--invalid` overrides `.perfect` with higher specificity and a reason line, and the status is recomputed on every render. |
| Spoilers through the existing panels | Gating is central in `computeWorkspaceData`, and every assist route returns 403. Both are covered by tests. |
| Double scoring through reorder, edit or a second block | Finds are deduplicated by `exactKey`, and variants are separated by `groupKey`. |
| Tests overwrite the real daily | Tests use only 2020 dates through the test route and track ids for cleanup. |
| Clutter from practice puzzles | Practice puzzles live in their own collapsible section, and untouched ones (no words, finds or hints) are deleted automatically. |
| Read-modify-write race between a hint and a mutation | The same as the existing behaviour; acceptable for a single-user app. |
