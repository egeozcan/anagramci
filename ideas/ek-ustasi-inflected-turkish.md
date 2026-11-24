# Ek Ustası: Inflected Turkish for AnagramCI

> **Unchosen product direction** — saved for future reference.
>
> - **Direction key:** `turkish`
> - **Iteration round:** 3
> - **Evaluator scores:** consistency 8.6 · design 8.3 · entertainment 7.7 · **avg 8.2**

## Evaluator's last critique

I checked the plan against the code. The main claims hold up:
- `PUT /chosen` parses `word_0..n` in a `formData.has` loop (attempts.ts:221), so the `hx-vals` swap needs no new mutation route.
- `renderAllBlocks` and `parseOpenParam` exist, so the toggle can reuse the hide re-render path.
- `computeWorkspaceData(attempt, ci, withFill)` is the right seam for adding `{derived}`.
- `FillOptions` already takes `budgetMs` and `maxPerLead`, so the `isDerived` extension fits.
- There are 9,914 `-mak/-mek` lines, matching the plan.
- `WordListEntry` is easy to extend with `stems`.
- New code is confined to `src/morph/` and `src/templates/morph.ts`, which respects the large-file concern.

Weaknesses, and what would raise each score:

CONSISTENCY
1. `homePageContent` lives in `src/templates/components.ts` (line 74), not `pages.ts`. The perfect check is inline template logic at roughly lines 117 and 269. Scoring the Ek Rekoru needs the `StemIndex`, which means passing `wordLists` entries or a scorer into a pure template. Say exactly how the template gets access to `analyzeWord`, for example by precomputing `bestUsta` per attempt in `pages.ts` and passing a map in.
2. `analyzeWord` is mapping-free, while pools, suggestions and the derived chips are mapping-normalized. With the mapping `ç→c`, a user who types `agaci` (or adds a chip whose surface is fine but whose stem differs only by a mapped letter) gets "çekimlerde yok" and no counter, even though `findDerived` would have matched it. Decide on one rule. Analyzing under the snapshot mapping, with the normalized form as the memo key, is the more consistent choice.
3. The tri-state default depends on an audit outcome. That makes tests conditional ("either unset+nudge or true") and leaves two code paths to ship. Pick one: always-on plus the toggle, or always-unset plus the nudge. Make the audit only decide whether that constant flips.
4. `fill.ts`'s budget is still wall-clock (line 137). Tamamla with morph on is therefore not deterministic either. State this so nobody expects the same stability guarantee that paging has.

DESIGN
5. Scope is very large for one feature: about 8 new modules, 11 template functions, 2 routes, a toggle, a nudge, a popover, a swap, a stamp, a reveal, a home badge and an audit. Commit A alone is a big morphology engine. Ship commit A without the nudge and failure-retry buttons, and drop either Ek Rekoru or the reveal, to tighten the MVP.
6. The "derived" stamp can be granted for false parses. `analyze` accepts any parse whose realized surface matches, so a user who types a noun that happens to parse as stem+suffix (for example `kazan`, `akın`, `yazı` if those are not lemmas, or a dictionary miss) gets EK USTASI. Require `kind: derived` only when the word is not a lemma under the mapping. Consider also requiring the word to be absent from hidden words. Add a test with tricky lemma-like surfaces.
7. The `altCount` and "longest stem" tie-break for something like `evleri` is fine, but the Fişi gloss for an ambiguous parse may teach wrong grammar. Show both readings, or mark it "belirsiz".
8. Positioning the popover relative to the panel breaks when the suggestions panel scrolls or wraps. Also define what happens to an open popover when an HTMX swap of the block replaces the trigger: close it and reset focus.
9. The cache key includes the full hidden ∪ banned set, so hiding one word invalidates every entry. That is acceptable, but note it, along with the 32-entry ceiling across 4 open blocks and searches.

ENTERTAINMENT
10. The core delight is "many more anagrams", which is utility more than fun. The stamp, reveal and home badge are pleasant but thin: no goal, no progression, no surprise beyond the first stamp. To raise this score, add one playful loop, for example:
   - an "Ek avı" challenge (reach N suffixes in a perfect anagram of this source)
   - a per-attempt "en çok ek" record that is beaten visibly
   - the morpheme reveal on a Tamamla "hepsi" click as well as on swap
11. Near-miss "eksik: m" plus "yerine koy" is the most game-like idea in the plan. Lean into it by surfacing near-misses proactively, for example "1 harf uzakta" chips in Öneriler, instead of hiding them behind `⋯`.

---

# Ek Ustası: Inflected Turkish for AnagramCI (rev. 3)

## What changed since rev. 2

| Critique item | Fix in this revision |
|---|---|
| 1. Derived paging unstable | `findDerived` has **no wall-clock budget**. It uses a deterministic step budget, so the same input always gives the same ordered output. A small LRU cache makes page 2 reuse page 1's exact list. |
| 2. Cost of re-rendering many blocks | Closed blocks never run `findDerived`. Their summary only needs `analyzeWord`, which is memoized. Results are cached by (list, mapping, pool signature, exclusions). Phase 0 benchmarks `renderAllBlocks` with 4 open blocks. |
| 3. Stamp condition muddled | The stamp and the Ek Fişi come from `analyzeWord` over the chosen words, never from `FillSolution`. Analysis **always runs**, whether the toggle is on or off. |
| 4. Pruning cost not estimated | There is a worked step estimate, an incremental (trie-style) chain walk, and an explicit reason for truncating longest-stem-first. |
| 5. Noise in derived rows | Türetme forms (`lI/sIz/lIk/CI`) are **cut from Öneriler and Tamamla**. They appear only in the Ek Çarkı. Derived rows follow an explicit ranking key. |
| 6. Consistency points | One popover container per block, outside the chip flow. An integration test round-trips the swap `hx-vals` through `PUT /chosen`. Hiding `yemek` removing both noun and verb forms is accepted and documented. Extra-DAWG build time is logged. |
| 7. Entertainment | New **Ek Rekoru** badge on home cards. A client-side **morpheme-split reveal** plays the moment a block becomes Ek Ustası. A live **ek counter** sits in every summary. A tri-state toggle with a first-run nudge. Default-on is decided by a Phase 0 overgeneration audit. |
| 8. Scope | Delivered as two commits, each with its own test gate. |

