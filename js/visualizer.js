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
 * 6. Trace highlight styles (highlighted, highlighted-final)
 * 7. Highlight + state type combinations
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

  // ========== SELECTION STYLES ==========
  // Selected state
  {
    selector: 'node.selected',
    style: {
      'border-color': COLORS.primary,
      'border-width': 4
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

  // ========== SELECTION + STATE TYPE COMBINATIONS ==========
  // Dead state selected: keep dashed border style
  {
    selector: 'node.dead.selected',
    style: {
      'border-color': COLORS.primary,
      'border-width': 4,
      'border-style': 'dashed'
    }
  },
  // Accept state selected: keep double border style
  {
    selector: 'node.accept.selected',
    style: {
      'border-color': COLORS.primary,
      'border-width': 5,
      'border-style': 'double'
    }
  },
  // Dead edge selected: keep dashed line style
  {
    selector: 'edge.dead.selected-outgoing',
    style: {
      'line-color': COLORS.primary,
      'target-arrow-color': COLORS.primary,
      'width': 3,
      'line-style': 'dashed'
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
  // Hidden elements (general purpose)
  {
    selector: '.hidden',
    style: {
      'display': 'none'
    }
  },
  // Merged elements (hidden when merge toggle is on)
  {
    selector: '.merged',
    style: {
      'display': 'none'
    }
  },
  // Merged edges are hidden by default (shown when merging is active)
  {
    selector: '.merged-edge',
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
  }
];

// ============================================
// Symbol Label Compression
// ============================================

/**
 * Compress a list of symbols into a compact regex-like character class string.
 * Consecutive characters are collapsed into ranges (e.g., 1,2,3,5,7,8,9 → 1-357-9)
 *
 * @param {Array<string|number>} symbols - Array of symbols (assumed to be pre-sorted by symbol index)
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
    this.nfa = null;
    this.transform = null;
  }

  /**
   * Check if transform is active (has non-identity mappings)
   * @returns {boolean}
   */
  isTransformActive() {
    if (!this.transform || !this.nfa) return false;
    const remap = this.transform.remap;
    for (let i = 0; i < remap.length; i++) {
      if (remap[i] !== i) return true;
    }
    return false;
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
   * @param {import('./nfa.js').NFA} nfa
   * @param {import('./nfa.js').StateTransformation} [transform] - Optional transformation to apply
   * @param {Map<number, {x: number, y: number}>} [positions] - Optional preset positions
   */
  render(nfa, transform = null, positions = null) {
    this.nfa = nfa;
    this.transform = transform;
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
      wheelSensitivity: 0.3,
      minZoom: 0.3,
      maxZoom: 3
    });

    // Show merged edges when transform is active
    if (this.isTransformActive()) {
      this.cy.$('.merged-edge').removeClass('merged-edge');
    }

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

    // Handle click on node for selection
    this.cy.on('tap', 'node:not(.start-marker)', (event) => {
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
      if (edge.source().id() === `s${stateId}` && !edge.hasClass('start-arrow')) {
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
   * Build Cytoscape elements from NFA, applying transform if present
   */
  buildElements() {
    const elements = [];
    const states = this.nfa.getStateInfo();
    const transitions = this.nfa.getAllTransitions();
    const transform = this.transform;

    const deadStateIds = new Set();

    // Helper: check if state is canonical (visible when merged)
    const isCanonical = (stateId) => {
      if (!transform) return true;
      return transform.remap[stateId] === stateId;
    };

    // Helper: get canonical state for a given state
    const getCanonical = (stateId) => {
      if (!transform) return stateId;
      return transform.remap[stateId];
    };

    // Helper: check if merging is active
    const isMerging = transform && states.some(s => !isCanonical(s.id));

    // Build map of canonical state -> list of source states that map to it
    const mergedSources = new Map();
    if (isMerging) {
      for (const state of states) {
        const canonical = getCanonical(state.id);
        if (canonical !== -1) {
          if (!mergedSources.has(canonical)) {
            mergedSources.set(canonical, []);
          }
          mergedSources.get(canonical).push(state.id);
        }
      }
    }

    // Add ALL state nodes, marking non-canonical ones as 'merged'
    states.forEach(state => {
      if (state.isDead) deadStateIds.add(state.id);

      const classes = [];
      if (state.isStart) classes.push('start');
      if (state.isAccept) classes.push('accept');
      if (state.isDead) classes.push('dead');
      if (!isCanonical(state.id)) {
        classes.push('merged');
      } else if (mergedSources.has(state.id) && mergedSources.get(state.id).length > 1) {
        // This canonical node absorbed other states
        classes.push('combined');
      }

      // Get source states for this node (if it's a combined node)
      const sources = mergedSources.get(state.id) || [state.id];

      elements.push({
        data: {
          id: `s${state.id}`,
          label: this.getStateLabel(state.id, sources),
          fullLabel: this.getFullStateLabel(state.id, sources)
        },
        classes: classes.join(' ')
      });

      // Add invisible marker node + edge for start states
      if (state.isStart) {
        const markerClasses = ['start-marker'];
        if (!isCanonical(state.id)) markerClasses.push('merged');

        elements.push({
          data: { id: `start-marker-${state.id}` },
          classes: markerClasses.join(' ')
        });
        elements.push({
          data: {
            id: `start-edge-${state.id}`,
            source: `start-marker-${state.id}`,
            target: `s${state.id}`
          },
          classes: !isCanonical(state.id) ? 'start-arrow merged' : 'start-arrow'
        });
      }
    });

    // Add original edges (hidden when merging)
    const originalGrouped = this.groupTransitions(transitions);
    originalGrouped.forEach(({ from, to, symbols }, key) => {
      const isLoop = from === to;
      const isDead = deadStateIds.has(from) || deadStateIds.has(to);
      const label = compactSymbolLabel(symbols);
      const classes = [];
      if (isLoop) classes.push('loop');
      if (isDead) classes.push('dead');
      // Hide all original edges when merging is active
      if (isMerging) {
        classes.push('merged');
      }

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

    // Add merged edges (only when merging is active)
    if (isMerging) {
      const mergedGrouped = this.groupTransitions(transitions, getCanonical);
      mergedGrouped.forEach(({ from, to, symbols }, key) => {
        const isLoop = from === to;
        const isDead = deadStateIds.has(from) || deadStateIds.has(to);
        const label = compactSymbolLabel(symbols);
        const classes = ['merged-edge']; // Visible when merging
        if (isLoop) classes.push('loop');
        if (isDead) classes.push('dead');

        elements.push({
          data: {
            id: `em${key}`,
            source: `s${from}`,
            target: `s${to}`,
            label: label
          },
          classes: classes.join(' ')
        });
      });
    }

    return elements;
  }

  /**
   * Group transitions by source-target pair
   * @param {Array} transitions
   * @param {Function} [getCanonical] - Optional function to map state to canonical
   * @returns {Map}
   */
  groupTransitions(transitions, getCanonical = (x) => x) {
    const grouped = new Map();

    transitions.forEach(t => {
      const from = getCanonical(t.from);
      const to = getCanonical(t.to);
      // Skip transitions involving deleted states
      if (from === -1 || to === -1) return;

      const key = `${from}-${to}`;
      if (!grouped.has(key)) {
        grouped.set(key, { from, to, symbols: [] });
      }
      // Avoid duplicate symbols
      const entry = grouped.get(key);
      if (!entry.symbols.includes(t.symbol)) {
        entry.symbols.push(t.symbol);
      }
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
        // For start markers, position relative to their target
        if (id.startsWith('start-marker-')) {
          const targetId = parseInt(id.slice('start-marker-'.length), 10);
          if (positions.has(targetId)) {
            const targetPos = positions.get(targetId);
            return { x: targetPos.x - 60, y: targetPos.y };
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
      return `q'${stateId}`;
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
        const label = this.nfa.stateLabels.get(id);
        return label !== null && label !== undefined ? `q${id}: ${label}` : `q${id}`;
      });
      return sourceLines.join('\n');
    }

    const stateLabel = this.nfa.stateLabels.get(stateId);
    if (stateLabel === null || stateLabel === undefined) {
      return `q${stateId}`;
    }
    return `q${stateId}: ${stateLabel}`;
  }

  /**
   * Highlight all states and edges visited during a trace
   * @param {Array<{states: number[]}>} trace
   * @param {import('./nfa.js').StateTransformation} [transform] - Optional transformation for mapping states
   */
  highlightTrace(trace, transform = null) {
    if (!this.cy) return;

    // Clear previous highlights (selection is independent)
    this.cy.elements().removeClass('highlighted highlighted-final');

    // Helper to get canonical state ID
    const getCanonical = (stateId) => {
      if (!transform) return stateId;
      return transform.remap[stateId];
    };

    // Track visited canonical states at each step and transitions taken
    const visitedStates = new Set();
    const visitedEdges = new Set();

    for (let i = 0; i < trace.length; i++) {
      const step = trace[i];
      for (const stateId of step.states) {
        const canonical = getCanonical(stateId);
        if (canonical !== -1) visitedStates.add(canonical);
      }

      // Track edges from previous step to current step (using canonical IDs)
      if (i > 0) {
        const prevStates = trace[i - 1].states;
        for (const fromId of prevStates) {
          for (const toId of step.states) {
            const canonicalFrom = getCanonical(fromId);
            const canonicalTo = getCanonical(toId);
            if (canonicalFrom !== -1 && canonicalTo !== -1) {
              visitedEdges.add(`${canonicalFrom}-${canonicalTo}`);
            }
          }
        }
      }
    }

    // Get final canonical states
    const finalStates = new Set();
    if (trace.length > 0) {
      for (const stateId of trace[trace.length - 1].states) {
        const canonical = getCanonical(stateId);
        if (canonical !== -1) finalStates.add(canonical);
      }
    }

    // Highlight visited states
    for (const stateId of visitedStates) {
      const node = this.cy.$(`#s${stateId}`);
      if (finalStates.has(stateId)) {
        node.addClass('highlighted-final');
      } else {
        node.addClass('highlighted');
      }
    }

    // Highlight visited edges (both original 'e' prefix and merged 'em' prefix)
    for (const edgeKey of visitedEdges) {
      this.cy.$(`#e${edgeKey}`).addClass('highlighted');
      this.cy.$(`#em${edgeKey}`).addClass('highlighted');
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
