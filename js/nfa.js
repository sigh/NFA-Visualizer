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

import { canonicalJSON } from './util.js';

// ============================================
// Constants
// ============================================

/** Default maximum number of states before throwing an error */
const DEFAULT_MAX_STATES = 1000;

/** Default symbol class (regex character class syntax) */
export const DEFAULT_SYMBOL_CLASS = '1-9';

/**
 * Full set of symbols the app can use.
 * Includes digits, letters, and common punctuation.
 */
const ALL_SYMBOLS = [
  // Digits 0-9
  ...'0123456789',
  // Lowercase letters
  ...'abcdefghijklmnopqrstuvwxyz',
  // Uppercase letters
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  // Common punctuation/symbols
  ...'_-+*/.@#$%&!?'
];

// ============================================
// NFA Class
// ============================================

/**
 * Represents a Non-deterministic Finite Automaton.
 * States are identified by sequential numeric IDs.
 */
export class NFA {
  constructor() {
    /** @type {Array<Map<any, Set<number>>>} Transitions per state */
    this._transitions = [];
    /** @type {Set<number>} */
    this.startStates = new Set();
    /** @type {Set<number>} */
    this.acceptStates = new Set();
    /** @type {Map<number, string>} State ID to label for visualization */
    this.stateLabels = new Map();
  }

  /** Add a new state, returns its ID */
  addState(accepting = false) {
    const id = this._transitions.length;
    this._transitions.push(new Map());
    if (accepting) this.acceptStates.add(id);
    return id;
  }

  /** Mark a state as a start state */
  setStart(stateId) {
    this.startStates.add(stateId);
  }

  /** Mark a state as an accepting state */
  setAccept(stateId) {
    this.acceptStates.add(stateId);
  }

  /** Add a transition from one state to another on a symbol */
  addTransition(fromState, toState, symbol) {
    const transitions = this._transitions[fromState];
    if (!transitions) return;

    if (!transitions.has(symbol)) {
      transitions.set(symbol, new Set());
    }
    transitions.get(symbol).add(toState);
  }

