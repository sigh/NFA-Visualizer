/**
 * Tests for nfa_builder.js - NFABuilder and parsing utilities
 */

import { test, describe, assert } from './test_utils.js';
import {
  NFABuilder,
  expandSymbolClass,
  parseNFAConfig,
  buildCodeFromSplit,
  parseSplitFromCode
} from '../js/nfa_builder.js';
import { NFA, DEFAULT_SYMBOL_CLASS } from '../js/nfa.js';

// =============================================================================
// expandSymbolClass Tests
// =============================================================================

describe('expandSymbolClass', () => {
  test('expands digit range', () => {
    const result = expandSymbolClass('0-9');
    assert.deepStrictEqual(result, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  test('expands lowercase letter range', () => {
    const result = expandSymbolClass('a-c');
    assert.deepStrictEqual(result, ['a', 'b', 'c']);
  });

  test('expands uppercase letter range', () => {
    const result = expandSymbolClass('A-C');
    assert.deepStrictEqual(result, ['A', 'B', 'C']);
  });

  test('expands multiple ranges', () => {
    const result = expandSymbolClass('a-c0-2');
    // Order depends on ALL_SYMBOLS order (digits first)
    assert(result.includes('a'));
    assert(result.includes('b'));
    assert(result.includes('c'));
    assert(result.includes('0'));
    assert(result.includes('1'));
    assert(result.includes('2'));
    assert.strictEqual(result.length, 6);
  });

  test('handles literal characters', () => {
    const result = expandSymbolClass('abc');
    assert.deepStrictEqual(result, ['a', 'b', 'c']);
  });

  test('handles mixed literals and ranges', () => {
    const result = expandSymbolClass('a-cxyz');
    assert(result.includes('a'));
    assert(result.includes('b'));
    assert(result.includes('c'));
    assert(result.includes('x'));
    assert(result.includes('y'));
    assert(result.includes('z'));
  });

  test('handles single character', () => {
    const result = expandSymbolClass('x');
    assert.deepStrictEqual(result, ['x']);
  });

  test('throws on empty class', () => {
    assert.throws(() => expandSymbolClass(''), /empty/);
  });

  test('throws on no matches', () => {
    // Use a pattern that won't match anything in ALL_SYMBOLS
    assert.throws(() => expandSymbolClass('🎉'), /No symbols match/);
  });
});

// =============================================================================
// parseNFAConfig Tests
// =============================================================================

describe('parseNFAConfig', () => {
  test('parses valid code with all definitions', () => {
    const code = `
      startState = 0;
      function transition(state, symbol) { return state + 1; }
      function accept(state) { return state > 5; }
    `;
    const config = parseNFAConfig(code);
    assert.strictEqual(config.startState, 0);
    assert.strictEqual(typeof config.transition, 'function');
    assert.strictEqual(typeof config.accept, 'function');
  });

  test('parses complex startState', () => {
    const code = `
      startState = { count: 0, flag: true };
      function transition(state, symbol) { return state; }
      function accept(state) { return false; }
    `;
    const config = parseNFAConfig(code);
    assert.deepStrictEqual(config.startState, { count: 0, flag: true });
  });

  test('parses array startState', () => {
    const code = `
      startState = [1, 2, 3];
      function transition(state, symbol) { return state; }
      function accept(state) { return false; }
    `;
    const config = parseNFAConfig(code);
    assert.deepStrictEqual(config.startState, [1, 2, 3]);
  });

  test('throws on missing startState', () => {
    const code = `
      function transition(state, symbol) { return state; }
      function accept(state) { return false; }
    `;
    assert.throws(() => parseNFAConfig(code), /Code error.*startState/);
  });

  test('throws on missing transition function', () => {
    const code = `
      startState = 0;
      function accept(state) { return false; }
    `;
    assert.throws(() => parseNFAConfig(code), /Code error.*transition/);
  });

  test('throws on missing accept function', () => {
    const code = `
      startState = 0;
      function transition(state, symbol) { return state; }
    `;
    assert.throws(() => parseNFAConfig(code), /Code error.*accept/);
  });

  test('throws on syntax error', () => {
    const code = `
      startState = {invalid json};
    `;
    assert.throws(() => parseNFAConfig(code), /Code error/);
  });
});

// =============================================================================
// buildCodeFromSplit Tests
// =============================================================================

describe('buildCodeFromSplit', () => {
  test('builds code from split components', () => {
    const code = buildCodeFromSplit('0', 'return state + 1;', 'return state > 5;');
    assert(code.includes('startState = 0;'));
    assert(code.includes('function transition(state, symbol)'));
    assert(code.includes('function accept(state)'));
  });

  test('properly indents multiline bodies', () => {
    const transitionBody = 'if (symbol === 0) {\n  return 1;\n}\nreturn 0;';
    const code = buildCodeFromSplit('0', transitionBody, 'return true;');
    // Each line should be indented
    assert(code.includes('  if (symbol === 0)'));
  });

  test('handles complex startState expressions', () => {
    const code = buildCodeFromSplit('{ x: 1, y: 2 }', 'return state;', 'return true;');
    assert(code.includes('startState = { x: 1, y: 2 };'));
  });

  test('generated code is parseable', () => {
    const code = buildCodeFromSplit('42', 'return state;', 'return state === 42;');
    const config = parseNFAConfig(code);
    assert.strictEqual(config.startState, 42);
  });
});

// =============================================================================
// parseSplitFromCode Tests
// =============================================================================

describe('parseSplitFromCode', () => {
  test('extracts components from valid code', () => {
    const code = `
      startState = 5;
      function transition(state, symbol) {
        return state + symbol;
      }
      function accept(state) {
        return state > 10;
      }
    `;
    const split = parseSplitFromCode(code);
    assert.strictEqual(split.startState, '5');
    assert(split.transitionBody.includes('return state + symbol'));
    assert(split.acceptBody.includes('return state > 10'));
  });

  test('handles object startState', () => {
    const code = `
      startState = { a: 1 };
      function transition(state, symbol) { return state; }
      function accept(state) { return false; }
    `;
    const split = parseSplitFromCode(code);
    assert.strictEqual(split.startState, '{"a":1}');
  });

  test('returns empty strings on invalid code', () => {
    const code = 'this is not valid javascript {{{';
    const split = parseSplitFromCode(code);
    assert.strictEqual(split.startState, '');
    assert.strictEqual(split.transitionBody, '');
    assert.strictEqual(split.acceptBody, '');
  });

  test('round-trips with buildCodeFromSplit', () => {
    const original = buildCodeFromSplit('100', 'return state;', 'return state === 100;');
    const split = parseSplitFromCode(original);
    const rebuilt = buildCodeFromSplit(split.startState, split.transitionBody, split.acceptBody);

    // Both should produce equivalent configs
    const config1 = parseNFAConfig(original);
    const config2 = parseNFAConfig(rebuilt);
    assert.strictEqual(config1.startState, config2.startState);
  });
});

// =============================================================================
// NFABuilder Tests
// =============================================================================

describe('NFABuilder', () => {
  test('builds simple NFA', () => {
    const config = {
      startState: 0,
      transition: (state, symbol) => state < 5 ? state + 1 : null,
      accept: (state) => state === 5
    };

    const builder = new NFABuilder(config, { symbols: ['0', '1'] });
    const nfa = builder.build();

    assert(nfa instanceof NFA);
    assert(nfa.numStates() > 0);
  });

  test('correctly sets start state', () => {
    const config = {
      startState: 'initial',
      transition: () => null,
      accept: () => false
    };

    const builder = new NFABuilder(config, { symbols: ['a'] });
    const nfa = builder.build();

    assert.strictEqual(nfa.startStates.size, 1);
  });

  test('correctly marks accepting states', () => {
    const config = {
      startState: 0,
      transition: (state, symbol) => state === 0 ? 1 : null,
      accept: (state) => state === 1
    };

    const builder = new NFABuilder(config, { symbols: ['a'] });
    const nfa = builder.build();

    assert(nfa.acceptStates.size > 0);
  });

  test('handles array transitions (nondeterminism)', () => {
    const config = {
      startState: 0,
      transition: (state, symbol) => state === 0 ? [1, 2] : null,
      accept: (state) => state > 0
    };

    const builder = new NFABuilder(config, { symbols: ['a'] });
    const nfa = builder.build();

    // Should have transitions to multiple states
    assert(nfa.numStates() >= 3);
  });

  test('handles object states', () => {
    const config = {
      startState: { x: 0 },
      transition: (state, symbol) => {
        if (state === null) return null;
        return state.x < 2 ? { x: state.x + 1 } : null;
      },
      accept: (state) => state !== null && state.x === 2
    };

    const builder = new NFABuilder(config, { symbols: ['a'] });
    const nfa = builder.build();

    assert(nfa.numStates() > 0);
    // Should accept sequence of 'a's - run() takes array of symbol arrays
    const result = nfa.run([['a'], ['a']]); // two 'a's
    assert(result.accepted);
  });

  test('handles numeric symbols correctly', () => {
    const config = {
      startState: 0,
      transition: (state, symbol) => {
        // symbol should be a number when input is digit
        if (typeof symbol === 'number' && state < 3) return state + 1;
        return null;
      },
      accept: (state) => state > 0
    };

    const builder = new NFABuilder(config, { symbols: ['0', '1', '2'] });
    const nfa = builder.build();

    assert(nfa.numStates() > 0);
  });

  test('respects max states limit', () => {
    const config = {
      startState: 0,
      transition: (state, symbol) => state + 1, // infinite states
      accept: () => false
    };

    const builder = new NFABuilder(config, { symbols: ['a'], maxStates: 100 });

    // Should throw due to state limit
    assert.throws(() => builder.build(), /exceeded maximum state limit|state limit/i);
  });

  test('builds NFA that accepts correct inputs', () => {
    // NFA that accepts strings ending in 'ab'
    const config = {
      startState: 0,
      transition: (state, symbol) => {
        if (state === 0) return symbol === 'a' ? [0, 1] : [0];
        if (state === 1) return symbol === 'b' ? [2] : null;
        return null;
      },
      accept: (state) => state === 2
    };

    const builder = new NFABuilder(config, { symbols: ['a', 'b'] });
    const nfa = builder.build();

    // 'ab' should be accepted - run() takes array of symbol arrays
    const result1 = nfa.run([['a'], ['b']]);
    assert(result1.accepted);

    // 'aab' should be accepted
    const result2 = nfa.run([['a'], ['a'], ['b']]);
    assert(result2.accepted);

    // 'ba' should not be accepted
    const result3 = nfa.run([['b'], ['a']]);
    assert(!result3.accepted);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  test('full workflow: code -> config -> NFA -> run', () => {
    const code = `
      startState = 0;
      function transition(state, symbol) {
        if (state < 3) return state + 1;
        return null;
      }
      function accept(state) {
        return state === 3;
      }
    `;

    const config = parseNFAConfig(code);
    const builder = new NFABuilder(config, { symbols: ['x'] });
    const nfa = builder.build();

    // Should accept exactly 3 symbols - run() takes array of symbol arrays
    const result1 = nfa.run([['x'], ['x'], ['x']]); // 3 x's
    assert(result1.accepted);

    const result2 = nfa.run([['x'], ['x']]); // 2 x's
    assert(!result2.accepted);
  });

  test('split editor workflow: split -> build -> parse -> split', () => {
    const startState = '{ position: 0 }';
    const transitionBody = 'return { position: state.position + 1 };';
    const acceptBody = 'return state.position >= 3;';

    const code = buildCodeFromSplit(startState, transitionBody, acceptBody);
    const config = parseNFAConfig(code);

    assert.deepStrictEqual(config.startState, { position: 0 });
    assert(config.accept({ position: 3 }));
    assert(!config.accept({ position: 2 }));

    const splitBack = parseSplitFromCode(code);
    assert(splitBack.startState.includes('position'));
  });

  test('expandSymbolClass with NFABuilder', () => {
    const symbols = expandSymbolClass('0-2');

    const config = {
      startState: 0,
      transition: (state, symbol) => {
        // symbol is converted to number for digit symbols
        // Limit states to prevent explosion
        if (typeof symbol === 'number' && state < 5) {
          return state + 1;
        }
        return null;
      },
      accept: (state) => state === 3
    };

    const builder = new NFABuilder(config, { symbols });
    const nfa = builder.build();

    // Three transitions (one for each symbol) should reach state 3
    const result = nfa.run([['1'], ['1'], ['1']]); // any 3 digits
    assert(result.accepted);
  });
});