---

## Pitch

The bundled `turkce_kelime_listesi.txt` (76k lines, about 60.5k unique single words) is essentially a lemma dictionary.

- **What is present:** `kitap`, `ev`, `gelmek`.
- **What is missing:** `kitabı`, `evlerde`, `geldi`, `gözümüz`.
- **Not purely lemmas:** a few plurals such as `kuşlar` are present, so the code must dedupe against the list.
- **Verbs are unusable:** 9,914 entries are `-mak/-mek` infinitives, so no conjugated verb can be suggested.

Real Turkish anagrams of names, headlines or "ebabil bir kuştur" depend on inflection. A pool full of `l, a, r, ı, m, d, e` is a goldmine in Turkish, but today those letters are dead weight.

Ek Ustası teaches the app a small, conservative and fully tested core of Turkish morphology:
- vowel harmony
- consonant assimilation
- stem softening
- buffer consonants
- vowel drop
- verb tense and person

Building an anagram becomes a grammar toy. The rewards are visible inside the workspace and outside it:

1. **Ek Çarkı** (suffix wheel): every form of a root that fits the remaining letters. Near-misses say "eksik: m". A one-click **"takas"** swaps out the chosen word that holds the missing letters.
2. **Ek sayacı + Ek Fişi**: a live suffix count in every block summary, and a receipt-style morpheme breakdown (`kitap·lar·ımız·da`). It works even for words you typed yourself, with the toggle off.
3. **Ek Ustası moment**: the instant a combination becomes perfect while using inflected words, the stamp lands and the Ek Fişi's morphemes visibly split apart.
4. **Ek Rekoru**: the home page attempt card shows your best perfect inflected anagram, for example `EK USTASI · 5 ek`, so the achievement lives beyond the workspace.

---

## User-facing experience, step by step

1. **Tri-state toggle and first-run nudge.**
   - The workspace header gets a segmented pill, `Çekimli kelimeler: Kapalı | Açık`.
   - `Attempt.morph` is `undefined` (never chosen), `true` or `false`.
   - **While it is `undefined`**, a one-line dismissible nudge card sits above the first block: *"Türkçe ekleri aç: kitap → kitabı, gelmek → geldi. Çok daha fazla anagram."* It has two buttons:
     - **[Aç]** sets `true`.
     - **[Şimdilik değil]** sets `false`.
     - Either choice hides the nudge for good on this attempt.
   - **Failure nudges** appear when morph is not `true`:
     - Tamamla finding no solution, and an empty Öneriler, both show **"Çekimli kelimelerle dene"**.
   - **Default for new attempts** is set by the Phase 0 audit:
     - If the audit passes, `createAttempt` sets `morph: true`, and the nudge is never seen.
     - If it fails, the field stays unset and the nudge applies.
     - The plan works either way.
   - **Toggling** re-renders all blocks, keeps the open/closed state and keeps the search query. It is the same path as hide.

2. **Live ek counter (always on, toggle-independent).**
   - Every block summary shows a muted `· 3 ek` when any chosen word is a recognized inflection.
   - The number is the sum of the suffix counts.
   - It updates on every block re-render, so adding `kitabı` makes it tick up.

3. **Suggestions with inflections (toggle on).**
   - Each letter-count group keeps its root chips unchanged.
   - Below them is a `<details>` row, `ÇEKİMLİ (312) ▸`.
   - **When the row is open by default:**
     - Closed by default.
     - Open by default for the "complete" group (letter count equals remaining count).
     - Open by default whenever the search box has a query.
   - **When opened:** the first 12 chips are shown, then "Daha fazla..." adds 50 at a time.
   - **Content:** inflections only (plural, possessive, case and verb forms). Türetme forms never appear here.

4. **Derived chips.**
   - The chip shows morphemes, `kitab·ı·mız`: the stem in normal ink, suffixes in ochre, separators muted.
   - Clicking adds the surface form, and hover highlighting works unchanged.
   - The gloss is in `title`, but nothing depends on it. The same gloss is always visible in the Ek Çarkı and the Ek Fişi, so touch users lose nothing.

5. **Ek Çarkı.**
   - **Where the `⋯` button appears:** on every noun root chip and every derived chip. A verb's infinitive chip (`gelmek`) often does not fit the pool while `geldi` does, so derived chips need the button too.
   - **Opening:** clicking `⋯` always re-fetches the card. Near-miss data depends on the current pool.
   - **Layout:** a card titled "gelmek — ekler" with categories, each form with a visible gloss caption.
     - Nouns: Çoğul / İyelik / Hâl / **Türetme** (Türetme lives only here).
     - Verbs: Zaman / Olumsuz / Kişi / Sıfat-fiil.
   - **Kinds of item:**
     - Fitting forms are add chips.
     - Near-misses (1–2 letters missing) are greyed and show `eksik: m, z`.
     - A near-miss also gets **"‘mum’ yerine koy"** when one chosen word holds all the missing letters. One click removes that word and appends the form (the swap loop).
     - Forms missing more than 2 letters are hidden.
   - **Closing:** Escape, an outside click, or `⋯` again. Only one card is open at a time.
   - **Focus:**
     - On open, focus goes to the first fitting chip or swap button.
     - Escape returns focus to `⋯`.
     - After an add or a swap the block re-renders, and focus goes to its add-word input.

