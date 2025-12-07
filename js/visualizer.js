/**
 * NFA Visualizer - Cytoscape-based State Diagram Renderer
 *
 * Renders NFAs as interactive state diagrams using Cytoscape.js with:
 * - Automatic layout (breadthfirst for small graphs, cose for larger)
 * - Visual distinction for start/accept states
 * - Curved edges for parallel transitions
 * - Self-loop rendering
 * - Trace highlighting
 *
 * @module visualizer
 */

// ============================================
// Configuration
// ============================================

/**
 * Visual theme colors - synced with CSS variables
 */
const COLORS = {
  background: '#0f0f12',
  state: '#2a2a35',
  stateStroke: '#5a5a6a',
  startState: '#60a5fa',
  acceptState: '#4ade80',
  text: '#f5f5f7',
  transition: '#6a6a7a',
  transitionText: '#d0d0d8',
  highlight: '#fbbf24'
};

/** Font stack for canvas text */
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, sans-serif';

/**
 * Cytoscape stylesheet for NFA visualization
 */
const CYTOSCAPE_STYLE = [
  // Base node style
  {
    selector: 'node',
    style: {
      'background-color': COLORS.state,
      'border-color': COLORS.stateStroke,
      'border-width': 2,
      'label': 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'color': COLORS.text,
      'font-size': '12px',
      'font-family': FONT_FAMILY,
      'width': 50,
      'height': 50
    }
  },
  // Start state
  {
    selector: 'node.start',
    style: {
      'background-color': COLORS.startState,
      'border-color': COLORS.startState
    }
  },
  // Accept state (double border effect)
  {
    selector: 'node.accept',
    style: {
      'border-width': 4,
      'border-color': COLORS.acceptState,
      'border-style': 'double'
    }
  },
  // Start + Accept state
  {
    selector: 'node.start.accept',
    style: {
      'background-color': COLORS.startState,
      'border-color': COLORS.acceptState
    }
  },
  // Highlighted state
  {
    selector: 'node.highlighted',
    style: {
      'border-color': COLORS.highlight,
      'border-width': 4,
      'background-opacity': 1
    }
  },
  // Base edge style
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': COLORS.transition,
      'target-arrow-color': COLORS.transition,
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'font-size': '11px',
      'font-family': FONT_FAMILY,
      'color': COLORS.transitionText,
      'text-background-color': COLORS.background,
      'text-background-opacity': 1,
      'text-background-padding': '3px',
      'text-rotation': 'autorotate'
    }
  },
  // Self-loop edges
  {
    selector: 'edge.loop',
    style: {
      'curve-style': 'unbundled-bezier',
      'control-point-distances': [40],
      'control-point-weights': [0.5],
      'loop-direction': '-45deg',
      'loop-sweep': '90deg'
    }
  },
  // Highlighted edge
  {
    selector: 'edge.highlighted',
    style: {
      'line-color': COLORS.highlight,
      'target-arrow-color': COLORS.highlight,
      'width': 3
    }
  },
  // Start arrow (pseudo-edge from invisible node)
  {
    selector: 'node.start-marker',
    style: {
      'width': 1,
      'height': 1,
      'background-opacity': 0,
      'border-width': 0
    }
  },
  {
    selector: 'edge.start-arrow',
    style: {
      'width': 2,
      'line-color': COLORS.startState,
      'target-arrow-color': COLORS.startState,
      'target-arrow-shape': 'triangle',
      'curve-style': 'straight'
    }
  }
];

// ============================================
// NFAVisualizer Class
// ============================================

export class NFAVisualizer {
  /**
   * @param {HTMLElement} container - The container element for Cytoscape
   */
  constructor(container) {
    this.container = container;
    this.cy = null;
    this.nfa = null;
  }

  /**
   * Render the NFA visualization
   * @param {import('./nfa.js').NFA} nfa
   */
  render(nfa) {
    this.nfa = nfa;
    const elements = this.buildElements();

    // Destroy existing instance
    if (this.cy) {
      this.cy.destroy();
    }

    // Create new Cytoscape instance
    this.cy = cytoscape({
      container: this.container,
      elements: elements,
      style: CYTOSCAPE_STYLE,
      layout: this.getLayoutOptions(elements),
      wheelSensitivity: 0.3,
      minZoom: 0.3,
      maxZoom: 3
    });

    // Fit to container with padding
    this.cy.fit(50);
  }

