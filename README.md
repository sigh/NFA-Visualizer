# NFA Visualizer

A web-based tool for visualizing Non-deterministic Finite Automata (NFAs)
written in JavaScript.

Define a NFA using simple JavaScript functions and instantly see:

- The state graph with transitions
- Start, accept, and dead states highlighted
- Test inputs with step-by-step execution traces

It is hosted at <http://sigh.github.io/NFA-Visualizer>

## Usage

An NFA is defined with three components:

1. **startState** - The initial state (or array of states)
2. **transition(state, symbol)** - Returns the next state(s) for a given input
3. **accept(state)** - Returns true if the state is accepting

The visualizer will explore all reachable states and display the resulting
automaton.

## Running locally

Open `index.html` in a browser, or serve with any static file server:

```bash
python -m http.server
```
