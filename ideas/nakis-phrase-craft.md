# Nakış: Phrase Craft for Anagramcı

> **Unchosen product direction** — saved for future reference.
>
> - **Direction key:** `craft`
> - **Iteration round:** 3
> - **Evaluator scores:** consistency 8.8 · design 8.5 · entertainment 8.2 · **avg 8.5**

## Evaluator's last critique

The plan is well grounded in the code. I checked these points:
- `computeCharMapping` and the inline displacement are in components.ts (lines 27 and 321–330), so moving them is a clean refactor.
- `fillRow` builds `data-phrase` and `data-words`, so the "same arranged array" claim can be built.
- About 2.6k word-list lines start with an uppercase letter, which matches the stated proper-noun count.
- Every hand-labelled noun in the fixture except ödü is a lemma, so the lemma-first rule keeps them nouns. That includes gelir and uçar, which would otherwise match the aorist pattern. ödü is not in the list, and its only verb-pattern stem is ö (ömek is not a lemma), so it also stays a noun.
- The verbs to test (okudu, gidiyor, uçmuş) are not lemmas, and gelmek, okumak and uçmak are, so the recall fixture can pass.
- HTMX 2 behaviour fits the design. OOB swaps still run with swap:"none". For HX-Trigger-After-Settle, HTMX falls back to body when the requesting element has been swapped out, so the event still reaches the document-level listener after an outerHTML swap of the block. State this in the plan so nobody re-derives it.
- New logic goes in new files, components.ts only gets optional parameters, and the commit/test conventions are followed.

Weaknesses, and what would raise each score:

1. **Verb classifier false positives (design).** It has no minimum stem length. "eti" (its meat) is not a lemma. The past pattern gives e+ti, and emek IS a lemma, so "eti" becomes a verb. The same applies to short stems like "atı" if "amak" ever exists.
   - Require a stem of at least 2–3 letters in VERB_PATTERNS, as `stem()` already does.
   - Add eti, atı and suyu to the noun fixture.
   - Say that the patterns are anchored (^…$) and that every split is tried, not just the regex's first lazy match. "For some match" is ambiguous with one regex exec.

2. **Tier calibration is unverified (entertainment).** A perfect phrase that ends in a noun and has no modifier→noun pair gets Biçim 0, which caps it at 78 (İyi). Many real anagrams are noun lists. So İnce iş and Şaheser, and with them the celebration, may almost never fire, and the core hook would fall flat.
   - Add an M1 step: a script or test that scores the Tamamla outputs for about 10 real sources and reports the tier distribution.
   - Set a target before shipping, for example 10–25 % of perfect phrases reaching ≥80. Tune `WEIGHTS` to hit it.
   - Consider a small Biçim credit for a noun-final phrase that has a modifier, so "noun phrase" titles are not punished.

3. **Vowel harmony is ignored (design).** The suffix lists do not check harmony, so wrong strips can still validate by accident. This is low risk, but either note it or add the check (last vowel class → allowed suffix vowel). It is cheap and improves precision.

4. **Vitrin un-star semantics are confusing (design).** After you edit a starred phrase, the button reads "★ Vitrine koy" while the old snapshot is still in the Vitrin. A second star then creates a second entry for the same attempt. Decide whether that is intended (several versions per attempt), and show "★ n" per combination so the user knows.

5. **Scope (design).** Three milestones bring around 6 new files, a PNG canvas renderer, live preview, celebrations and a new page. The plan is specific enough, but the PNG card and the live score are the most fragile parts.
   - Move the PNG card to a stretch item at the end of M3.
   - Specify the font-loading check explicitly: `document.fonts.load('600 48px Bitter')`, not just `fonts.ready`, because the Bitter weight may not be loaded yet.

6. **Stale scores (consistency).** `best` and `Favorite.score` store numbers computed by one version of `WEIGHTS`. If you tune the weights (and point 2 says you will), these become inconsistent with live scores.
   - Store a `scoreVersion`, or recompute the Vitrin and home scores on render. Scoring is cheap and needs no DAWG, so recomputing from the stored words is simpler and avoids the problem.

7. **Live-score race (design, minor).** A debounced GET that resolves after the user has committed the inline edit could put an `is-live` meter over the freshly committed block. Abort or ignore stale responses (htmx `sync`, or a request token checked on `htmx:beforeSwap`).

8. **Entertainment ceiling.** The loop of improving a phrase, collecting it and sharing it is good. There is still no reason to come back once a source is done: no prompt to start a new source and no history of how a score rose over time. A tiny "Nakış geçmişi" sparkline on the attempt, or Vitrin streaks, would push entertainment above 8.5 at little cost.

---

# Nakış: Phrase Craft for Anagramcı (revision 3)

## Title
**Nakış** (Embroidery). It adds a live, explainable craft score with tiers and a per-attempt personal best, one-click Turkish word order (Dizilim), Tamamla rows ranked by final score with an "En iyi hamle" hint, and a Vitrin (showcase) of favourite anagrams that are ready to share. It ships in three milestones, and each one can be released and tested on its own.

