/**
 * NFA (Non-deterministic Finite Automaton) Implementation
 *
 * This module provides:
 * - NFA class for representing and running finite automata
 * - StateTransformation class for state remapping operations
 *
 * @module nfa
 */

// ============================================
// Constants
// ============================================

/** Default symbol class (regex character class syntax) */
export const DEFAULT_SYMBOL_CLASS = '1-9';

// ============================================
// State Transformation
// ============================================

/**
 * Encapsulates a state remapping for NFA transformations.
 * Allows stacking/composing transformations without modifying the original NFA.
 *
 * The remap array maps original state IDs to canonical state IDs:
 * - remap[state] >= 0: maps to canonical representative
 * - remap[state] === -1: state is deleted
 */
export class StateTransformation {
  /**
   * @param {Int32Array} remap - Remapping array
   */
  constructor(remap) {
    /** @type {Int32Array} */
    this.remap = remap;

    this._isIdentity = true;
    for (let i = 0; i < remap.length; i++) {
      const canonical = remap[i];
      if (canonical !== i) {
        this._isIdentity = false;
        break;
      }
    }
  }

  /**
   * Create an identity transformation (no changes).
   * @param {number} numStates - Number of states
   * @returns {StateTransformation}
   */
  static identity(numStates) {
    const remap = new Int32Array(numStates);
    for (let i = 0; i < numStates; i++) remap[i] = i;
    return new StateTransformation(remap);
  }

  /**
   * Create a transformation that deletes specified states.
   * @param {number} numStates - Total number of states
   * @param {Set<number>|Array<number>} deletedStates - States to delete
   * @returns {StateTransformation}
   */
  static deletion(numStates, deletedStates) {
    const deleted = deletedStates instanceof Set ? deletedStates : new Set(deletedStates);
    const remap = new Int32Array(numStates);
    for (let i = 0; i < numStates; i++) {
      remap[i] = deleted.has(i) ? -1 : i;
    }
    return new StateTransformation(remap);
  }

  /** Number of states in the original NFA */
  get numStates() {
    return this.remap.length;
  }

  /** Get the set of deleted state IDs */
  getDeletedStates() {
    const deleted = new Set();
    for (let i = 0; i < this.remap.length; i++) {
      if (this.remap[i] === -1) deleted.add(i);
    }
    return deleted;
  }

  /** Get the set of active (non-deleted) state IDs */
  getActiveStates() {
    const active = [];
    for (let i = 0; i < this.remap.length; i++) {
      if (this.remap[i] !== -1) active.push(i);
    }
    return active;
  }

  /** Check if a state is deleted */
  isDeleted(stateId) {
    return this.remap[stateId] === -1;
  }

  /** Get the canonical representative for a state (-1 if deleted) */
  getCanonical(stateId) {
    return this.remap[stateId];
  }

  /**
   * Check if this is an identity transformation.
   * @returns {boolean}
   */
  isIdentity() {
    return this._isIdentity;
  }

  /**
   * Compose this transformation with another: apply other after this.
   * @param {StateTransformation} other - Transformation to apply after this one
   * @returns {StateTransformation} Composed transformation
   */
  compose(other) {
    const result = new Int32Array(this.remap.length);
    for (let i = 0; i < this.remap.length; i++) {
      const intermediate = this.remap[i];
      result[i] = intermediate === -1 ? -1 : other.remap[intermediate];
    }
    return new StateTransformation(result);
  }
}

// ============================================
// NFA Class
// ============================================

/**
 * Represents a Non-deterministic Finite Automaton.
 * States are identified by sequential numeric IDs.
 * Transitions stored as sparse 3D array: _transitions[fromState][symbolIndex] = [toStates]
 */
