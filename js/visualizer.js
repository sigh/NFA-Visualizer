/**
 * NFA Visualizer - Canvas-based State Diagram Renderer
 *
 * Renders NFAs as interactive state diagrams with:
 * - Automatic layout using force-directed positioning
 * - Visual distinction for start/accept states
 * - Transition arrows with labels
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
  background: '#0d1117',
  state: '#0f3460',
  stateStroke: '#1a4980',
  startState: '#0096ff',
  acceptState: '#2ed573',
  text: '#e8e8e8',
  textMuted: '#8b8b8b',
  transition: '#4a5568',
  transitionText: '#a0aec0',
  highlight: '#ffc107',
  highlightState: 'rgba(255, 193, 7, 0.3)'
};

/**
 * Layout and sizing constants
 */
const LAYOUT = {
  stateRadius: 30,
  padding: 60,
  canvasHeight: 400,
  arrowSize: 8,
  selfLoopRadius: 20,
  startArrowLength: 30,
  minStateDistance: 90,  // 3 * stateRadius
  forceIterations: 50
};

// ============================================
// NFAVisualizer Class
// ============================================

export class NFAVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    /** @type {import('./nfa.js').NFA|null} */
    this.nfa = null;

    /** @type {Map<number, {x: number, y: number}>} */
    this.statePositions = new Map();

    /** @type {Set<number>} */
    this.highlightedStates = new Set();

    // Computed dimensions
    this.width = 0;
    this.height = LAYOUT.canvasHeight;
  }

  /**
   * Render the NFA visualization
   * @param {import('./nfa.js').NFA} nfa
   */
  render(nfa) {
    this.nfa = nfa;
    this.setupCanvas();
    this.calculateLayout();
    this.draw();
  }

  /**
   * Highlight states from a trace (typically the final states)
   * @param {Array<{states: number[]}>} trace
   */
  highlightTrace(trace) {
    this.highlightedStates.clear();

    if (trace.length > 0) {
      const lastStep = trace[trace.length - 1];
      lastStep.states.forEach(stateId => {
        this.highlightedStates.add(stateId);
      });
    }

    this.draw();
  }

  /**
   * Clear all highlighting
   */
  clearHighlight() {
    this.highlightedStates.clear();
    this.draw();
  }

  // ============================================
  // Canvas Setup
  // ============================================

  /**
   * Configure canvas dimensions for high-DPI displays
   */
  setupCanvas() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = LAYOUT.canvasHeight * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${LAYOUT.canvasHeight}px`;

    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = LAYOUT.canvasHeight;
  }

  // ============================================
  // Layout Calculation
  // ============================================

  /**
   * Calculate positions for all states using a force-directed approach
   */
  calculateLayout() {
    this.statePositions.clear();

    const states = this.nfa.getStateInfo();
    if (states.length === 0) return;

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // Single state: center it
    if (states.length === 1) {
      this.statePositions.set(states[0].id, { x: centerX, y: centerY });
      return;
    }

    // Position states: start states on left, others in grid
    this.positionStartStates(states, centerY);
    this.positionOtherStates(states);

    // Refine with force-directed algorithm
    this.refineLayout(LAYOUT.forceIterations);
  }

  /**
   * Position start states on the left side
   */
  positionStartStates(states, centerY) {
    const startStates = states.filter(s => s.isStart);
    const startX = LAYOUT.padding + LAYOUT.stateRadius + 20;

    startStates.forEach((state, i) => {
      const offset = (i - (startStates.length - 1) / 2) * (LAYOUT.stateRadius * 2.5);
      this.statePositions.set(state.id, { x: startX, y: centerY + offset });
    });
  }

  /**
   * Position non-start states in a grid layout
   */
  positionOtherStates(states) {
    const startStates = states.filter(s => s.isStart);
    const otherStates = states.filter(s => !s.isStart);

    if (otherStates.length === 0) return;

    const startX = LAYOUT.padding + LAYOUT.stateRadius + 20;
    const availableWidth = this.width - startX - LAYOUT.padding - LAYOUT.stateRadius * 2;
    const availableHeight = this.height - LAYOUT.padding * 2;

    // Calculate grid dimensions
    const aspectRatio = availableWidth / availableHeight;
    const cols = Math.ceil(Math.sqrt(otherStates.length * aspectRatio));
    const rows = Math.ceil(otherStates.length / cols);

    const cellWidth = availableWidth / cols;
    const cellHeight = availableHeight / Math.max(rows, 1);

    otherStates.forEach((state, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + LAYOUT.stateRadius * 3 + col * cellWidth + cellWidth / 2;
      const y = LAYOUT.padding + row * cellHeight + cellHeight / 2;
      this.statePositions.set(state.id, { x, y });
    });
  }

  /**
   * Refine layout using force-directed algorithm
   * Applies repulsion between overlapping states
   */
  refineLayout(iterations) {
    const states = Array.from(this.statePositions.keys());
    const minDist = LAYOUT.minStateDistance;

    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map();
      states.forEach(id => forces.set(id, { x: 0, y: 0 }));

      // Calculate repulsion forces between close states
      for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
          this.applyRepulsionForce(states[i], states[j], minDist, forces);
        }
      }

      // Apply forces with boundary constraints
      this.applyForces(states, forces);
    }
  }

  /**
   * Apply repulsion force between two states if they're too close
   */
  applyRepulsionForce(stateA, stateB, minDist, forces) {
    const posA = this.statePositions.get(stateA);
    const posB = this.statePositions.get(stateB);

    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist && dist > 0) {
      const force = ((minDist - dist) / dist) * 0.5;
      const fx = dx * force;
      const fy = dy * force;

      forces.get(stateA).x -= fx;
      forces.get(stateA).y -= fy;
      forces.get(stateB).x += fx;
      forces.get(stateB).y += fy;
    }
  }

  /**
   * Apply accumulated forces to state positions
   */
  applyForces(states, forces) {
    const minX = LAYOUT.padding + LAYOUT.stateRadius;
    const maxX = this.width - LAYOUT.padding - LAYOUT.stateRadius;
    const minY = LAYOUT.padding + LAYOUT.stateRadius;
    const maxY = this.height - LAYOUT.padding - LAYOUT.stateRadius;

    states.forEach(id => {
      const pos = this.statePositions.get(id);
      const force = forces.get(id);

      pos.x = Math.max(minX, Math.min(maxX, pos.x + force.x));
      pos.y = Math.max(minY, Math.min(maxY, pos.y + force.y));
    });
  }

  // ============================================
  // Main Drawing
  // ============================================

  /**
   * Main draw method - renders the complete visualization
   */
  draw() {
    const ctx = this.ctx;

    // Clear canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.width, this.height);

    if (!this.nfa) return;

    // Draw transitions first (behind states)
    this.drawTransitions();

    // Draw states on top
    this.drawStates();
  }

  // ============================================
  // State Drawing
  // ============================================

  /**
   * Draw all states
   */
  drawStates() {
    const states = this.nfa.getStateInfo();

    states.forEach(state => {
      const pos = this.statePositions.get(state.id);
      if (!pos) return;

      const isHighlighted = this.highlightedStates.has(state.id);

      this.drawStateCircle(pos, state, isHighlighted);
      this.drawStateLabel(pos, state.id);

      if (state.isStart) {
        this.drawStartArrow(pos);
      }
    });
  }

  /**
   * Draw a single state circle with appropriate styling
   */
  drawStateCircle(pos, state, isHighlighted) {
    const ctx = this.ctx;
    const radius = LAYOUT.stateRadius;

    // Highlight glow
    if (isHighlighted) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.highlightState;
      ctx.fill();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = state.isStart ? COLORS.startState : COLORS.state;
    ctx.fill();
    ctx.strokeStyle = isHighlighted ? COLORS.highlight : COLORS.stateStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Accept state double circle
    if (state.isAccept) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius - 5, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.acceptState;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Draw state label (truncated if necessary)
   */
  drawStateLabel(pos, stateId) {
    const ctx = this.ctx;
    const label = this.getStateLabel(stateId);
    const maxWidth = LAYOUT.stateRadius * 1.6;

    ctx.fillStyle = COLORS.text;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Truncate if needed
    let displayLabel = label;
    if (ctx.measureText(label).width > maxWidth) {
      while (ctx.measureText(displayLabel + '…').width > maxWidth && displayLabel.length > 1) {
        displayLabel = displayLabel.slice(0, -1);
      }
      displayLabel += '…';
    }

    ctx.fillText(displayLabel, pos.x, pos.y);
  }

  /**
   * Draw arrow indicating start state
   */
  drawStartArrow(pos) {
    const ctx = this.ctx;
    const arrowLength = LAYOUT.startArrowLength;
    const startX = pos.x - LAYOUT.stateRadius - arrowLength;
    const endX = pos.x - LAYOUT.stateRadius - 2;

    // Line
    ctx.beginPath();
    ctx.moveTo(startX, pos.y);
    ctx.lineTo(endX, pos.y);
    ctx.strokeStyle = COLORS.startState;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(endX, pos.y);
    ctx.lineTo(endX - 8, pos.y - 5);
    ctx.lineTo(endX - 8, pos.y + 5);
    ctx.closePath();
    ctx.fillStyle = COLORS.startState;
    ctx.fill();
  }

  /**
   * Get display label for a state
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

  // ============================================
  // Transition Drawing
  // ============================================

  /**
   * Draw all transitions
   */
  drawTransitions() {
    const transitions = this.nfa.getAllTransitions();

    // Group transitions by from-to pair for combined labels
    const grouped = this.groupTransitions(transitions);

    grouped.forEach(({ from, to, symbols }) => {
      const fromPos = this.statePositions.get(from);
      const toPos = this.statePositions.get(to);
      if (!fromPos || !toPos) return;

      const label = symbols.join(',');

      if (from === to) {
        this.drawSelfLoop(fromPos, label);
      } else {
        // Curve bidirectional transitions to avoid overlap
        const reverseKey = `${to}-${from}`;
        const hasBidirectional = grouped.has(reverseKey);
        this.drawTransitionArrow(fromPos, toPos, label, hasBidirectional ? 15 : 0);
      }
    });
  }

  /**
   * Group transitions by source-target pair
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
   * Draw a transition arrow between two states
   */
  drawTransitionArrow(from, to, label, curve = 0) {
    const ctx = this.ctx;
    const radius = LAYOUT.stateRadius;

    // Calculate direction vector
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Points at circle edges
    const startX = from.x + (dx / dist) * radius;
    const startY = from.y + (dy / dist) * radius;
    const endX = to.x - (dx / dist) * radius;
    const endY = to.y - (dy / dist) * radius;

    // Control point for curve
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const perpX = -dy / dist;
    const perpY = dx / dist;
    const ctrlX = midX + perpX * curve;
    const ctrlY = midY + perpY * curve;

    // Draw line/curve
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    if (curve !== 0) {
      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    } else {
      ctx.lineTo(endX, endY);
    }
    ctx.strokeStyle = COLORS.transition;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrow head
    const angle = curve !== 0
      ? Math.atan2(endY - ctrlY, endX - ctrlX)
      : Math.atan2(dy, dx);

    this.drawArrowHead(endX, endY, angle);

    // Label
    const labelX = curve !== 0 ? ctrlX : midX;
    const labelY = curve !== 0 ? ctrlY : midY;
    this.drawTransitionLabel(labelX, labelY, label);
  }

  /**
   * Draw a self-loop above a state
   */
  drawSelfLoop(pos, label) {
    const ctx = this.ctx;
    const loopRadius = LAYOUT.selfLoopRadius;
    const loopY = pos.y - LAYOUT.stateRadius - loopRadius;

    // Arc
    ctx.beginPath();
    ctx.arc(pos.x, loopY, loopRadius, 0.2 * Math.PI, 0.8 * Math.PI, true);
    ctx.strokeStyle = COLORS.transition;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrow head
    const arrowAngle = 0.8 * Math.PI;
    const arrowX = pos.x + loopRadius * Math.cos(arrowAngle);
    const arrowY = loopY + loopRadius * Math.sin(arrowAngle);
    const tangentAngle = arrowAngle + Math.PI / 2;

    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - 8 * Math.cos(tangentAngle - Math.PI / 6),
      arrowY - 8 * Math.sin(tangentAngle - Math.PI / 6));
    ctx.lineTo(arrowX - 8 * Math.cos(tangentAngle + Math.PI / 6),
      arrowY - 8 * Math.sin(tangentAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = COLORS.transition;
    ctx.fill();

    // Label
    ctx.fillStyle = COLORS.transitionText;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, pos.x, loopY - loopRadius - 2);
  }

  /**
   * Draw an arrow head at a given position and angle
   */
  drawArrowHead(x, y, angle) {
    const ctx = this.ctx;
    const size = LAYOUT.arrowSize;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6),
      y - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6),
      y - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = COLORS.transition;
    ctx.fill();
  }

  /**
   * Draw a transition label with background
   */
  drawTransitionLabel(x, y, label) {
    const ctx = this.ctx;

    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Background
    const labelWidth = ctx.measureText(label).width + 6;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(x - labelWidth / 2, y - 8, labelWidth, 16);

    // Text
    ctx.fillStyle = COLORS.transitionText;
    ctx.fillText(label, x, y);
  }
}
