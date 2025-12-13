/**
 * Regex Parser and NFA Builder
 * Adapted from Interactive-Sudoku-Solver
 */

import { NFA } from './nfa.js';

export class RegexAstNode {
  static Charset = class {
    constructor(chars, negated = false) {
      this.chars = chars;
      this.negated = negated;
    }
  }

  static Concat = class {
    constructor(parts) {
      this.parts = parts;
    }
  }
  static Alternate = class {
    constructor(options) {
      this.options = options;
    }
  }

  // Quantifier: {n}, {n,}, {n,m}, and also *, +, ?
  static Quantifier = class {
    constructor(child, min, max) {
      this.child = child;
      this.min = min;       // minimum repetitions
      this.max = max;       // maximum repetitions (null = unbounded)
    }
  }
}

export class RegexParser {
  static SEQUENCE_TERMINATORS = "|)";
  static QUANTIFIERS = "*+?{";

  constructor(pattern) {
    this.pattern = pattern;
    this.pos = 0;
  }

  parse() {
    const expr = this._parseExpression();
    if (!this._isEOF()) {
      throw new Error(`Unexpected token at position ${this.pos}`);
    }
    return expr;
  }

  _parseExpression() {
    const node = this._parseSequence();
    const alternatives = [node];
    while (this._peek() === '|') {
      this._next();
      alternatives.push(this._parseSequence());
    }
    if (alternatives.length === 1) return node;
    return new RegexAstNode.Alternate(alternatives);
  }

  _parseSequence() {
    const parts = [];
    while (!this._isEOF() && !RegexParser.SEQUENCE_TERMINATORS.includes(this._peek())) {
      parts.push(this._parseQuantified());
    }
    if (parts.length === 1) return parts[0];
    return new RegexAstNode.Concat(parts);
  }

  _parseQuantified() {
    let node = this._parsePrimary();
    while (!this._isEOF()) {
      const ch = this._peek();
      if (ch === '*') {
        this._next();
        node = new RegexAstNode.Quantifier(node, 0, null);
      } else if (ch === '+') {
        this._next();
        node = new RegexAstNode.Quantifier(node, 1, null);
      } else if (ch === '?') {
        this._next();
        node = new RegexAstNode.Quantifier(node, 0, 1);
      } else if (ch === '{') {
        node = this._parseBraceQuantifier(node);
      } else {
        break;
      }
    }
    return node;
  }

  _parseBraceQuantifier(node) {
    const startPos = this.pos;
    this._expect('{');

    const min = this._parseNumber();
    if (min === null) {
      throw new Error(`Expected number after '{' at position ${startPos}`);
    }

    let max = min;
    if (this._peek() === ',') {
      this._next();
      max = this._peek() === '}' ? null : this._parseNumber();
      if (max === undefined) {
        throw new Error(`Expected number or '}' after ',' at position ${this.pos}`);
      }
      if (max !== null && max < min) {
        throw new Error(`Invalid quantifier: max (${max}) < min (${min}) at position ${startPos}`);
      }
    }

    this._expect('}');

    return new RegexAstNode.Quantifier(node, min, max);
  }

  _parseNumber() {
    let numStr = '';
    while (this._peek() >= '0' && this._peek() <= '9') {
      numStr += this._next();
    }
    if (!numStr) return null;
    return parseInt(numStr, 10);
  }

  _parsePrimary() {
    const ch = this._peek();
    if (ch === '(') {
      this._next();
      const expr = this._parseExpression();
      if (this._peek() !== ')') {
        throw new Error(`Unclosed group at position ${this.pos}`);
      }
      this._next();
      return expr;
    }
    if (ch === '[') {
      return this._parseCharClass();
    }
    if (ch === '.') {
      this._next();
      return new RegexAstNode.Charset([], true);  // Negated empty = all symbols
    }
    if (ch === undefined) {
      throw new Error('Unexpected end of pattern');
    }
    if (RegexParser.QUANTIFIERS.includes(ch) || RegexParser.SEQUENCE_TERMINATORS.includes(ch)) {
      throw new Error(`Unexpected token '${ch}' at position ${this.pos}`);
    }
    this._next();
    return new RegexAstNode.Charset([ch]);
  }

  _parseCharClass() {
    this._expect('[');
    const isNegated = this._peek() === '^';
    if (isNegated) {
      this._next();
    }
    const chars = new Set();
    while (!this._isEOF() && this._peek() !== ']') {
      const start = this._next();
      if (this._peek() === '-') {
        this._next();
        const end = this._next();
        const startCode = start.charCodeAt(0);
        const endCode = end.charCodeAt(0);
        if (endCode < startCode) {
          throw new Error('Invalid character range in class');
        }
        for (let code = startCode; code <= endCode; code++) {
          chars.add(String.fromCharCode(code));
        }
      } else {
        chars.add(start);
      }
    }
    this._expect(']');
    if (!chars.size) {
      throw new Error('Empty character class');
    }
    return new RegexAstNode.Charset([...chars], isNegated);
  }