  /**
   * Build Cytoscape elements from NFA
   * @returns {Array} Cytoscape elements array
   */
  buildElements() {
    const elements = [];
    const states = this.nfa.getStateInfo();
    const transitions = this.nfa.getAllTransitions();

    // Add state nodes
    states.forEach(state => {
      const classes = [];
      if (state.isStart) classes.push('start');
      if (state.isAccept) classes.push('accept');

      elements.push({
        data: {
          id: `s${state.id}`,
          label: this.getStateLabel(state.id)
        },
        classes: classes.join(' ')
      });

      // Add invisible marker node + edge for start states
      if (state.isStart) {
        elements.push({
          data: { id: `start-marker-${state.id}` },
          classes: 'start-marker'
        });
        elements.push({
          data: {
            id: `start-edge-${state.id}`,
            source: `start-marker-${state.id}`,
            target: `s${state.id}`
          },
          classes: 'start-arrow'
        });
      }
    });

    // Group transitions by source-target pair
    const grouped = this.groupTransitions(transitions);

    // Add edges
    grouped.forEach(({ from, to, symbols }, key) => {
      const isLoop = from === to;
      const label = symbols.join(', ');

      elements.push({
        data: {
          id: `e${key}`,
          source: `s${from}`,
          target: `s${to}`,
          label: label
        },
        classes: isLoop ? 'loop' : ''
      });
    });

    return elements;
  }

  /**
   * Group transitions by source-target pair
   * @param {Array} transitions
   * @returns {Map}
   */
  groupTransitions(transitions) {
    const grouped = new Map();

    transitions.forEach(t => {
      const key = `${t.from}-${t.to}`;
      if (!grouped.has(key)) {
        grouped.set(key, { from: t.from, to: t.to, symbols: [] });
      }
      grouped.get(key).symbols.push(t.symbol);
    });

    return grouped;
  }

  /**
   * Get layout options based on graph structure
   * @param {Array} elements
   * @returns {Object} Layout options
   */
  getLayoutOptions(elements) {
    const nodeCount = elements.filter(e => e.data.id?.startsWith('s')).length;

    // Use breadthfirst for small graphs, cose for larger ones
    if (nodeCount <= 10) {
      return {
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.5,
        padding: 50,
        avoidOverlap: true
      };
    }

    return {
      name: 'cose',
      idealEdgeLength: 100,
      nodeOverlap: 20,
      padding: 50,
      randomize: false,
      componentSpacing: 100,
      nodeRepulsion: 400000,
      edgeElasticity: 100,
      nestingFactor: 5,
      gravity: 80,
      numIter: 1000,
      animate: false
    };
  }

  /**
   * Get display label for a state
   * @param {number} stateId
   * @returns {string}
   */
  getStateLabel(stateId) {
    if (this.nfa.stateLabels?.has(stateId)) {
      const label = this.nfa.stateLabels.get(stateId);
      try {
        const value = JSON.parse(label);
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        if (value === null) return 'null';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      } catch {
        return label;
      }
    }
    return `q${stateId}`;
  }

  /**
   * Highlight states from a trace
   * @param {Array<{states: number[]}>} trace
   */
  highlightTrace(trace) {
    if (!this.cy) return;

    // Clear previous highlights
    this.cy.elements().removeClass('highlighted');

    if (trace.length > 0) {
      const lastStep = trace[trace.length - 1];
      lastStep.states.forEach(stateId => {
        this.cy.$(`#s${stateId}`).addClass('highlighted');
      });
    }
  }

  /**
   * Clear all highlighting
   */
  clearHighlight() {
    if (this.cy) {
      this.cy.elements().removeClass('highlighted');
    }
  }

  /**
   * Fit the graph to the container
   */
  fit() {
    if (this.cy) {
      this.cy.fit(50);
    }
  }

  /**
   * Destroy the Cytoscape instance
   */
  destroy() {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }
}