export class NFA {
  /**
   * @param {Array} symbols - Array of symbols for this NFA
   */
  constructor(symbols) {
    /** @type {Array} The symbol alphabet */
    this.symbols = symbols;
    /** @type {Map<any, number>} Symbol to index mapping */
    this._symbolToIndex = new Map(symbols.map((s, i) => [s, i]));
    /** @type {Array<Array<Array<number>>>} Sparse 3D array: [fromState][symbolIndex] = [toStates] */
    this._transitions = [];
    /** @type {Set<number>} */
    this.startStates = new Set();
    /** @type {Set<number>} */
    this.acceptStates = new Set();
    /** @type {string[]} State ID to label for visualization */
    this.stateLabels = [];
    /** @type {Map<number, Set<number>>} Epsilon transitions: fromState -> Set<toState> */
    this.epsilonTransitions = new Map();

    /** @type {StateTransformation|null} Cached dead states transformation */
    this._deadStatesCache = null;
    /** @type {Object|null} Epsilon closure info (if computed) */
    this.epsilonClosureInfo = null;
  }

  /**
   * Check if a symbol is in the NFA's alphabet
   * @param {string} symbol
   * @returns {boolean}
   */
  hasSymbol(symbol) {
    return this._symbolToIndex.has(symbol);
  }

  /** Add a new state, returns its ID */
  addState(label) {
    this._deadStatesCache = null;
    const id = this._transitions.length;
    this._transitions.push([]);
    this.stateLabels.push(label === undefined ? id.toString() : label);
    return id;
  }

  /** Mark a state as a start state
   * @return {boolean} True if the state was newly marked as a start state
  */
  addStart(stateId) {
    if (this.startStates.has(stateId)) return false;
    this._deadStatesCache = null;
    this.startStates.add(stateId);
    return true;
  }

  /** Mark a state as an accepting state
   * @return {boolean} True if the state was newly marked as accepting
  */
  addAccept(stateId) {
    if (this.acceptStates.has(stateId)) return false;
    this._deadStatesCache = null;
    this.acceptStates.add(stateId);
    return true;
  }

  /** Add a transition from one state to another on a symbol index
   * @return {boolean} True if the transition was newly added (not a duplicate)
  */
  addTransition(fromState, toState, symbolIndex) {
    const stateTransitions = this._transitions[fromState];
    if (!stateTransitions) return false;

    if (!stateTransitions[symbolIndex]) {
      stateTransitions[symbolIndex] = [];
    }
    // Avoid duplicates
    if (stateTransitions[symbolIndex].includes(toState)) return false;

    this._deadStatesCache = null;
    stateTransitions[symbolIndex].push(toState);
    return true;
  }

  /**
   * Add an epsilon transition from one state to another.
   * @param {number} fromState
   * @param {number} toState
   * @returns {boolean} True if the transition was newly added
   */
  addEpsilonTransition(fromState, toState) {
    if (!this.epsilonTransitions.has(fromState)) {
      this.epsilonTransitions.set(fromState, new Set());
    }
    const targets = this.epsilonTransitions.get(fromState);
    if (targets.has(toState)) return false;
    this._deadStatesCache = null;
    targets.add(toState);
    return true;
  }

  /** Get all states reachable from a state on a given symbol index */
  getTransitions(stateId, symbolIndex) {
    const stateTransitions = this._transitions[stateId];
    if (!stateTransitions) return [];
    return stateTransitions[symbolIndex] || [];
  }

  isAccepting(stateId) {
    return this.acceptStates.has(stateId);
  }

  isStart(stateId) {
    return this.startStates.has(stateId);
  }

  numStates() {
    return this._transitions.length;
  }