  _expect(ch) {
    if (this._next() !== ch) {
      throw new Error(`Expected '${ch}' at position ${this.pos - 1}`);
    }
  }

  _peek() {
    return this.pattern[this.pos];
  }

  _next() {
    if (this.pos >= this.pattern.length) return undefined;
    return this.pattern[this.pos++];
  }

  _isEOF() {
    return this.pos >= this.pattern.length;
  }
}

export class RegexToNFABuilder {
  /**
   * @param {string[]} symbols - The alphabet symbols
   */
  constructor(symbols) {
    this._nfa = new NFA(symbols);
    this._symbols = symbols;
    // Map symbol string to index
    this._symbolToIndex = new Map(symbols.map((s, i) => [s, i]));
  }

  static _Fragment = class {
    constructor(startId, acceptId) {
      this.startId = startId;
      this.acceptId = acceptId;
    }
  };

  _newFragment(startId, acceptId) {
    return new RegexToNFABuilder._Fragment(startId, acceptId);
  }

  build(ast) {
    const fragment = this._buildNode(ast);
    this._nfa.addStart(fragment.startId);
    this._nfa.addAccept(fragment.acceptId);
    this._nfa.enforceEpsilonTransitions();
    return this._nfa;
  }

  _buildNode(node) {
    switch (node.constructor) {
      case RegexAstNode.Charset:
        return this._buildCharset(node.chars, node.negated);
      case RegexAstNode.Concat:
        return this._buildConcat(node.parts);
      case RegexAstNode.Alternate:
        return this._buildAlternate(node.options);
      case RegexAstNode.Quantifier:
        return this._buildQuantifier(node.child, node.min, node.max);
      default:
        throw new Error('Unknown AST node type');
    }
  }

  _buildEmpty() {
    const stateId = this._nfa.addState();
    return this._newFragment(stateId, stateId);
  }

  _buildCharset(chars, negated = false) {
    const startId = this._nfa.addState();
    const acceptId = this._nfa.addState();

    let targetIndices = [];

    if (negated) {
      // For negated charset, include all symbols NOT in the chars set
      const excluded = new Set(chars);
      for (let i = 0; i < this._symbols.length; i++) {
        if (!excluded.has(this._symbols[i])) {
          targetIndices.push(i);
        }
      }
    } else {
      // Include only symbols in the chars set
      for (const char of chars) {
        const index = this._symbolToIndex.get(char);
        if (index !== undefined) {
          targetIndices.push(index);
        } else {
          // Warn or ignore symbols not in alphabet?
          // For now, we ignore them as they can't be matched
        }
      }
    }

    for (const index of targetIndices) {
      this._nfa.addTransition(startId, acceptId, index);
    }

    return this._newFragment(startId, acceptId);
  }

  _buildConcat(parts) {
    if (!parts.length) return this._buildEmpty();
    const first = this._buildNode(parts[0]);
    let acceptId = first.acceptId;
    for (let i = 1; i < parts.length; i++) {
      const next = this._buildNode(parts[i]);
      this._nfa.addEpsilonTransition(acceptId, next.startId);
      acceptId = next.acceptId;
    }
    return this._newFragment(first.startId, acceptId);
  }

  _buildAlternate(options) {
    const startId = this._nfa.addState();
    const acceptId = this._nfa.addState();
    for (const option of options) {
      const optionFragment = this._buildNode(option);
      this._nfa.addEpsilonTransition(startId, optionFragment.startId);
      this._nfa.addEpsilonTransition(optionFragment.acceptId, acceptId);
    }
    return this._newFragment(startId, acceptId);
  }

  _buildQuantifier(child, min, max) {
    // Start with an empty fragment if min is 0, otherwise build first required copy.
    let result = min === 0 ? this._buildEmpty() : this._buildNode(child);

    // Build remaining required copies (indices 1 to min-1).
    for (let i = 1; i < min; i++) {
      const next = this._buildNode(child);
      this._nfa.addEpsilonTransition(result.acceptId, next.startId);
      result = this._newFragment(result.startId, next.acceptId);
    }

    if (max === null) {
      // Unbounded: can optionally match more copies with a self-loop.
      const inner = this._buildNode(child);
      this._nfa.addEpsilonTransition(result.acceptId, inner.startId);  // Optionally enter loop
      this._nfa.addEpsilonTransition(inner.acceptId, inner.startId);   // Loop for more
      this._nfa.addEpsilonTransition(inner.acceptId, result.acceptId); // Exit loop back to accept
    } else {
      // Bounded: append (max - min) optional copies.
      for (let i = min; i < max; i++) {
        const inner = this._buildNode(child);
        this._nfa.addEpsilonTransition(result.acceptId, inner.startId);
        this._nfa.addEpsilonTransition(result.acceptId, inner.acceptId);  // Skip (optional)
        result = this._newFragment(result.startId, inner.acceptId);
      }
    }

    return result;
  }
}
