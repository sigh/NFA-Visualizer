/**
 * Tests for regex_parser.js
 */

import { test, describe, assert } from './test_utils.js';
import { RegexParser, RegexAstNode, RegexToNFABuilder } from '../js/regex_parser.js';

describe('RegexParser', () => {
  test('parses single character', () => {
    const parser = new RegexParser('a');
    const ast = parser.parse();
    assert(ast instanceof RegexAstNode.Charset);
    assert.deepStrictEqual(ast.chars, ['a']);
    assert.strictEqual(ast.negated, false);
  });

  test('parses concatenation', () => {
    const parser = new RegexParser('ab');
    const ast = parser.parse();
    assert(ast instanceof RegexAstNode.Concat);
    assert.strictEqual(ast.parts.length, 2);
    assert.deepStrictEqual(ast.parts[0].chars, ['a']);
    assert.deepStrictEqual(ast.parts[1].chars, ['b']);
  });

  test('parses alternation', () => {
    const parser = new RegexParser('a|b');
    const ast = parser.parse();
    assert(ast instanceof RegexAstNode.Alternate);
    assert.strictEqual(ast.options.length, 2);
    assert.deepStrictEqual(ast.options[0].chars, ['a']);
    assert.deepStrictEqual(ast.options[1].chars, ['b']);
  });

  test('parses quantifiers', () => {
    const parser = new RegexParser('a*');
    const ast = parser.parse();
    assert(ast instanceof RegexAstNode.Quantifier);
    assert.strictEqual(ast.min, 0);
    assert.strictEqual(ast.max, null);
  });

  test('parses character classes', () => {
    const parser = new RegexParser('[a-c]');
    const ast = parser.parse();
    assert(ast instanceof RegexAstNode.Charset);
    assert(ast.chars.includes('a'));
    assert(ast.chars.includes('b'));
    assert(ast.chars.includes('c'));
  });

  test('parses groups', () => {
    const parser = new RegexParser('(ab)+');
    const ast = parser.parse();
    assert(ast instanceof RegexAstNode.Quantifier);
    assert(ast.child instanceof RegexAstNode.Concat);
  });
});

describe('RegexToNFABuilder', () => {
  const symbols = ['a', 'b', 'c'];

  function testRegex(regex, input, expected) {
    const parser = new RegexParser(regex);
    const ast = parser.parse();
    const builder = new RegexToNFABuilder(symbols);
    const nfa = builder.build(ast);

    const inputSeq = input.split('').map(c => [c]);
    const result = nfa.run(inputSeq);
    assert.strictEqual(result.accepted, expected, `Regex /${regex}/ should ${expected ? 'accept' : 'reject'} "${input}"`);
  }

  test('builds NFA for single char', () => {
    testRegex('a', 'a', true);
    testRegex('a', 'b', false);
  });

  test('builds NFA for concatenation', () => {
    testRegex('ab', 'ab', true);
    testRegex('ab', 'a', false);
    testRegex('ab', 'abc', false);
  });

  test('builds NFA for alternation', () => {
    testRegex('a|b', 'a', true);
    testRegex('a|b', 'b', true);
    testRegex('a|b', 'c', false);
  });

  test('builds NFA for star', () => {
    testRegex('a*', '', true);
    testRegex('a*', 'a', true);
    testRegex('a*', 'aaaa', true);
    testRegex('a*', 'b', false);
  });

  test('builds NFA for plus', () => {
    testRegex('a+', '', false);
    testRegex('a+', 'a', true);
    testRegex('a+', 'aaaa', true);
  });

  test('builds NFA for question mark', () => {
    testRegex('a?', '', true);
    testRegex('a?', 'a', true);
    testRegex('a?', 'aa', false);
  });

  test('builds NFA for complex expression', () => {
    // (a|b)*c
    testRegex('(a|b)*c', 'c', true);
    testRegex('(a|b)*c', 'ac', true);
    testRegex('(a|b)*c', 'bc', true);
    testRegex('(a|b)*c', 'abac', true);
    testRegex('(a|b)*c', 'aba', false);
  });
});
