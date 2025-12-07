/**
 * NFA (Non-deterministic Finite Automaton) Implementation
 *
 * This module provides:
 * - NFA class for representing and running finite automata
 * - NFABuilder for constructing NFAs from JavaScript function definitions
 * - Helper functions for parsing user code
 *
 * @module nfa
 */

// ============================================
// Constants
// ============================================

/** Default maximum number of states before throwing an error */
const DEFAULT_MAX_STATES = 1000;

/** Default maximum symbol value to explore during NFA construction */
const DEFAULT_MAX_SYMBOLS = 10;

// ============================================
// NFA Class
// ============================================

/**
 * Represents a Non-deterministic Finite Automaton
 *
 * States are identified by numeric IDs. Each state can have multiple
 * transitions for the same symbol (non-determinism).
 */
export class NFA {
  constructor() {
    /** @type {Map<number, {transitions: Map<any, Set<number>>}>} */
    this.states = new Map();

    /** @type {Set<number>} */
    this.startStates = new Set();

    /** @type {Set<number>} */
    this.acceptStates = new Set();

    /** @type {Map<number, string>} State ID to label mapping for visualization */
    this.stateLabels = new Map();

    /** @private */
    this._stateCounter = 0;
  }

  /**
   * Add a new state to the NFA
   * @param {boolean} accepting - Whether this is an accepting state
   * @returns {number} The ID of the newly created state
   */
  addState(accepting = false) {
    const id = this._stateCounter++;
    this.states.set(id, { transitions: new Map() });
    if (accepting) {
      this.acceptStates.add(id);
    }
    return id;
  }

  /**
   * Mark a state as a start state
   * @param {number} stateId
   */
  setStart(stateId) {
    this.startStates.add(stateId);
  }

  /**
   * Mark a state as an accepting state
   * @param {number} stateId
   */
  setAccept(stateId) {
    this.acceptStates.add(stateId);
  }

  /**
   * Add a transition between states
   * @param {number} fromState - Source state ID
   * @param {number} toState - Target state ID
   * @param {any} symbol - The transition symbol
   */
  addTransition(fromState, toState, symbol) {
    const state = this.states.get(fromState);
    if (!state) return;

    if (!state.transitions.has(symbol)) {
      state.transitions.set(symbol, new Set());
    }
    state.transitions.get(symbol).add(toState);
  }

  /**
   * Get all states reachable from a state on a given symbol
   * @param {number} stateId
   * @param {any} symbol
   * @returns {Set<number>}
   */
  getTransitions(stateId, symbol) {
    const state = this.states.get(stateId);
    if (!state) return new Set();
    return state.transitions.get(symbol) || new Set();
  }

  /**
   * Check if a state is accepting
   * @param {number} stateId
   * @returns {boolean}
   */
  isAccepting(stateId) {
    return this.acceptStates.has(stateId);
  }

  /**
   * Check if a state is a start state
   * @param {number} stateId
   * @returns {boolean}
   */
  isStart(stateId) {
    return this.startStates.has(stateId);
  }

  /**
   * Get the total number of states
   * @returns {number}
   */
  numStates() {
    return this.states.size;
  }

  /**
   * Run the NFA on an input sequence
   *
   * Uses the standard NFA simulation: track all possible current states
   * and for each input, compute the union of all reachable next states.
   *
   * @param {any[]} inputSequence - Array of input symbols
   * @returns {{accepted: boolean, trace: Array}} Result with execution trace
   */
  run(inputSequence) {
    let currentStates = new Set(this.startStates);

    const trace = [{
      step: 0,
      input: null,
      states: [...currentStates]
    }];

    for (let i = 0; i < inputSequence.length; i++) {
      const value = inputSequence[i];
      const nextStates = new Set();

      for (const stateId of currentStates) {
        for (const target of this.getTransitions(stateId, value)) {
          nextStates.add(target);
        }
      }

      currentStates = nextStates;
      trace.push({
        step: i + 1,
        input: value,
        states: [...currentStates]
      });

      if (currentStates.size === 0) break;
    }

    // Accept if any current state is accepting
    const accepted = [...currentStates].some(id => this.isAccepting(id));

    return { accepted, trace };
  }