6. **Tamamla with inflections (toggle on).**
   - Full solutions may include derived inflections, but not Türetme forms.
   - At equal word count, solutions with fewer derived slots rank first, so lemma-only solutions stay on top.
   - Derived words have a thin ochre underline.

7. **Ek Fişi (always on).**
   - A collapsible `Ek fişi ▸ (3 ek)` under the chosen words.
   - It is hidden entirely when no chosen word is derived.
   - **One row per chosen word:**
     - A recognized inflection: `kitap·lar·ımız·da — kitap + çoğul + iyelik (biz) + bulunma`. When the parse is ambiguous, a muted `(+2 okuma)` is added, for example `evleri`.
     - A dictionary word: the word plus "sözlük".
     - Anything else: "sözlükte ve çekimlerde yok", in muted italic.
   - Derived chosen words get an `ek` badge. It is a `<button>` that opens the Fişi and flashes that row, so it works on touch.
   - **Discovery hook:** a user with morph off who types `geldik` by hand still sees it recognized and counted.

8. **The Ek Ustası moment.**
   - **Condition:** the combination is perfect (no remaining letters, no overflow) and at least one chosen word analyzes as `derived`.
   - **What changes:**
     - The summary shows a rotated stamp, `EK USTASI · 4 ek`.
     - The Ek Fişi opens by default.
   - **Reveal (client-side):** when a swap turns a block into Ek Ustası, and it was not one before, two animations play once:
     - the stamp scales in
     - each Fişi row's suffix spans slide apart from the stem with the `·` separators popping in, staggered 60 ms per row
   - On a plain page reload the stamp is shown statically, with no replay.
   - Under `prefers-reduced-motion` the reveal is skipped.

9. **Ek Rekoru on the home page.**
   - Each attempt card computes, at render time, the best perfect combination containing derived words, measured as the highest total suffix count.
   - The card shows a small stamp chip, `EK USTASI · 5 ek`, next to the date.
   - Perfect lemma-only attempts show nothing new.
   - This needs no stored state.

10. **Hiding and banning.**
    - Hiding (×) or banning (⊘) a root suppresses all its derived forms. Verbs are matched by infinitive, so hiding `gelmek` removes every `gel*` form.
    - Hiding or banning a derived chip affects only that surface form.
    - **Accepted:** hiding `yemek` removes both its noun forms and its verb forms (yedi, yiyor). This is documented in the hide button's `title`.

---

## UI and visual design notes

- **Tokens.** Two new tokens on `:root`:
  - `--color-suffix`: a terracotta or ochre from the existing palette, verified at 4.5:1 or better on the chip background
  - `--color-suffix-bg`: the same colour at about 14% alpha

  Morpheme spans are `.morph-stem`, `.morph-sfx` and `.morph-sep`; the separator uses `--color-muted`.
- **Nudge card.**
  - The style of the stale-mapping banner, with a softer `--color-suffix-bg` fill.
  - Inside it, a sample morpheme line in the chip style (`kitab·ı`).
  - Two buttons: primary "Aç" and a text-style "Şimdilik değil".
- **Ek counter.** `font-variant-numeric: tabular-nums` and muted ink. It becomes `--color-suffix` when the block is Ek Ustası.
- **Derived row.** A small-caps `ÇEKİMLİ (312)` summary in muted ink, indented 12px, with a rotating ▸. It clearly weighs less than the root chips.
- **Ek Çarkı.**
  - **Container:** one `<div class="forms-pop" id="forms-pop-{ci}" hidden>` per block, placed as a direct child of the suggestions panel, **not inside the chip flow**. Chip-row flex layout and "Daha fazla" appends are therefore never affected.
  - **Positioning:**
    - JS sets its `top` from the trigger chip's `getBoundingClientRect()` relative to the panel.
    - At 480px or less it becomes a bottom sheet (`position: fixed; bottom: 0`) and needs no positioning.
  - **Card:** the raised shadow, `max-width: 420px`, and a category grid that stacks to one column at 480px or less.
  - **Near-misses** use opacity .5, with `eksik:` in `--color-overflow`.
  - **Swap button:** an outlined pill in `--color-suffix`.
  - **The `⋯` button:**
    - copies the size and focus ring of ⊘ and ×
    - carries `aria-expanded` and `aria-controls="forms-pop-{ci}"`
- **Stamp.**
  - Look: a −3° rotated outlined label in `--color-suffix`, in Bitter small caps. No emoji.
  - The home version is the same label at 80% size, not rotated, so it stays legible in the card meta row.
- **Reveal.** `.is-reveal .morph-sfx` animates `translateX(-6px) → 0` with opacity 0→1, and `.morph-sep` animates `scale(0) → 1`. It lasts 300 ms with row stagger set through a `--i` custom property.
- **Ek Fişi.** Dashed top border like a paper receipt, tabular numbers, and a 1s `.is-flash` background for badge taps.
- **Text.** All new strings use correct Turkish characters ("Çekimli", "Hâl", "yerine koy", "Ek fişi", "Şimdilik değil").
- **CSS placement.** One new section at the end of `style.css`, `/* ── Morphology ── */`, at about 170 lines.

---

## Technical design

### Delivery in two commits

