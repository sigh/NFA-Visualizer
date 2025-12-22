import { DFABuilder } from '../js/dfa_builder.js';
import { NFABuilder } from '../js/nfa_builder.js';
import { NFAView } from '../js/nfa_view.js';
import { StateTransformation } from '../js/nfa.js';
import { assert, describe, test as it } from './test_utils.js';

const CONFIG = { maxStates: 100 };

describe('DFABuilder', () => {
  it('converts a simple NFA to DFA', () => {
    // (a|b)*abb
    const code = `
      startState = 0;
      function transition(state, symbol) {
        if (state === 0) {
          if (symbol === 'a') return [0, 1];
          if (symbol === 'b') return 0;
        }
        if (state === 1 && symbol === 'b') return 2;
        if (state === 2 && symbol === 'b') return 3;
        return undefined;
      }
      function accept(state) {
        return state === 3;
      }
    `;

    const builder = new NFABuilder({
      startState: 0,
      transition: (s, sym) => {
        if (s === 0) {
          if (sym === 'a') return [0, 1];
          if (sym === 'b') return 0;
        }
        if (s === 1 && sym === 'b') return 2;
        if (s === 2 && sym === 'b') return 3;
      },
      accept: s => s === 3
    }, { ...CONFIG, symbols: ['a', 'b'] });

    const nfa = builder.build();

    // Create a view (identity transform, no explicit epsilons)
    const view = new NFAView(nfa, {
      transform: StateTransformation.identity(nfa.numStates())
    });

    const dfa = DFABuilder.build(view);

    assert.strictEqual(dfa.symbols.length, 2);
    // DFA should be deterministic
    // We can check by running some inputs

    // Test acceptance
    assert(dfa.matches([['a'], ['b'], ['b']]));
    assert(dfa.matches([['a'], ['a'], ['b'], ['b']]));
    assert(dfa.matches([['b'], ['a'], ['b'], ['b']]));
    assert(!dfa.matches([['a'], ['b']]));
    assert(!dfa.matches([['a'], ['a'], ['b']]));

    // Check determinism (at most 1 transition per symbol)
    for (let i = 0; i < dfa.numStates(); i++) {
      for (let s = 0; s < dfa.symbols.length; s++) {
        const targets = dfa.getTransitions(i, s);
        assert(targets.length <= 1, `State ${i} has multiple transitions for symbol ${dfa.symbols[s]}`);
      }
    }
  });

  it('handles epsilon transitions correctly', () => {
    // 0 --eps--> 1 --a--> 2
    const builder = new NFABuilder({
      startState: 0,
      transition: (s, sym) => {
        if (s === 1 && sym === 'a') return 2;
      },
      accept: s => s === 2,
      epsilon: s => s === 0 ? 1 : undefined
    }, { ...CONFIG, symbols: ['a'] });

    const nfa = builder.build();
    nfa.enforceEpsilonTransitions();

    // Create a view (identity transform, showEpsilonTransitions: false)
    // This view should expose the effective transitions (0 --a--> 2)
    const view = new NFAView(nfa, {
      transform: StateTransformation.identity(nfa.numStates())
    });

    const dfa = DFABuilder.build(view);

    // DFA should have a transition from start on 'a' to accept
    // Start state of DFA corresponds to {0, 1}
    // Transition on 'a' goes to {2}

    assert(dfa.matches([['a']]));
    assert(!dfa.matches([]));
  });

  it('aborts subset construction when maxStates is exceeded', () => {
    // NFA: start 0, on 'a' -> {0,1}. This yields at least two reachable DFA states: {0} and {0,1}.
    const builder = new NFABuilder({
      startState: 0,
      transition: (s, sym) => {
        if (sym !== 'a') return undefined;
        if (s === 0) return [0, 1];
        if (s === 1) return 1;
      },
      accept: () => false
    }, { ...CONFIG, symbols: ['a'] });

    const nfa = builder.build();
    const view = new NFAView(nfa, {
      transform: StateTransformation.identity(nfa.numStates())
    });

    assert.throws(
      () => DFABuilder.build(view, { maxStates: 1 }),
      /exceeded maxStates=1/
    );
  });
});
