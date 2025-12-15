/**
 * Tests for nfa_view.js - NFAView class
 */

import { test, describe, assert } from './test_utils.js';
import { NFA, StateTransformation } from '../js/nfa.js';
import { NFAView } from '../js/nfa_view.js';

/**
 * Helper to create a simple NFA for testing
 * @param {string[]} symbols
 * @returns {NFA}
 */
function createTestNFA(symbols = ['a', 'b']) {
  return new NFA(symbols);
}

// =============================================================================
// NFAView Tests
// =============================================================================

describe('NFAView', () => {
  describe('constructor', () => {
    test('stores nfa and transform', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      const transform = StateTransformation.identity(1);
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.nfa, nfa);
      assert.strictEqual(view.transform, transform);
    });

    test('computes mergedSources on construction', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      assert(view.mergedSources instanceof Map);
      assert.strictEqual(view.mergedSources.size, 2);
    });
  });

  describe('mergedSources', () => {
    test('maps each state to itself with identity transform', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      const transform = StateTransformation.identity(3);
      const view = new NFAView(nfa, transform);

      assert.deepStrictEqual(view.mergedSources.get(0), [0]);
      assert.deepStrictEqual(view.mergedSources.get(1), [1]);
      assert.deepStrictEqual(view.mergedSources.get(2), [2]);
    });

    test('groups merged states under canonical state', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      // q1 and q2 merge into q1
      const transform = new StateTransformation(new Int32Array([0, 1, 1]));
      const view = new NFAView(nfa, transform);

      assert.deepStrictEqual(view.mergedSources.get(0), [0]);
      assert.deepStrictEqual(view.mergedSources.get(1), [1, 2]);
      assert.strictEqual(view.mergedSources.has(2), false);
    });

    test('excludes deleted states', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      const transform = StateTransformation.deletion(3, new Set([1]));
      const view = new NFAView(nfa, transform);

      assert.deepStrictEqual(view.mergedSources.get(0), [0]);
      assert.strictEqual(view.mergedSources.has(1), false);
      assert.deepStrictEqual(view.mergedSources.get(2), [2]);
    });
  });

  describe('isCanonical()', () => {
    test('returns true for states that map to themselves', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isCanonical(0), true);
      assert.strictEqual(view.isCanonical(1), true);
    });

    test('returns false for merged states', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      // q2 merges into q1
      const transform = new StateTransformation(new Int32Array([0, 1, 1]));
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isCanonical(0), true);
      assert.strictEqual(view.isCanonical(1), true);
      assert.strictEqual(view.isCanonical(2), false);
    });

    test('returns false for deleted states', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      const transform = StateTransformation.deletion(2, new Set([1]));
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isCanonical(0), true);
      assert.strictEqual(view.isCanonical(1), false);
    });
  });

  describe('getCanonical()', () => {
    test('returns state ID for identity transform', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.getCanonical(0), 0);
      assert.strictEqual(view.getCanonical(1), 1);
    });

    test('returns canonical state for merged states', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      // q2 merges into q1
      const transform = new StateTransformation(new Int32Array([0, 1, 1]));
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.getCanonical(0), 0);
      assert.strictEqual(view.getCanonical(1), 1);
      assert.strictEqual(view.getCanonical(2), 1);
    });

    test('returns -1 for deleted states', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      const transform = StateTransformation.deletion(2, new Set([1]));
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.getCanonical(0), 0);
      assert.strictEqual(view.getCanonical(1), -1);
    });
  });

  describe('isMergedState()', () => {
    test('returns false for states with single source', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isMergedState(0), false);
      assert.strictEqual(view.isMergedState(1), false);
    });

    test('returns true for states with multiple sources', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      // q1 and q2 merge into q1
      const transform = new StateTransformation(new Int32Array([0, 1, 1]));
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isMergedState(0), false);
      assert.strictEqual(view.isMergedState(1), true);
    });

    test('returns false for non-canonical states', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      const transform = new StateTransformation(new Int32Array([0, 1, 1]));
      const view = new NFAView(nfa, transform);

      // q2 is not canonical, so it's not in mergedSources
      assert.strictEqual(view.isMergedState(2), false);
    });
  });

  describe('getStats()', () => {
    test('returns correct stats for simple NFA', () => {
      const nfa = createTestNFA();
      nfa.addState();      // q0 - start
      const s1 = nfa.addState();  // q1 - accept
      nfa.addAccept(s1);
      nfa.addState();      // q2
      nfa.addStart(0);
      const transform = StateTransformation.identity(3);
      const view = new NFAView(nfa, transform);

      const stats = view.getStats();
      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.start, 1);
      assert.strictEqual(stats.accept, 1);
    });

    test('counts only canonical states', () => {
      const nfa = createTestNFA();
      nfa.addState();      // q0
      nfa.addState();      // q1
      nfa.addState();      // q2
      // q2 merges into q1
      const transform = new StateTransformation(new Int32Array([0, 1, 1]));
      const view = new NFAView(nfa, transform);

      const stats = view.getStats();
      assert.strictEqual(stats.total, 2);
    });

    test('excludes deleted states from count', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      const transform = StateTransformation.deletion(3, new Set([1]));
      const view = new NFAView(nfa, transform);

      const stats = view.getStats();
      assert.strictEqual(stats.total, 2);
    });
  });

  describe('getTransitionsFrom()', () => {
    test('returns empty map for state with no transitions', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      const transform = StateTransformation.identity(1);
      const view = new NFAView(nfa, transform);

      const transitions = view.getTransitionsFrom(0);
      assert.strictEqual(transitions.size, 0);
    });

    test('returns transitions mapped to canonical targets', () => {
      const nfa = createTestNFA(['a', 'b']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addTransition(0, 1, 0); // q0 --a--> q1
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      const transitions = view.getTransitionsFrom(0);
      assert.strictEqual(transitions.size, 1);
      assert(transitions.has(1));
      assert.deepStrictEqual(transitions.get(1), ['a']);
    });

    test('merges transitions to same canonical target', () => {
      const nfa = createTestNFA(['a', 'b']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      nfa.addTransition(0, 1, 0); // q0 --a--> q1
      nfa.addTransition(0, 2, 1); // q0 --b--> q2
      // q2 merges into q1
      const transform = new StateTransformation(new Int32Array([0, 1, 1]));
      const view = new NFAView(nfa, transform);

      const transitions = view.getTransitionsFrom(0);
      assert.strictEqual(transitions.size, 1);
      assert(transitions.has(1));
      assert.deepStrictEqual(transitions.get(1), ['a', 'b']);
    });

    test('excludes transitions to deleted states', () => {
      const nfa = createTestNFA(['a', 'b']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      nfa.addTransition(0, 1, 0); // q0 --a--> q1
      nfa.addTransition(0, 2, 1); // q0 --b--> q2
      const transform = StateTransformation.deletion(3, new Set([2]));
      const view = new NFAView(nfa, transform);

      const transitions = view.getTransitionsFrom(0);
      assert.strictEqual(transitions.size, 1);
      assert(transitions.has(1));
      assert.deepStrictEqual(transitions.get(1), ['a']);
    });

    test('returns symbols sorted by alphabet order', () => {
      const nfa = createTestNFA(['a', 'b', 'c']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addTransition(0, 1, 2); // q0 --c--> q1
      nfa.addTransition(0, 1, 0); // q0 --a--> q1
      nfa.addTransition(0, 1, 1); // q0 --b--> q1
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      const transitions = view.getTransitionsFrom(0);
      assert.deepStrictEqual(transitions.get(1), ['a', 'b', 'c']);
    });

    test('handles self-loops', () => {
      const nfa = createTestNFA(['a']);
      nfa.addState(); // q0
      nfa.addTransition(0, 0, 0); // q0 --a--> q0
      const transform = StateTransformation.identity(1);
      const view = new NFAView(nfa, transform);

      const transitions = view.getTransitionsFrom(0);
      assert.strictEqual(transitions.size, 1);
      assert(transitions.has(0));
      assert.deepStrictEqual(transitions.get(0), ['a']);
    });
  });

  describe('isDeterministic()', () => {
    test('returns true for deterministic machine', () => {
      const nfa = createTestNFA(['a', 'b']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addStart(0);
      nfa.addTransition(0, 1, 0); // q0 --a--> q1
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isDeterministic(), true);
    });

    test('returns false for multiple transitions on same symbol', () => {
      const nfa = createTestNFA(['a', 'b']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addState(); // q2
      nfa.addStart(0);
      nfa.addTransition(0, 1, 0); // q0 --a--> q1
      nfa.addTransition(0, 2, 0); // q0 --a--> q2
      const transform = StateTransformation.identity(3);
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isDeterministic(), false);
    });

    test('returns false for multiple start states', () => {
      const nfa = createTestNFA(['a', 'b']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addStart(0);
      nfa.addStart(1);
      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform);

      assert.strictEqual(view.isDeterministic(), false);
    });

    test('returns false if epsilon transitions exist (when shown)', () => {
      const nfa = createTestNFA(['a', 'b']);
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.addStart(0);
      nfa.addEpsilonTransition(0, 1);

      nfa.enforceEpsilonTransitions();

      const transform = StateTransformation.identity(2);
      const view = new NFAView(nfa, transform, { showEpsilonTransitions: true });

      assert.strictEqual(view.isDeterministic(), false);
    });
  });

  describe('getStateInfo() with raw epsilon view', () => {
    test('start state stays live if epsilon closure reaches live path', () => {
      const nfa = createTestNFA(['a']);
      const s0 = nfa.addState(); // start
      const s1 = nfa.addState(); // via epsilon
      const s2 = nfa.addState(); // accept
      nfa.addAccept(s2);

      nfa.addStart(s0);
      nfa.addEpsilonTransition(s0, s1);
      nfa.addTransition(s1, s2, 0);

      // Calculate epsilon closure info
      nfa.enforceEpsilonTransitions();

      const transform = StateTransformation.identity(3);
      const view = new NFAView(nfa, transform, { showEpsilonTransitions: true });

      const info = view.getStateInfo();
      const startInfo = info.find(s => s.id === s0);
      assert(startInfo.isStart);
      assert.strictEqual(startInfo.isDead, false);
    });
  });

  describe('getResolvedSources', () => {
    test('returns sources for simple identity transform', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.stateLabels[0] = 'q0';
      const transform = StateTransformation.identity(1);
      const view = new NFAView(nfa, transform);

      const sources = view.getResolvedSources(0);
      assert.strictEqual(sources.length, 1);
      assert.strictEqual(sources[0].id, 0);
      assert.strictEqual(sources[0].label, 'q0');
    });

    test('returns multiple sources for merged states', () => {
      const nfa = createTestNFA();
      nfa.addState(); // q0
      nfa.addState(); // q1
      nfa.stateLabels[0] = 'q0';
      nfa.stateLabels[1] = 'q1';

      // Map both to 0
      const transform = new StateTransformation([0, 0]);
      const view = new NFAView(nfa, transform);

      const sources = view.getResolvedSources(0);
      assert.strictEqual(sources.length, 2);
      // Order depends on implementation, but usually insertion order or sorted
      const ids = sources.map(s => s.id).sort();
      assert.deepStrictEqual(ids, [0, 1]);
    });

    test('resolves sources through parentNfa', () => {
      const baseNfa = createTestNFA();
      baseNfa.addState(); // 0
      baseNfa.addState(); // 1
      baseNfa.addState(); // 2
      baseNfa.stateLabels = ['A', 'B', 'C'];

      const derivedNfa = createTestNFA();
      derivedNfa.addState(); // 0
      derivedNfa.parentNfa = baseNfa;
      // State 0 in derived NFA represents {0, 2} from base NFA
      derivedNfa.stateLabels[0] = '0,2';

      const transform = StateTransformation.identity(1);
      const view = new NFAView(derivedNfa, transform);

      const sources = view.getResolvedSources(0);
      assert.strictEqual(sources.length, 2);

      assert.strictEqual(sources[0].id, 0);
      assert.strictEqual(sources[0].label, 'A');

      assert.strictEqual(sources[1].id, 2);
      assert.strictEqual(sources[1].label, 'C');
    });
  });
});