| Commit | Contents | Test gate |
|---|---|---|
| **A** | Morph core (`src/morph/*`), the toggle and nudge, derived suggestion rows, fill integration and the cache. | `bun test` green, plus Phase 0 numbers recorded. |
| **B** | Ek Çarkı and swap, ek counter, Ek Fişi, stamp and reveal, and Ek Rekoru on home. | `bun test` green, plus the Playwright manual checklist. |

### Phase 0: measurement and audit gate (the first step of commit A)

The benchmark is `src/morph/bench.test.ts`. It runs only when `BENCH=1` and is skipped otherwise. It uses 10 fixed sources of 15–25 letters. The baseline is that the main DAWG builds in about 515 ms.

| Metric | Acceptance |
|---|---|
| Added startup (stem index + extra DAWG) | < 300 ms |
| `findDerived` cold, p95 | < 40 ms at the chosen `maxSteps` |
| `renderAllBlocks` with 4 open blocks, morph on, cold cache | < 400 ms |
| `renderAllBlocks` with 4 open blocks, warm cache | < 150 ms |
| Tamamla truncation rate, morph on vs. lemma-only | at most +1 truncated source |

**Calibration procedure:**
1. Start at `maxSteps = 60_000`.
2. Lower it until the p95 criterion holds.
3. If the truncation criterion fails, drop the derived cap passed to fill from 3000 to 1500.

The final numbers are recorded as commented constants in `src/morph/derive.ts` and `fill.ts`.

**Overgeneration audit (decides the default):**
1. A script, `BENCH=1 AUDIT=1`, writes 200 seeded-random derived surfaces, half noun forms and half verb forms, to `scratch/morph-audit.txt`. The script commits nothing.
2. The implementer marks each form wrong or right by hand.
3. **Error rate below 3%:** new attempts default to `morph: true`.
4. **Otherwise:** the default stays unset (nudge path), and the bad patterns become new exception entries or rule fixes.

The result is noted in the commit message.

### New pure module `src/morph/` (no I/O, unit-tested)

| File | Responsibility |
|---|---|
| `phonology.ts` | The constants `VOWELS = "aeıioöuü"`, `BACK = "aıou"`, `ROUNDED = "oöuü"`, `VOICELESS = "fstkçşhp"`. The functions `lastVowel`, `harmonize2` (a/e), `harmonize4` (ı/i/u/ü), `endsInVowel`, `syllableCount` and `softenFinal` (p→b, ç→c, k→ğ, nk→ng; t only when the caller asks). Lowercasing is always `toLocaleLowerCase("tr-TR")`. |
| `suffixes.ts` | The catalog `{ id, arch, slot, pos, category, gloss, derivational }` and the slot graph. In the notation, `A` is 2-way, `I` is 4-way, `D` is d/t and `C` is c/ç. `(y)/(s)/(n)` are used after a vowel; `(I)` after a consonant. |
| `exceptions.ts` | Exact constant sets (below). Nothing outside these sets is treated as an exception. |
| `inflect.ts` | `step(state, suffix) → state \| null`: incremental, carrying the surface, last vowel, final letter and a "pronominal n pending" flag. `realize(stem, chain)` is a fold over `step`. It returns `{ surface, parts }` or `null` for illegal combinations, such as a soft or drop variant followed by a consonant-initial suffix. |
| `stems.ts` | `buildStemIndex(words) → StemIndex { byStem: Map<string, StemInfo[]>, extraDawg: DAWG, lemmas: Set<string> }`. |
| `derive.ts` | `findDerived(index, nounStemHits, pool, mapping, opts)`, a deterministic step budget. |
| `analyze.ts` | `analyzeWord(index, listId, word) → Analysis`, memoized. |
| `cache.ts` | `derivedCache`: an LRU of 32 entries (a `Map` with delete-and-reinsert). |

**Exceptions: the exact starting constants (policy: only these).**

- `VOWEL_DROP`: the stem loses its last vowel before a vowel-initial suffix. These are 28 entries; ambiguous `koyun` is excluded.

  > ağız, alın, akıl, asır, bağır, beyin, boyun, böğür, burun, emir, fikir, gönül, göğüs, hüküm, isim, karın, kısım, metin, nehir, nesil, oğul, omuz, ömür, resim, sabır, şehir, vakit, zihin

- `FRONT_HARMONY`: back last vowel, but the suffixes are front.

  > saat, kalp, hal, hayal, rol, gol, alkol, petrol, kontrol, istiklal, ihtimal, misal, sual, usul, kabul, harf, dikkat, hakikat

- **Softening:** polysyllabic stems ending in `p/ç/k/nk` soften by default. These tables override that default.

  | Constant | Effect | Words |
  |---|---|---|
  | `NO_SOFT` | polysyllabic stems that do not soften | ahlak, ittifak, hukuk, evrak, tebrik, iştirak |
  | `T_SOFT` | t→d | kağıt, umut, yoğurt, armut, bulut, öğüt, kilit, geçit, söğüt, yiğit, tabut |
  | `MONO_SOFT` | monosyllables that do soften (every other monosyllable never softens) | renk, denk, cenk, kurt, yurt, dört, tat, uç, kap, dip, kalp, çok |

  Suffix-final `k` (`-AcAk`, `-lIk`, `-CIk`) also softens, giving geleceğim.
- `AORIST_IR`: al, bil, bul, dur, gel, gör, kal, ol, öl, san, var, ver, vur.
- `VERB_T_SOFT`: git, et, tat, güt.
  - **Compound rule:** a verb stem ending in `et` whose two preceding letters are both consonants also softens. That covers hiss·et, aff·et, kayb·et, seyr·et, terk·et and redd·et, and excludes yön·et, il·et and göz·et.
  - A snapshot test lists every match on the real list.