## What changed from revision 2, and why
1. **The celebration is decided on the server.**
   - Revision 2 kept client-side "previous score" maps. Live previews overwrote them, and combination deletes shifted their keys.
   - Now each mutating route computes the craft before and after the change and sends an `HX-Trigger-After-Settle: craftCelebrate` event.
   - The score delta is rendered by the server as `data-delta`.
   - The client keeps no score state at all, and the trigger can be tested end to end in integration tests.
2. **The verb classifier checks against the word list.**
   - A word that is itself a lemma in the list (karar, şeker, demir, kedi, batı) is never classified as a verb.
   - A word not in the list counts as a verb only if stripping a verbal suffix leaves a stem `s` where `s+mak` or `s+mek` is in the list (uçtu→uç→uçmak).
   - A hand-labelled fixture checked against the real list pins this behaviour.
3. **Stemming checks against the word list.**
   - `stem()` leaves lemmas alone (kapı stays kapı).
   - It strips a suffix only if what remains is a lemma, with p/ç/t/k consonant-softening recovery (kitabı→kitap, gidiyor→git).
4. **Tema is cut** and moved to `ideas/`. That removes the false-positive test that asserted nothing, the themedFill complexity, and the "the score drops when I add a theme" problem. The weights now add up to exactly 100.
5. **The effort goes into the hook and the collection layer:**
   - Rozet tiers (Taslak / İyi / İnce iş / Şaheser)
   - a per-attempt personal best with a "Rekor!" moment
   - a final score on every Tamamla row, with the best row flagged "En iyi hamle"
   - negative notes that suggest an action
   - Vitrin sorted by score, with a tier tally
   - copy-ready text and a downloadable PNG card

## Pitch
Anagramcı is good at finding letters that *fit*. It gives no help with phrases that are *good*. The anagrams people remember read like Turkish, avoid echoing the source's own words, and feel like a finished sentence.

Nakış turns the workbench into a game of improving a phrase, with a tight loop:
- **See the score.** Every combination shows a 0–100 Nakış puanı, a tier and up to 5 plain-Turkish reasons.
- **Know what to try next.** Each "−" note says what to try ("Fiili sona al — Dizilim"). Tamamla shows the final score each row would give, and the best one is flagged "En iyi hamle".
- **Feel progress.**
  - The score updates live while you inline-edit, with a "+6 / −4" delta against the saved version.
  - Saving a perfect phrase that crosses into İnce iş (≥80) or Şaheser (≥90) plays a tile-flip celebration.
  - Beating the attempt's personal best shows "Rekor! 86 (önceki 81)".
- **Collect.** Star perfect anagrams into the Vitrin. It shows a tier tally ("Şaheser 1 · İnce iş 3 · İyi 2"), sorts by score or date, copies a formatted text and downloads a PNG card.

Everything is local and heuristic: suffix rules checked against the word list that is already in memory. There is no NLP and no network.

## Milestones (each is one commit, keeps the 76 existing tests green, and adds its own tests)
- **M1 — Puan:** `src/craft.ts` (stem, classify, scorePhrase, tier), the lemma and proper-noun sets, shared displacement, the meter, tier pill and notes, `GET /score` for live preview, the `commitCombination` helper with before/after delta, personal best and the celebration trigger, and the home best badge. Commit: `feat: Nakış puanı — live phrase craft score, tiers and personal best`.
- **M2 — Dizilim:** `bestArrangement`, `POST /arrange`, and `craftFill`, which gives arranged, final-score-sorted Tamamla rows plus "En iyi hamle". Commit: `feat: Dizilim — auto-arrange words, score-ranked Tamamla`.
- **M3 — Vitrin:** the favourites store, star and note controls, the `/vitrin` page with sort and tier tally, Kopyala and PNG card, the nav link, and "★ n" on home cards. Commit: `feat: Vitrin — showcase of favourite anagrams`.

M2 and M3 depend on M1. If time runs out, M1 plus M3 is still a complete feature.

## User-facing experience, step by step

### M1 — Score, tiers, personal best
1. **Summary meter.**
   - The collapsed block summary shows a 5-tile mosaic meter next to the displacement number. Filled tiles = round(score/20).
   - The tooltip reads "Nakış: 72/100".
   - For a *perfect* combination (no remaining letters, no overflow), a small tier pill follows the meter.
2. **Tiers** (perfect combinations only):
   - Taslak 0–59
   - İyi 60–79
   - İnce iş 80–89
   - Şaheser 90–100

   A combination that is not perfect shows the meter only, because it is not finished.
3. **Değerlendirme notes.** Expanding the block shows a "Değerlendirme" strip at the bottom of "Seçilen Kelimeler" with 2–5 notes marked + or −. Each − note names a fix:
   - "+ Tüm harfler kullanıldı"
   - "+ Yüklemle bitiyor — cümle gibi"
   - "+ Sıfat + isim: kanatlı kuş"
   - "− Fiil ortada kalmış — sona almayı dene (Dizilim)"
   - "− Kaynaktaki 'bir' tekrar ediyor — başka kelime dene"
   - "− 3 harf kaldı — Tamamla'ya bak"
