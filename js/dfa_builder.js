import { NFA } from './nfa.js';

/**
 * Builder for converting an NFA View into a DFA.
 */
export class DFABuilder {
  /**
   * Converts an NFAView into a DFA (represented as a new NFA object).
   * Uses the standard subset construction algorithm.
   *
   * @param {NFAView} view - The source NFA view. Must provide effective transitions (e.g. epsilon closure applied).
   * @returns {NFA} The resulting DFA
   */
  static build(view) {
    // Ensure we are working with a view that exposes effective transitions
    if (view.showEpsilonTransitions) {
      throw new Error('DFABuilder: Cannot build from a view with explicit epsilon transitions.');
    }

    const dfa = new NFA(view.nfa.symbols);

    // 1. Identify Start States
    const startStates = DFABuilder._getStartStates(view);

    // 2. Initialize Worklist
    // Map of StateKey -> DFA State ID
    const dfaStateMap = new Map();
    // Use array + head index for O(1) dequeues
    // We use a queue so that state IDs are assigned in BFS order
    const worklist = [];
    let worklistHead = 0;

    const startKey = DFABuilder._getStateKey(startStates);
    const startId = dfa.addState(startKey);
    dfa.addStart(startId);

    if (DFABuilder._isAcceptingSet(view, startStates)) {
      dfa.addAccept(startId);
    }

    dfaStateMap.set(startKey, startId);
    worklist.push(startStates);

    // 3. Process Worklist
    while (worklistHead < worklist.length) {
      const currentSet = worklist[worklistHead++];
      const currentId = dfaStateMap.get(DFABuilder._getStateKey(currentSet));

      // Group transitions by symbol for the current set of states
      const transitionsBySymbol = DFABuilder._aggregateTransitions(view, currentSet);

      // Create DFA transitions
      for (let symbolIndex = 0; symbolIndex < dfa.symbols.length; symbolIndex++) {
        const symbol = dfa.symbols[symbolIndex];
        const nextSet = transitionsBySymbol.get(symbol);

        if (nextSet && nextSet.size > 0) {
          const nextSetArray = [...nextSet];
          const nextKey = DFABuilder._getStateKey(nextSetArray);

          let nextId;
          if (dfaStateMap.has(nextKey)) {
            nextId = dfaStateMap.get(nextKey);
          } else {
            nextId = dfa.addState(nextKey);
            if (DFABuilder._isAcceptingSet(view, nextSetArray)) {
              dfa.addAccept(nextId);
            }
            dfaStateMap.set(nextKey, nextId);
            worklist.push(nextSetArray);
          }

          dfa.addTransition(currentId, nextId, symbolIndex);
        }
      }
    }

    dfa.parentNfa = view.nfa;

    return dfa;
  }

  /**
   * Get the set of start states from the view.
   * @private
   */
  static _getStartStates(view) {
    const startStates = [];
    const numStates = view.nfa.numStates();
    for (let i = 0; i < numStates; i++) {
      // Only consider canonical states in the view
      if (view.transform.remap[i] === i && view.isStart(i)) {
        startStates.push(i);
      }
    }
    return startStates;
  }

  /**
   * Check if any state in the set is accepting.
   * @private
   */
  static _isAcceptingSet(view, stateIds) {
    return stateIds.some(id => view.isAccepting(id));
  }

  /**
   * Aggregate transitions from a set of states by symbol.
   * @returns {Map<string, Set<number>>} Map of symbol -> Set of target states
   * @private
   */
  static _aggregateTransitions(view, stateIds) {
    const transitionsBySymbol = new Map();

    for (const sourceId of stateIds) {
      const transitions = view.getTransitionsFrom(sourceId);
      for (const [target, symbols] of transitions) {
        for (const symbol of symbols) {
          if (!transitionsBySymbol.has(symbol)) {
            transitionsBySymbol.set(symbol, new Set());
          }
          transitionsBySymbol.get(symbol).add(target);
        }
      }
    }
    return transitionsBySymbol;
  }

  /**
   * Generate a unique key for a set of states.
   * @private
   */
  static _getStateKey(stateIds) {
    return [...stateIds].sort((a, b) => a - b).join(',');
  }
}