- `NARROWING`: de and ye become di- and yi- before `-Iyor`, `-(y)An` and `-(y)AcAk`.
- `NOUN_MAK`:
  - **Both noun and verb:** yemek, ekmek, kaymak, çakmak, ilmek, azmak, oymak, yumak, artmak, boğmak, uçmak. These are exactly the duplicated `-mak/-mek` lines in the list, and the set is also detected from duplicate lines.
  - **Noun only:** ırmak, parmak, damak, yamak, emek.

**Stem POS rules (`stems.ts`).**

| Entry | Treated as |
|---|---|
| Multi-word entry | skipped |
| In `NOUN_MAK` noun-only | a noun |
| A `-mak/-mek` entry that is duplicated, or in the both set | a noun **and** a verb |
| Any other `-mak/-mek` entry | a verb, stem = word minus 3 letters |
| Everything else | a noun |

- **Validity:** a stem needs at least 2 letters and at least one vowel.
- **Variants:** soft and drop variants are flagged `variant: "soft" | "drop"`.

**Startup and memory.**
- Noun lemmas are already in the main DAWG, and `computeWorkspaceData` already calls `findAvailable`, so those hits are reused for free.
- Only verb stems (about 9.9k) and the soft/drop variants (an estimated 10–15k) go into `extraDawg`, about 25k entries.
- `WordListEntry` gains `stems: StemIndex`.
- Startup logs `morph index: N extra surfaces in X ms`. The integration test boot shows the same log line, so its added cost is visible.

**`inflect.ts` rules (applied inside `step`).**
1. Buffers: `(y)`, `(s)` and `(n)` after a vowel; `(I)` after a consonant.
2. `D` and `C` become `t` and `ç` after a voiceless consonant.
3. Before a vowel-initial suffix, the stem switches to its soft or drop variant, if one exists.
4. Harmony follows the running last vowel. A `FRONT_HARMONY` stem forces front vowels on the first suffix.
5. `-Iyor`:
   - a stem-final a/e is dropped and the preceding vowel harmonizes (başlıyor)
   - the `o` never harmonizes
   - the `NARROWING` stems are handled
6. Aorist:
   - a vowel-final stem takes `r`
   - a monosyllable takes `Ar` unless it is in `AORIST_IR`
   - a polysyllable takes `Ir`
   - after NEG it is `z`, with `mAm` and `mAyIz` for 1sg and 1pl
7. After a 3rd-person possessive, case takes the pronominal `n` (arabasına, evinde).

`parts` attributes softening to the stem, for example `["kitab","ı"]`.

**Slot graph (depth 3 or less).**
- **Noun:** `PL(lAr)?` → `POSS((I)m, (I)n, (s)I, (I)mIz, (I)nIz, lArI)?` → `CASE((y)I, (y)A, DA, DAn, (n)In, (y)lA)?`, plus a terminal `ki` after `DA`.
  - Türetme forms (`lI`, `sIz`, `lIk`, `CI`) are depth 1 only and flagged `derivational: true`. They are enumerated only for the Ek Çarkı and for analysis.
- **Verb:** `NEG(mA)?` → one TAM from `DI, mIş, (y)AcAk, (I)yor, Aorist, mAlI, sA` → `PERSON?`.
  - k-paradigm after `DI` and `sA`: m, n, k, nIz, lAr.
  - z-paradigm otherwise: (y)Im, sIn, (y)Iz, sInIz, lAr.
  - Standalone forms: `(y)An`, `mA`, `(y)Ip`, `(y)IncA`.

### `derive.ts`: deterministic, bounded and cached

**Signature.**

```ts
findDerived(index, nounStemHits: DAWGResult[], pool, mapping,
  { maxSteps = MAX_STEPS, excludedLemmas, excludedSurfaces, includeDerivational = false })
  → { results: DerivedResult[]; truncated: boolean; steps: number }
```

**Algorithm.**
1. Merge `nounStemHits` with `index.extraDawg.findAvailable(pool, mapping)`, map each hit to its `StemInfo[]`, and drop excluded lemmas.
2. **Sort stems by (letter count desc, stem asc).** This is a total order, so the output is deterministic.
3. For each stem, compute `leftover = subtractWord(pool, stem)`, then walk the slot graph **depth-first and incrementally**:
   - each edge is one `step()` call, which counts as one step
   - the newly added suffix letters are checked against `leftover`, normalized through the mapping
   - a failing edge prunes its whole subtree
4. Stop when `steps ≥ maxSteps` and set `truncated`. **There is no wall clock**, so identical inputs give identical results.

**Emitted surfaces.** A surface is emitted when it is not in `lemmas`, not excluded and not already emitted. Each carries `morph { lemma, parts, gloss, category, suffixCount }`.

**Output ranking (rows and fill cap):**
1. `suffixCount` ascending
2. category priority: case/possessive/plural, then TAM, then standalone
3. stem length descending
4. tr-TR alphabetical

**Cost estimate.**
- A noun stem has at most 2 + 7 + 8 = 17 first-level edges explored before pruning. The graph has about 116 noun chains in total, but most die at depth 1 because a suffix needs a letter that is not in the leftover.
- A verb stem has about 9 first-level edges (NEG + 7 TAM + standalone), with person endings below.
- On a 20-letter pool there are typically 1.5–3k stem hits. Expect about 15–25 steps per stem, so **about 30–75k steps**, at about 0.3–0.5 µs per step.
- Phase 0 confirms the real number. `MAX_STEPS` is set so that it rarely binds.

