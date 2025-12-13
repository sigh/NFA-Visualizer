/**
 * NFA Visualizer - Cytoscape-based State Diagram Renderer
 *
 * Renders NFAs as interactive state diagrams using Cytoscape.js with:
 * - Dagre layout for directed graphs
 * - Visual distinction for start/accept/dead states
 * - State selection with outgoing edge highlighting
 * - Trace highlighting for test execution
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
  epsilon: '#a78bfa', // Light purple for epsilon
  highlight: '#fbbf24',
  highlightDim: '#b08a1a',
  primary: '#6c9eff'
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
 * 4. Selection styles
 * 5. Selection + state type combinations
 * 6. Trace highlight styles (highlighted, highlighted-final outline)
 * 7. Highlight + state type combinations
 * 8. High priority rules (e.g. accept border)
 */
const CYTOSCAPE_STYLE = [
  // ========== NODE INTERNAL STYLES ==========
  // Base style
  {
    selector: 'node',
    style: {
      'background-color': COLORS.state,
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
  // Dead state: dark
  {
    selector: 'node.dead',
    style: {
      'background-color': COLORS.deadState,
      'color': COLORS.deadText
    }
  },
  // Start state: override dead (border will differentiate)
  {
    selector: 'node.start',
    style: {
      'background-color': COLORS.startState,
      'color': COLORS.text,
    }
  },

  // ========== NODE BORDER STYLES ==========
  // Border defaults
  {
    selector: 'node',
    style: {
      'border-color': COLORS.stateStroke,
      'border-width': 2,
    }
  },
  // Dead states are always dashed
  {
    selector: 'node.dead',
    style: {
      'border-color': COLORS.deadStateStroke,
      'border-style': 'dashed'
    }
  },
  // Start state border matches the fill, but can be overridden.
  {
    selector: 'node.start',
    style: {
      'border-color': COLORS.startState
    }
  },
  // Accept border is always doubled.
  // Green border overrides the start state, but not anything else.
  {
    selector: 'node.accept',
    style: {
      'border-width': 4,
      'border-style': 'double',
      'border-color': COLORS.acceptState,
    }
  },
  // Highlighting overrides all but selection.
  {
    selector: 'node.highlighted',
    style: {
      'border-color': COLORS.highlightDim,
      'border-width': 4
    }
  },
  // Final state: yellow outline/halo
  {
    selector: 'node.highlighted-final',
    style: {
      'border-color': COLORS.highlight,
      'border-width': 4,
      'outline-color': COLORS.highlight,
      'outline-width': 5,
      'outline-opacity': 0.3,
      'outline-style': 'solid',
    }
  },
  // Selected state overrides any border color.
  {
    selector: 'node.selected',
    style: {
      'border-color': COLORS.primary,
      'border-width': 4
    }
  },

  // ========== EDGE STYLES ==========
  // Edge defaults
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
  {
    selector: 'edge.epsilon',
    style: {
      'label': 'ε',
      'font-family': 'Times New Roman, serif',
      'font-style': 'italic',
      'font-size': '20px',
      'font-weight': 'bold',
      'color': COLORS.epsilon
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
  // Highlighted edge
  {
    selector: 'edge.highlighted',
    style: {
      'line-color': COLORS.highlight,
      'target-arrow-color': COLORS.highlight,
      'width': 3
    }
  },
  // Outgoing edge from selected state
  {
    selector: 'edge.selected-outgoing',
    style: {
      'line-color': COLORS.primary,
      'target-arrow-color': COLORS.primary,
      'width': 3
    }
  },

  // ========== SPECIAL ELEMENT STYLES ==========
  // Hidden elements (general purpose)
  {
    selector: '.hidden',
    style: {
      'display': 'none'
    }
  },
  // Combined nodes (canonical nodes that absorbed other states)
  {
    selector: 'node.combined',
    style: {
      'shape': 'diamond',
      'width': 50,
      'height': 50
    }
  },
];



// ============================================
// Symbol Label Compression
// ============================================

/**
 * Compress a list of symbols into a compact regex-like character class string.
 * Consecutive characters are collapsed into ranges (e.g., 1,2,3,5,7,8,9 → 1-357-9)
 *
 * @param {Array<string|number>} symbols - Array of symbols (must be sorted by symbol index)
 * @returns {string} Compact label
 */
export function compactSymbolLabel(symbols) {
  if (symbols.length === 0) return '';
  if (symbols.length === 1) return String(symbols[0]);

  // Symbols are already in index order from NFA iteration.
  // Convert to strings for range detection.
  const strs = symbols.map(String);

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
    this.view = null;
  }

  /**
   * Get current node positions
   * @returns {Map<number, {x: number, y: number}>} Map of state ID to position
   */
  getNodePositions() {
    const positions = new Map();
    if (!this.cy) return positions;

    this.cy.nodes().forEach(node => {
      const id = node.id();
      if (id.startsWith('s')) {
        const stateId = parseInt(id.slice(1), 10);
        const pos = node.position();
        positions.set(stateId, { x: pos.x, y: pos.y });
      }
    });

    return positions;
  }

  /**
   * Get current viewport (zoom and pan)
   * @returns {{zoom: number, pan: {x: number, y: number}}}
   */
  getViewport() {
    if (!this.cy) return { zoom: 1, pan: { x: 0, y: 0 } };
    return {
      zoom: this.cy.zoom(),
      pan: this.cy.pan()
    };
  }

  /**
   * Set viewport (zoom and pan)
   * @param {{zoom: number, pan: {x: number, y: number}}} viewport
   */
  setViewport(viewport) {
    if (!this.cy || !viewport) return;
    this.cy.viewport({
      zoom: viewport.zoom,
      pan: viewport.pan
    });
  }

  /**
   * Render the NFA visualization
   * @param {import('./nfa_view.js').NFAView} view - The NFA view to render
   * @param {Map<number, {x: number, y: number}>} [positions] - Optional preset positions
   */
  render(view, positions = null) {
    this.view = view;
    const elements = this.buildElements();

    // Destroy existing instance
    if (this.cy) {
      this.cy.destroy();
    }

    // Create tooltip element if it doesn't exist
    this.ensureTooltip();

    // Determine layout: use preset positions if provided, otherwise dagre
    const layoutOptions = positions && positions.size > 0
      ? this.getPresetLayoutOptions(positions)
      : this.getLayoutOptions();

    // Create new Cytoscape instance
    this.cy = cytoscape({
      container: this.container,
      elements: elements,
      style: CYTOSCAPE_STYLE,
      layout: layoutOptions,
      minZoom: 0.05,
      maxZoom: 4
    });

    // Setup tooltip events
    this.setupTooltipEvents();

    // Fit to container with padding (only if no preset positions)
    if (!positions || positions.size === 0) {
      this.cy.fit(50);
    }
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
    this.cy.on('mouseover', 'node', (event) => {
      const node = event.target;
      const fullLabel = node.data('fullLabel');
      if (fullLabel) {
        this.tooltip.textContent = fullLabel;
        this.tooltip.style.display = 'block';
      }
    });

    // Update tooltip position on mouse move
    this.cy.on('mousemove', 'node', (event) => {
      const renderedPos = event.renderedPosition;
      this.tooltip.style.left = `${renderedPos.x + 15}px`;
      this.tooltip.style.top = `${renderedPos.y - 10}px`;
    });

    // Hide tooltip when leaving node
    this.cy.on('mouseout', 'node', () => {
      this.tooltip.style.display = 'none';
    });

    // Handle click on node for selection
    this.cy.on('tap', 'node', (event) => {
      const node = event.target;
      const stateId = parseInt(node.id().slice(1), 10);
      this.selectState(stateId);
      // Notify external handler if set
      if (this.onStateSelect) {
        this.onStateSelect(stateId);
      }
    });

    // Handle click on background to deselect
    this.cy.on('tap', (event) => {
      if (event.target === this.cy) {
        this.clearSelection();
        if (this.onStateSelect) {
          this.onStateSelect(null);
        }
      }
    });
  }

  /**
   * Select a state and highlight its outgoing transitions
   * @param {number} stateId
   */
  selectState(stateId) {
    if (!this.cy) return;

    // Clear previous selection
    this.cy.elements().removeClass('selected selected-outgoing');

    // Select the node
    this.cy.$(`#s${stateId}`).addClass('selected');

    // Highlight outgoing edges
    this.cy.edges().forEach(edge => {
      if (edge.source().id() === `s${stateId}`) {
        edge.addClass('selected-outgoing');
      }
    });
  }

  /**
   * Clear state selection
   */
  clearSelection() {
    if (this.cy) {
      this.cy.elements().removeClass('selected selected-outgoing');
    }
  }

  /**
   * Build Cytoscape elements from the view
   *
   * Renders ALL states but hides non-canonical ones with CSS.
   * This preserves positions when toggling merge on/off.
   */
  buildElements() {
    const elements = [];
    const view = this.view;
    const states = view.getStateInfo();

    const deadStateIds = new Set();

    // Add ALL state nodes, hiding non-canonical ones
    for (const state of states) {
      if (state.isDead) deadStateIds.add(state.id);

      const isCanonical = view.isCanonical(state.id);
      const classes = [];
      if (state.isStart) classes.push('start');
      if (state.isAccept) classes.push('accept');
      if (state.isDead) classes.push('dead');
      if (!isCanonical) {
        classes.push('hidden');
      } else if (view.isMergedState(state.id)) {
        classes.push('combined');
      }

      const sources = view.mergedSources.get(state.id) || [state.id];

      elements.push({
        data: {
          id: `s${state.id}`,
          label: this.getStateLabel(state.id, sources),
          fullLabel: this.getFullStateLabel(state.id, sources)
        },
        classes: classes.join(' ')
      });
    }

    // Add edges for each canonical state
    for (const state of states) {
      if (!view.isCanonical(state.id)) continue;

      // Regular transitions
      const transitions = view.getTransitionsFrom(state.id);
      for (const [to, symbols] of transitions) {
        const isLoop = state.id === to;
        const isDead = deadStateIds.has(state.id) || deadStateIds.has(to);
        const label = compactSymbolLabel(symbols);

        const classes = [];
        if (isLoop) classes.push('loop');
        if (isDead) classes.push('dead');

        elements.push({
          data: {
            id: `e${state.id}-${to}`,
            source: `s${state.id}`,
            target: `s${to}`,
            label: label
          },
          classes: classes.join(' ')
        });
      }

      // Epsilon transitions
      if (view.showEpsilonTransitions) {
        const epsilonTargets = view.getEpsilonTransitionsFrom(state.id);
        for (const to of epsilonTargets) {
          const isLoop = state.id === to;
          const isDead = deadStateIds.has(state.id) || deadStateIds.has(to);

          const classes = ['epsilon'];
          if (isLoop) classes.push('loop');
          if (isDead) classes.push('dead');

          elements.push({
            data: {
              id: `eps${state.id}-${to}`,
              source: `s${state.id}`,
              target: `s${to}`,
              label: 'ε'
            },
            classes: classes.join(' ')
          });
        }
      }
    }

    return elements;
  }

  /**
   * Get layout options for the graph
   * @returns {Object} Layout options
   */
  getLayoutOptions() {
    return {
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 100,
      rankSep: 80,
    };
  }

  /**
   * Get layout options for preset positions
   * @param {Map<number, {x: number, y: number}>} positions
   * @returns {Object} Layout options
   */
  getPresetLayoutOptions(positions) {
    return {
      name: 'preset',
      positions: (node) => {
        const id = node.id();
        if (id.startsWith('s')) {
          const stateId = parseInt(id.slice(1), 10);
          if (positions.has(stateId)) {
            return positions.get(stateId);
          }
        }
        return { x: 0, y: 0 };
      },
      padding: 30
    };
  }

  /**
   * Get display label for a state
   * @param {number} stateId
   * @param {number[]} sources - Source state IDs for this node
   * @returns {string}
   */
  getStateLabel(stateId, sources) {
    // If this node absorbed other states, show with prime notation
    if (sources.length > 1) {
      return `q${stateId}'`;
    }
    return `q${stateId}`;
  }

  /**
   * Get full label for a state (used in tooltips)
   * @param {number} stateId
   * @param {number[]} sources - Source state IDs for this node
   * @returns {string}
   */
  getFullStateLabel(stateId, sources) {
    // If this node absorbed other states, list each source on its own line
    if (sources.length > 1) {
      const sourceLines = sources.map(id => {
        const label = this.view.nfa.stateLabels[id];
        return label !== null && label !== undefined ? `q${id}: ${label}` : `q${id}`;
      });
      return sourceLines.join('\n');
    }

    const stateLabel = this.view.nfa.stateLabels[stateId];
    if (stateLabel === null || stateLabel === undefined) {
      return `q${stateId}`;
    }
    return `q${stateId}: ${stateLabel}`;
  }

  /**
   * Calculate which elements should be highlighted for a trace
   * @param {Array<{states: number[]}>} trace
   * @returns {{visitedStates: Set<number>, visitedEdges: Set<string>, visitedEpsilonEdges: Set<string>, finalStates: Set<number>}}
   */
  calculateTraceHighlights(trace) {
    const view = this.view;
    const visitedStates = new Set();
    const visitedEdges = new Set();
    const visitedEpsilonEdges = new Set();

    // Helper to get canonical set for a step
    const getCanonicalSet = (states) => {
      const set = new Set();
      for (const id of states) {
        const canonical = view.getCanonical(id);
        if (canonical !== -1) set.add(canonical);
      }
      return set;
    };

    let prevCanonicalStates = new Set();

    for (let i = 0; i < trace.length; i++) {
      const step = trace[i];
      const currCanonicalStates = getCanonicalSet(step.states);

      // Add to visited states
      for (const s of currCanonicalStates) visitedStates.add(s);

      // 1. Check for epsilon transitions within the current step
      for (const fromId of currCanonicalStates) {
        const epsilonTargets = view.getEpsilonTransitionsFrom(fromId);
        for (const toId of epsilonTargets) {
          if (currCanonicalStates.has(toId)) {
            visitedEpsilonEdges.add(`${fromId}-${toId}`);
          }
        }
      }

      // 2. Check for transitions from previous step
      if (i > 0) {
        for (const fromId of prevCanonicalStates) {
          const transitions = view.getTransitionsFrom(fromId);
          for (const toId of transitions.keys()) {
            if (currCanonicalStates.has(toId)) {
              visitedEdges.add(`${fromId}-${toId}`);
            }
          }
        }
      }

      prevCanonicalStates = currCanonicalStates;
    }

    // Get final canonical states
    const finalStates = trace.length > 0
      ? getCanonicalSet(trace[trace.length - 1].states)
      : new Set();

    return { visitedStates, visitedEdges, visitedEpsilonEdges, finalStates };
  }

  /**
   * Highlight all states and edges visited during a trace
   * @param {Array<{states: number[]}>} trace
   */
  highlightTrace(trace) {
    if (!this.cy) return;

    // Clear previous highlights (selection is independent)
    this.cy.elements().removeClass('highlighted highlighted-final');

    const { visitedStates, visitedEdges, visitedEpsilonEdges, finalStates } = this.calculateTraceHighlights(trace);

    // Apply highlights in batch
    this.cy.batch(() => {
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

      // Highlight visited epsilon edges
      for (const edgeKey of visitedEpsilonEdges) {
        this.cy.$(`#eps${edgeKey}`).addClass('highlighted');
      }
    });
  }  /**
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
