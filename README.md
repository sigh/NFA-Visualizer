# NFA Visualizer

A web-based tool for visualizing Non-deterministic Finite Automata (NFAs)
written in JavaScript.

Define a NFA using simple JavaScript functions:

- See the state graph with transitions
- See how the NFA can be minimized or converted to a DFA
- Test inputs with execution traces on the graph

It is hosted at <http://sigh.github.io/NFA-Visualizer>

## Usage

An NFA is defined with these components:

1. **startState** - The initial state (or array of states)
2. **transition(state, symbol)** - Returns the next state(s) for a given input
3. **accept(state)** - Returns true if the state is accepting
4. **epsilon** - Returns an array of epsilon transitions for a state

The visualizer will explore all reachable states and display the resulting
automaton.

## Running locally

Open `index.html` in a browser, or serve with any static file server:

```bash
python -m http.server
```
