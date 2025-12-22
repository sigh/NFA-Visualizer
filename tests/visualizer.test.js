
import { test, describe, assert } from './test_utils.js';
import { compactSymbolLabel, NFAVisualizer } from '../js/visualizer.js';

describe('Visualizer Utilities', () => {
  describe('compactSymbolLabel', () => {
    test('handles empty input', () => {
      assert.strictEqual(compactSymbolLabel([]), '');
    });

    test('handles single symbol', () => {
      assert.strictEqual(compactSymbolLabel(['a']), 'a');
      assert.strictEqual(compactSymbolLabel([1]), '1');
    });

    test('handles ranges', () => {
      assert.strictEqual(compactSymbolLabel(['a', 'b', 'c']), 'a-c');
      assert.strictEqual(compactSymbolLabel(['1', '2', '3']), '1-3');
    });

    test('handles mixed ranges and singles', () => {
      assert.strictEqual(compactSymbolLabel(['a', 'b', 'd', 'f', 'g', 'h']), 'abdf-h');
    });

    test('handles non-range sequences', () => {
      assert.strictEqual(compactSymbolLabel(['a', 'c', 'e']), 'ace');
    });
  });
});

describe('NFAVisualizer Logic', () => {
  // Mock View
  const createMockView = () => ({
    getCanonical: (id) => id, // Identity transform by default
    getEpsilonTransitionsFrom: (id) => new Set(),
    getTransitionsFrom: (id) => new Map(),
  });

  describe('calculateExecutionHighlights', () => {
    test('highlights visited states', () => {
      const viz = new NFAVisualizer(null);
      viz.view = createMockView();

      const highlights = {
        visitedStates: [0, 1],
        visitedEdges: [],
        visitedEpsilonEdges: [],
        finalStates: [],
      };

      const result = viz.calculateExecutionHighlights(highlights);

      assert(result.visitedStates.has(0));
      assert(result.visitedStates.has(1));
      assert.strictEqual(result.visitedStates.size, 2);
    });

    test('highlights final states correctly', () => {
      const viz = new NFAVisualizer(null);
      viz.view = createMockView();

      const highlights = {
        visitedStates: [0, 1],
        visitedEdges: [],
        visitedEpsilonEdges: [],
        finalStates: [1],
      };

      const result = viz.calculateExecutionHighlights(highlights);

      assert(result.finalStates.has(1));
      assert(!result.finalStates.has(0));
    });

    test('highlights transitions between steps', () => {
      const viz = new NFAVisualizer(null);
      const mockView = createMockView();

      // 0 -> 1 on 'a'
      mockView.getTransitionsFrom = (id) => {
        if (id === 0) return new Map([[1, ['a']]]);
        return new Map();
      };

      viz.view = mockView;

      const highlights = {
        visitedStates: [0, 1],
        visitedEdges: ['0-1'],
        visitedEpsilonEdges: [],
        finalStates: [],
      };

      const result = viz.calculateExecutionHighlights(highlights);

      assert(result.visitedEdges.has('0-1'));
    });

    test('highlights epsilon transitions', () => {
      const viz = new NFAVisualizer(null);
      const mockView = createMockView();

      // 0 -> 1 (epsilon)
      mockView.getEpsilonTransitionsFrom = (id) => {
        if (id === 0) return new Set([1]);
        return new Set();
      };

      viz.view = mockView;

      const highlights = {
        visitedStates: [0, 1],
        visitedEdges: [],
        visitedEpsilonEdges: ['0-1'],
        finalStates: [],
      };

      const result = viz.calculateExecutionHighlights(highlights);

      assert(result.visitedEpsilonEdges.has('0-1'));
    });

    test('handles canonical state mapping', () => {
      const viz = new NFAVisualizer(null);
      const mockView = createMockView();

      // Map 10 -> 1, 20 -> 2
      mockView.getCanonical = (id) => {
        if (id === 10) return 1;
        if (id === 20) return 2;
        return -1; // Deleted
      };

      // 1 -> 2 transition
      mockView.getTransitionsFrom = (id) => {
        if (id === 1) return new Map([[2, ['a']]]);
        return new Map();
      };

      viz.view = mockView;

      const highlights = {
        visitedStates: [10, 20],
        visitedEdges: ['10-20'],
        visitedEpsilonEdges: [],
        finalStates: [20],
      };

      const result = viz.calculateExecutionHighlights(highlights);

      assert(result.visitedStates.has(1));
      assert(result.visitedStates.has(2));
      assert(result.visitedEdges.has('1-2'));
    });
  });
});