  /** Get all states reachable from a state on a given symbol */
  getTransitions(stateId, symbol) {
    const transitions = this._transitions[stateId];
    if (!transitions) return new Set();
    return transitions.get(symbol) || new Set();
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
   * Run the NFA on an input sequence.
   * Returns whether accepted and an execution trace.
   */
  run(inputSequence) {
    let currentStates = new Set(this.startStates);
    const trace = [{ step: 0, input: null, states: [...currentStates] }];

    for (let i = 0; i < inputSequence.length; i++) {
      const symbol = inputSequence[i];
      const nextStates = new Set();

      for (const stateId of currentStates) {
        for (const target of this.getTransitions(stateId, symbol)) {
          nextStates.add(target);
        }
      }

      currentStates = nextStates;
      trace.push({ step: i + 1, input: symbol, states: [...currentStates] });

      if (currentStates.size === 0) break;
    }

    const accepted = [...currentStates].some(id => this.isAccepting(id));
    return { accepted, trace };
  }

  /** Get all transitions for visualization */
  getAllTransitions() {
    const result = [];
    for (let fromId = 0; fromId < this._transitions.length; fromId++) {
      for (const [symbol, targets] of this._transitions[fromId]) {
        for (const toId of targets) {
          result.push({ from: fromId, to: toId, symbol });
        }
      }
    }
    return result;
  }

  /** Get state information for visualization */
  getStateInfo() {
    const deadStates = this.getDeadStates();
    return this._transitions.map((_, id) => ({
      id,
      isStart: this.startStates.has(id),
      isAccept: this.acceptStates.has(id),
      isDead: deadStates.has(id)
    }));
  }

  /**
   * Find all "dead" states - states from which no accept state is reachable.
   * Uses backward reachability: find all states that can reach an accept state.
   */
  getDeadStates() {
    const numStates = this._transitions.length;
    if (numStates === 0) return new Set();

    // Build reverse transition graph
    const reverseTransitions = Array.from({ length: numStates }, () => new Set());
    for (let fromId = 0; fromId < numStates; fromId++) {
      for (const targets of this._transitions[fromId].values()) {
        for (const toId of targets) {
          reverseTransitions[toId].add(fromId);
        }
      }
    }

    // BFS backward from accept states to find all states that can reach accept
    const canReachAccept = new Set(this.acceptStates);
    const queue = [...this.acceptStates];
    let queueHead = 0;

    while (queueHead < queue.length) {
      const stateId = queue[queueHead++];
      for (const fromId of reverseTransitions[stateId]) {
        if (!canReachAccept.has(fromId)) {
          canReachAccept.add(fromId);
          queue.push(fromId);
        }
      }
    }

    // Dead states are those that cannot reach any accept state
    const deadStates = new Set();
    for (let id = 0; id < numStates; id++) {
      if (!canReachAccept.has(id)) {
        deadStates.add(id);
      }
    }

    return deadStates;
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
   * @param {Array} options.symbols - Array of symbols to explore
   */
  constructor(config, options = {}) {
    this.startState = config.startState;
    this.transitionFn = config.transition;
    this.acceptFn = config.accept;
    this.maxStates = options.maxStates || DEFAULT_MAX_STATES;
    this.symbols = options.symbols || expandSymbolClass(DEFAULT_SYMBOL_CLASS);
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

    // Wrap user functions to provide better error messages
    const wrappedAccept = this._wrapAcceptFn(this.acceptFn);
    const wrappedTransition = this._wrapTransitionFn(this.transitionFn);

    /**
     * Add a state to the NFA, returning existing ID if already added
     */
    const addState = (stateStr) => {
      if (stateStrToId.has(stateStr)) {
        return stateStrToId.get(stateStr);
      }

      if (nfa.numStates() >= this.maxStates) {
        throw new Error(`NFA exceeded maximum state limit (${this.maxStates}). Consider simplifying your state machine.`);
      }

      const id = nfa.addState();
      stateStrToId.set(stateStr, id);
      idToStateStr.set(id, stateStr);

      // Check if this state is accepting
      if (wrappedAccept(stateStr)) {
        nfa.setAccept(id);
      }

      return id;
    };

    // Initialize with start states
    // Use array-based queue with head pointer for O(1) dequeue
    const queue = [];
    let queueHead = 0;
    const startStates = this._normalizeToArray(this.startState);

    for (const startState of startStates) {
      const stateStr = this._serializeState(startState);
      const id = addState(stateStr);
      nfa.setStart(id);
      queue.push(id);
    }

    // Explore all reachable states using BFS for nicer state numbering
    const visited = new Set();

    while (queueHead < queue.length) {
      const currentId = queue[queueHead++];
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const stateStr = idToStateStr.get(currentId);

      // Try all configured symbols
      for (const symbol of this.symbols) {
        const nextStateStrs = wrappedTransition(stateStr, symbol);

        for (const nextStateStr of nextStateStrs) {
          const nextId = addState(nextStateStr);
          nfa.addTransition(currentId, nextId, symbol);

          if (!visited.has(nextId)) {
            queue.push(nextId);
          }
        }
      }
    }

    // Store state labels for visualization
    nfa.stateLabels = idToStateStr;

    return nfa;
  }

  /**
   * Wrap the transition function to handle errors and normalize output
   * @private
   */
  _wrapTransitionFn(fn) {
    return (stateStr, symbol) => {
      const stateValue = this._deserializeState(stateStr);
      try {
        const result = fn(stateValue, symbol);
        const nextStates = this._normalizeToArray(result);
        return nextStates
          .filter(s => s !== undefined)
          .map(s => this._serializeState(s));
      } catch (err) {
        throw new Error(
          `Transition function threw for (${stateStr}, ${symbol}): ${err?.message || err}`);
      }
    };
  }

  /**
   * Wrap the accept function to handle errors
   * @private
   */
  _wrapAcceptFn(fn) {
    return (stateStr) => {
      const stateValue = this._deserializeState(stateStr);
      try {
        return !!fn(stateValue);
      } catch (err) {
        throw new Error(
          `Accept function threw for ${stateStr}: ${err?.message || err}`);
      }
    };
  }

  /** Normalize a value to an array */
  _normalizeToArray(value) {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Serialize a state value to a canonical string for use as map key.
   * Objects are serialized with sorted keys for order-independence.
   * @private
   */
  _serializeState(state) {
    if (Array.isArray(state)) {
      throw new Error('State cannot be an array (arrays are reserved for multiple states)');
    }
    return canonicalJSON(state);
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
// Symbol Class Expansion
// ============================================

/**
 * Expand a regex character class pattern into an array of matching symbols.
 * Uses JavaScript's regex engine to test each symbol in ALL_SYMBOLS.
 *
 * @param {string} charClass - Character class content (without brackets), e.g. "1-9", "a-zA-Z0-9_"
 * @returns {Array<string|number>} Array of matching symbols (numbers are returned as numbers)
 * @throws {Error} If the character class pattern is invalid
 */
export function expandSymbolClass(charClass) {
  if (!charClass || charClass.trim() === '') {
    throw new Error('Symbol class cannot be empty');
  }

  try {
    const regex = new RegExp(`^[${charClass}]$`);
    const matches = ALL_SYMBOLS.filter(s => regex.test(String(s)));

    if (matches.length === 0) {
      throw new Error(`No symbols match the pattern [${charClass}]`);
    }

    // Convert numeric strings to numbers for backward compatibility
    return matches.map(s => {
      const num = Number(s);
      return !isNaN(num) && s.match(/^[0-9]$/) ? num : s;
    });
  } catch (e) {
    if (e.message.includes('No symbols match')) throw e;
    throw new Error(`Invalid character class pattern: ${e.message}`);
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