4. **Live preview while editing.**
   - While you inline-edit a word (double-click), the meter and notes update about 250 ms after you stop typing.
   - The meter gets a dashed "taslak" outline and a static delta badge against the saved score, for example "+6".
   - Nothing is saved, and no celebration fires.
5. **After a saved change** (add, remove, reorder, commit an inline edit, or Dizilim):
   - When the score changed, a delta chip ("+6" or "−4") floats next to the meter for 1.2 s.
6. **Celebration.** It fires when a saved change makes the combination perfect and:
   - (a) its tier rises into İnce iş or Şaheser, or
   - (b) it beats the attempt's previous perfect best.

   What happens:
   - The five tiles flip in sequence (60 ms stagger).
   - A toast appears: "İnce iş! 84/100", "Şaheser! 93/100" or "Rekor! 86 (önceki 81)".
   - Under prefers-reduced-motion the toast appears without the flip.
7. **Home cards.** Attempts that have a perfect best show its tier pill and "en iyi 86".

### M2 — Dizilim and score-ranked Tamamla
8. **Arrange your words.**
   - "Dizilimi düzenle" appears in the chosen-words panel when there are 2–5 words, and is hidden during inline edit.
   - It reorders the words for the best grammar, saves, and re-renders the block. Its delta chip or celebration shows the effect.
   - Drag-and-drop still works.
9. **Tamamla rows.**
   - Each row is shown in its arranged order ("kuş bir ebabil" → "bir ebabil kuş").
   - Each row ends with "→ 82" and a tier pill: the score the *whole phrase* (current words + row) would get.
   - Within each "k kelime" group, rows are sorted by that score.
   - The best row across all groups gets a "✦ En iyi hamle" label.
   - "hepsi" adds the words in the displayed order, and the hover preview shows the same order.

### M3 — Vitrin
10. **Star it.**
    - On a perfect combination, a "★ Vitrine koy" button opens an inline note form ("Not (isteğe bağlı)") with Kaydet / Vazgeç.
    - After saving, the button reads "★ Vitrinde". Clicking it removes the entry after an hx-confirm.
    - If you then edit the words, the button reads "★ Vitrine koy" again, with the tooltip "Vitrindeki hali korunur".
11. **The /vitrin page.**
    - A nav link "Vitrin" sits between the logo and "Ayarlar".
    - The header has a tier tally ("Şaheser 1 · İnce iş 3 · İyi 2") and a sort toggle "Yeni / Puan" (`?sort=date|score`).
    - Each card shows:
      - the source in small caps, then an arrow
      - the anagram in large Bitter type, with proper nouns capitalized
      - the italic note
      - the meter and tier pill, and the date
      - **Kopyala**, which copies `Kaynak\n→ Anagram\nNakış 84/100 · İnce iş`
      - **Kart indir**, which downloads a 1200×630 PNG
      - **Denemeye git**, only when the attempt still exists
      - **Kaldır**, with hx-confirm
    - The empty state reads: "Henüz vitrinde bir anagram yok. Mükemmel bir anagram bulduğunda ★ ile buraya ekle."
12. **Home cards.** They show "★ n" when the attempt has entries in the Vitrin.

## UI and visual design notes
- **Tokens.** Add `--craft-accent` (ochre/saffron) and `--craft-gold`, plus the tier colours `--tier-taslak`, `--tier-iyi`, `--tier-ince` and `--tier-saheser`, all from the existing stone palette: stone grey, olive, ochre, gold. There are no new fonts.
  - Styles go in one `/* === Nakış (craft) === */` section at the end of `style.css`, and the Vitrin styles in a `/* === Vitrin === */` section.
- **Meter.**
  - `<span class="craft-meter" id="craft-meter-N" role="img" aria-label="Nakış puanı 72/100" data-score="72" data-delta="6">`.
  - Five 8×8 px rounded tiles that echo the logo mosaic.
  - `.is-live` gives a dashed outline, and the delta is a static badge.
- **Tier pill.** `.tier-pill.tier--ince` uses small caps at 0.7rem. Şaheser gets a thin gold border, and the phrase gets a `--craft-gold` underline at İnce iş and above. Both are server-rendered and persistent.
- **Delta chip.** `.craft-delta--up` uses the success token and `--down` uses the danger token. It is absolutely positioned and rises and fades over 1.2 s; under reduced motion it only fades.
- **Celebration.** The `.ince-is` class runs rotateY tile-flip keyframes with nth-child delays. `#craft-toast` has `role="status" aria-live="polite"`, sits fixed at the bottom centre, and hides after 2.4 s.
- **Notes.** One line each in a small font. The +/− markers use desaturated success and danger tokens. There is no box.
- **Tamamla.**
  - The "→ 82" score is right-aligned in a muted colour, with the tier pill.
  - `.fill-row--best` gets a "✦ En iyi hamle" label and an ochre left border.