  /**
   * Get all transitions for visualization
   * @returns {Array<{from: number, to: number, symbol: any}>}
   */
  getAllTransitions() {
    const transitions = [];
    for (const [fromId, state] of this.states) {
      for (const [symbol, targets] of state.transitions) {
        for (const toId of targets) {
          transitions.push({ from: fromId, to: toId, symbol });
        }
      }
    }
    return transitions;
  }

  /**
   * Get state information for visualization
   * @returns {Array<{id: number, isStart: boolean, isAccept: boolean}>}
   */
  getStateInfo() {
    return [...this.states.keys()].map(id => ({
      id,
      isStart: this.startStates.has(id),
      isAccept: this.acceptStates.has(id)
    }));
  }
}

// ============================================
// NFA Builder
// ============================================

/**
 * Builds an NFA by exploring all reachable states from user-defined functions.
 *
 * This implements a state-space exploration algorithm:
 * 1. Start from initial state(s)
 * 2. For each state, try all possible input values
 * 3. Add transitions to resulting states
 * 4. Continue until no new states are discovered
 */
export class NFABuilder {
  /**
   * @param {Object} config - NFA configuration
   * @param {any} config.startState - Initial state value (or array for multiple)
   * @param {Function} config.transition - (state, symbol) => nextState(s)
   * @param {Function} config.accept - (state) => boolean
   * @param {Object} options - Builder options
   * @param {number} options.maxStates - Maximum states before error
   * @param {number} options.maxSymbols - Maximum symbol value to explore
   */
  constructor(config, options = {}) {
    this.startState = config.startState;
    this.transitionFn = config.transition;
    this.acceptFn = config.accept;
    this.maxStates = options.maxStates || DEFAULT_MAX_STATES;
    this.maxSymbols = options.maxSymbols || DEFAULT_MAX_SYMBOLS;
  }

  /**
   * Build and return the NFA
   * @returns {NFA}
   * @throws {Error} If state limit is exceeded or state is invalid
   */
  build() {
    const nfa = new NFA();

    // Maps for state serialization (user values <-> NFA IDs)
    const stateStrToId = new Map();
    const idToStateStr = new Map();

    /**
     * Add a state to the NFA, returning existing ID if already added
     */
    const addState = (stateStr) => {
      if (stateStrToId.has(stateStr)) {
        return stateStrToId.get(stateStr);
      }

      const id = nfa.addState();
      stateStrToId.set(stateStr, id);
      idToStateStr.set(id, stateStr);

      // Check if this state is accepting
      const stateValue = this._deserializeState(stateStr);
      if (this.acceptFn(stateValue)) {
        nfa.setAccept(id);
      }

      return id;
    };

    // Initialize with start states
    const stack = [];
    const startStates = this._normalizeToArray(this.startState);

    for (const startState of startStates) {
      const stateStr = this._serializeState(startState);
      const id = addState(stateStr);
      nfa.setStart(id);
      stack.push(id);
    }

    // Explore all reachable states using DFS
    const visited = new Set();

    while (stack.length > 0) {
      if (nfa.numStates() > this.maxStates) {
        throw new Error(`NFA exceeded maximum state limit (${this.maxStates}). Consider simplifying your state machine.`);
      }

      const currentId = stack.pop();
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const stateStr = idToStateStr.get(currentId);
      const stateValue = this._deserializeState(stateStr);

      // Try all possible input symbols
      for (let symbol = 1; symbol <= this.maxSymbols; symbol++) {
        const nextStates = this._normalizeToArray(this.transitionFn(stateValue, symbol));

        for (const nextState of nextStates) {
          if (nextState === undefined) continue;

          const nextStateStr = this._serializeState(nextState);
          const nextId = addState(nextStateStr);
          nfa.addTransition(currentId, nextId, symbol);

          if (!visited.has(nextId)) {
            stack.push(nextId);
          }
        }
      }
    }

    // Store state labels for visualization
    nfa.stateLabels = idToStateStr;

    return nfa;
  }