  /**
   * Enforce epsilon transitions by computing closures and adding necessary transitions/states.
   * Populates epsilonClosureInfo.
   */
  enforceEpsilonTransitions() {
    if (this.epsilonTransitions.size === 0) return; // No epsilon transitions

    const epsilonClosureInfo = {
      addedStartStates: new Set(),
      addedAcceptStates: new Set(),
      addedTransitions: new Map(), // fromId -> symbolIndex -> Set<toId>
      epsilonClosure: new Map(), // stateId -> Set<stateId>
    };
    this.epsilonClosureInfo = epsilonClosureInfo;

    const epsilonClosure = epsilonClosureInfo.epsilonClosure;

    // Helper to get epsilon closure of a state ID
    const getEpsilonClosure = (stateId) => {
      if (epsilonClosure.has(stateId)) {
        return epsilonClosure.get(stateId);
      }
      const closure = new Set([stateId]);
      const stack = [stateId];
      while (stack.length > 0) {
        const current = stack.pop();
        const targets = this.epsilonTransitions.get(current);
        if (targets) {
          for (const target of targets) {
            if (!closure.has(target)) {
              closure.add(target);
              stack.push(target);
            }
          }
        }
      }
      epsilonClosure.set(stateId, closure);
      return closure;
    };

    // Expand start states
    for (const startId of [...this.startStates]) {
      for (const closureState of getEpsilonClosure(startId)) {
        if (this.addStart(closureState)) {
          epsilonClosureInfo.addedStartStates.add(closureState);
        }
      }
    }

    // Add transitions to epsilon closure states
    const numStates = this.numStates();
    for (let fromId = 0; fromId < numStates; fromId++) {
      for (let symbolIndex = 0; symbolIndex < this.symbols.length; symbolIndex++) {
        // Snapshot transitions to avoid iterating over newly added ones
        const targets = [...this.getTransitions(fromId, symbolIndex)];
        for (const toId of targets) {
          for (const closureState of getEpsilonClosure(toId)) {
            if (this.addTransition(fromId, closureState, symbolIndex)) {
              let fromMap = epsilonClosureInfo.addedTransitions.get(fromId);
              if (!fromMap) {
                fromMap = new Map();
                epsilonClosureInfo.addedTransitions.set(fromId, fromMap);
              }
              let toSet = fromMap.get(symbolIndex);
              if (!toSet) {
                toSet = new Set();
                fromMap.set(symbolIndex, toSet);
              }
              toSet.add(closureState);
            }
          }
        }
      }
    }

    // Propagate accept status
    for (let id = 0; id < numStates; id++) {
      for (const closureState of getEpsilonClosure(id)) {
        if (this.acceptStates.has(closureState)) {
          if (this.addAccept(id)) {
            epsilonClosureInfo.addedAcceptStates.add(id);
          }
          break;
        }
      }
    }
  }

  /**
   * Run the NFA on an input sequence.
   * Each input element is an array of symbols to process simultaneously.
   * Returns whether accepted and an execution trace.
   * @param {Array<string[]>} inputSequence - Array of symbol arrays
   */
  run(inputSequence) {
    let currentStates = new Set(this.startStates);
    const trace = [{ step: 0, input: null, states: [...currentStates] }];

    for (let i = 0; i < inputSequence.length; i++) {
      const symbols = inputSequence[i];
      const nextStates = new Set();

      // Follow transitions for all symbols in this step
      for (const symbol of symbols) {
        const symbolIndex = this._symbolToIndex.get(symbol);
        if (symbolIndex === undefined) continue;

        for (const stateId of currentStates) {
          for (const target of this.getTransitions(stateId, symbolIndex)) {
            nextStates.add(target);
          }
        }
      }

      currentStates = nextStates;
      trace.push({ step: i + 1, input: symbols, states: [...currentStates] });

      if (currentStates.size === 0) break;
    }

    const accepted = [...currentStates].some(id => this.isAccepting(id));
    return { accepted, trace };
  }

  /** Get all transitions for visualization (converts indices back to symbols) */
  getAllTransitions() {
    const result = [];
    for (let fromId = 0; fromId < this._transitions.length; fromId++) {
      const stateTransitions = this._transitions[fromId];
      for (let symbolIndex = 0; symbolIndex < stateTransitions.length; symbolIndex++) {
        const targets = stateTransitions[symbolIndex];
        if (!targets) continue;
        const symbol = this.symbols[symbolIndex];
        for (const toId of targets) {
          result.push({ from: fromId, to: toId, symbol });
        }
      }
    }
    return result;
  }