- **Vitrin.**
  - The grid is `repeat(auto-fill, minmax(320px, 1fr))`. At ≤480 px it is one column with a 16 px gutter.
  - The phrase is 1.6rem Bitter, weight 600, with `text-wrap: balance`.
  - A decorative row of letter tiles (`aria-hidden`) sits under the phrase.
  - Cards lift slightly on hover, except under reduced motion.
  - The PNG card reuses the same composition: a stone background, a tile row, the source, an arrow, the anagram, and the tier with the score.
- **Accessibility.** All controls are real `<button>`s. The star and arrange buttons live in the panel, not in `<summary>`. The tier is also given as text in the meter's aria-label.

## Technical design

### Word list: lemmas and proper nouns (M1), in `src/store/wordlists.ts`
Two sets are added to `WordListEntry`:
- `lemmas: Set<string>`: every line lowercased with tr-TR, kept only if it is a single token of letters.
- `properNouns: Set<string>`: the lowercased forms of lines that start with `\p{Lu}`, excluding any whose lowercase form also appears as a lowercase-initial line. About 2.6k candidates. This leaves out words like "Ordu" that also exist as "ordu".

Both are built once at load, and the memory cost is a few MB. Chosen words that are not in the list are never proper; they go through the suffix rules.

### Pure module `src/craft.ts` (no I/O; takes a `Lexicon = { lemmas, properNouns }`)
- **`tokens(entry)`** splits on whitespace and drops tokens that contain no letters.
  - For grammar, an entry is classified by its **last** token, because Turkish is head-final.
  - For freshness and duplicates, every token counts.
- **`stem(word, lex)`**, checked against the word list:
  1. If `word ∈ lemmas`, return the word (kapı, kedi, kanatlı and elma stay as they are).
  2. Otherwise try the suffixes in `SUFFIXES`, longest first:
     - plural: lar/ler
     - case: ı/i/u/ü, a/e, da/de/ta/te, dan/den/tan/ten, ın/in/un/ün, la/le
     - buffer forms: yı/yi/yu/yü, ya/ye, nın/nin/nun/nün, sı/si/su/sü
     - copula: dır/dir/dur/dür/tır/tir/tur/tür
     - possessive: ım/im/um/üm
  3. Accept a strip only when the remainder has at least 3 letters and is a lemma, or becomes one after softening its last letter b→p, c→ç, d→t or ğ→k.
  4. Strip at most 2 suffixes. If nothing validates, return the word unchanged.

  Examples: kaplar→kap, kitabı→kitap, kuşlara→kuş, kuştur→kuş.
- **`classify(entry, lex)`** returns `"proper" | "infinitive" | "verb" | "predicate" | "modifier" | "noun"`. It works on the raw, un-normalized last token, since ç/ş/ı matter. Checks, in order:
  1. **proper:** `properNouns.has(t)`.
  2. **infinitive:** `t` ends in -mak/-mek and `t ∈ lemmas`.
  3. **Lemma branch.** If `t ∈ lemmas`, the result is modifier when `t` is in `DETERMINERS` (bir, bu, şu, o, her) or `ADJ` (çok, az, en, ak, kara, yeni, eski, büyük, küçük, güzel), or ends in -lı/-li/-lu/-lü, -sız/-siz/-suz/-süz or -sal/-sel. Otherwise it is noun. **A lemma is never a verb**, so karar, şeker, demir, kedi, batı and gelir are nouns.
  4. **Verb, for non-lemmas only.** Match `VERB_PATTERNS`, each with a captured stem:
     - past: `(.+?)[dt][ıiuü](m|n|k|nız|niz|nuz|nüz|lar|ler)?`
     - reported past: `(.+?)m[ıiuü]ş(…person)?`
     - progressive: `(.+?)[ıiuü]?yor(um|sun|uz|sunuz|lar)?`
     - future: `(.+?)[ae]?c[ae]k(…)?`
     - necessity: `(.+?)m[ae]l[ıi]`
     - aorist: `(.+?)[aeıiuü]r(…)?`

     It is a verb if, for some match, `stem + "mak"` or `stem + "mek"` is a lemma, also trying the softened stem. So gidiyor → gid → git → gitmek, and uçtu → uç → uçmak.
  5. **predicate:** a non-lemma whose copula strip (dır…tür, optionally +lar/ler) leaves a lemma, as in kuştur. It is treated like a verb for sentence-final purposes.
  6. **noun:** everything else.

  Results are memoized per call.
