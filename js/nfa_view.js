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
   * @param {any} [layoutState] - Opaque layout state owned by the visualizer
   */
  constructor(nfa, transform, layoutState = null) {
    this.nfa = nfa;
    this.transform = transform;

    // Opaque layout state (visualizer-owned). This view must not inspect it.
    this.layoutState = layoutState;

    // Compute merged sources once
    this.mergedSources = this._computeMergedSources();

    this._deadStates = this.nfa.getDeadStates();
  }

  getStateIdPrefix() {
    return this.nfa.parentNfa ? "q'" : 'q';
  }

  getSourceStateIdPrefix() {
    return 'q';
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
    let total = 0;
    let start = 0;
    let accept = 0;
    let dead = 0;

    const deadTransform = this._deadStates;

    for (let i = 0; i < this.transform.remap.length; i++) {
      // Only count canonical states (where remap[i] === i)
      if (this.transform.remap[i] === i) {
        total++;
        if (this.isStart(i)) start++;
        if (this.isAccepting(i)) accept++;
        if (deadTransform.isDeleted(i)) dead++;
      }
    }

    return { total, start, accept, live: total - dead, dead };
  }

  /**
   * Check if a state is a start state in this view
   * @param {number} stateId
   * @returns {boolean}
   */
  isStart(stateId) {
    if (!this.nfa.startStates.has(stateId)) return false;
    return true;
  }

  /**
   * Check if a state is an accepting state in this view
   * @param {number} stateId
   * @returns {boolean}
   */
  isAccepting(stateId) {
    if (!this.nfa.acceptStates.has(stateId)) return false;
    return true;
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
   * Check if the machine in this view is deterministic (at most one transition per symbol)
   * @returns {boolean}
   */
  isDeterministic() {
    // Any epsilon transitions make this machine non-deterministic.
    if (this.nfa.epsilonTransitions.size > 0) {
      return false;
    }

    let seenStart = false;
    for (const stateId of this.mergedSources.keys()) {
      if (this.isStart(stateId)) {
        if (seenStart) return false;
        seenStart = true;
      }

      const seenSymbols = new Set();
      for (const symbols of this.getTransitionsFrom(stateId).values()) {
        for (const symbol of symbols) {
          if (seenSymbols.has(symbol)) return false;
          seenSymbols.add(symbol);
        }
      }
    }
    return true;
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

      if (symbols.length === 0) continue;

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

  /**
   * Get state information for visualization
   */
  getStateInfo() {
    const nfa = this.nfa;
    const deadTransform = nfa.getDeadStates();

    return Array.from({ length: nfa.numStates() }, (_, id) => {
      return {
        id,
        isStart: this.isStart(id),
        isAccept: this.isAccepting(id),
        isDead: deadTransform.isDeleted(id),
      };
    });
  }

  /**
   * Get epsilon transitions from a state, mapped through the transform
   * @param {number} stateId - Canonical state ID
   * @returns {Set<number>} Set of canonical target states
   */
  getEpsilonTransitionsFrom(stateId) {
    const epsilonTargets = new Set();
    const sources = this.mergedSources.get(stateId) || [];

    for (const sourceId of sources) {
      const targets = this.nfa.epsilonTransitions.get(sourceId);
      if (!targets) continue;

      for (const to of targets) {
        const canonical = this.transform.remap[to];
        if (canonical === -1) continue;
        epsilonTargets.add(canonical);
      }
    }

    return epsilonTargets;
  }

  /**
   * Get the resolved source states for a given canonical state ID.
   * If the NFA has a parent NFA (e.g. it's a DFA created from an NFA),
   * this resolves the sources back to the parent NFA's state IDs.
   *
   * @param {number} stateId - The canonical state ID in this view
   * @returns {Array<{id: number, label: string}>} List of source states with their IDs and labels
   */
  getResolvedSources(stateId) {
    let sources = this.mergedSources.get(stateId) || [];

    if (this.nfa.parentNfa) {
      const baseIds = new Set();
      for (const sourceId of sources) {
        const label = this.nfa.stateLabels[sourceId] || '';
        for (const id of label.split(',').map(s => parseInt(s, 10))) {
          baseIds.add(id);
        }
      }
      sources = [...baseIds].sort((a, b) => a - b);
    }

    const baseNfa = this.nfa.parentNfa || this.nfa;
    return sources.map(id => ({ id, label: baseNfa.stateLabels[id] || '' }));
  }
}