  /** Get transitions from a specific state, grouped by target */
  getTransitionsFrom(stateId) {
    const stateTransitions = this._transitions[stateId];
    if (!stateTransitions) return [];

    // Group by target state
    const byTarget = new Map();
    for (let symbolIndex = 0; symbolIndex < stateTransitions.length; symbolIndex++) {
      const targets = stateTransitions[symbolIndex];
      if (!targets) continue;
      const symbol = this.symbols[symbolIndex];
      for (const toId of targets) {
        if (!byTarget.has(toId)) byTarget.set(toId, []);
        byTarget.get(toId).push(symbol);
      }
    }

    return [...byTarget.entries()].map(([to, symbols]) => ({ to, symbols }));
  }

  /** Get state information for visualization */
  getStateInfo() {
    const deadTransform = this.getDeadStates();
    return this._transitions.map((_, id) => ({
      id,
      isStart: this.startStates.has(id),
      isAccept: this.acceptStates.has(id),
      isDead: deadTransform.isDeleted(id)
    }));
  }

  hasEnforcedEpsilonTransitions() {
    return this.epsilonTransitions.size === 0 || this.epsilonClosureInfo !== null;
  }

  /**
   * Create a reversed NFA where all transitions are flipped.
   * Start states become accept states and vice versa.
   * @returns {NFA} A new NFA with reversed transitions
   */
  reverse() {
    if (!this.hasEnforcedEpsilonTransitions()) {
      throw new Error('Epsilon transitions must be enforced before reversing the NFA.');
    }

    const reversed = new NFA(this.symbols);
    const numStates = this._transitions.length;

    // Direct internal manipulation for performance
    reversed.stateLabels = [...this.stateLabels];
    reversed.startStates = new Set(this.acceptStates);
    reversed.acceptStates = new Set(this.startStates);

    // Pre-allocate transitions array
    reversed._transitions = new Array(numStates);
    for (let i = 0; i < numStates; i++) {
      reversed._transitions[i] = [];
    }

    // Reverse all transitions
    for (let fromId = 0; fromId < numStates; fromId++) {
      const stateTransitions = this._transitions[fromId];
      for (let symbolIndex = 0; symbolIndex < stateTransitions.length; symbolIndex++) {
        const targets = stateTransitions[symbolIndex];
        if (!targets) continue;

        for (const toId of targets) {
          reversed.addTransition(toId, fromId, symbolIndex);
        }
      }
    }

    return reversed;
  }

  /**
   * Find all states reachable from the start states.
   * @returns {Set<number>} All reachable states (including start states)
   */
  getReachableStates() {
    const reachable = new Set(this.startStates);
    const queue = [...this.startStates];
    let queueHead = 0;

    while (queueHead < queue.length) {
      const stateId = queue[queueHead++];
      const stateTransitions = this._transitions[stateId];
      if (!stateTransitions) continue;

      for (const targets of stateTransitions) {
        if (!targets) continue;
        for (const toId of targets) {
          if (!reachable.has(toId)) {
            reachable.add(toId);
            queue.push(toId);
          }
        }
      }
    }

    return reachable;
  }

  /**
   * Find all "dead" states - states from which no accept state is reachable.
   * Uses backward reachability from accept states via the reversed NFA.
   * @returns {StateTransformation} Transformation that deletes dead states
   */
  getDeadStates() {
    if (this._deadStatesCache) return this._deadStatesCache;

    const numStates = this._transitions.length;
    if (numStates === 0) {
      this._deadStatesCache = StateTransformation.identity(0);
      return this._deadStatesCache;
    }

    // In the reversed NFA, states reachable from start (= original accept)
    // are exactly those that can reach accept in the original
    const canReachAccept = this.reverse().getReachableStates();

    // Dead states are those that cannot reach any accept state
    const deadStates = [];
    for (let id = 0; id < numStates; id++) {
      if (!canReachAccept.has(id)) {
        deadStates.push(id);
      }
    }

    this._deadStatesCache = StateTransformation.deletion(numStates, deadStates);
    return this._deadStatesCache;
  }

