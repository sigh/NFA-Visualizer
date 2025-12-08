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
const ALL_SYMBOLS =
  '0123456789' +
  'abcdefghijklmnopqrstuvwxyz' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  '_-+*/.@#$%&!?';

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
    /** @type {Map<number, string>} State ID to label for visualization */
    this.stateLabels = new Map();
  }

  /** Add a new state, returns its ID */
  addState(accepting = false) {
    const id = this._transitions.length;
    this._transitions.push([]);
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

  /** Add a transition from one state to another on a symbol index */
  addTransition(fromState, toState, symbolIndex) {
    const stateTransitions = this._transitions[fromState];
    if (!stateTransitions) return;

    if (!stateTransitions[symbolIndex]) {
      stateTransitions[symbolIndex] = [];
    }
    // Avoid duplicates
    if (!stateTransitions[symbolIndex].includes(toState)) {
      stateTransitions[symbolIndex].push(toState);
    }
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
    const deadStates = this.getDeadStates();
    return this._transitions.map((_, id) => ({
      id,
      isStart: this.startStates.has(id),
      isAccept: this.acceptStates.has(id),
      isDead: deadStates.has(id)
    }));
  }

  /**
   * Create a reversed NFA where all transitions are flipped.
   * Start states become accept states and vice versa.
   * @returns {NFA} A new NFA with reversed transitions
   */
  reverse() {
    const reversed = new NFA(this.symbols);

    // Create same number of states
    for (let i = 0; i < this._transitions.length; i++) {
      reversed.addState();
    }

    // Swap start and accept states
    for (const id of this.startStates) {
      reversed.setAccept(id);
    }
    for (const id of this.acceptStates) {
      reversed.setStart(id);
    }

    // Reverse all transitions
    for (let fromId = 0; fromId < this._transitions.length; fromId++) {
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
   */
  getDeadStates() {
    const numStates = this._transitions.length;
    if (numStates === 0) return new Set();

    // In the reversed NFA, states reachable from start (= original accept)
    // are exactly those that can reach accept in the original
    const canReachAccept = this.reverse().getReachableStates();

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
    const nfa = new NFA(this.symbols);

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

      // Try all configured symbols (using index for efficient storage)
      for (let symbolIndex = 0; symbolIndex < this.symbols.length; symbolIndex++) {
        const symbol = this.symbols[symbolIndex];
        const nextStateStrs = wrappedTransition(stateStr, symbol);

        for (const nextStateStr of nextStateStrs) {
          const nextId = addState(nextStateStr);
          nfa.addTransition(currentId, nextId, symbolIndex);

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
   * Wrap the transition function to handle errors and normalize output.
   * Converts digit strings to Numbers for user-facing API compatibility.
   * @private
   */
  _wrapTransitionFn(fn) {
    return (stateStr, symbol) => {
      const stateValue = this._deserializeState(stateStr);
      // Convert digit strings to numbers for user function
      const userSymbol = symbol >= '0' && symbol <= '9' ? Number(symbol) : symbol;
      try {
        const result = fn(stateValue, userSymbol);
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
 * Uses JavaScript's regex engine to extract matching characters from ALL_SYMBOLS.
 *
 * @param {string} charClass - Character class content (without brackets), e.g. "1-9", "a-zA-Z0-9_"
 * @returns {string[]} Array of matching symbol strings
 * @throws {Error} If the character class pattern is invalid
 */
export function expandSymbolClass(charClass) {
  if (!charClass || charClass.trim() === '') {
    throw new Error('Symbol class cannot be empty');
  }

  try {
    const regex = new RegExp(`[${charClass}]`, 'g');
    const matches = ALL_SYMBOLS.match(regex);

    if (!matches || matches.length === 0) {
      throw new Error(`No symbols match the pattern [${charClass}]`);
    }

    return matches;
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
 * Parse unified code back into split components.
 *
 * Uses execution-based parsing for robustness:
 * 1. Execute the code to get actual JS objects
 * 2. Extract function bodies from the compiled functions
 * 3. Serialize startState back to code
 *
 * @param {string} code - Unified code string
 * @returns {{startState: string, transitionBody: string, acceptBody: string}}
 */
export function parseSplitFromCode(code) {
  try {
    // Execute the code to get the actual objects
    const parsed = new Function(`${code}; return { startState, transition, accept };`)();

    return {
      startState: JSON.stringify(parsed.startState),
      transitionBody: extractFunctionBody(parsed.transition),
      acceptBody: extractFunctionBody(parsed.accept)
    };
  } catch {
    // Fallback to empty if code is invalid
    return {
      startState: '',
      transitionBody: '',
      acceptBody: ''
    };
  }
}

/**
 * Extract function body text from a function object.
 * Removes the 2-space base indent that buildCodeFromSplit adds.
 */
function extractFunctionBody(fn) {
  const source = fn.toString();
  // Find the opening brace and closing brace
  const start = source.indexOf('{') + 1;
  const end = source.lastIndexOf('}');
  if (start === 0 || end === -1) return '';

  // Extract body and remove leading/trailing whitespace
  let body = source.slice(start, end);

  // Remove leading newline if present
  if (body.startsWith('\n')) body = body.slice(1);
  // Remove trailing newline if present
  if (body.endsWith('\n')) body = body.slice(0, -1);

  // Remove 2-space base indent from each line
  return body.replace(/^ {2}/gm, '');
}