- **Shared displacement.** Move `computeCharMapping` from components.ts into `src/anagram.ts` and add `computeDisplacement(sourceText, words, normalizer)`. Both `combinationBlock` and `scorePhrase` use it, with no change in behaviour.
- **`scorePhrase(words, ctx)`** returns `{ score, parts, perfect, tier, notes }`.
  - `ctx = { sourceText, normalizer, lex }`. Remaining letters, overflow (via textToPool/subtractWord) and displacement are all computed inside. This is cheap: there is no DAWG access.
  - `CraftNote = { sign, code: NoteCode, words?, n?, delta }`. It holds no prose.
  - Let n = the number of letters in the source, wc = the number of entries and d = the displacement. The weights live in one `WEIGHTS` constant and add up to 100:

  | Component | Max | Rule |
  |---|---|---|
  | Bütünlük | 35 | `max(0, 35 × used/n − 6 × overflow)` |
  | Biçim | 22 | clamp 0..22 of the following: +13 if the last entry is a verb or predicate, or +7 if it is an infinitive ("başlık gibi"); −5 for each verb or predicate that is not last; +4.5 for each adjacent modifier → noun/proper pair, where each distinct modifier string counts once, all determiners together give at most one pair, and pairs are capped at 2 |
  | Ekonomi | 15 | with T = max(1, ceil(n/7)): `max(0, 15 − 3 × max(0, wc − T))` |
  | Tazelik | 18 | `max(0, 18 − 6 × reused − 4 × dups)`. reused = chosen tokens whose normalized stem equals the stem of a source token. dups = repeated normalized stems among the chosen tokens. |
  | Karışıklık | 10 | m = the number of mapped letters; 0 if m < 2; otherwise `10 × min(1, d / ((m² − 1)/3))`, the random-permutation expectation |

  - Score = `clamp(round(sum), 0, 100)`.
  - `tier` is set only when the combination is perfect.
  - "bir bir bir" is blocked by the determiner cap together with the dup penalty.
  - Notes come only from components that fire, at most 5. They are sorted by |delta| descending, then table order, then code. Each negative `NoteCode` maps to a hint that names an action.
- **`bestArrangement(words, ctx)`** applies to 2–5 entries and returns any other input unchanged.
  - It enumerates permutations in lexicographic index order, starting from the identity.
  - First pass: compute **Biçim only** for each permutation. This is cheap: classification is memoized, and Biçim needs no displacement.
  - Keep the permutations tied on the best Biçim, then pick the highest total score among them. On a further tie, the earliest permutation (the identity) wins.
  - Grammar always dominates, so a Karışıklık gain cannot buy a worse word order.
- **`craftFill(fill, current, ctx)`** (M2).
  - Each slot's representative is `words[0]`, which is what `fillRow` uses today.
  - Arrange the row with `bestArrangement(rowReps)`, then score the final phrase `current ++ arrangedRow`, keeping the current words in their order.
  - Rows are stably sorted by score within each k, and `bestIndex` is the overall maximum.
  - It returns `CraftedFill = FillResult & { rows: { slots, score, tier }[], bestIndex }`. Totals and k grouping are unchanged.
  - Cost: rows ≤ 30. Most have 1–3 words, so ≤ 6 permutations each. The worst case of 5-word rows is bounded by the Biçim-first pass, with full scoring only on ties; this is benchmarked in a unit test (< 15 ms for 30 rows of 5 words).

### Data model
- **Attempt (M1)** gains `best?: { score: number; words: string[]; at: string }`. It is the highest-scoring *perfect* phrase ever saved for this attempt, across all combinations. Deleting a combination keeps it. It is optional, so no migration is needed.
- **Favourites store (M3).** `src/store/favorites.ts` keeps `data/favorites/favorites.json` = `{ items: Favorite[] }`.
  - `Favorite = { id, attemptId, sourceText, words, displayWords, note (trimmed, ≤ 200 chars), score, tier, wordListId, createdAt }`.
  - `displayWords` capitalizes proper nouns with `toLocaleUpperCase("tr-TR")` on the first letter.
  - Functions, all taking an optional `dir`:
    - `listFavorites(sort, dir?)`
    - `addFavorite(input, dir?)`, which is idempotent on (attemptId, words)
    - `removeFavorite(id, dir?)`
    - `findFavorite(attemptId, words, dir?)`
    - the pure helpers `countFavoritesByAttempt(favs)` and `tierTally(favs)`
  - Entries are snapshots, so re-indexing `ci` or deleting the attempt cannot corrupt them. `index.ts` creates `data/favorites`.

### Server helpers (in src/routes/attempts.ts)
- **`computeCraft(attempt, ci, words?)`** builds the context: the normalizer from `mappingSnapshot`, and `lex` from `getWordList(attempt.wordListId)`, which is already in memory. It returns the `scorePhrase` result.
- **`commitCombination(attempt, ci, newWords)`**:
  1. Compute `before` (computeCraft on the old words), set the words, then compute `after`.
  2. If `after.perfect` and `after.score > (attempt.best?.score ?? -1)`, set `best` and remember `prevBest`.
  3. Save the attempt.
  4. Return `{ before, after, celebrate }`, where `celebrate` is set when `after.perfect` and either:
     - `tierRank(after) > tierRank(before)` and after's tier is İnce iş or Şaheser, or
     - `prevBest` existed and the score beat it.

  It carries `{ ci, score, tier, record, prevBest }`. The choose, `DELETE /chosen/:index`, `PUT /chosen` and arrange routes call it instead of saving directly.