**Why truncate longest-first.**
- Long stems consume most of the pool, so their inflections are the forms that *finish* anagrams. They are also the rarest and most interesting forms.
- Short stems (2–3 letters, such as `ev`, `at`, `al`) explode into many forms. Those forms are low-value, and most also appear as lemmas or near-duplicates.
- When the budget binds, losing the tail of short stems costs the least.

**Cache (`cache.ts`).**
- **Key:** `listId \0 JSON(mappingSnapshot.pairs) \0 poolSignature \0 sortedExclusions.join("|")`, where `poolSignature` is the sorted normalized letters.
- **Value:** the full `findDerived` result.
- **Size:** 32 entries, LRU.
- **Hits:**
  - each keystroke of a 300 ms search on an unchanged pool is a hit (the filter applies after the cache)
  - "Daha fazla" paging is a hit
  - re-rendering untouched open blocks is a hit
- **Stability:** paging stays stable even after eviction, because the recomputation is deterministic.

### `analyze.ts`

- **What it does:**
  - for each prefix of the word that is a key in `byStem`, enumerate chains of depth 3 or less, including Türetme forms
  - keep every parse whose realized surface equals the word
- **Parse choice:**
  - longest stem, then fewest suffixes, then catalog order
  - `altCount` records how many other parses exist
- **Result:** `{ kind: "lemma" } | { kind: "derived", lemma, parts, gloss, suffixCount, altCount } | { kind: "unknown" }`.
  - `lemma` means the word is in `lemmas`. That check comes first, so `kitaplık` reads as a dictionary word.
- **Normalization:** mapping-free, on the exact surface after tr-TR lowercasing.
- **Memo:** keyed `listId + "\0" + word`, cleared when it reaches 5k entries. Lists load only at startup, so it never goes stale.
- **Cost:** a few hundred `step` calls per new word, and effectively zero after the first time. It is cheap enough for every render and for the home page.

### Data model

- **`Attempt`** gains `morph?: boolean`, tri-state:
  - `undefined`: never chosen, the nudge shows
  - `true` or `false`: chosen
  - `createAttempt` sets `true` only if the Phase 0 audit passed
- **`DAWGResult`** is unchanged. `DerivedResult` extends it in `src/morph/derive.ts`.
- **`FillSolution`** gains `derivedCount`.
  - A slot is derived only if every alternative in it is derived, so `kuşlar` mixed with a derived anagram counts as a lemma slot.
  - Ranking becomes `(wordCount, derivedCount, -minLen, maxLen, alpha)`.
  - `FillOptions` gains `isDerived?: (w) => boolean`. Fill stays pure, and without the option the behaviour is unchanged.
- **Stamp, counter and home record** are pure render-time functions in `src/morph/score.ts`:
  - `scoreCombination(index, listId, words, isPerfect) → { analyses, suffixTotal, usta: boolean }`
  - `usta = isPerfect && analyses.some(a => a.kind === "derived")`
  - `suffixTotal` is the sum of `suffixCount` over the derived analyses
  - `FillSolution.derivedCount` is not involved

### Routes (`src/routes/attempts.ts`, `src/routes/pages.ts`)

- **`computeWorkspaceData(attempt, ci, withFill, { derived })`**
  - `derived` is true only for open-block renders, suggestions, fill and forms requests, and only when `attempt.morph === true`.
  - **Closed blocks** pass `false`. They compute only the remaining pool plus `scoreCombination` for the summary, as today plus memoized analysis.
  - **When derived is on:**
    - fetch `findDerived` through the cache, using the unfiltered main hits as noun stems and hidden ∪ banned as both exclusion sets
    - fill receives `allResults` plus the first 3000 (or 1500) inflectional derived results, with `budgetMs: 120` (80 when morph is off) and `isDerived`
- **`computeSuggestionsData`** adds `derivedByGroup` and `derivedTotalByGroup`. The first page is 12, later pages are 50, sliced from the deterministic cached list.
- **`GET /:id/suggestions`**
  - `group` is matched by `/^(\d+)(m?)$/`; anything else gets a 400. This replaces the lenient `parseInt`.
  - `m` selects the derived list, with offset `12 + (page−1)·50`.
  - `q` filters both lists.
- **New `POST /:id/morph`**
  - Input: `on=1|0` and `open=` (via `parseOpenParam`).
  - Persists the flag with `updateAttempt`.
  - Returns `renderAllBlocks(attempt, open)` plus oob replacements of `#morph-toggle` and `#morph-nudge`. The nudge renders empty once the flag is set.
  - The toggle, nudge buttons and "Çekimli kelimelerle dene" all carry `data-all-blocks`, so the existing `open=` injection and query restore apply.
- **New `GET /:id/forms?ci=&lemma=`**: returns the Ek Çarkı fragment.
  - **Validation:** 404 for a missing attempt or an unknown lemma; 400 for a bad `ci`, using the existing helpers.
  - **Enumeration:** every chain of depth 2 or less, plus depth 3 for PL+POSS+CASE, plus Türetme forms.
  - For each form, compute `missing = letters(form) − remaining`, normalized:
    - empty: the form fits
    - 1–2 letters: a near-miss
    - more: the form is dropped
  - **Swap target:** for a near-miss, take the first chosen word `i` whose normalized multiset contains `missing`. That guarantees `form ⊆ remaining + word_i`.
  - **Sort order:** fitting forms first, then by category order.
  - **Swap button:** `hx-put="/attempts/:id/chosen"` with `hx-vals` holding a JSON object `{ ci, word_0..word_n }`. Word `i` is removed and the form appended, and the names are exactly the fields the PUT handler parses. The JSON goes through `escapeHtml`, and the target is `#combination-{ci}`.
  - **No new mutation route.**