  /**
   * Find equivalent states using partition refinement (Hopcroft-style).
   * Two states are equivalent if they have:
   * 1. Same acceptance status
   * 2. For each symbol, transitions to equivalent sets of states
   *
   * @param {StateTransformation} [transform] - Optional existing transformation to build upon
   * @returns {StateTransformation} Transformation that merges equivalent states
   */
  getEquivalentStateRemap(transform = null) {
    const numStates = this._transitions.length;
    if (numStates === 0) {
      return transform || StateTransformation.identity(0);
    }

    // Start from existing transformation or identity
    if (!transform) {
      transform = StateTransformation.identity(numStates);
    }

    const activeStates = transform.getActiveStates();
    if (activeStates.length === 0) {
      return transform;
    }

    // partition[state] = partition ID (-1 for deleted states)
    const partition = new Int32Array(numStates).fill(-1);
    let nextPartitionId = 0;

    // Initial partition: group by acceptance status
    for (const s of activeStates) {
      const isAccept = this.acceptStates.has(s);
      // Use partition 0 for non-accepting, 1 for accepting
      partition[s] = isAccept ? 1 : 0;
    }
    nextPartitionId = 2;

    // Partition refinement: split partitions until stable
    let changed = true;
    while (changed) {
      changed = false;

      // Group states by current partition
      const partitionGroups = new Map();
      for (const s of activeStates) {
        const partId = partition[s];
        if (!partitionGroups.has(partId)) partitionGroups.set(partId, []);
        partitionGroups.get(partId).push(s);
      }

      // Try to split each partition based on transition signatures
      for (const members of partitionGroups.values()) {
        if (members.length <= 1) continue;

        // Group members by their transition signature
        const bySignature = new Map();
        for (const state of members) {
          const sig = this._computeTransitionSignature(state, partition);
          if (!bySignature.has(sig)) bySignature.set(sig, []);
          bySignature.get(sig).push(state);
        }

        // Split if multiple signatures exist
        if (bySignature.size > 1) {
          changed = true;
          let first = true;
          for (const states of bySignature.values()) {
            if (first) {
              first = false; // Keep first group in original partition
            } else {
              const newPartId = nextPartitionId++;
              for (const s of states) partition[s] = newPartId;
            }
          }
        }
      }
    }

    // Build remap: each state maps to the smallest state ID in its partition
    const remap = new Int32Array(transform.remap);
    const canonicalState = new Map();

    for (const s of activeStates) {
      const partId = partition[s];
      if (!canonicalState.has(partId) || s < canonicalState.get(partId)) {
        canonicalState.set(partId, s);
      }
    }

    for (const s of activeStates) {
      remap[s] = canonicalState.get(partition[s]);
    }

    return new StateTransformation(remap);
  }

  /**
   * Compute a transition signature for partition refinement.
   * Returns a string encoding which partitions are reachable on each symbol.
   * @private
   */
  _computeTransitionSignature(stateId, partition) {
    const sigParts = [];

    for (let symIdx = 0; symIdx < this.symbols.length; symIdx++) {
      const targets = this.getTransitions(stateId, symIdx);
      if (targets.length === 0) {
        sigParts.push('');
      } else {
        // Get partition IDs of targets, filter deleted, sort for canonical form
        const targetPartitions = [];
        for (const t of targets) {
          const p = partition[t];
          if (p !== -1) targetPartitions.push(p);
        }
        targetPartitions.sort((a, b) => a - b);
        sigParts.push(targetPartitions.join(','));
      }
    }

    return sigParts.join('|');
  }
}