- **`blockResponse(attempt, ci, commit?)`** wraps `renderCombinationBlock(attempt, ci, true, { delta: after.score − before.score, favorites })`.
  - If `commit.celebrate` is set, it adds `HX-Trigger-After-Settle: {"craftCelebrate": {...}}`. JSON-encoding a fixed-shape object is safe, because the event data never interpolates raw words into markup.
  - The delta is rendered as the meter's `data-delta`, and only on these mutation responses. All other renders omit it, so re-renders from hide, delete-combination or refresh-mapping never flash a chip or celebrate.
- **`renderCombinationBlock(attempt, ci, open, ctx?)`**, with `ctx = { favorites?, delta? }`. Without favourites in the context it loads them once. `renderAllBlocks` loads them once for every block.

### Routes
**M1**
- `GET /attempts/:id/score?ci=&word_0..n` is read-only.
  - It reads at most 30 `word_*` parameters and returns 400 if there are more.
  - It returns 404 for an unknown attempt and 400 for an invalid `ci`, mirroring the ban route.
  - It returns two OOB fragments: `craftMeter(live, { delta: liveScore − savedScore })` as `#craft-meter-N`, and `craftNotes` as `#craft-notes-N`, both with `hx-swap-oob="outerHTML"`.
  - It never writes and never triggers a celebration.

**M2**
- `POST /attempts/:id/arrange` (form `ci`) runs `commitCombination(bestArrangement(words))` and returns `blockResponse`.
- `GET /fill` and the inline fill return `CraftedFill`, which needs the block's current words.

**M3**
- `POST /attempts/:id/favorite` (form `ci`, `note`) returns 400 unless the combination is perfect. It is idempotent and returns the block.
- `DELETE /attempts/:id/favorite?ci=` removes the entry that matches the current words and returns the block.
- New `src/routes/vitrin.ts` with `handleVitrinRoute`, added to the chain in index.ts:
  - `GET /vitrin?sort=date|score` renders the full page through `layout`. An unknown sort falls back to date.
  - `DELETE /favorites/:id` returns an empty string (the card uses `hx-target="closest .vitrin-card" hx-swap="outerHTML"`), plus an OOB `#vitrin-tally`. When nothing remains, it also returns an OOB `#vitrin-empty`, which the page always renders and hides when there are items. An unknown id returns 404.

### Templates: new `src/templates/craft.ts`, which imports `escapeHtml`
- `noteText(note)` maps each `NoteCode` to Turkish text, escaping `words` and `n` here.
- `craftMeter(result, ci, { live?, delta? })`
- `tierPill(tier)`
- `craftNotes(notes, ci)`
- `arrangeButton(attemptId, ci, wordCount)`
- `favoriteControl(attemptId, ci, { perfect, starred })`: a star button and a hidden note `<form hx-post … hx-target="#combination-N" hx-swap="outerHTML">`. If another swap re-renders the block while the form is open, the draft note is lost; this is documented and acceptable.
- `bestBadge(best)` for home cards
- `vitrinPageContent(favs, existingIds, sort)` and `vitrinCard(fav, attemptExists)`. The card's `data-copy` and `data-card` (JSON for the PNG) are attribute-escaped.

### Changes in components.ts (only optional parameters and hooks)
- `combinationBlock`: an optional `craft?: BlockCraft` renders the meter and tier after the displacement span.
- `chosenWordsPanel`: an optional `footerHtml` for the notes, the arrange button and the favourite control.
- `fillRow`: renders `CraftedFill.rows` in arranged order. `data-phrase`, `data-words` (for "hepsi") and the visible order all come from the **same arranged representative array**, so preview, display and add always agree. It also renders the score, the tier and `.fill-row--best`.
- Home card: `bestBadge` and "★ n".

`layout.ts` adds the Vitrin nav link. `workspaceContent` adds `#craft-toast`.

### Client JS: `static/app.js`, delegated listeners only, no scoring or pool math
1. **Live score.**
   - When inline edit starts, the existing code adds `is-editing`, and CSS hides `.btn-arrange`.
   - On input, a 250 ms debounce calls `htmx.ajax("GET", "/attempts/"+id+"/score", { values: { ci, word_0, … }, swap: "none" })`, with `values` as a plain object. HTMX still processes the OOB swaps.
   - On cancel, one more call is made with the original words. On commit, the existing PUT goes through `commitCombination`.
2. **Delta chip.**
   - On `htmx:load`, which fires for each newly inserted element, check `detail.elt` and its descendants for `.craft-meter[data-delta]:not(.is-live)`.
   - For each one whose delta is not zero, insert `.craft-delta` and remove it after 1.2 s.
   - The client keeps no state.
3. **Celebration.**
   - `document.addEventListener("craftCelebrate", e => …)`. HTMX dispatches HX-Trigger events on the request element and they bubble to document.
   - It reads `e.detail.ci`, adds `.ince-is` to `#craft-meter-<ci>`, removes it on `animationend`, and shows `#craft-toast` with text built from `detail` (assigned through `textContent`).
4. **Favourite note.**
   - `.btn-favorite[data-open-note]` un-hides the sibling form and focuses its input.
   - Vazgeç hides it again.
   - A starred button uses `hx-delete` with `hx-confirm`.
