export interface DAWGResult {
  word: string;
  letterCount: number;
}

class DAWGNode {
  children: Map<string, DAWGNode> = new Map();
  isEnd: boolean = false;
  /** All original words that end at this node (supports multi-word entries
   *  like "a b" and "ab" mapping to the same trie path). */
  words: string[] = [];
}

export class DAWG {
  private root: DAWGNode;

  constructor(words: string[]) {
    this.root = new DAWGNode();
    for (const word of words) {
      this.insert(word);
    }
    this.compress();
  }

  /**
   * Insert a word into the trie. For multi-word entries (containing spaces),
   * spaces are skipped in the trie structure but the full original word is
   * stored at the end node.
   */
  private insert(word: string): void {
    let node = this.root;
    for (const ch of word) {
      if (ch === " ") continue;
      let child = node.children.get(ch);
      if (!child) {
        child = new DAWGNode();
        node.children.set(ch, child);
      }
      node = child;
    }
    node.isEnd = true;
    node.words.push(word);
  }

  /**
   * Attempt DAWG suffix compression by merging nodes with identical subtrees.
   * Uses a signature-based approach. If compression takes too long, bail out
   * and use the plain trie (traversal performance is the same).
   *
   * The signature includes stored words so that nodes with different word
   * values at end positions are never merged.
   */
  private compress(): void {
    const startTime = performance.now();
    const TIME_LIMIT = 2000;

    const signatureMap = new Map<string, DAWGNode>();

    const computeSignature = (node: DAWGNode): string | null => {
      if (performance.now() - startTime > TIME_LIMIT) return null;

      const parts: string[] = [];
      const sortedKeys = [...node.children.keys()].sort();
      for (const key of sortedKeys) {
        const child = node.children.get(key)!;
        const childSig = computeSignature(child);
        if (childSig === null) return null;
        parts.push(`${key}:${childSig}`);
      }
      // Include stored words in signature so end nodes with different words
      // are never considered identical.
      const wordsPart = node.words.length > 0
        ? `W${node.words.sort().join("|")}`
        : "";
      return `${node.isEnd ? "1" : "0"}${wordsPart}[${parts.join(",")}]`;
    };

    const dedup = (node: DAWGNode): DAWGNode | null => {
      if (performance.now() - startTime > TIME_LIMIT) return null;

      for (const [key, child] of node.children) {
        const deduped = dedup(child);
        if (deduped === null) return null;
        node.children.set(key, deduped);
      }

      const sig = computeSignature(node);
      if (sig === null) return null;

      const existing = signatureMap.get(sig);
      if (existing) {
        return existing;
      }
      signatureMap.set(sig, node);
      return node;
    };

    dedup(this.root);
  }

  /**
   * Check if the DAWG contains an exact word. Spaces in the word are skipped
   * during traversal.
   */
  contains(word: string): boolean {
    let node = this.root;
    for (const ch of word) {
      if (ch === " ") continue;
      const child = node.children.get(ch);
      if (!child) return false;
      node = child;
    }
    return node.isEnd;
  }

  /**
   * Find all words that can be formed from the given letter pool.
   *
   * @param pool - Map of available letters to their counts
   * @param mapping - Optional letter mapping (e.g., "c-cedilla" -> "c") for
   *   matching trie edges against normalized pool keys
   * @returns Array of DAWGResult with the word and its letter count
   */
  findAvailable(
    pool: Map<string, number>,
    mapping?: Map<string, string>
  ): DAWGResult[] {
    const results: DAWGResult[] = [];
    const seen = new Set<string>();

    const normalize = mapping
      ? (ch: string) => mapping.get(ch) ?? ch
      : (ch: string) => ch;

    const dfs = (node: DAWGNode): void => {
      if (node.isEnd) {
        for (const word of node.words) {
          if (!seen.has(word)) {
            seen.add(word);
            let letterCount = 0;
            for (const ch of word) {
              if (ch !== " ") letterCount++;
            }
            results.push({ word, letterCount });
          }
        }
      }

      for (const [edgeCh, child] of node.children) {
        const normalized = normalize(edgeCh);
        const count = pool.get(normalized);
        if (count !== undefined && count > 0) {
          pool.set(normalized, count - 1);
          dfs(child);
          pool.set(normalized, count);
        }
      }
    };

    dfs(this.root);
    return results;
  }
}
