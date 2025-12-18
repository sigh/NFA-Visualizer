/**
 * Tests for nfa.js - NFA and StateTransformation classes
 */

import { test, describe, assert } from './test_utils.js';
import { NFA, StateTransformation, DEFAULT_SYMBOL_CLASS } from '../js/nfa.js';

// =============================================================================
// StateTransformation Tests
// =============================================================================

describe('StateTransformation', () => {
  describe('identity()', () => {
    test('creates identity mapping for given size', () => {
      const t = StateTransformation.identity(5);
      assert.strictEqual(t.remap.length, 5);
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(t.remap[i], i);
      }
    });

    test('creates empty transformation for size 0', () => {
      const t = StateTransformation.identity(0);
      assert.strictEqual(t.remap.length, 0);
    });
  });

  describe('deletion()', () => {
    test('marks specified states as deleted', () => {
      const deleted = new Set([1, 3]);
      const t = StateTransformation.deletion(5, deleted);
      assert.strictEqual(t.remap[0], 0);
      assert.strictEqual(t.remap[1], -1);
      assert.strictEqual(t.remap[2], 2);
      assert.strictEqual(t.remap[3], -1);
      assert.strictEqual(t.remap[4], 4);
    });

    test('handles empty deletion set', () => {
      const t = StateTransformation.deletion(3, new Set());
      assert.strictEqual(t.remap[0], 0);
      assert.strictEqual(t.remap[1], 1);
      assert.strictEqual(t.remap[2], 2);
    });

    test('handles all states deleted', () => {
      const t = StateTransformation.deletion(3, new Set([0, 1, 2]));
      assert.strictEqual(t.remap[0], -1);
      assert.strictEqual(t.remap[1], -1);
      assert.strictEqual(t.remap[2], -1);
    });
  });

  describe('getDeletedStates()', () => {
    test('returns states marked as deleted', () => {
      const t = StateTransformation.deletion(5, new Set([1, 3]));
      const deleted = t.getDeletedStates();
      assert.strictEqual(deleted.size, 2);
      assert(deleted.has(1));
      assert(deleted.has(3));
    });

    test('returns empty set when no deletions', () => {
      const t = StateTransformation.identity(5);
      const deleted = t.getDeletedStates();
      assert.strictEqual(deleted.size, 0);
    });
  });

  describe('getActiveStates()', () => {
    test('returns non-deleted states', () => {
      const t = StateTransformation.deletion(5, new Set([1, 3]));
      const active = t.getActiveStates();
      assert.deepStrictEqual(active, [0, 2, 4]);
    });

    test('returns all states when no deletions', () => {
      const t = StateTransformation.identity(3);
      const active = t.getActiveStates();
      assert.deepStrictEqual(active, [0, 1, 2]);
    });
  });

  describe('isDeleted()', () => {
    test('returns true for deleted states', () => {
      const t = StateTransformation.deletion(5, new Set([2]));
      assert.strictEqual(t.isDeleted(2), true);
    });

    test('returns false for active states', () => {
      const t = StateTransformation.deletion(5, new Set([2]));
      assert.strictEqual(t.isDeleted(0), false);
      assert.strictEqual(t.isDeleted(4), false);
    });
  });

  describe('getCanonical()', () => {
    test('returns canonical state for merged states', () => {
      // Create transformation where states 1,2,3 all map to 1
      const t = new StateTransformation(new Int32Array([0, 1, 1, 1, 4]));
      assert.strictEqual(t.getCanonical(1), 1);
      assert.strictEqual(t.getCanonical(2), 1);
      assert.strictEqual(t.getCanonical(3), 1);
    });

    test('returns -1 for deleted states', () => {
      const t = StateTransformation.deletion(3, new Set([1]));
      assert.strictEqual(t.getCanonical(1), -1);
    });
  });

  describe('compose()', () => {
    test('composes two transformations correctly', () => {
      // First: delete state 1
      const t1 = StateTransformation.deletion(4, new Set([1]));
      // Second: merge state 3 into state 2
      const t2 = new StateTransformation(new Int32Array([0, -1, 2, 2]));

      const composed = t1.compose(t2);
      assert.strictEqual(composed.remap[0], 0);
      assert.strictEqual(composed.remap[1], -1); // deleted in t1
      assert.strictEqual(composed.remap[2], 2);
      assert.strictEqual(composed.remap[3], 2); // merged via t2
    });

    test('propagates deletions from first transformation', () => {
      const t1 = StateTransformation.deletion(3, new Set([0]));
      const t2 = StateTransformation.identity(3);
      const composed = t1.compose(t2);
      assert.strictEqual(composed.remap[0], -1);
    });

    test('propagates deletions from second transformation', () => {
      const t1 = StateTransformation.identity(3);
      const t2 = StateTransformation.deletion(3, new Set([0]));
      const composed = t1.compose(t2);
      assert.strictEqual(composed.remap[0], -1);
    });
  });
});