  /**
   * Normalize a value to an array (handles single values, arrays, undefined)
   * @private
   */
  _normalizeToArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined) return [];
    return [value];
  }

  /**
   * Serialize a state value to a string for use as map key
   * @private
   */
  _serializeState(state) {
    if (Array.isArray(state)) {
      throw new Error('State cannot be an array (arrays are reserved for multiple states)');
    }
    return JSON.stringify(state);
  }

  /**
   * Deserialize a state string back to its original value
   * @private
   */
  _deserializeState(stateStr) {
    return JSON.parse(stateStr);
  }
}

// ============================================
// Code Parsing Utilities
// ============================================

/**
 * Parse and compile user-provided JavaScript code into an NFA config object.
 *
 * The code should define:
 * - startState: initial state value
 * - transition(state, symbol): returns next state(s)
 * - accept(state): returns true if accepting
 *
 * @param {string} code - User's JavaScript code
 * @returns {{startState: any, transition: Function, accept: Function}}
 * @throws {Error} If code is invalid or missing required definitions
 */
export function parseNFAConfig(code) {
  const wrappedCode = `
    ${code}
    return { startState, transition, accept };
  `;

  try {
    const fn = new Function(wrappedCode);
    const result = fn();

    // Validate required definitions
    if (result.startState === undefined) {
      throw new Error('startState is not defined');
    }
    if (typeof result.transition !== 'function') {
      throw new Error('transition must be a function');
    }
    if (typeof result.accept !== 'function') {
      throw new Error('accept must be a function');
    }

    return result;
  } catch (e) {
    throw new Error(`Code error: ${e.message}`);
  }
}

/**
 * Build unified code string from split input components
 *
 * @param {string} startStateCode - The startState expression
 * @param {string} transitionBody - Body of the transition function
 * @param {string} acceptBody - Body of the accept function
 * @returns {string} Complete code string
 */
export function buildCodeFromSplit(startStateCode, transitionBody, acceptBody) {
  const indentedTransition = transitionBody
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');

  const indentedAccept = acceptBody
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');

  return `startState = ${startStateCode};

function transition(state, symbol) {
${indentedTransition}
}

function accept(state) {
${indentedAccept}
}`;
}

/**
 * Parse unified code back into split components
 *
 * @param {string} code - Unified code string
 * @returns {{startState: string, transitionBody: string, acceptBody: string}}
 */
export function parseSplitFromCode(code) {
  const result = {
    startState: '',
    transitionBody: '',
    acceptBody: ''
  };

  // Extract startState assignment
  const startMatch = code.match(/startState\s*=\s*(.+?);/);
  if (startMatch) {
    result.startState = startMatch[1].trim();
  }

  // Extract transition function body
  const transitionMatch = code.match(
    /function\s+transition\s*\(\s*state\s*,\s*symbol\s*\)\s*\{([\s\S]*?)\n\}/
  );
  if (transitionMatch) {
    result.transitionBody = transitionMatch[1]
      .split('\n')
      .map(line => line.replace(/^  /, ''))
      .join('\n')
      .trim();
  }

  // Extract accept function body
  const acceptMatch = code.match(
    /function\s+accept\s*\(\s*state\s*\)\s*\{([\s\S]*?)\n?\}$/
  );
  if (acceptMatch) {
    result.acceptBody = acceptMatch[1]
      .split('\n')
      .map(line => line.replace(/^  /, ''))
      .join('\n')
      .trim();
  }

  return result;
}