5. **Kopyala.** `.btn-copy[data-copy]` calls `navigator.clipboard.writeText` inside try/catch, falling back to a textarea plus `execCommand`. The button gets `.copied` for 1.2 s.
6. **Kart indir.** `.btn-card[data-card]` waits for `document.fonts.ready`, then draws on a 1200×630 canvas:
   - a stone background
   - a tile row
   - the source in small caps
   - the arrow and the anagram in Bitter, with a greedy word-wrap helper and the font size stepped down to fit
   - the tier and score

   It then calls `toBlob` and downloads through an `<a download="anagram.png">`. This is about 60 lines, wrapped in try/catch, and the button is hidden if canvas is unavailable.

### Conventions checklist
- Lowercasing uses `toLocaleLowerCase("tr-TR")`, uppercasing uses `toLocaleUpperCase("tr-TR")`, and sorting uses `localeCompare(…, "tr-TR")`.
- Every word and note goes through `escapeHtml`. The toast uses `textContent`.
- `htmx.ajax` values are plain objects.
- `ci` is threaded as a form field or `?ci=`.
- Listeners are delegated only.
- New code goes in the focused files `craft.ts`, `templates/craft.ts`, `routes/vitrin.ts` and `store/favorites.ts`, plus two CSS sections.
- Commits are one per milestone, in "feat: …" style. `tasks/todo.md` tracks the milestones.

## Test plan

**M1**
- `src/craft.test.ts`, using a small synthetic lexicon:
  - `stem`: kaplar→kap, kapı→kapı (a lemma is kept), kitabı→kitap (softening), kuşlara→kuş, kuştur→kuş, kedi→kedi; never shorter than 3 letters.
  - `classify`: uçtu→verb, gidiyor→verb (softening), kuştur→predicate, gitmek→infinitive, kanatlı→modifier, bir→modifier; the proper-noun lexicon entry→proper; an unknown word with no verb stem→noun; a multi-word entry uses its last token.
  - `scorePhrase`:
    - a verb-final order beats verb-first
    - reusing a source stem lowers Tazelik and emits a note with an action
    - overflow lowers Bütünlük
    - "bir bir bir" scores below "bir" plus two distinct words
    - Ekonomi uses T = ceil(n/7)
    - an ideal fixture can reach 100 and the score is clamped to 0..100
    - the tier is set only when perfect, and the tier boundaries hold at 59/60/79/80/89/90
    - there are at most 5 notes, in a deterministic order, with no HTML
- **Classifier precision fixture against the real word list** (in the integration tests, using the loaded lexicon):
  - The hand-labelled nouns must **never** be classified as verb: karar, zarar, kadar, kader, haber, şeker, asker, demir, zincir, onur, kömür, anahtar, kedi, batı, kadı, gelir, uçar, ödü.
  - The labelled verbs must be classified as verb or predicate with at least 80 % recall: uçtu, geldi, gidiyor, uçmuş, okudu, gelecekler, kuştur.
  - `stem` with the real list keeps kapı, kedi and elma, and strips kaplar to kap.
- `src/anagram.test.ts`: `computeDisplacement` equals the previous inline result on a fixture.
- `src/store/wordlists.test.ts`: `lemmas` and `properNouns` are built correctly, including the exclusion of "Ordu"-style words.
- Integration (`describe("Nakış puanı")`):
  - The summary contains `craft-meter` with an aria-label, and the panel contains `craft-notes-0`.
  - `GET /score` returns both OOB ids with `is-live` and leaves the stored attempt unchanged (re-read and deep-equal). It returns 400 for a bad `ci` and for 31 `word_*` parameters.
  - Building a perfect high-scoring phrase with `PUT /chosen` returns an `HX-Trigger-After-Settle` header containing `craftCelebrate` and the right `ci` and `tier`, and the meter carries a non-zero `data-delta`.
  - A second identical PUT returns no celebrate header, because there is no tier rise and no record.
  - A different perfect phrase with a higher score returns `record: true` with `prevBest`.
  - The `best` stored on the attempt is updated. The home page shows "en iyi".
  - Deleting the combination keeps `best`.
  - `POST /hide` re-renders contain no `data-delta`.

**M2**
- `bestArrangement`:
  - ["kuştur", "bir", "ebabil"] → ["bir", "ebabil", "kuştur"]
  - a Biçim tie keeps the identity order
  - Biçim dominates a Karışıklık gain (a constructed case)
  - fewer than 2 or 6 and more entries come back unchanged
- `craftFill`:
  - the row count and k grouping are unchanged and sorting happens only within each k
  - `bestIndex` is the maximum
  - rows are scored against `current ++ row`
  - performance: 30 synthetic 5-word rows take < 15 ms
- Integration:
  - `POST /arrange` puts the verb or predicate last and can return the celebrate header.
  - For a known source, each rendered Tamamla row's visible order, `data-phrase` and `data-words` are identical and equal to `bestArrangement` of its representatives (computed in the test through the module).
  - Exactly one `fill-row--best` is rendered.

