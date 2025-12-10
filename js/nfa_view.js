/**
 * NFA View - A view of an NFA with a transformation applied
 *
 * Combines an NFA with a StateTransformation and provides derived data
 * that depends on both (merged sources, stats, mapped transitions).
 *
 * The app is responsible for computing the transform and creating new
 * NFAView instances when the transform changes.
 *
 * @module nfa_view
 */

/**
 * A view of an NFA with a transformation applied
 */
export class NFAView {
  /**
   * @param {NFA} nfa - The NFA
   * @param {StateTransformation} transform - The transformation to apply
   */
  constructor(nfa, transform) {
    this.nfa = nfa;
    this.transform = transform;

    // Compute merged sources once
    this.mergedSources = this._computeMergedSources();
  }

  /**
   * Compute map of canonical state -> list of source states
   * @private
   * @returns {Map<number, number[]>}
   */
  _computeMergedSources() {
    const mergedSources = new Map();
    for (let id = 0; id < this.nfa.numStates(); id++) {
      const canonical = this.transform.remap[id];
      if (canonical !== -1) {
        if (!mergedSources.has(canonical)) {
          mergedSources.set(canonical, []);
        }
        mergedSources.get(canonical).push(id);
      }
    }
    return mergedSources;
  }

  /**
   * Get stats for this view
   * @returns {{total: number, start: number, accept: number, live: number, dead: number}}
   */
  getStats() {
    const deadTransform = this.nfa.getDeadStates();

    let total = 0;
    let start = 0;
    let accept = 0;
    let dead = 0;

    for (let i = 0; i < this.transform.remap.length; i++) {
      // Only count canonical states (where remap[i] === i)
      if (this.transform.remap[i] === i) {
        total++;
        if (this.nfa.startStates.has(i)) start++;
        if (this.nfa.acceptStates.has(i)) accept++;
        if (deadTransform.isDeleted(i)) dead++;
      }
    }

    return { total, start, accept, live: total - dead, dead };
  }

  /**
   * Check if a state is a merged state (has multiple sources)
   * @param {number} stateId - Canonical state ID
   * @returns {boolean}
   */
  isMergedState(stateId) {
    const sources = this.mergedSources.get(stateId);
    return !!sources && sources.length > 1;
  }

  /**
   * Check if a state is canonical (maps to itself)
   * @param {number} stateId
   * @returns {boolean}
   */
  isCanonical(stateId) {
    return this.transform.remap[stateId] === stateId;
  }

  /**
   * Get the canonical state for a given state (-1 if deleted)
   * @param {number} stateId
   * @returns {number}
   */
  getCanonical(stateId) {
    return this.transform.remap[stateId];
  }

  /**
   * Get transitions from a state, mapped through the transform
   * @param {number} stateId - State ID
   * @returns {Map<number, string[]>} Map of canonical target -> sorted symbols
   */
  getTransitionsFrom(stateId) {
    const rawTransitions = this.nfa.getTransitionsFrom(stateId);

    // Group transitions by canonical target state, filtering deleted states
    const byCanonicalTarget = new Map();
    for (const { to, symbols } of rawTransitions) {
      const canonical = this.transform.remap[to];
      if (canonical === -1) continue; // Skip deleted states

      if (!byCanonicalTarget.has(canonical)) {
        byCanonicalTarget.set(canonical, new Set());
      }
      for (const symbol of symbols) {
        byCanonicalTarget.get(canonical).add(symbol);
      }
    }

    // Convert Sets to sorted arrays
    const result = new Map();
    for (const [target, symbolSet] of byCanonicalTarget) {
      const sorted = [...symbolSet].sort((a, b) =>
        this.nfa.symbols.indexOf(a) - this.nfa.symbols.indexOf(b)
      );
      result.set(target, sorted);
    }
    return result;
  }
}
