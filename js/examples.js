/**
 * Example NFA configurations for the visualizer.
 */

import { extractFunctionBody } from './util.js';

const RAW_EXAMPLES = {
  'divisible-by-3': {
    label: 'Divisible by 3',
    fn: function () {
      // Numbers divisible by 3
      symbols = /[0-9]/;

      // State represents remainder mod 3
      startState = 0;

      function transition(state, symbol) {
        return (state * 10 + symbol) % 3;
      }

      function accept(state) {
        // Accept if remainder is 0
        return state === 0;
      }
    }
  },
  'third-from-last-1': {
    label: 'Third from last is "1"',
    fn: function () {
      // Accept any binary string where the third character from the end is "1".
      // Non-determinism is used to guess that each "1" is the third from last.
      symbols = /[01]/;

      // State is either "start" or the distance a "1" is from the end.
      startState = 'start';

      function transition(state, symbol) {
        if (state === 'start') {
          return symbol == '1' ? ['start', 1] : 'start';
        }
        if (state < 3) {
          return state + 1;
        }
      }

      function accept(state) {
        // A "1" is third from last if we reach state 3
        return state === 3;
      }
    }
  },
  'river-crossing': {
    label: 'River crossing puzzle',
    fn: function () {
      // The classic river crossing puzzle:
      // A farmer needs to transport a wolf (W), a goat (G),
      // and cabbage (C) across a river.
      // The farmer can only take one item at a time in the boat.
      // If left alone together, the wolf will eat the goat,
      // or the goat will eat the cabbage.
      // Find a sequence of crossings that gets all safely across.
      symbols = /[WGC_]/;

      // Start with everyone on the left bank.
      startState = { boat: 0, W: 0, G: 0, C: 0 };

      function transition(state, symbol) {
        // Determine which bank the boat is on
        const nextBoat = 1 - state.boat;
        const nextState = { ...state, boat: nextBoat };

        if (symbol !== '_') {
          // Boat must be on the same bank as the item to transport it.
          if (state[symbol] !== state.boat) return;
          nextState[symbol] = nextBoat;
        }

        // Validity check: ensure no one gets eaten
        if (nextState.W == nextState.G && nextState.boat !== nextState.W) {
          return; // Wolf eats goat
        }
        if (nextState.G == nextState.C && nextState.boat !== nextState.G) {
          return; // Goat eats cabbage
        }

        return nextState;
      }

      function accept(state) {
        // Accept if no one is on the left bank.
        for (const item of ['W', 'G', 'C', 'boat']) {
          if (state[item] === 0) return false;
        }
        return true;
      }
    }
  },
};

export const EXAMPLES = Object.fromEntries(
  Object.entries(RAW_EXAMPLES).map(([key, ex]) => [
    key,
    {
      label: ex.label,
      code: extractFunctionBody(ex.fn)
    }
  ])
);