- **Home page (`homePageContent` in `pages.ts`):** for each card, compute `scoreCombination` over each combination using the card's existing perfect check, and pass the best `usta` total to the card.
  - The perfect check stays as it is today, including the existing current-mapping inconsistency.
  - Fixing that inconsistency is a non-goal and is listed in ideas.

### Templates: new `src/templates/morph.ts`

New functions:
- `morphToggle(attempt)`
- `morphNudge(attempt)`
- `morphRetryButton(attemptId)`
- `derivedChipForm(result, attemptId, ci, complete)`, which mirrors `wordChipForm` with morpheme spans and `⋯`
- `derivedRow(lc, results, total, open, attemptId, ci, q)`
- `formsPopoverShell(ci)`, which renders the empty `#forms-pop-{ci}`
- `formsPopover(lemma, groups, attemptId, ci, chosen)`
- `ekCounter(total)`
- `wordBadge(i)`
- `ekFisi(analyses, open)`
- `ustaStamp(total, { home })`

Small hooks in existing files:
- `suggestionsResults` appends `derivedRow` per group.
- The suggestions panel includes `formsPopoverShell`.
- `wordChipForm` gets an optional `withForms`.
- `chosenWordsPanel` takes `score`, which adds the badges and the Fişi.
- The block summary adds `ekCounter`, plus `ustaStamp` when `score.usta`.
- The empty fill and empty suggestions branches add `morphRetryButton` when `morph !== true`.
- The `workspaceContent` header adds the toggle and nudge.
- The home card adds the stamp.

Every lemma, surface, part and gloss goes through `escapeHtml()`.

### Client JS (`static/app.js`, new delegated section of about 80 lines)

- **Popover.**
  - The `⋯` button uses `hx-get` with `hx-target="#forms-pop-{ci}"`.
  - In `htmx:beforeRequest`: if that popover is visible and was opened by this same button, hide it and call `preventDefault()`. Otherwise close any other open popover.
  - After the swap into `.forms-pop`:
    - unhide it
    - position it under the trigger chip (skipped at 480px or less)
    - set `aria-expanded`
    - focus the first button
  - Escape and outside clicks close it, and focus returns to `⋯`.
- **Focus after add or swap.** Remember the `ci` on requests from inside `.forms-pop`. After the next swap of `#combination-{ci}`, focus that block's add-word input.
- **Reveal.**
  - In `htmx:beforeSwap` on a `#combination-N` target, record `hadUsta = !!target.querySelector(".usta-stamp")`.
  - In `htmx:afterSwap`, if the new block has a stamp and `!hadUsta`, add `.is-reveal` to the block and set `--i` on each Fişi row.
  - Remove the class on `animationend`.
  - It is skipped when `matchMedia("(prefers-reduced-motion: reduce)")` matches.
- **Ek Fişi.** An `ek` badge click opens the `<details>` and flashes `[data-fis-i]` for 1s.
- **No new pool math on the client.**

---

## Test plan

**Unit tests (`src/morph/*.test.ts`, table-driven):**

- **`phonology.test.ts`:** harmony, `softenFinal` (renk→reng), `syllableCount`.
- **`inflect.test.ts`**, exact outputs:
  - **Nouns:** evler, kitabı, ağacı, rengi, topu, saati, golü, ağzı, oğlu, vakti, kitapta, evden, arabası, arabaya, arabanın, arabasına, evinde, kitaplarımızda, evdeki, kitaplığı, kurdu, ahlakı, kağıdı, umudu, sepeti.
  - **Verbs:** geldi, gidiyor, ediyor, hissediyor, yönetiyor, başlıyor, diyor, yiyecek, gelir, yapar, alır, okur, olur, gelmedi, gelmez, gelmem, gelecek, geleceğim, yapacağız, konuşmuş, geldik, gelirsiniz.
  - **Parts:** `kitabı` gives `["kitab","ı"]`.
  - **Rejection:** a soft variant followed by a consonant suffix returns `null`.
  - **Incremental equivalence:** `realize` equals a fold of `step` over 500 random chains.
- **`stems.test.ts`:**
  - gelmek gives the verb stem gel.
  - yemek gives both a noun and a verb.
  - ırmak gives a noun only.
  - kitap also gives the variant kitab.
  - `a` gives no stem.
  - Multi-word entries are skipped.
  - Duplicate-line homographs are detected.
  - A snapshot of the `-et` rule matches on the real list (skipped if the list is missing).
- **`derive.test.ts`:**
  - The pool "kitabı" yields kitabı with lemma kitap.
  - Property test: 50 random pools, every result subtracts with no overflow.
  - The mapping `ç→c` matches ağacı.
  - Exclusions: `{kitap}` removes every kitap* form, and `{gelmek}` removes every gel* form.
  - `kuşlar` is never emitted.
  - `maxSteps: 10` gives `truncated: true`.
  - **Determinism:** two calls on the same pool with a binding `maxSteps` return identical arrays.
  - Türetme forms are absent unless `includeDerivational` is set.
  - **Ranking:** a 1-suffix form sorts before a 2-suffix form.
- **`cache.test.ts`:**
  - the same key gives the same object
  - the 33rd insert evicts the least recently used entry
  - a different exclusion set gives a miss
- **`analyze.test.ts`:**
  - kitaplarımızda gives derived/kitap with the right parts and `suffixCount` 3
  - evleri has `altCount ≥ 1`
  - ev gives lemma, geldik gives derived/gelmek, xqzt gives unknown
- **`score.test.ts`:**
  - Perfect with a derived word gives `usta` true and the right total.
  - Perfect lemma-only gives false.
  - Imperfect with a derived word gives false, but the counter total is still above 0.