**M3**
- `src/store/favorites.test.ts` (in `data/test-favorites`):
  - add, both sort orders, and an idempotent add that returns the same id
  - `findFavorite` matching, and remove
  - `countFavoritesByAttempt` and `tierTally`
  - the note is trimmed and capped at 200 characters
  - `displayWords` capitalization, including İ for i
- Integration:
  - a favourite on a non-perfect combination returns 400
  - on a perfect one, the button shows "Vitrinde", `/vitrin` lists the phrase and the tally, and the home page shows "★ 1"
  - a second POST adds no duplicate
  - `?sort=score` returns the cards in score order
  - `DELETE /attempts/:id/favorite` reverts the button
  - after the attempt is deleted, the card remains without "Denemeye git"
  - deleting the last item returns the `vitrin-empty` and `vitrin-tally` OOB fragments; an unknown id returns 404
  - a `<script>` note is escaped both in the card and in `data-copy`
  - The test tracks the favourite ids it creates and removes them from the real `data/favorites`, following the existing cleanup.

**Manual and Playwright checks**
- the live meter and delta badge while typing, and that the arrange button is hidden during edit
- the delta chip after a save
- the İnce iş, Şaheser and Rekor toasts and the tile flip, plus reduced motion
- a delete-combination re-render does not celebrate
- the Tamamla "En iyi hamle" row and that "hepsi" preserves the order
- star, note and Vitrin sort
- Kopyala
- the PNG download renders the fonts correctly
- the Vitrin layout at 480 px

**Regression:** all 76 existing tests pass after every milestone.

## Scope boundaries and non-goals
- **No Tema.** Theme words, themed suggestions and themed Tamamla are moved to `ideas/` as a future direction.
- **No semantics.** No embeddings, synonyms or network access. The grammar is suffix rules checked against the word list, and it misses vowel narrowing (bekliyor→bekle) and other irregular forms. These fall back to noun, which only costs a few Biçim points.
- **No word-frequency ranking.** Suggestion order is unchanged. Only Tamamla rows are re-sorted, and only within each k.
- **No changes to `findFullAnagrams`** and no user-tunable fill options.
- **No public sharing, accounts or server-side image rendering.** The PNG is generated client-side and downloaded locally.
- **No client-side copy of the scoring or pool logic.** The live score is a cheap server round-trip.
- **No touch or keyboard rework** of the existing hover features. The rough edges listed in the briefing stay as they are, apart from moving `computeCharMapping` and `computeDisplacement`.

## Risks and mitigations
- **Heuristic grammar is still imperfect.**
  - The lemma-first rule removes the common noun→verb errors, and the real-list fixture pins them.
  - Misses default to noun, a safe failure: no penalty for a "verb in the middle".
  - Notes are worded softly ("fiil gibi").
  - Biçim is at most 22 % of the score, and drag-and-drop always overrides.
- **The score can feel arbitrary.** Every component that fires produces a note with an action. Live preview shows cause and effect. The formulas and weights sit in one documented constant.
- **Celebration correctness.** The decision is made on the server from the actual before and after state. Only the four mutating routes can trigger it, and integration tests assert the header. Re-renders never carry a delta.
- **Celebration fatigue.** It fires only on a tier *rise* into ≥80 or a new personal record, never on page load, live preview or re-render.
- **Tamamla latency.** craftFill is bounded by the Biçim-first arrangement and the row cap of 30, and it is covered by a performance test. Closed blocks stay lazy.
- **Live score load.** The 250 ms debounce sends one read-only GET with no DAWG access and at most 30 parameters.
- **PNG canvas fragility** (fonts or old browsers). It waits for `document.fonts.ready`, runs inside try/catch, hides the button without canvas support, and Kopyala remains the primary share path.
- **Snapshot versus live state.** Editing a starred phrase un-stars the button, with an explanatory tooltip. `best` is history and outlives combination deletes by design.
- **Concurrent JSON writes.** The same read-modify-write as the other stores, which is acceptable for one local user.
- **File growth.** New logic goes in new files. Changes to components.ts are limited to optional parameters and hooks.

## Files touched
- **New:**
  - src/craft.ts, src/craft.test.ts
  - src/templates/craft.ts
  - src/store/favorites.ts, src/store/favorites.test.ts
  - src/routes/vitrin.ts
- **Modified:**
  - src/anagram.ts (+test): `computeCharMapping` and `computeDisplacement`
  - src/store/wordlists.ts (+test): `lemmas` and `properNouns`
  - src/store/attempts.ts (+test): `best`
  - src/routes/attempts.ts: `computeCraft`, `commitCombination`, `blockResponse`, and the score, arrange and favourite routes; CraftedFill wiring
  - src/templates/components.ts: optional `craft` and `footerHtml` parameters, crafted `fillRow`, home badges
  - src/templates/layout.ts: Vitrin nav link
  - src/index.ts: route chain and `data/favorites`
  - static/app.js: live score, delta chip, celebrate listener, note toggle, copy, PNG card
  - static/style.css: the Nakış and Vitrin sections
  - src/integration.test.ts: one describe block per milestone, plus the classifier fixture
