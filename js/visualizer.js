/**
 * NFA Visualizer - Cytoscape-based State Diagram Renderer
 *
 * Renders NFAs as interactive state diagrams using Cytoscape.js with:
 * - Dagre layout for directed graphs
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
  deadState: '#2a2a30',
  deadStateStroke: '#3a3a42',
  deadText: '#a0a0a8',
  text: '#f5f5f7',
  textDark: '#1a1a1a',
  textMuted: '#6a6a75',
  transition: '#6a6a7a',
  transitionText: '#d0d0d8',
  transitionMuted: '#3a3a42',
  highlight: '#fbbf24',
  highlightDim: '#b08a1a'
};

/** Font stack for canvas text */
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, sans-serif';

/**
 * Cytoscape stylesheet for NFA visualization
 *
 * Style priority (later rules override earlier):
 * 1. Base node/edge styles
 * 2. State type styles (start, accept, dead)
 * 3. Combination styles (start+accept)
 * 4. Trace highlight styles (highlighted, highlighted-final)
 * 5. Highlight + state type combinations
 */
const CYTOSCAPE_STYLE = [
  // ========== BASE STYLES ==========
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

  // ========== STATE TYPE STYLES ==========
  // Start state: blue fill
  {
    selector: 'node.start',
    style: {
      'background-color': COLORS.startState,
      'border-color': COLORS.startState
    }
  },
  // Accept state: green double border
  {
    selector: 'node.accept',
    style: {
      'border-width': 4,
      'border-color': COLORS.acceptState,
      'border-style': 'double'
    }
  },
  // Start + Accept: blue fill, green double border
  {
    selector: 'node.start.accept',
    style: {
      'background-color': COLORS.startState,
      'border-color': COLORS.acceptState
    }
  },
  // Dead state: dark, dashed border
  {
    selector: 'node.dead',
    style: {
      'background-color': COLORS.deadState,
      'border-color': COLORS.deadStateStroke,
      'border-style': 'dashed',
      'color': COLORS.deadText
    }
  },
  // Dead edges: muted, dashed
  {
    selector: 'edge.dead',
    style: {
      'line-color': COLORS.transitionMuted,
      'target-arrow-color': COLORS.transitionMuted,
      'line-style': 'dashed',
      'color': COLORS.deadText
    }
  },

  // ========== TRACE HIGHLIGHT STYLES ==========
  // Visited state: yellow border
  {
    selector: 'node.highlighted',
    style: {
      'border-color': COLORS.highlightDim,
      'border-width': 4,
      'border-style': 'solid'
    }
  },
  // Final state: yellow fill
  {
    selector: 'node.highlighted-final',
    style: {
      'background-color': COLORS.highlight,
      'border-color': COLORS.highlight,
      'border-width': 4,
      'border-style': 'solid',
      'color': COLORS.textDark
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

  // ========== HIGHLIGHT + STATE TYPE COMBINATIONS ==========
  // Accept + final: keep green double border
  {
    selector: 'node.accept.highlighted-final',
    style: {
      'background-color': COLORS.highlight,
      'border-color': COLORS.acceptState,
      'border-width': 5,
      'border-style': 'double',
      'color': COLORS.textDark
    }
  },
  // Dead + visited: keep dashed border
  {
    selector: 'node.dead.highlighted',
    style: {
      'border-color': COLORS.highlightDim,
      'border-width': 4,
      'border-style': 'dashed'
    }
  },
  // Dead + final: yellow fill, dashed border
  {
    selector: 'node.dead.highlighted-final',
    style: {
      'background-color': COLORS.highlight,
      'border-color': COLORS.highlight,
      'border-width': 4,
      'border-style': 'dashed',
      'color': COLORS.textDark
    }
  },
  // Dead + highlighted edge: keep dashed
  {
    selector: 'edge.dead.highlighted',
    style: {
      'line-color': COLORS.highlight,
      'target-arrow-color': COLORS.highlight,
      'width': 3
    }
  },

  // ========== SPECIAL ELEMENTS ==========
  // Start arrow marker (invisible node)
  {
    selector: 'node.start-marker',
    style: {
      'width': 1,
      'height': 1,
      'background-opacity': 0,
      'border-width': 0
    }
  },
  // Start arrow edge
  {
    selector: 'edge.start-arrow',
    style: {
      'width': 2,
      'line-color': COLORS.startState,
      'target-arrow-color': COLORS.startState,
      'target-arrow-shape': 'triangle',
      'curve-style': 'straight'
    }
  },
  // Hidden elements (for dead state toggle)
  {
    selector: '.hidden',
    style: {
      'display': 'none'
    }
  }
];

// ============================================
// Symbol Label Compression
// ============================================

/**
 * Compress a list of symbols into a compact regex-like character class string.
 * Consecutive characters are collapsed into ranges (e.g., 1,2,3,5,7,8,9 → 1-357-9)
 *
 * @param {Array<string|number>} symbols - Array of symbols
 * @returns {string} Compact label
 */
function compactSymbolLabel(symbols) {
  if (symbols.length === 0) return '';
  if (symbols.length === 1) return String(symbols[0]);

  // Convert to strings and sort
  const strs = symbols.map(String).sort((a, b) => {
    // Sort numbers numerically, then letters
    const aNum = Number(a), bNum = Number(b);
    const aIsNum = !isNaN(aNum) && a.length === 1;
    const bIsNum = !isNaN(bNum) && b.length === 1;
    if (aIsNum && bIsNum) return aNum - bNum;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  // Build ranges for single characters
  const result = [];
  let rangeStart = null;
  let rangeEnd = null;

  const flushRange = () => {
    if (rangeStart === null) return;
    const len = rangeEnd.charCodeAt(0) - rangeStart.charCodeAt(0);
    if (len >= 2) {
      result.push(`${rangeStart}-${rangeEnd}`);
    } else if (len === 1) {
      result.push(rangeStart, rangeEnd);
    } else {
      result.push(rangeStart);
    }
    rangeStart = rangeEnd = null;
  };

  for (const s of strs) {
    // Only single characters can form ranges
    if (s.length !== 1) {
      flushRange();
      result.push(s);
      continue;
    }

    const code = s.charCodeAt(0);

    if (rangeStart === null) {
      rangeStart = rangeEnd = s;
    } else if (code === rangeEnd.charCodeAt(0) + 1) {
      // Extend range
      rangeEnd = s;
    } else {
      // End current range, start new one
      flushRange();
      rangeStart = rangeEnd = s;
    }
  }

  flushRange();
  return result.join('');
}

// ============================================
// NFAVisualizer Class
// ============================================

export class NFAVisualizer {
  constructor(container) {
    this.container = container;
    this.cy = null;
    this.nfa = null;
    this.hideDeadStates = false;
  }

  /** Set whether to hide dead states */
  setHideDeadStates(hide) {
    if (this.hideDeadStates === hide) return;
    this.hideDeadStates = hide;
    if (this.cy) {
      // Toggle visibility without re-rendering
      if (hide) {
        this.cy.$('.dead').addClass('hidden');
      } else {
        this.cy.$('.dead').removeClass('hidden');
      }
    }
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

    // Create tooltip element if it doesn't exist
    this.ensureTooltip();

    // Create new Cytoscape instance
    this.cy = cytoscape({
      container: this.container,
      elements: elements,
      style: CYTOSCAPE_STYLE,
      layout: this.getLayoutOptions(),
      wheelSensitivity: 0.3,
      minZoom: 0.3,
      maxZoom: 3
    });

    // Apply current visibility state
    if (this.hideDeadStates) {
      this.cy.$('.dead').addClass('hidden');
    }

    // Setup tooltip events
    this.setupTooltipEvents();

    // Fit to container with padding
    this.cy.fit(50);
  }

  /**
   * Ensure tooltip element exists
   */
  ensureTooltip() {
    // Check if tooltip already exists and is still in DOM
    if (this.tooltip && this.tooltip.parentNode === this.container) {
      return;
    }
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'graph-tooltip';
    this.container.appendChild(this.tooltip);
  }

  /**
   * Setup tooltip mouse events
   */
  setupTooltipEvents() {
    // Show tooltip on node hover
    this.cy.on('mouseover', 'node:not(.start-marker)', (event) => {
      const node = event.target;
      const fullLabel = node.data('fullLabel');
      if (fullLabel) {
        this.tooltip.textContent = fullLabel;
        this.tooltip.style.display = 'block';
      }
    });

    // Update tooltip position on mouse move
    this.cy.on('mousemove', 'node:not(.start-marker)', (event) => {
      const renderedPos = event.renderedPosition;
      this.tooltip.style.left = `${renderedPos.x + 15}px`;
      this.tooltip.style.top = `${renderedPos.y - 10}px`;
    });

    // Hide tooltip when leaving node
    this.cy.on('mouseout', 'node', () => {
      this.tooltip.style.display = 'none';
    });
  }

  /**
   * Build Cytoscape elements from NFA
   */
  buildElements() {
    const elements = [];
    const states = this.nfa.getStateInfo();
    const transitions = this.nfa.getAllTransitions();

    const deadStateIds = new Set();

    // Add state nodes (always include all states for consistent layout)
    states.forEach(state => {
      if (state.isDead) deadStateIds.add(state.id);

      const classes = [];
      if (state.isStart) classes.push('start');
      if (state.isAccept) classes.push('accept');
      if (state.isDead) classes.push('dead');

      elements.push({
        data: {
          id: `s${state.id}`,
          label: this.getStateLabel(state.id),
          fullLabel: this.getFullStateLabel(state.id)
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
      const isDead = deadStateIds.has(from) || deadStateIds.has(to);
      const label = compactSymbolLabel(symbols);
      const classes = [];
      if (isLoop) classes.push('loop');
      if (isDead) classes.push('dead');

      elements.push({
        data: {
          id: `e${key}`,
          source: `s${from}`,
          target: `s${to}`,
          label: label
        },
        classes: classes.join(' ')
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
   * Get layout options for the graph
   * @returns {Object} Layout options
   */
  getLayoutOptions() {
    return {
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 50,
      rankSep: 80,
      padding: 30
    };
  }

  /**
   * Get display label for a state (just the number for graph clarity)
   * @param {number} stateId
   * @returns {string}
   */
  getStateLabel(stateId) {
    return `q${stateId}`;
  }

  /**
   * Get full label for a state (used in tooltips)
   * @param {number} stateId
   * @returns {string}
   */
  getFullStateLabel(stateId) {
    const stateLabel = this.nfa.stateLabels.get(stateId);
    if (stateLabel === null || stateLabel === undefined) {
      return `q${stateId}`;
    }
    return `q${stateId}: ${stateLabel}`;
  }

  /**
   * Highlight all states and edges visited during a trace
   * @param {Array<{states: number[]}>} trace
   */
  highlightTrace(trace) {
    if (!this.cy) return;

    // Clear previous highlights
    this.cy.elements().removeClass('highlighted highlighted-final');

    // Track visited states at each step and transitions taken
    const visitedStates = new Set();
    const visitedEdges = new Set();

    for (let i = 0; i < trace.length; i++) {
      const step = trace[i];
      for (const stateId of step.states) {
        visitedStates.add(stateId);
      }

      // Track edges from previous step to current step
      if (i > 0) {
        const prevStates = trace[i - 1].states;
        for (const fromId of prevStates) {
          for (const toId of step.states) {
            visitedEdges.add(`${fromId}-${toId}`);
          }
        }
      }
    }

    // Get final states
    const finalStates = trace.length > 0
      ? new Set(trace[trace.length - 1].states)
      : new Set();

    // Highlight visited states
    for (const stateId of visitedStates) {
      const node = this.cy.$(`#s${stateId}`);
      if (finalStates.has(stateId)) {
        node.addClass('highlighted-final');
      } else {
        node.addClass('highlighted');
      }
    }

    // Highlight visited edges
    for (const edgeKey of visitedEdges) {
      this.cy.$(`#e${edgeKey}`).addClass('highlighted');
    }
  }

  /**
   * Clear all trace highlighting
   */
  clearHighlight() {
    if (this.cy) {
      this.cy.elements().removeClass('highlighted highlighted-final');
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
