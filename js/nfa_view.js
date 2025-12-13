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
   * @param {Object} [options] - View options
   * @param {boolean} [options.showEpsilonTransitions] - Whether to show explicit epsilon transitions (raw NFA mode)
   */
  constructor(nfa, transform, options = {}) {
    this.nfa = nfa;
    this.transform = transform;

    // Only allow showing explicit epsilon transitions if we have an identity transform
    // This simplifies logic by avoiding edge cases with merged/deleted states
    if (options.showEpsilonTransitions && !this.transform.isIdentity()) {
      throw new Error('Cannot show explicit epsilon transitions with a non-identity transform');
    }
    this.showEpsilonTransitions = !!options.showEpsilonTransitions;

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
    let total = 0;
    let start = 0;
    let accept = 0;
    let dead = 0;

    const deadTransform = this.nfa.getDeadStates();

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
    if (this.showEpsilonTransitions && this.nfa.epsilonClosureInfo?.addedStartStates.has(stateId)) return false;
    return true;
  }

  /**
   * Check if a state is an accepting state in this view
   * @param {number} stateId
   * @returns {boolean}
   */
  isAccepting(stateId) {
    if (!this.nfa.acceptStates.has(stateId)) return false;
    if (this.showEpsilonTransitions && this.nfa.epsilonClosureInfo?.addedAcceptStates.has(stateId)) return false;
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
    // If showing explicit epsilon transitions, check if any exist
    if (this.showEpsilonTransitions && this.nfa.epsilonTransitions.size > 0) {
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

      let visibleSymbols = symbols;
      if (this.showEpsilonTransitions) {
        // When showing explicit epsilon transitions, we want to HIDE the closure artifacts
        // (transitions added by epsilon closure).
        // The transform is identity, so stateId/to are original IDs.
        const addedFrom = this.nfa.epsilonClosureInfo?.addedTransitions.get(stateId);
        if (addedFrom) {
          visibleSymbols = symbols.filter(symbol => {
            const symbolIndex = this.nfa._symbolToIndex.get(symbol);
            const addedTo = addedFrom.get(symbolIndex);
            return !addedTo || !addedTo.has(to);
          });
        }
      }

      if (visibleSymbols.length === 0) continue;

      if (!byCanonicalTarget.has(canonical)) {
        byCanonicalTarget.set(canonical, new Set());
      }
      for (const symbol of visibleSymbols) {
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
    const deadTransform = this.nfa.getDeadStates();

    if (!this.nfa.hasEnforcedEpsilonTransitions()) {
      throw new Error(
        'Warning: NFA has epsilon transitions but no epsilon closure info');
    }

    // In raw NFA mode (explicit epsilons), treat a start state as live if any
    // state in its epsilon-closure is live.
    const hasLiveStartStateInClosure = (stateId) => {
      // If we don't have epsilon closure info, there are no epsilon transitions.
      if (!this.nfa.epsilonClosureInfo) return false;

      // If it's not in the start state epsilon closure map, it is not a start
      // state in the epsilon closure.
      const startStateClosure = this.nfa.epsilonClosureInfo.startStateEpsilonClosure.get(stateId);
      if (!startStateClosure) return false;

      const closure = this.nfa.epsilonClosureInfo.startStateEpsilonClosure.get(stateId);
      for (const id of closure) {
        if (!deadTransform.isDeleted(id)) return true;
      }
      return false;
    };

    return this.nfa._transitions.map((_, id) => ({
      id,
      isStart: this.isStart(id),
      isAccept: this.isAccepting(id),
      isDead: deadTransform.isDeleted(id)
        // In raw NFA mode, stay live if epsilon-closure reaches a live state.
        && !(this.showEpsilonTransitions && hasLiveStartStateInClosure(id))
    }));
  }

  /**
   * Get epsilon transitions from a state, mapped through the transform
   * @param {number} stateId - Canonical state ID
   * @returns {Set<number>} Set of canonical target states
   */
  getEpsilonTransitionsFrom(stateId) {
    if (!this.showEpsilonTransitions) {
      return new Set();
    }

    // Since showEpsilonTransitions requires an identity transform,
    // we don't need to handle merged states or remapping.
    // stateId is the original state ID.
    return this.nfa.epsilonTransitions.get(stateId) || new Set();
  }
}
