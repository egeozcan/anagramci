(function () {
  var activeChip = null;

  function clearHighlights(block) {
    var chips = block.querySelectorAll(".letter-chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.remove("letter-chip--full", "letter-chip--partial");
    }
  }

  function buildMapping(pairs) {
    var map = {};
    for (var i = 0; i < pairs.length; i++) {
      map[pairs[i][0]] = pairs[i][1];
    }
    return map;
  }

  function highlightLetters(wordChip) {
    var block = wordChip.closest(".combination-block");
    if (!block) return;

    clearHighlights(block);

    var pairs = JSON.parse(block.dataset.mapping || "[]");
    var mapping = buildMapping(pairs);

    var word = wordChip.textContent.toLocaleLowerCase("tr-TR");
    var needed = {};
    for (var ch of word) {
      if (ch === " ") continue;
      var n = mapping[ch] || ch;
      needed[n] = (needed[n] || 0) + 1;
    }

    var letterChips = block.querySelectorAll(".letter-chip");
    for (var i = 0; i < letterChips.length; i++) {
      var lc = letterChips[i];
      var letter = lc.dataset.letter;
      var available = parseInt(lc.querySelector("sup").textContent, 10);
      var count = needed[letter] || 0;
      if (count <= 0) continue;
      lc.classList.add(count >= available ? "letter-chip--full" : "letter-chip--partial");
    }
  }

  document.addEventListener("mouseover", function (e) {
    var wordChip = e.target.closest(".word-chip");

    if (wordChip === activeChip) return;

    // Clear old highlights
    if (activeChip) {
      var oldBlock = activeChip.closest(".combination-block");
      if (oldBlock) clearHighlights(oldBlock);
      activeChip = null;
    }

    if (!wordChip) return;

    activeChip = wordChip;
    highlightLetters(wordChip);
  });

  // Clear when mouse leaves the document
  document.addEventListener("mouseleave", function () {
    if (activeChip) {
      var block = activeChip.closest(".combination-block");
      if (block) clearHighlights(block);
      activeChip = null;
    }
  });
})();