// =============================================================================
// NFA Tests
// =============================================================================

describe('NFA', () => {
  describe('constructor', () => {
    test('creates NFA with custom symbols', () => {
      const nfa = new NFA(['a', 'b', 'c']);
      assert.deepStrictEqual(nfa.symbols, ['a', 'b', 'c']);
    });

    test('creates symbol-to-index mapping', () => {
      const nfa = new NFA(['a', 'b', 'c']);
      assert.strictEqual(nfa.getSymbolIndex('a'), 0);
      assert.strictEqual(nfa.getSymbolIndex('b'), 1);
      assert.strictEqual(nfa.getSymbolIndex('c'), 2);
    });

    test('initializes empty state collections', () => {
      const nfa = new NFA(['a']);
      assert.strictEqual(nfa.numStates(), 0);
      assert.strictEqual(nfa.startStates.size, 0);
      assert.strictEqual(nfa.acceptStates.size, 0);
    });
  });

  describe('clone()', () => {
    test('deep-copies transitions and epsilon transitions', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState('s0');
      const s1 = nfa.addState('s1');
      const s2 = nfa.addState('s2');
      nfa.addStart(s0);
      nfa.addAccept(s2);
      nfa.addTransition(s0, s1, 0);
      nfa.addEpsilonTransition(s1, s2);

      const cloned = nfa.clone();
      assert.notStrictEqual(cloned, nfa);
      assert.deepStrictEqual(cloned.symbols, nfa.symbols);
      assert.deepStrictEqual(cloned.stateLabels, nfa.stateLabels);
      assert.deepStrictEqual([...cloned.startStates], [...nfa.startStates]);
      assert.deepStrictEqual([...cloned.acceptStates], [...nfa.acceptStates]);
      assert.deepStrictEqual(cloned.getTransitions(s0, 0), nfa.getTransitions(s0, 0));
      assert(cloned.epsilonTransitions.get(s1).has(s2));

      // Mutating the clone should not affect the original
      cloned.addTransition(s0, s2, 0);
      assert(!nfa.getTransitions(s0, 0).includes(s2));

      cloned.addEpsilonTransition(s0, s2);
      assert(!nfa.epsilonTransitions.get(s0));
    });
  });

  describe('addState()', () => {
    test('adds state with default label', () => {
      const nfa = new NFA(['a']);
      const id = nfa.addState();
      assert.strictEqual(id, 0);
      assert.strictEqual(nfa.numStates(), 1);
      assert.strictEqual(nfa.stateLabels[id], '0');
    });

    test('adds state with custom label', () => {
      const nfa = new NFA(['a']);
      const id = nfa.addState('myState');
      assert.strictEqual(id, 0);
      assert.strictEqual(nfa.stateLabels[id], 'myState');
    });

    test('assigns sequential IDs', () => {
      const nfa = new NFA(['a']);
      assert.strictEqual(nfa.addState(), 0);
      assert.strictEqual(nfa.addState(), 1);
      assert.strictEqual(nfa.addState(), 2);
    });
  });

  describe('setStart()', () => {
    test('sets state as start state', () => {
      const nfa = new NFA(['a']);
      const id = nfa.addState();
      assert.strictEqual(nfa.addStart(id), true);
      assert(nfa.isStart(id));
      assert.strictEqual(nfa.addStart(id), false);
    });

    test('allows multiple start states', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      assert.strictEqual(nfa.addStart(s0), true);
      assert.strictEqual(nfa.addStart(s1), true);
      assert(nfa.isStart(s0));
      assert(nfa.isStart(s1));
    });
  });

  describe('setAccept()', () => {
    test('sets state as accepting', () => {
      const nfa = new NFA(['a']);
      const id = nfa.addState();
      assert(!nfa.isAccepting(id));
      assert.strictEqual(nfa.addAccept(id), true);
      assert(nfa.isAccepting(id));
      assert.strictEqual(nfa.addAccept(id), false);
    });
  });

  describe('addTransition() and getTransitions()', () => {
    test('adds and retrieves transitions', () => {
      const nfa = new NFA(['a', 'b']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      assert.strictEqual(nfa.addTransition(s0, s1, 0), true); // on 'a'

      const targets = nfa.getTransitions(s0, 0);
      assert(targets.includes(s1));
      assert.strictEqual(nfa.addTransition(s0, s1, 0), false);
    });

    test('supports multiple transitions on same symbol', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s0, s2, 0);

      const targets = nfa.getTransitions(s0, 0);
      assert(targets.includes(s1));
      assert(targets.includes(s2));
    });

    test('returns empty array for no transitions', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const targets = nfa.getTransitions(s0, 0);
      assert.deepStrictEqual(targets, []);
    });
  });

  describe('getAllTransitions()', () => {
    test('returns all transitions in NFA', () => {
      const nfa = new NFA(['a', 'b']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s1, s0, 1);

      const all = nfa.getAllTransitions();
      assert.strictEqual(all.length, 2);
    });
  });

  describe('getTransitionsFrom()', () => {
    test('returns all transitions from a state grouped by target', () => {
      const nfa = new NFA(['a', 'b']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addTransition(s0, s1, 0); // s0 --a--> s1
      nfa.addTransition(s0, s1, 1); // s0 --b--> s1

      const trans = nfa.getTransitionsFrom(s0);
      assert.strictEqual(trans.length, 1); // grouped by target
      assert.strictEqual(trans[0].to, s1);
      assert.strictEqual(trans[0].symbols.length, 2);
    });
  });

  describe('run()', () => {
    test('accepts matching input', () => {
      // Simple NFA: accepts strings ending in 'a'
      const nfa = new NFA(['a', 'b']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);
      nfa.addTransition(s0, s0, 0); // a -> stay
      nfa.addTransition(s0, s0, 1); // b -> stay
      nfa.addTransition(s0, s1, 0); // a -> accept

      // run() takes array of symbol arrays (each step can have multiple symbols)
      const result = nfa.run([['a']]); // single 'a'
      assert(result.accepted);
    });

    test('rejects non-matching input', () => {
      const nfa = new NFA(['a', 'b']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0); // only accept on 'a'

      const result = nfa.run([['b']]); // 'b'
      assert(!result.accepted);
    });

    test('trace records correct state history', () => {
      const nfa = new NFA(['a', 'b']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();

      nfa.addStart(s0);
      // s0 --a--> s1 --b--> s2
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s1, s2, 1);

      const result = nfa.run([['a'], ['b']]);

      assert.strictEqual(result.trace.length, 3);

      assert.deepStrictEqual(result.trace[0], {
        step: 0,
        input: null,
        states: [s0]
      });

      assert.deepStrictEqual(result.trace[1], {
        step: 1,
        input: ['a'],
        states: [s1]
      });

      assert.deepStrictEqual(result.trace[2], {
        step: 2,
        input: ['b'],
        states: [s2]
      });
    });

    test('accepts empty input if start state is accepting', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      nfa.addAccept(s0);
      nfa.addStart(s0);

      const result = nfa.run([]);
      assert(result.accepted);
      assert.strictEqual(result.trace.length, 1);
      assert.deepStrictEqual(result.trace[0].states, [s0]);
    });

    test('uses epsilon closure for empty input (without enforcement)', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addStart(s0);
      nfa.addAccept(s1);
      // s0 --epsilon--> s1
      nfa.addEpsilonTransition(s0, s1);

      const result = nfa.run([]);
      assert(result.accepted);
      assert.deepStrictEqual(new Set(result.trace[0].states), new Set([s0, s1]));
    });

    test('applies epsilon closure after each step (without enforcement)', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();
      nfa.addStart(s0);
      nfa.addAccept(s2);
      // s0 --a--> s1
      nfa.addTransition(s0, s1, 0);
      // s1 --epsilon--> s2
      nfa.addEpsilonTransition(s1, s2);

      const result = nfa.run([['a']]);
      assert(result.accepted);
      assert.deepStrictEqual(new Set(result.trace[1].states), new Set([s1, s2]));
    });

    test('handles cycles correctly', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);
      // s0 --a--> s1 --a--> s0
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s1, s0, 0);

      // 'aaa' -> s0 -> s1 -> s0 -> s1 (accept)
      const result = nfa.run([['a'], ['a'], ['a']]);
      assert(result.accepted);
      assert.strictEqual(result.trace.length, 4);
      assert.deepStrictEqual(result.trace[3].states, [s1]);
    });

    test('handles multiple symbols in one step', () => {
      const nfa = new NFA(['a', 'b']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);
      // s0 --a--> s1
      // s0 --b--> s1
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s0, s1, 1);

      // Input step contains both 'a' and 'b', should follow both transitions
      const result = nfa.run([['a', 'b']]);
      assert(result.accepted);
      assert.deepStrictEqual(result.trace[1].states, [s1]);
    });

    test('trace handles non-determinism', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();

      nfa.addStart(s0);
      // s0 --a--> s1
      // s0 --a--> s2
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s0, s2, 0);

      const result = nfa.run([['a']]);

      assert.strictEqual(result.trace.length, 2);
      const states = result.trace[1].states.sort((a, b) => a - b);
      assert.deepStrictEqual(states, [s1, s2].sort((a, b) => a - b));
    });

    test('trace stops early if no states remain', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      nfa.addStart(s0);
      // No transitions

      const result = nfa.run([['a'], ['a']]);

      // Should have step 0 (start) and step 1 (empty), then break
      assert.strictEqual(result.trace.length, 2);
      assert.deepStrictEqual(result.trace[1].states, []);
    });
  });

  describe('reverse()', () => {
    test('reverses transitions', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0);

      const reversed = nfa.reverse();
      // In reversed: s1 is start, s0 is accept, transition s1 -> s0
      assert(reversed.startStates.has(s1));
      assert(reversed.acceptStates.has(s0));
      assert(reversed.getTransitions(s1, 0).includes(s0));
    });

    test('swaps start and accept states', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);

      const reversed = nfa.reverse();
      assert(reversed.isStart(s1));
      assert(reversed.isAccepting(s0));
    });

    test('reverses epsilon transitions', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addStart(s0);
      nfa.addAccept(s1);
      nfa.addEpsilonTransition(s0, s1);

      const reversed = nfa.reverse();
      const epsFromS1 = reversed.epsilonTransitions.get(s1);
      assert(epsFromS1);
      assert(epsFromS1.has(s0));
    });
  });

  describe('getReachableStates()', () => {
    test('finds all reachable states', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState(); // unreachable
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0);

      const reachable = nfa.getReachableStates();
      assert(reachable.has(s0));
      assert(reachable.has(s1));
      assert(!reachable.has(s2));
    });

    test('includes start states', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      nfa.addStart(s0);

      const reachable = nfa.getReachableStates();
      assert(reachable.has(s0));
    });

    test('traverses epsilon transitions', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addStart(s0);
      nfa.addEpsilonTransition(s0, s1);

      const reachable = nfa.getReachableStates();
      assert(reachable.has(s0));
      assert(reachable.has(s1));
    });
  });

  describe('getDeadStates()', () => {
    test('finds states that cannot reach accept', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      const s2 = nfa.addState(); // dead - no transitions out
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s0, s2, 0);

      const dead = nfa.getDeadStates();
      assert(dead.isDeleted(s2));
      assert(!dead.isDeleted(s0));
      assert(!dead.isDeleted(s1));
    });

    test('returns empty set when all states can reach accept', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0);

      const dead = nfa.getDeadStates();
      assert.strictEqual(dead.getDeletedStates().size, 0);
    });

    test('treats epsilon-only path to accept as not dead', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();

      nfa.addStart(s0);
      nfa.addAccept(s1);
      // s0 --epsilon--> s1 (so s0 can reach accept)
      nfa.addEpsilonTransition(s0, s1);
      // s2 is dead

      const dead = nfa.getDeadStates();
      assert(!dead.isDeleted(s0));
      assert(!dead.isDeleted(s1));
      assert(dead.isDeleted(s2));
    });

  });

  describe('getEpsilonClosure()', () => {
    test('computes and caches closure', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();

      nfa.addEpsilonTransition(s0, s1);
      const c1 = nfa.getEpsilonClosure(s0);
      assert(c1.has(s0));
      assert(c1.has(s1));
      assert(!c1.has(s2));

      const c2 = nfa.getEpsilonClosure(s0);
      assert.strictEqual(c1, c2); // cached
    });

    test('throws if epsilon graph is mutated after closure is computed', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();

      nfa.addEpsilonTransition(s0, s1);
      nfa.getEpsilonClosure(s0);

      assert.throws(() => nfa.addEpsilonTransition(s1, s2), /Cannot add epsilon transition/);
    });

    test('enforceEpsilonTransitions() clears explicit epsilon transitions', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();

      nfa.addStart(s0);
      nfa.addEpsilonTransition(s0, s1);
      nfa.enforceEpsilonTransitions();

      assert.strictEqual(nfa.epsilonTransitions.size, 0);
      assert(nfa.isStart(s1));
    });

    test('throws if epsilon graph is mutated after enforceEpsilonTransitions()', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();
      nfa.addEpsilonTransition(s0, s1);
      nfa.enforceEpsilonTransitions();

      assert.throws(() => nfa.addEpsilonTransition(s1, s2), /Cannot add epsilon transition/);
    });
  });

  describe('getEquivalentStateRemap()', () => {
    test('merges equivalent states', () => {
      // Two states with identical behavior should be merged
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      const s2 = nfa.addState(); // equivalent to s1
      nfa.addAccept(s2);
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0);
      nfa.addTransition(s0, s2, 0);
      // s1 and s2 are both accepting with no outgoing transitions

      const transform = nfa.getEquivalentStateRemap();
      // s1 and s2 should map to the same canonical state
      assert.strictEqual(transform.getCanonical(s1), transform.getCanonical(s2));
    });

    test('keeps non-equivalent states separate', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      nfa.addStart(s0);
      nfa.addTransition(s0, s1, 0);

      const transform = nfa.getEquivalentStateRemap();
      // Different acceptance => not equivalent
      assert.notStrictEqual(transform.getCanonical(s0), transform.getCanonical(s1));
    });

    test('accepts existing transformation', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      nfa.addAccept(s1);
      const s2 = nfa.addState();
      nfa.addStart(s0);

      // Pre-delete s2
      const existing = StateTransformation.deletion(3, new Set([s2]));
      const transform = nfa.getEquivalentStateRemap(existing);

      assert(transform.isDeleted(s2));
    });
  });

  describe('enforceEpsilonTransitions()', () => {
    test('propagates transitions through epsilon', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();
      const s2 = nfa.addState();

      nfa.addStart(s0);
      nfa.addAccept(s2);

      // s0 --a--> s1
      nfa.addTransition(s0, s1, 0);
      // s1 --epsilon--> s2
      nfa.addEpsilonTransition(s1, s2);

      nfa.enforceEpsilonTransitions();

      // Should now have s0 --a--> s2 (because s1 reaches s2 via epsilon)
      const transitions = nfa.getTransitions(s0, 0);
      assert(transitions.includes(s2));
      assert(transitions.includes(s1));
    });

    test('expands start states', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();

      nfa.addStart(s0);
      nfa.addEpsilonTransition(s0, s1);

      nfa.enforceEpsilonTransitions();

      assert(nfa.isStart(s1));
    });

    test('propagates accept status backwards', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();

      nfa.addAccept(s1);
      nfa.addEpsilonTransition(s0, s1);

      nfa.enforceEpsilonTransitions();

      assert(nfa.isAccepting(s0));
    });

    test('handles epsilon cycles', () => {
      const nfa = new NFA(['a']);
      const s0 = nfa.addState();
      const s1 = nfa.addState();

      nfa.addStart(s0);
      nfa.addAccept(s1);

      // s0 --epsilon--> s1 --epsilon--> s0
      nfa.addEpsilonTransition(s0, s1);
      nfa.addEpsilonTransition(s1, s0);

      nfa.enforceEpsilonTransitions();

      assert(nfa.isStart(s1));
      assert(nfa.isAccepting(s0));
    });
  });
});