- **`fill.test.ts`:**
  - Derived candidates enable a solution that is impossible with lemmas only.
  - A lower `derivedCount` ranks first.
  - A mixed slot counts as non-derived.
  - Without `isDerived`, behaviour is unchanged; the existing tests pass untouched.

**Integration tests (`src/integration.test.ts`, new describe "Çekimli kelimeler"):**

- **Default:** a new attempt matches the audit decision (either `morph` unset with the nudge rendered, or `true`). `POST /morph on=0` removes the nudge oob and keeps it gone on reload.
- **Toggle:**
  - `on=1` persists, returns the blocks plus the oob toggle, and keeps `open=` blocks open.
  - On, the source "kitabı" gives `morph-sfx` and `data-word="kitabı"`. Off gives neither.
- **Closed blocks:** a workspace with morph on and all blocks closed renders no derived rows. That shows closed blocks skip `findDerived`.
- **Paging:**
  - `group=6m&page=1`, requested twice, returns identical HTML.
  - Pages 1 and 2 share no `data-word`.
  - `group=6x` returns 400, and `group=6` is unchanged.
- **No Türetme in Öneriler:** a source that fits `evsiz` shows it only in `/forms`, not in suggestions.
- **Hide:** hiding `kitap` removes kitabı; hiding `kitabı` keeps kitap.
- **Forms:**
  - `/forms?lemma=kitap&ci=0` returns 200, with fitting chips and an `eksik` item.
  - **Swap round-trip:** parse the swap button's `hx-vals` JSON from the HTML, send it as form fields to `PUT /chosen`, and assert that the stored list equals the original minus word `i` plus the form.
  - An unknown lemma gives 404; a bad `ci` gives 400.
- **Analysis with morph off:**
  - a chosen `kitabı` renders the `ek` badge, a Fişi row and `· 1 ek` in the summary
  - a random string renders "çekimlerde yok"
- **Stamp:**
  - a perfect combination containing a derived word renders `EK USTASI`
  - a perfect lemma-only combination does not
- **Home:** an attempt with a perfect derived combination shows `EK USTASI · N ek` on its card in `GET /`, and a lemma-only perfect attempt does not.
- **Fill:**
  - for "evler geldi", fill with morph on contains a derived word; off, it does not
  - the no-solution state with morph not `true` contains "Çekimli kelimelerle dene"
- **Whole suite:** `bun test` stays green, with the 76 existing tests plus the new ones, at both commit gates.

**Manual checks with Playwright (commit B gate):**
- popover open, toggle-close, Escape, focus return and swap
- the popover after "Daha fazla" appends
- the bottom sheet at 480px
- the reveal firing once on the swap that completes the anagram, and not on reload
- the reduced-motion skip
- the badge tap on a mobile viewport
- the home stamp layout at 480px

---

## Scope boundaries and non-goals

- **Not a full analyzer.** About 35 inflectional suffixes plus 4 derivational ones (the derivational ones only in the Ek Çarkı and in analysis), with chains of depth 3 or less. No compounding, no inflection of multi-word entries, no derivation chains.
- **No grammar or meaning.** No sentence grammar, semantics or phrase-wide harmony checks.
- **Code-only data.** The exception lists are code constants; there is no user catalog.
- **No frequency data.** Ranking uses only the structural key above.
- **Persistence.** No new persistence beyond `Attempt.morph`. Ek Rekoru and the stamp are computed at render time.
- **Untouched areas.** The mapping editor, the ASCII-string cleanup, and the home preview's use of the current mapping instead of the snapshot are not changed.
- **Moved to `ideas/`:**
  - the vowel/consonant meter
  - remembering the collapsed state of derived rows
  - showing Türetme forms in Öneriler behind a sub-toggle
  - the home-preview snapshot fix
  - a global "Ek Ustası" gallery across attempts

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Overgeneration (saatı, kitapı, ırdı) | The Phase 0 audit (200 samples, error rate below 3%) decides the default. The "only these" exception policy, a conservative softening default, the stem validity rule, `NOUN_MAK` plus homograph detection, and a snapshot-reviewed `-et` rule. Türetme forms are kept out of suggestions and fill. Chips are visibly marked, and hiding a root kills every form. |
| Unstable paging | A deterministic step budget (no wall clock) and the LRU cache. A test asserts identical repeat pages and disjoint pages. |
| Cost of re-rendering many blocks | Closed blocks skip `findDerived`, and the cache covers search keystrokes, paging and untouched blocks. Phase 0 bounds 4 open blocks at < 400 ms cold and < 150 ms warm. |
| Noise in Öneriler | Rows are collapsed by default, inflections only, capped at 12 on the first page, with structural ranking. |
| Fill gets weaker on long pools | The cap is calibrated in Phase 0 (3000 or 1500), the morph budget is 120 ms, and `derivedCount` keeps lemma-first ranking. |
| Startup and memory | Main DAWG hits are reused, and only about 25k extra surfaces are built, under 300 ms and logged at boot. |
| Stale near-miss data | The card re-fetches on every open, and any block re-render clears its container. |
| Swap field mismatch | The `hx-vals` round-trip integration test. |
| Verb edge cases (yemek, demek, compound -et) | Constants plus table tests. Hiding `yemek` removing both noun and verb forms is accepted and documented in the button `title`. |
| Reveal misfires | Detection is client-only and based on the state before and after a swap, so it never fires on reload and is skipped under reduced motion. |
| Scope creep | Two commits, each with its own test gate, and new code confined to `src/morph/` and `src/templates/morph.ts`. |
