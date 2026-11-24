// Vitrin client: reveal page word game, gallery stars, "Kendini sına" rounds.
// No HTMX, no modules — also inlined verbatim into the standalone .html export.
(function () {
  "use strict";

  var LETTER_RE = /\p{L}/u;

  // ---------------------------------------------------------------------
  // Pure helpers (exported for tests when there is no DOM)
  // ---------------------------------------------------------------------

  // Same semantics as buildMappingNormalizer in src/anagram.ts.
  function buildMap(pairs) {
    var map = {};
    for (var i = 0; i < pairs.length; i++) {
      map[pairs[i][0]] = pairs[i][1];
      if (!(pairs[i][1] in map)) map[pairs[i][1]] = pairs[i][1];
    }
    return map;
  }

  // Mirrors normalizeLetters in src/anagram.ts (parity is tested):
  // tr-TR lowercase, mapping applied, only \p{L} letters kept.
  function normalizeGuess(str, pairs) {
    var map = buildMap(pairs || []);
    var out = [];
    for (var ch of String(str).toLocaleLowerCase("tr-TR")) {
      if (!LETTER_RE.test(ch)) continue;
      out.push(Object.prototype.hasOwnProperty.call(map, ch) ? map[ch] : ch);
    }
    return out;
  }

  // r = { by: "play" | "coz", misses, hints }
  function stars(r) {
    if (r.by === "coz") return 0;
    if (r.hints === 0 && r.misses <= 2) return 3;
    if (r.hints <= 1 && r.misses <= 5) return 2;
    return 1;
  }

  function starText(n) {
    var s = "";
    for (var i = 0; i < 3; i++) s += i < n ? "⭐" : "☆";
    return s;
  }

  // locks: per source word "player" | "hint" | null
  function resultLine(title, locks, r) {
    var squares = locks.map(function (l) { return l === "player" ? "🟩" : l === "hint" ? "🟨" : "⬛"; }).join("");
    var n = stars(r);
    var parts = [squares + " " + (n > 0 ? "⭐".repeat(n) : "çözüme bakıldı")];
    parts.push(r.misses + " ıska", r.hints + " ipucu");
    return "Anagramcı · " + (title || "Bir anagram") + "\n" + parts.join(" · ");
  }

  function decodePuzzle(s) {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); })));
  }

  function betterThan(a, b) {
    if (!b) return true;
    if (a.stars !== b.stars) return a.stars > b.stars;
    if (a.misses !== b.misses) return a.misses < b.misses;
    return a.hints < b.hints;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Round queue: not-yet-3-starred first (shuffled), then the rest, capped.
  function buildQueue(slugs, bestOf, cap) {
    var open = [], done = [];
    for (var i = 0; i < slugs.length; i++) {
      var b = bestOf(slugs[i]);
      (b && b.stars === 3 ? done : open).push(slugs[i]);
    }
    return shuffle(open).concat(shuffle(done)).slice(0, cap || 7);
  }

  // Enter with the whole answer typed (any spacing) solves every open word,
  // including when only one word is left.
  function streamSolves(stream, restLetters) {
    return !!stream && restLetters.length > 0 && stream === restLetters.join("");
  }

  // Score puzzle `idx` of a round at most once (Back + re-solve must not
  // count twice). Mutates and returns true when it scored.
  function scoreRound(round, idx, by, n) {
    if (!round.done) round.done = {};
    if (round.done[idx]) return false;
    round.done[idx] = true;
    round.scored = idx;
    if (by === "coz") round.streak = 0;
    else { round.streak++; round.solved++; round.stars += n; }
    round.bestStreakRound = Math.max(round.bestStreakRound, round.streak);
    return true;
  }

  // What a document-level key does on the reveal page. Before the solve a
  // printable key is a guess letter ("type") unless the player explicitly
  // armed shortcuts with Esc; Çöz is irreversible, so it never fires from a
  // stray keystroke. After the solve only R (replay) and N (next) apply.
  function shortcutFor(key, solved, armed) {
    if (!key || key.length !== 1) return null;
    var k = key.toLocaleLowerCase("tr-TR");
    if (solved) return k === "r" ? "replay" : k === "n" ? "next" : null;
    if (armed && k === "h") return "hint";
    if (armed && k === "r") return "coz";
    return key === " " ? null : "type";
  }

  // Which tiles look spent once `locked` (source word indices) are placed.
  // Independent of charMap (that greedy mapping is only for the flight): a
  // locked word's letters are taken from the tile groups (the anagram's
  // words) that spell it exactly, then from groups it fully covers (largest
  // first), then tile by tile. Punctuation tiles are spent from the start —
  // guesses ignore them. groups: tile indices per anagram word.
  function spentTiles(puzzle, locked, groups) {
    var cells = puzzle.cells;
    var spent = puzzle.charMap.map(function (c) { return !!cells[c].f; });
    var letterOf = function (t) { return cells[puzzle.charMap[t]].n; };
    var key = function (letters) { return letters.slice().sort().join(""); };
    var need = {};
    var exact = [];
    locked.forEach(function (w) {
      var letters = puzzle.words[w].filter(function (c) { return !cells[c].f; }).map(function (c) { return cells[c].n; });
      letters.forEach(function (l) { need[l] = (need[l] || 0) + 1; });
      exact.push(key(letters));
    });
    var letterTiles = groups.map(function (g) { return g.filter(function (t) { return !spent[t]; }); });
    var taken = groups.map(function () { return false; });
    function take(g) {
      taken[g] = true;
      letterTiles[g].forEach(function (t) { spent[t] = true; need[letterOf(t)]--; });
    }
    exact.forEach(function (k) {
      for (var g = 0; g < groups.length; g++) {
        if (!taken[g] && key(letterTiles[g].map(letterOf)) === k) { take(g); return; }
      }
    });
    var bySize = groups.map(function (_, g) { return g; }).sort(function (a, b) { return letterTiles[b].length - letterTiles[a].length || a - b; });
    bySize.forEach(function (g) {
      if (taken[g] || !letterTiles[g].length) return;
      var count = {};
      letterTiles[g].forEach(function (t) { count[letterOf(t)] = (count[letterOf(t)] || 0) + 1; });
      for (var l in count) if ((need[l] || 0) < count[l]) return;
      take(g);
    });
    for (var t = 0; t < spent.length; t++) {
      if (!spent[t] && need[letterOf(t)] > 0) { spent[t] = true; need[letterOf(t)]--; }
    }
    return spent;
  }

  // Hint 3 places the longest open word; never the last one (that would be a
  // "solve" with nothing solved).
  function canHint(hints, openCount) {
    if (hints >= 3 || openCount === 0) return false;
    return hints < 2 || openCount > 1;
  }

  // Play mode: the saved progress of an unscored puzzle (round.live), checked
  // so a stale or hand-edited sessionStorage entry can't break the page.
  // Locks are restored as saved, never replayed: hint 3 picks the longest
  // *open* word, which depends on what the player had locked by then.
  function parseLive(live, wordCount) {
    var out = { misses: 0, hints: 0, locked: {}, hinted: {} };
    if (!live || typeof live !== "object") return out;
    var n = function (v, max) { return typeof v === "number" && v >= 0 && v <= max && v === Math.floor(v); };
    if (n(live.misses, Infinity)) out.misses = live.misses;
    if (n(live.hints, 3)) out.hints = live.hints;
    var locked = live.locked && typeof live.locked === "object" ? live.locked : {};
    for (var w in locked) {
      if (n(Number(w), wordCount - 1) && (locked[w] === "player" || locked[w] === "hint")) out.locked[w] = locked[w];
    }
    (Array.isArray(live.hinted) ? live.hinted : []).forEach(function (c) { if (n(c, Infinity)) out.hinted[c] = true; });
    return out;
  }

  // Copy feedback: remember the real label once so overlapping clicks
  // can't make "Kopyalandı ✓" the label to restore.
  function flashCopied(button) {
    if (button.dataset.label == null) button.dataset.label = button.textContent;
    button.textContent = "Kopyalandı ✓";
    clearTimeout(button._copyTimer);
    button._copyTimer = setTimeout(function () { button.textContent = button.dataset.label; }, 1500);
  }

  var api = {
    shortcutFor: shortcutFor, spentTiles: spentTiles, canHint: canHint, flashCopied: flashCopied,
    normalizeGuess: normalizeGuess, stars: stars, starText: starText, resultLine: resultLine,
    decodePuzzle: decodePuzzle, betterThan: betterThan, buildQueue: buildQueue,
    streamSolves: streamSolves, scoreRound: scoreRound, parseLive: parseLive,
  };
  if (typeof document === "undefined") {
    globalThis.__anagramciReveal = api;
    return;
  }

  // ---------------------------------------------------------------------
  // Storage (everything may throw: private mode, file://, blocked cookies)
  // ---------------------------------------------------------------------

  var BEST = "anagramci:best:";
  var STREAK = "anagramci:bestStreak";
  var ROUND = "anagramci:oyun";

  function store(kind) {
    try {
      var s = window[kind];
      s.setItem("anagramci:probe", "1");
      s.removeItem("anagramci:probe");
      return s;
    } catch (e) {
      return null;
    }
  }
  function readJson(s, key) {
    if (!s) return null;
    try { return JSON.parse(s.getItem(key) || "null"); } catch (e) { return null; }
  }
  function writeJson(s, key, val) {
    if (!s) return;
    try { s.setItem(key, JSON.stringify(val)); } catch (e) { /* full or blocked */ }
  }
  var local = store("localStorage");
  var session = store("sessionStorage");

  function bestOf(slug) { return readJson(local, BEST + slug); }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------------
  // Clipboard: async API, else a preselected readonly textarea
  // ---------------------------------------------------------------------

  function copy(text, button) {
    function fallback() {
      var old = button.parentNode.querySelector(".copy-fallback");
      if (old) old.remove();
      var wrap = document.createElement("div");
      wrap.className = "copy-fallback";
      var ta = document.createElement("textarea");
      ta.readOnly = true;
      ta.value = text;
      ta.rows = Math.min(4, text.split("\n").length + 1);
      var hint = document.createElement("small");
      hint.textContent = "Kopyalamak için Ctrl/⌘+C";
      wrap.appendChild(ta);
      wrap.appendChild(hint);
      button.insertAdjacentElement("afterend", wrap);
      ta.focus();
      ta.select();
    }
    try {
      navigator.clipboard.writeText(text).then(function () { flashCopied(button); }, fallback);
    } catch (e) {
      fallback();
    }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-copy");
    if (!btn) return;
    var text = btn.dataset.copyPath ? location.origin + btn.dataset.copyPath : btn.dataset.copy || "";
    copy(text, btn);
  });

  // Share card PNG: rasterize the same-origin SVG card (no foreignObject, so
  // the canvas stays untainted) and download it.
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-card-png");
    if (!btn) return;
    btn.disabled = true;
    fetch(btn.dataset.src).then(function (res) { return res.blob(); }).then(function (blob) {
      var src = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 630;
        canvas.getContext("2d").drawImage(img, 0, 0, 1200, 630);
        URL.revokeObjectURL(src);
        canvas.toBlob(function (png) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(png);
          a.download = btn.dataset.name || "anagram.png";
          document.body.appendChild(a);
          a.click();
          a.remove();
          btn.disabled = false;
        }, "image/png");
      };
      img.onerror = function () { btn.disabled = false; };
      img.src = src;
    }, function () { btn.disabled = false; });
  });

  // ---------------------------------------------------------------------
  // Reveal page
  // ---------------------------------------------------------------------

  function initStage(stage) {
    var puzzle;
    try {
      puzzle = decodePuzzle(stage.dataset.puzzle);
    } catch (e) {
      return;
    }
    var slug = stage.dataset.slug;
    var title = stage.dataset.title;
    var standalone = stage.hasAttribute("data-standalone");
    var cells = puzzle.cells;
    var words = puzzle.words;
    var wordLetters = words.map(function (cs) {
      return cs.filter(function (c) { return !cells[c].f; }).map(function (c) { return cells[c].n; }).join("");
    });

    var tiles = Array.prototype.slice.call(stage.querySelectorAll(".tile"));
    var tileGroups = Array.prototype.map.call(stage.querySelectorAll(".reveal-word"), function (g) {
      return Array.prototype.map.call(g.querySelectorAll(".tile"), function (t) { return parseInt(t.dataset.ti, 10); });
    });
    var slotEls = {};
    var slotNodes = stage.querySelectorAll(".slot");
    for (var i = 0; i < slotNodes.length; i++) slotEls[slotNodes[i].dataset.cell] = slotNodes[i];
    // Fixed glyphs live only in the payload (spoiler rule): fill them here.
    cells.forEach(function (c, ci) { if (c.f && slotEls[ci]) slotEls[ci].textContent = c.g; });

    var tileRow = stage.querySelector(".reveal-tiles");
    var input = stage.querySelector(".guess-input");
    var form = stage.querySelector(".guess-form");
    var hintBtn = stage.querySelector(".btn-hint");
    var solveBtn = stage.querySelector(".btn-solve");
    var missEl = stage.querySelector(".miss-count");
    var feedback = stage.querySelector(".reveal-feedback");
    var result = stage.querySelector(".reveal-result");
    var nextBtn = stage.querySelector(".btn-next");
    var summary = stage.querySelector(".round-summary");
    var playBar = stage.querySelector(".play-bar");

    var state;
    var flight = null; // { anims, width }
    // Set by Esc in the guess field; cleared when it regains focus or on any click.
    var shortcutsArmed = false;
    // Once any finish has shown the answer, replays on this page are practice:
    // they don't overwrite the stored best.
    var seenAnswer = false;
    // Desktop: keep typing landing in the guess field after a tile/button
    // click. Touch: don't pop the virtual keyboard on every tap.
    var finePointer = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);

    function reset() {
      state = { misses: 0, hints: 0, locked: {}, hinted: {}, tapStack: [], solved: false, by: "play", staleMiss: false };
    }

    function keepTyping() {
      if (!state.solved && finePointer) input.focus({ preventScroll: true });
    }

    function spentNow() {
      return spentTiles(puzzle, Object.keys(state.locked).map(Number), tileGroups);
    }
    function unlockedWords() {
      var out = [];
      for (var w = 0; w < words.length; w++) if (!state.locked[w]) out.push(w);
      return out;
    }

    // Slot state precedence: solved > locked > hinted > empty.
    function renderSlots() {
      for (var w = 0; w < words.length; w++) {
        var lock = state.locked[w];
        words[w].forEach(function (c) {
          var el = slotEls[c];
          if (cells[c].f) return;
          el.classList.remove("slot--locked", "slot--hintlocked", "slot--hinted", "slot--solved");
          if (state.solved) { el.textContent = cells[c].g; el.classList.add("slot--solved"); }
          else if (lock) { el.textContent = cells[c].g; el.classList.add(lock === "hint" ? "slot--hintlocked" : "slot--locked"); }
          else if (state.hinted[c]) { el.textContent = cells[c].g; el.classList.add("slot--hinted"); }
          else el.textContent = "";
        });
      }
      stage.classList.toggle("reveal-stage--solved", state.solved);
    }

    function renderTiles() {
      var spent = spentNow();
      var used = {};
      state.tapStack.forEach(function (t) { used[t] = true; });
      tiles.forEach(function (tile, t) {
        var isSpent = spent[t];
        tile.classList.toggle("tile--spent", isSpent);
        tile.classList.toggle("tile--used", !!used[t] && !isSpent);
        tile.disabled = isSpent || state.solved;
      });
    }

    function renderControls() {
      missEl.textContent = state.misses;
      var more = canHint(state.hints, unlockedWords().length);
      hintBtn.disabled = !more || state.solved;
      hintBtn.textContent = more ? "İpucu " + state.hints + "/3" : "İpucu yok";
      solveBtn.disabled = state.solved;
      input.disabled = state.solved;
    }

    function render() { renderSlots(); renderTiles(); renderControls(); }

    function say(msg) { feedback.textContent = msg; }

    function shake() {
      if (reduceMotion || !input.animate) {
        input.classList.add("guess-input--miss");
        setTimeout(function () { input.classList.remove("guess-input--miss"); }, 400);
        return;
      }
      input.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" },
         { transform: "translateX(-4px)" }, { transform: "translateX(0)" }],
        { duration: 300, easing: "ease-out" }
      );
      input.classList.add("guess-input--miss");
      setTimeout(function () { input.classList.remove("guess-input--miss"); }, 400);
    }

    function pop(w) {
      if (reduceMotion) return;
      words[w].forEach(function (c) {
        if (slotEls[c].animate) slotEls[c].animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 150 });
      });
    }

    function lock(w, by) {
      state.locked[w] = by;
      pop(w);
    }

    function findWord(letters) {
      for (var w = 0; w < words.length; w++) if (!state.locked[w] && wordLetters[w] === letters) return w;
      return -1;
    }

    function afterChange() {
      saveLive();
      render();
      if (unlockedWords().length === 0) reveal("play");
    }

    // Check each whitespace token of the input against the unlocked words.
    function submit(isEnter) {
      if (state.solved) return;
      var raw = input.value;
      state.tapStack = [];
      var pairs = puzzle.map;
      if (isEnter) {
        var stream = normalizeGuess(raw, pairs).join("");
        var rest = unlockedWords();
        if (streamSolves(stream, rest.map(function (w) { return wordLetters[w]; }))) {
          rest.forEach(function (w) { lock(w, "player"); });
          input.value = "";
          say("Hepsi yerinde!");
          afterChange();
          return;
        }
      }
      var toks = raw.split(/\s+/).filter(Boolean);
      var left = [];
      var hits = [];
      var missed = false;
      toks.forEach(function (tok) {
        var letters = normalizeGuess(tok, pairs).join("");
        if (!letters) return;
        var w = findWord(letters);
        if (w >= 0) { lock(w, "player"); hits.push(tok); }
        else { state.misses++; left.push(tok); missed = true; }
      });
      input.value = left.join(" ");
      // Leave the miss selected so the next keystroke or tap replaces it
      // instead of gluing onto it (and being charged again).
      state.staleMiss = missed;
      if (missed) {
        shake();
        say("Iska: " + left.join(" "));
        // select() focuses: on touch that would pop the keyboard over the tiles.
        if (finePointer || document.activeElement === input) input.select();
      }
      else if (hits.length) say("✓ " + hits.join(" "));
      afterChange();
    }

    function hint() {
      var open = unlockedWords();
      if (state.solved || !canHint(state.hints, open.length)) return;
      state.hints++;
      if (state.hints === 1 || state.hints === 2) {
        open.forEach(function (w) {
          var letters = words[w].filter(function (c) { return !cells[c].f; });
          state.hinted[state.hints === 1 ? letters[0] : letters[letters.length - 1]] = true;
        });
        say(state.hints === 1 ? "İpucu: her kelimenin ilk harfi" : "İpucu: her kelimenin son harfi");
      } else {
        var best = open[0];
        open.forEach(function (w) { if (wordLetters[w].length > wordLetters[best].length) best = w; });
        lock(best, "hint");
        // Tapped tiles of that word are now spent: drop the half-spelled
        // guess so ⌫ and the tile marks stay in step with the input.
        var spent = spentNow();
        if (state.tapStack.some(function (t) { return spent[t]; })) { state.tapStack = []; input.value = ""; }
        say("İpucu: en uzun kelime yerleşti");
      }
      afterChange();
    }

    // ---- Reveal: FLIP flight of each tile to its source slot -------------

    function finishReveal() {
      if (flight) flight.anims.forEach(function (a) { a.cancel(); });
      flight = null;
      tiles.forEach(function (t) { t.getAnimations && t.getAnimations().forEach(function (a) { a.cancel(); }); });
      stage.classList.remove("reveal-stage--flying");
      var glow = stage.querySelector(".reveal-slots");
      // FLIP: hiding the tile row moves the slots up; glide them there
      // instead of snapping the freshly written source.
      var before = glow.getBoundingClientRect().top;
      tileRow.hidden = true;
      render();
      var dy = before - glow.getBoundingClientRect().top;
      if (!reduceMotion && dy && glow.animate) {
        glow.animate([{ transform: "translateY(" + dy + "px)" }, { transform: "translateY(0)" }], { duration: 380, easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" });
      }
      if (!reduceMotion && glow.animate) {
        glow.animate([{ boxShadow: "0 0 0 0 rgba(74,140,92,0)" }, { boxShadow: "0 0 0 10px rgba(74,140,92,0.25)" }, { boxShadow: "0 0 0 0 rgba(74,140,92,0)" }], { duration: 900 });
      }
      showResult();
    }

    function reveal(by) {
      if (state.solved) return;
      state.by = by;
      state.solved = true;
      state.tapStack = [];
      input.blur();
      renderControls();
      stage.classList.add("reveal-stage--flying");
      // Glyphs go in now (stable slot boxes) but stay transparent under
      // --flying, so the landing tiles appear to write the source themselves.
      for (var c in slotEls) if (!cells[c].f) slotEls[c].textContent = cells[c].g;

      if (reduceMotion || !tiles.length || !tiles[0].animate) {
        if (!reduceMotion || !tileRow.animate) return finishReveal();
        var fade = tileRow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        var fadeFlight = flight = { anims: [fade], width: window.innerWidth };
        // A replay/resize during the fade goes through finishReveal itself.
        fade.onfinish = function () { if (flight === fadeFlight) finishReveal(); };
        return;
      }

      var anims = [];
      tiles.forEach(function (tile, t) {
        var target = slotEls[puzzle.charMap[t]];
        var a = tile.getBoundingClientRect();
        var b = target.getBoundingClientRect();
        var dx = b.left + b.width / 2 - (a.left + a.width / 2);
        var dy = b.top + b.height / 2 - (a.top + a.height / 2);
        var s = a.width ? Math.min(1.2, b.width / a.width) : 1;
        tile.classList.remove("tile--spent", "tile--used");
        anims.push(tile.animate(
          [{ transform: "translate(0,0) scale(1)", rotate: getComputedStyle(tile).rotate || "0deg", opacity: 1 },
           { transform: "translate(0,-6px) scale(1.04)", rotate: "0deg", opacity: 1, offset: 0.15 },
           { transform: "translate(" + dx + "px," + dy + "px) scale(" + s + ")", rotate: "0deg", opacity: 1 }],
          { duration: 600, delay: puzzle.charMap[t] * 35, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" }
        ));
      });
      flight = { anims: anims, width: window.innerWidth };
      Promise.all(anims.map(function (an) { return an.finished; })).then(function () {
        if (flight && flight.anims === anims) finishReveal();
      }, function () { /* canceled */ });
    }

    // A real relayout mid-flight (not a mobile keyboard closing) → jump to the end.
    window.addEventListener("resize", function () {
      if (flight && window.innerWidth !== flight.width) finishReveal();
    });

    // ---- Result, best score, play mode ----------------------------------

    function roundState() {
      if (standalone || stage.dataset.mode !== "oyun") return null;
      var r = readJson(session, ROUND);
      if (!r || !r.queue) return null;
      var at = r.queue.indexOf(slug);
      if (at < 0) return null;
      r.idx = at;
      return r;
    }

    function showResult() {
      var r = { by: state.by, misses: state.misses, hints: state.hints };
      var n = stars(r);
      var locks = words.map(function (_, w) { return state.locked[w] || null; });
      stage.querySelector(".result-score").textContent = "Karışım %" + puzzle.score;
      stage.querySelector(".result-line").textContent = state.by === "coz"
        ? "Çözüldü · " + state.misses + " ıska · " + state.hints + " ipucu"
        : "Bildin! " + starText(n) + " · " + state.misses + " ıska · " + state.hints + " ipucu";
      stage._resultText = resultLine(title, locks, r);
      result.hidden = false;

      var best = { stars: n, misses: state.misses, hints: state.hints };
      // A Çöz is not a solve: it never becomes the stored best.
      if (!seenAnswer && state.by !== "coz" && betterThan(best, bestOf(slug))) writeJson(local, BEST + slug, best);
      seenAnswer = true;

      var round = roundState();
      if (round) {
        if (scoreRound(round, round.idx, state.by, n)) {
          writeJson(session, ROUND, round);
          var allTime = readJson(local, STREAK) || 0;
          if (round.bestStreakRound > allTime) writeJson(local, STREAK, round.bestStreakRound);
        }
        renderPlayBar(round);
        if (round.idx < round.queue.length - 1) nextBtn.hidden = false;
        else renderSummary(summary, round);
      }
      // reveal() blurred the input; land keyboard / screen-reader users on the result.
      var primary = (!nextBtn.hidden && nextBtn) || stage.querySelector(".btn-copy-result");
      if (primary) primary.focus({ preventScroll: true });
    }

    // Play mode: misses, hints and placed words survive a reload of an unscored puzzle.
    function saveLive() {
      if (state.solved) return;
      var round = roundState();
      if (!round || (round.done && round.done[round.idx])) return;
      round.live = {
        slug: slug, misses: state.misses, hints: state.hints, locked: state.locked,
        hinted: Object.keys(state.hinted).map(Number),
      };
      writeJson(session, ROUND, round);
    }

    function restoreLive(round) {
      var live = round.live;
      if (!live || live.slug !== slug || (round.done && round.done[round.idx])) return;
      var saved = parseLive(live, words.length);
      state.misses = saved.misses;
      state.hints = saved.hints;
      state.locked = saved.locked;
      state.hinted = saved.hinted;
    }

    function renderPlayBar(round) {
      playBar.hidden = false;
      playBar.textContent = "Bulmaca " + (round.idx + 1) + "/" + round.queue.length + " · Seri " + round.streak;
    }

    function next() {
      // N during the flight: score the round (showResult) before moving on.
      if (flight) finishReveal();
      var round = roundState();
      if (!round || !state.solved || round.idx >= round.queue.length - 1) return;
      round.idx++;
      writeJson(session, ROUND, round);
      location.href = "/r/" + encodeURIComponent(round.queue[round.idx]) + "?oyun=1";
    }

    // ---- Entrance --------------------------------------------------------

    function entrance() {
      if (reduceMotion || !tiles.length || !tiles[0].animate) return;
      tiles.forEach(function (tile, t) {
        tile.animate(
          [{ opacity: 0, transform: "translateY(-14px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 320, delay: t * 30, easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)", fill: "backwards" }
        );
      });
    }

    function replay() {
      if (flight) finishReveal();
      reset();
      tileRow.hidden = false;
      result.hidden = true;
      nextBtn.hidden = true;
      summary.hidden = true;
      input.value = "";
      say("");
      render();
      entrance();
      input.focus();
    }

    // ---- Events ----------------------------------------------------------

    // Document-level delegation (CLAUDE.md), scoped to this stage.
    document.addEventListener("submit", function (e) {
      if (e.target !== form) return;
      e.preventDefault(); submit(true); keepTyping();
    });

    document.addEventListener("input", function (e) {
      if (e.target !== input) return;
      state.staleMiss = false;
      // One sync rule: any keyboard edit clears the tap marks.
      if (state.tapStack.length) { state.tapStack = []; renderTiles(); }
      // Space checks the word (works with virtual keyboards, which don't send key codes).
      if (/\s$/.test(input.value) && e.inputType !== "insertFromPaste") submit(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.target === input && e.key === "Escape") { input.blur(); shortcutsArmed = true; }
    });
    document.addEventListener("focusin", function (e) { if (e.target === input) shortcutsArmed = false; });
    document.addEventListener("pointerdown", function () { shortcutsArmed = false; }, true);

    document.addEventListener("click", function (e) {
      if (!stage.contains(e.target)) return;
      var tile = e.target.closest(".tile");
      if (tile && !tile.disabled) {
        var t = parseInt(tile.dataset.ti, 10);
        if (state.tapStack.indexOf(t) >= 0) return keepTyping();
        if (state.staleMiss) { input.value = ""; state.staleMiss = false; }
        state.tapStack.push(t);
        input.value += tile.textContent.toLocaleLowerCase("tr-TR");
        renderTiles();
        keepTyping();
        return;
      }
      if (e.target.closest(".btn-tap-back")) {
        if (state.solved) return;
        var chars = Array.from(input.value);
        chars.pop();
        input.value = chars.join("");
        state.tapStack.pop();
        state.staleMiss = false;
        renderTiles();
        keepTyping();
      } else if (e.target.closest(".btn-tap-space")) { submit(false); keepTyping(); }
      else if (e.target.closest(".btn-hint")) { hint(); keepTyping(); }
      else if (e.target.closest(".btn-solve")) reveal("coz");
      else if (e.target.closest(".btn-replay")) replay();
      else if (e.target.closest(".btn-next")) next();
      else if (e.target.closest(".btn-copy-result")) copy(stage._resultText || "", e.target.closest(".btn-copy-result"));
    });

    // Single-letter shortcuts: see shortcutFor. Letters typed while the
    // stage, a stage button/summary or the page body has focus are guesses.
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || !e.key) return;
      var t = e.target && e.target.closest ? e.target : null;
      if (t && t.closest("input, textarea, select, a, [contenteditable]")) return;
      var act = shortcutFor(e.key, state.solved, shortcutsArmed);
      if (act === "type") {
        if (!t || t === document.body || stage.contains(t)) input.focus({ preventScroll: true });
        return;
      }
      if (!act || e.repeat || (!state.solved && t && t.closest("button, summary"))) return;
      // The action may focus the input (replay does); without this the key's
      // default action would then insert the letter there and cost a miss.
      e.preventDefault();
      if (act === "hint") hint();
      else if (act === "coz") reveal("coz");
      else if (act === "replay") replay();
      else if (act === "next") next();
    });

    reset();
    var round = roundState();
    if (round) restoreLive(round);
    render();
    if (round) renderPlayBar(round);
    // Reloaded mid-flight after the last word: finish (and score) the round.
    if (round && words.length && !unlockedWords().length) reveal("play");
    else entrance();
  }

  // ---------------------------------------------------------------------
  // Round summary (reveal page and stale-queue 404 page)
  // ---------------------------------------------------------------------

  function renderSummary(container, round) {
    container.hidden = false;
    container.innerHTML = "";
    var p = document.createElement("p");
    p.className = "round-summary-text";
    p.textContent = "Tur bitti: " + round.solved + "/" + round.queue.length + " bildin · ⭐ " + round.stars + " · En iyi seri: " + round.bestStreakRound;
    var back = document.createElement("a");
    back.className = "btn btn-secondary";
    back.href = "/vitrin";
    back.textContent = "Vitrine dön";
    var again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-primary btn-yeni-tur";
    again.textContent = "Yeni tur";
    container.appendChild(p);
    container.appendChild(back);
    container.appendChild(again);
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest(".btn-yeni-tur")) {
      var round = readJson(session, ROUND);
      if (round && round.queue) startRound(round.pool || round.queue);
    } else if (e.target.closest(".btn-kendini-sina")) {
      var cards = document.querySelectorAll(".gallery-card[data-slug]");
      var slugs = [];
      for (var j = 0; j < cards.length; j++) slugs.push(cards[j].dataset.slug);
      startRound(slugs);
    }
  });

  function startRound(slugs) {
    if (!session || !slugs.length) return;
    var queue = buildQueue(slugs, bestOf, 7);
    writeJson(session, ROUND, { queue: queue, pool: slugs, idx: 0, streak: 0, bestStreakRound: 0, solved: 0, stars: 0, scored: -1, done: {} });
    location.href = "/r/" + encodeURIComponent(queue[0]) + "?oyun=1";
  }

  // ---------------------------------------------------------------------
  // Gallery
  // ---------------------------------------------------------------------

  function initGallery(gallery) {
    var marks = gallery.querySelectorAll(".card-stars[data-slug]");
    for (var i = 0; i < marks.length; i++) {
      var b = bestOf(marks[i].dataset.slug);
      if (b) {
        marks[i].textContent = starText(b.stars);
        marks[i].title = "En iyi: " + b.misses + " ıska · " + b.hints + " ipucu";
      }
    }
    var btn = gallery.querySelector(".btn-kendini-sina");
    if (!btn) return;
    if (!session) btn.hidden = true;
  }

  // A reveal deleted mid-round: skip ahead instead of stalling.
  function skipStale(missing) {
    if (!/[?&]oyun=1/.test(location.search)) return;
    var round = readJson(session, ROUND);
    if (!round || !round.queue) return;
    var slug;
    try { slug = decodeURIComponent(location.pathname.replace(/^\/r\//, "")); } catch (e) { return; }
    var at = round.queue.indexOf(slug);
    if (at < 0) return; // not this round's puzzle: don't skip a real one
    round.idx = at;
    if (round.idx < round.queue.length - 1) {
      round.idx++;
      writeJson(session, ROUND, round);
      location.replace("/r/" + encodeURIComponent(round.queue[round.idx]) + "?oyun=1");
    } else {
      var box = document.createElement("div");
      box.className = "round-summary";
      missing.appendChild(box);
      renderSummary(box, round);
    }
  }

  function boot() {
    var stage = document.querySelector(".reveal-stage");
    if (stage) initStage(stage);
    var gallery = document.querySelector(".gallery");
    if (gallery) initGallery(gallery);
    var missing = document.querySelector(".reveal-missing");
    if (missing) skipStale(missing);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
