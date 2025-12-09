/**
 * NFA Builder and Parsing Utilities
 *
 * This module provides:
 * - NFABuilder for constructing NFAs from JavaScript function definitions
 * - Helper functions for parsing user code
 * - Symbol class expansion utilities
 *
 * @module nfa_builder
 */

import { canonicalJSON } from './util.js';
import { NFA, DEFAULT_SYMBOL_CLASS } from './nfa.js';

// ============================================
// Constants
// ============================================

/** Default maximum number of states before throwing an error */
const DEFAULT_MAX_STATES = 1000;

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
   * @param {Function} [config.epsilon] - (state) => nextState(s) for epsilon transitions
   * @param {Object} options - Builder options
   * @param {number} options.maxStates - Maximum states before error
   * @param {Array} options.symbols - Array of symbols to explore
   */
  constructor(config, options = {}) {
    this.startState = config.startState;
    this.transitionFn = config.transition;
    this.acceptFn = config.accept;
    this.epsilonFn = config.epsilon || null;
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
    const wrappedEpsilon = this.epsilonFn ? this._wrapEpsilonFn(this.epsilonFn) : null;

    // Cache epsilon targets (stateStr -> string[])
    // Ensures user epsilon function is called at most once per state
    const epsilonTargetsCache = new Map();
    const getEpsilonTargets = (stateStr) => {
      if (!wrappedEpsilon) return [];
      if (epsilonTargetsCache.has(stateStr)) return epsilonTargetsCache.get(stateStr);
      const targets = wrappedEpsilon(stateStr);
      epsilonTargetsCache.set(stateStr, targets);
      return targets;
    };

    // Cache epsilon closures (stateStr -> Set<stateStr>)
    const epsilonClosureCache = new Map();
    const getEpsilonClosure = (stateStr) => {
      if (!wrappedEpsilon) return new Set([stateStr]);
      if (epsilonClosureCache.has(stateStr)) return epsilonClosureCache.get(stateStr);

      const closure = new Set([stateStr]);
      const stack = [stateStr];
      while (stack.length > 0) {
        const current = stack.pop();
        for (const target of getEpsilonTargets(current)) {
          if (!closure.has(target)) {
            closure.add(target);
            stack.push(target);
          }
        }
      }
      epsilonClosureCache.set(stateStr, closure);
      return closure;
    };

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

      // Explore epsilon transitions
      for (const closureState of getEpsilonTargets(stateStr)) {
        const closureId = addState(closureState);
        if (!visited.has(closureId)) {
          queue.push(closureId);
        }
      }
    }

    // Apply epsilon closure transformations to NFA structure
    if (wrappedEpsilon) {
      // Expand start states to include epsilon closures
      for (const startId of [...nfa.startStates]) {
        const stateStr = idToStateStr.get(startId);
        for (const closureState of getEpsilonClosure(stateStr)) {
          nfa.setStart(stateStrToId.get(closureState));
        }
      }

      // Add transitions to epsilon closure states
      const numStates = nfa.numStates();
      for (let fromId = 0; fromId < numStates; fromId++) {
        for (let symbolIndex = 0; symbolIndex < this.symbols.length; symbolIndex++) {
          for (const toId of nfa.getTransitions(fromId, symbolIndex)) {
            const toStateStr = idToStateStr.get(toId);
            for (const closureState of getEpsilonClosure(toStateStr)) {
              nfa.addTransition(fromId, stateStrToId.get(closureState), symbolIndex);
            }
          }
        }
      }

      // Propagate accept status through epsilon closures
      for (const [stateStr, id] of stateStrToId) {
        for (const closureState of getEpsilonClosure(stateStr)) {
          if (nfa.acceptStates.has(stateStrToId.get(closureState))) {
            nfa.setAccept(id);
            break;
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

  /**
   * Wrap the epsilon function to handle errors and normalize output
   * @private
   */
  _wrapEpsilonFn(fn) {
    return (stateStr) => {
      const stateValue = this._deserializeState(stateStr);
      try {
        const result = fn(stateValue);
        const nextStates = this._normalizeToArray(result);
        return nextStates
          .filter(s => s !== undefined)
          .map(s => this._serializeState(s));
      } catch (err) {
        throw new Error(
          `Epsilon function threw for ${stateStr}: ${err?.message || err}`);
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
 * - epsilon(state): (optional) returns epsilon-reachable state(s)
 *
 * @param {string} code - User's JavaScript code
 * @returns {{startState: any, transition: Function, accept: Function, epsilon?: Function}}
 * @throws {Error} If code is invalid or missing required definitions
 */
export function parseNFAConfig(code) {
  // Wrap code in IIFE to isolate scope and prevent global pollution
  const wrappedCode = `
    return (function() {
      var startState, transition, accept, epsilon;
      ${code}
      return { startState, transition, accept, epsilon };
    })();
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
    // epsilon is optional, but must be a function if defined
    if (result.epsilon !== undefined && typeof result.epsilon !== 'function') {
      throw new Error('epsilon must be a function');
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
 * @param {string} [epsilonBody] - Body of the epsilon function (optional)
 * @returns {string} Complete code string
 */
export function buildCodeFromSplit(startStateCode, transitionBody, acceptBody, epsilonBody) {
  const indentedTransition = transitionBody
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');

  const indentedAccept = acceptBody
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');

  let code = `startState = ${startStateCode};

function transition(state, symbol) {
${indentedTransition}
}

function accept(state) {
${indentedAccept}
}`;

  // Only include epsilon if body is non-empty
  if (epsilonBody && epsilonBody.trim()) {
    const indentedEpsilon = epsilonBody
      .split('\n')
      .map(line => '  ' + line)
      .join('\n');

    code += `

function epsilon(state) {
${indentedEpsilon}
}`;
  }

  return code;
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
 * @returns {{startState: string, transitionBody: string, acceptBody: string, epsilonBody: string}}
 */
export function parseSplitFromCode(code) {
  try {
    // Execute the code to get the actual objects
    // epsilon is optional, so check if it's defined after execution
    const parsed = new Function(`
      ${code};
      return {
        startState,
        transition,
        accept,
        epsilon: typeof epsilon !== 'undefined' ? epsilon : undefined
      };
    `)();

    return {
      startState: JSON.stringify(parsed.startState),
      transitionBody: extractFunctionBody(parsed.transition),
      acceptBody: extractFunctionBody(parsed.accept),
      epsilonBody: parsed.epsilon ? extractFunctionBody(parsed.epsilon) : ''
    };
  } catch {
    // Fallback to empty if code is invalid
    return {
      startState: '',
      transitionBody: '',
      acceptBody: '',
      epsilonBody: ''
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
