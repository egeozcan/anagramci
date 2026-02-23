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

  // -------------------------------------------------------------------------
  // Drag-and-drop reorder for chosen words
  // -------------------------------------------------------------------------
  var dragSrcIndex = null;
  var dragPanel = null;

  function clearDropIndicators(list) {
    var items = list.querySelectorAll(".chosen-word-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove("chosen-word-item--drop-above", "chosen-word-item--drop-below");
    }
  }

  function getWordsFromPanel(panel) {
    var spans = panel.querySelectorAll(".chosen-word-text");
    var words = [];
    for (var i = 0; i < spans.length; i++) {
      words.push(spans[i].textContent);
    }
    return words;
  }

  function submitWords(panel, words) {
    var attemptId = panel.dataset.attemptId;
    var ci = panel.dataset.ci;
    var url = "/attempts/" + encodeURIComponent(attemptId) + "/chosen";
    var vals = { ci: ci };
    for (var i = 0; i < words.length; i++) {
      vals["word_" + i] = words[i];
    }
    htmx.ajax("PUT", url, {
      target: "#combination-" + ci,
      swap: "outerHTML",
      values: vals,
    });
  }

  document.addEventListener("dragstart", function (e) {
    var item = e.target.closest(".chosen-word-item[draggable]");
    if (!item) return;
    dragSrcIndex = parseInt(item.dataset.index, 10);
    dragPanel = item.closest(".panel-chosen");
    item.classList.add("chosen-word-item--dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragSrcIndex.toString());
  });

  document.addEventListener("dragover", function (e) {
    var item = e.target.closest(".chosen-word-item[draggable]");
    if (!item || !dragPanel) return;
    if (!dragPanel.contains(item)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    var list = item.closest(".chosen-words-list");
    if (list) clearDropIndicators(list);

    var rect = item.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      item.classList.add("chosen-word-item--drop-above");
    } else {
      item.classList.add("chosen-word-item--drop-below");
    }
  });

  document.addEventListener("dragleave", function (e) {
    var item = e.target.closest(".chosen-word-item[draggable]");
    if (item) {
      item.classList.remove("chosen-word-item--drop-above", "chosen-word-item--drop-below");
    }
  });

  document.addEventListener("drop", function (e) {
    var item = e.target.closest(".chosen-word-item[draggable]");
    if (!item || !dragPanel) return;
    if (!dragPanel.contains(item)) return;
    e.preventDefault();

    var list = item.closest(".chosen-words-list");
    if (list) clearDropIndicators(list);

    var dropIndex = parseInt(item.dataset.index, 10);
    var rect = item.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    var insertAfter = e.clientY >= midY;

    var words = getWordsFromPanel(dragPanel);
    if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

    // Remove dragged word, compute target position
    var word = words.splice(dragSrcIndex, 1)[0];
    var targetIndex = dropIndex > dragSrcIndex ? dropIndex - 1 : dropIndex;
    if (insertAfter) targetIndex++;
    words.splice(targetIndex, 0, word);

    submitWords(dragPanel, words);
    dragSrcIndex = null;
    dragPanel = null;
  });

  document.addEventListener("dragend", function (e) {
    var item = e.target.closest(".chosen-word-item[draggable]");
    if (item) {
      item.classList.remove("chosen-word-item--dragging");
    }
    if (dragPanel) {
      var list = dragPanel.querySelector(".chosen-words-list");
      if (list) clearDropIndicators(list);
    }
    dragSrcIndex = null;
    dragPanel = null;
  });

  // -------------------------------------------------------------------------
  // Inline edit on double-click
  // -------------------------------------------------------------------------
  document.addEventListener("dblclick", function (e) {
    var span = e.target.closest(".chosen-word-text");
    if (!span) return;
    var item = span.closest(".chosen-word-item");
    if (!item) return;
    // Prevent if already editing
    if (item.querySelector(".chosen-word-edit-input")) return;

    var panel = item.closest(".panel-chosen");
    if (!panel) return;

    var originalText = span.textContent;
    var input = document.createElement("input");
    input.type = "text";
    input.className = "chosen-word-edit-input";
    input.value = originalText;

    span.style.display = "none";
    span.parentNode.insertBefore(input, span.nextSibling);
    input.focus();
    input.select();

    function commit() {
      var newText = input.value.trim();
      if (!newText || newText === originalText) {
        cancel();
        return;
      }
      var words = getWordsFromPanel(panel);
      var idx = parseInt(item.dataset.index, 10);
      words[idx] = newText;
      submitWords(panel, words);
    }

    function cancel() {
      span.style.display = "";
      if (input.parentNode) input.parentNode.removeChild(input);
    }

    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      }
    });

    input.addEventListener("blur", function () {
      // Small delay to let potential keydown (Enter/Escape) fire first
      setTimeout(function () {
        if (input.parentNode) commit();
      }, 0);
    });
  });
})();
