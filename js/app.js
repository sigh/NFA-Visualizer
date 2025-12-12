/**
 * NFA Visualizer - Main Application Controller
 *
 * Handles UI interactions, mode toggling, NFA building, and testing.
 *
 * @module app
 */

import { CodeJar } from '../lib/codejar.min.js';
import { DEFAULT_SYMBOL_CLASS, StateTransformation } from './nfa.js';
import { NFABuilder, parseNFAConfig, buildCodeFromSplit, parseSplitFromCode, expandSymbolClass } from './nfa_builder.js';
import { NFAView } from './nfa_view.js';
import { NFAVisualizer, compactSymbolLabel } from './visualizer.js';
import { EXAMPLES } from './examples.js';

// ============================================
// Configuration
// ============================================

const CONFIG = {
  maxStates: 500
};

/** SessionStorage keys for persisting input fields */
const STORAGE_KEYS = {
  symbols: 'nfa-symbols',
  startState: 'nfa-start-state',
  transition: 'nfa-transition',
  accept: 'nfa-accept',
  epsilon: 'nfa-epsilon',
  unified: 'nfa-unified-code',
  inputMode: 'nfa-input-mode',
  testInput: 'nfa-test-input'
};

// ============================================
// Application Class
// ============================================

/**
 * Main application controller - encapsulates all state
 */
class App {
  constructor() {
    // DOM element references
    this.elements = {
      // Input mode controls
      examplesSelect: document.getElementById('examples-select'),
      tabSplit: document.getElementById('tab-split'),
      tabUnified: document.getElementById('tab-unified'),
      splitInput: document.getElementById('split-input'),
      unifiedInput: document.getElementById('unified-input'),

      // Split mode inputs (now divs for CodeJar)
      symbolsInput: document.getElementById('symbols-input'),
      startStateInput: document.getElementById('start-state'),
      transitionInput: document.getElementById('transition-fn'),
      acceptInput: document.getElementById('accept-fn'),
      epsilonInput: document.getElementById('epsilon-fn'),

      // Unified mode input
      unifiedCodeInput: document.getElementById('unified-code'),

      // Actions
      buildBtn: document.getElementById('build-btn'),

      // Output
      errorDisplay: document.getElementById('error-display'),
      testInput: document.getElementById('test-input'),
      showTraceToggle: document.getElementById('show-trace-toggle'),
      testResult: document.getElementById('test-result'),
      cyContainer: document.getElementById('cy-container'),
      emptyState: document.getElementById('empty-state'),

      // Panel controls
      appLayout: document.querySelector('.app-layout'),
      configToggleBtn: document.getElementById('config-toggle-btn'),

      // Stats
      statStates: document.getElementById('stat-states'),
      statStart: document.getElementById('stat-start'),
      statAccept: document.getElementById('stat-accept'),
      statLive: document.getElementById('stat-live'),
      statDead: document.getElementById('stat-dead'),
      pipelineSlider: document.getElementById('pipeline-slider'),
      pipelineLabels: document.querySelectorAll('.pipeline-step'),
      stateList: document.getElementById('state-list')
    };

    // Application state
    this.currentNFA = null;
    this.view = null;
    this.visualizer = null;
    this.pipelineViews = [];
    this.isRestoring = false;

    // CodeJar editor instances
    this.editors = {
      symbols: null,
      startState: null,
      transition: null,
      accept: null,
      epsilon: null,
      unified: null
    };
  }

  // ============================================
  // CodeJar Setup
  // ============================================

  /**
   * Syntax highlighter using PrismJS
   */
  highlight(editor) {
    const code = editor.textContent;
    editor.innerHTML = Prism.highlight(code, Prism.languages.javascript, 'javascript');
  }

  /**
   * Initialize CodeJar editors
   */
  initEditors() {
    // All editors use syntax highlighting (except symbols which uses plain text)
    this.editors.symbols = CodeJar(this.elements.symbolsInput, () => { }, { tab: '  ' });
    this.editors.startState = CodeJar(this.elements.startStateInput, (e) => this.highlight(e), { tab: '  ' });
    this.editors.transition = CodeJar(this.elements.transitionInput, (e) => this.highlight(e), { tab: '  ' });
    this.editors.accept = CodeJar(this.elements.acceptInput, (e) => this.highlight(e), { tab: '  ' });
    this.editors.epsilon = CodeJar(this.elements.epsilonInput, (e) => this.highlight(e), { tab: '  ' });
    this.editors.unified = CodeJar(this.elements.unifiedCodeInput, (e) => this.highlight(e), { tab: '  ' });

    // Save on changes
    this.editors.symbols.onUpdate(() => this.saveToStorage());
    this.editors.startState.onUpdate(() => this.saveToStorage());
    this.editors.transition.onUpdate(() => this.saveToStorage());
    this.editors.accept.onUpdate(() => this.saveToStorage());
    this.editors.epsilon.onUpdate(() => this.saveToStorage());
    this.editors.unified.onUpdate(() => this.saveToStorage());

    // Highlight static code decoration elements
    document.querySelectorAll('.code-decoration').forEach(el => {
      Prism.highlightElement(el);
    });
  }

  // ============================================
  // Initialization
  // ============================================

  /**
   * Initialize the application: set up event listeners and visualizer
   */
  init() {
    // Initialize CodeJar editors
    this.initEditors();

    // Populate examples
    Object.entries(EXAMPLES).forEach(([key, example]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = example.label;
      this.elements.examplesSelect.appendChild(option);
    });

    // Restore saved inputs from sessionStorage
    this.restoreFromStorage();

    // Set up event listeners
    this.elements.examplesSelect.addEventListener('change', (e) => this.handleExampleSelect(e.target.value));
    this.elements.tabSplit.addEventListener('click', () => this.handleModeToggle('split'));
    this.elements.tabUnified.addEventListener('click', () => this.handleModeToggle('unified'));
    this.elements.buildBtn.addEventListener('click', () => this.handleBuild());

    // Auto-update test on input change
    this.elements.testInput.addEventListener('input', () => {
      this.saveToStorage();
      this.updateTestResult();
    });

    // Show/hide trace toggle
    this.elements.showTraceToggle.addEventListener('change', () => this.updateTestResult());

    // Initialize visualizer
    this.visualizer = new NFAVisualizer(this.elements.cyContainer);

    // Handle state selection from graph
    this.visualizer.onStateSelect = (stateId) => {
      this.updateStateListSelection(stateId);
    };

    // Pipeline slider
    this.elements.pipelineSlider.addEventListener('input', () => {
      this.updatePipelineUI();
      this.updateTransformAndRender();
    });

    // Pipeline labels click
    this.elements.pipelineLabels.forEach(label => {
      label.addEventListener('click', () => {
        const value = label.dataset.value;
        this.elements.pipelineSlider.value = value;
        this.updatePipelineUI();
        this.updateTransformAndRender();
      });
    });

    // Config panel collapse/expand
    this.elements.configToggleBtn.addEventListener('click', () => {
      this.elements.appLayout.classList.toggle('config-collapsed');
      this.visualizer?.fit();
    });

    // Refit visualization on window resize
    window.addEventListener('resize', () => {
      this.visualizer?.fit();
    });

    // Build NFA on startup
    this.handleBuild();
  }

  // ============================================
  // Session Storage
  // ============================================

  /**
   * Save current input values to sessionStorage
   */
  saveToStorage() {
    if (this.isRestoring) return;

    sessionStorage.setItem(STORAGE_KEYS.symbols, this.editors.symbols.toString());
    sessionStorage.setItem(STORAGE_KEYS.startState, this.editors.startState.toString());
    sessionStorage.setItem(STORAGE_KEYS.transition, this.editors.transition.toString());
    sessionStorage.setItem(STORAGE_KEYS.accept, this.editors.accept.toString());
    sessionStorage.setItem(STORAGE_KEYS.epsilon, this.editors.epsilon.toString());
    sessionStorage.setItem(STORAGE_KEYS.unified, this.editors.unified.toString());

    const mode = this.elements.tabUnified.classList.contains('active') ? 'unified' : 'split';
    sessionStorage.setItem(STORAGE_KEYS.inputMode, mode);

    sessionStorage.setItem(STORAGE_KEYS.testInput, this.elements.testInput.value);
  }

  /**
   * Restore input values from sessionStorage
   */
  restoreFromStorage() {
    this.isRestoring = true;

    const inputMode = sessionStorage.getItem(STORAGE_KEYS.inputMode);
    // Restore mode toggle state first to avoid layout jitter
    this.updateModeUI(inputMode || 'split');

    const symbols = sessionStorage.getItem(STORAGE_KEYS.symbols);
    const startState = sessionStorage.getItem(STORAGE_KEYS.startState);
    const transition = sessionStorage.getItem(STORAGE_KEYS.transition);
    const accept = sessionStorage.getItem(STORAGE_KEYS.accept);
    const epsilon = sessionStorage.getItem(STORAGE_KEYS.epsilon);
    const unified = sessionStorage.getItem(STORAGE_KEYS.unified);
    const testInput = sessionStorage.getItem(STORAGE_KEYS.testInput);

    if (symbols !== null) this.editors.symbols.updateCode(symbols);
    if (startState !== null) this.editors.startState.updateCode(startState);
    if (transition !== null) this.editors.transition.updateCode(transition);
    if (accept !== null) this.editors.accept.updateCode(accept);
    if (epsilon !== null) this.editors.epsilon.updateCode(epsilon);
    if (unified !== null) this.editors.unified.updateCode(unified);
    if (testInput !== null) this.elements.testInput.value = testInput;

    this.isRestoring = false;
  }

  /**
   * Update UI elements for the selected mode
   * @param {string} mode
   */
  updateModeUI(mode) {
    const isUnified = mode === 'unified';
    this.elements.tabUnified.classList.toggle('active', isUnified);
    this.elements.tabSplit.classList.toggle('active', !isUnified);
    this.elements.unifiedInput.classList.toggle('hidden', !isUnified);
    this.elements.splitInput.classList.toggle('hidden', isUnified);
  }

  // ============================================
  // Mode Toggle Handler
  // ============================================

  /**
   * Toggle between split and unified input modes,
   * converting code between formats.
   * @param {string} mode - 'split' or 'unified'
   */
  handleModeToggle(mode) {
    const currentMode = this.elements.tabUnified.classList.contains('active') ? 'unified' : 'split';

    if (mode === currentMode) return;

    this.updateModeUI(mode);

    if (mode === 'unified') {
      // Convert split inputs to unified code
      const code = buildCodeFromSplit(
        this.editors.startState.toString() || '"start"',
        this.editors.transition.toString() || 'return undefined;',
        this.editors.accept.toString() || 'return false;',
        this.editors.epsilon.toString()
      );
      this.editors.unified.updateCode(code);
    } else {
      // Parse unified code back to split inputs
      const parts = parseSplitFromCode(this.editors.unified.toString());
      this.editors.startState.updateCode(parts.startState);
      this.editors.transition.updateCode(parts.transitionBody);
      this.editors.accept.updateCode(parts.acceptBody);
      this.editors.epsilon.updateCode(parts.epsilonBody);
    }

    this.saveToStorage();
    this.hideError();
  }

  /**
   * Handle example selection
   * @param {string} key - Example key
   */
  handleExampleSelect(key) {
    const example = EXAMPLES[key];
    if (!example) return;

    this.updateModeUI('unified');
    this.editors.unified.updateCode(example.code);
    if (example.symbols) this.editors.symbols.updateCode(example.symbols);

    this.saveToStorage();
    this.handleBuild();
    this.elements.examplesSelect.value = '';
  }  // ============================================
  // Build Handler
  // ============================================

  /**
   * Build the NFA from the current input code
   */
  handleBuild() {
    this.hideError();

    try {
      // Get code from current input mode
      const code = this.getCurrentCode();

      // Parse and validate
      const config = parseNFAConfig(code);

      // Expand symbol class to array of symbols
      const symbolClass = this.editors.symbols.toString().trim() || DEFAULT_SYMBOL_CLASS;
      const symbols = expandSymbolClass(symbolClass);

      // Build NFA
      const builder = new NFABuilder(config, { ...CONFIG, symbols });
      this.currentNFA = builder.build();

      // Precompute views for all pipeline steps
      this.precomputeViews();

      // Update UI
      this.showResults();

    } catch (e) {
      this.showError(e.message);
      this.hideResults();
      this.currentNFA = null;
    }
  }

  /**
   * Get the current code from either split or unified mode
   */
  getCurrentCode() {
    if (this.elements.tabUnified.classList.contains('active')) {
      return this.editors.unified.toString();
    }

    return buildCodeFromSplit(
      this.editors.startState.toString() || '"start"',
      this.editors.transition.toString() || 'return undefined;',
      this.editors.accept.toString() || 'return false;',
      this.editors.epsilon.toString()
    );
  }

  /**
   * Show test section and visualization with current NFA
   */
  showResults() {
    // Hide empty state message
    this.elements.emptyState.classList.add('hidden');

    // Reset pipeline slider
    this.elements.pipelineSlider.value = 0;
    this.updatePipelineUI();

    // Create view based on slider state
    this.updateViewFromSlider();

    // Update stats display
    this.updateStatsDisplay();

    // Build state list
    this.updateStateList();

    // Render visualization
    this.visualizer.render(this.view);

    // Run test with current input
    this.updateTestResult();
  }

  /**
   * Update the pipeline UI to reflect current slider value
   */
  updatePipelineUI() {
    const value = parseInt(this.elements.pipelineSlider.value);
    const max = parseInt(this.elements.pipelineSlider.max);
    const percentage = (value / max) * 100;

    // Update slider fill
    this.elements.pipelineSlider.style.setProperty('--slider-progress', `${percentage}%`);

    // Update labels
    this.elements.pipelineLabels.forEach(label => {
      const labelValue = parseInt(label.dataset.value);
      if (labelValue <= value) {
        label.classList.add('active');
      } else {
        label.classList.remove('active');
      }
    });
  }

  /**
   * Precompute views for all pipeline steps
   */
  precomputeViews() {
    this.pipelineViews = [];
    const numStates = this.currentNFA.numStates();

    // Step 0: Raw NFA
    // Identity transform, show explicit epsilon transitions
    this.pipelineViews[0] = new NFAView(
      this.currentNFA,
      StateTransformation.identity(numStates),
      { showEpsilonTransitions: true }
    );

    // Step 1: Epsilon Closure
    // Identity transform, hide explicit epsilon transitions (implicit closure)
    this.pipelineViews[1] = new NFAView(
      this.currentNFA,
      StateTransformation.identity(numStates),
      { showEpsilonTransitions: false }
    );

    // Step 2: Prune States
    // Hide dead states
    let transformStep2 = StateTransformation.identity(numStates);
    const deadTransform = this.currentNFA.getDeadStates();
    transformStep2 = transformStep2.compose(deadTransform);

    this.pipelineViews[2] = new NFAView(
      this.currentNFA,
      transformStep2,
      { showEpsilonTransitions: false }
    );

    // Step 3: Merge States
    // Merge equivalent states (on top of pruned states)
    const mergeTransform = this.currentNFA.getEquivalentStateRemap(transformStep2);

    this.pipelineViews[3] = new NFAView(
      this.currentNFA,
      mergeTransform,
      { showEpsilonTransitions: false }
    );
  }

  /**
   * Create a new NFAView based on the current NFA and slider state
   */
  updateViewFromSlider() {
    const step = parseInt(this.elements.pipelineSlider.value);
    this.view = this.pipelineViews[step];
  }

  /**
   * Recompute transform and re-render, preserving viewport and positions
   */
  updateTransformAndRender() {
    if (!this.currentNFA) return;

    this.updateViewFromSlider();

    // Save current viewport and positions
    const viewport = this.visualizer.getViewport();
    const positions = this.visualizer.getNodePositions();

    // Re-render with same positions
    this.visualizer.render(this.view, positions);

    // Restore viewport
    this.visualizer.setViewport(viewport);

    // Update stats display
    this.updateStatsDisplay();
    this.updateStateList();
    this.updateTestResult();
  }

  /**
   * Update the stats display based on current NFA and view
   */
  updateStatsDisplay() {
    const stats = this.view.getStats();

    this.elements.statStates.textContent = stats.total;
    this.elements.statStart.textContent = stats.start;
    this.elements.statAccept.textContent = stats.accept;
    this.elements.statLive.textContent = stats.live;
    this.elements.statDead.textContent = stats.dead;
  }

  /**
   * Update the state list display in the info panel
   */
  updateStateList() {
    const states = this.view.getStateInfo();

    // Clear existing items
    this.elements.stateList.replaceChildren();

    for (const state of states) {
      // Only show canonical states
      if (!this.view.isCanonical(state.id)) continue;

      const sources = this.view.mergedSources.get(state.id) || [state.id];
      const item = this.createStateItem(state, sources);
      this.elements.stateList.appendChild(item);
    }
  }

  /**
   * Create a state item DOM element
   * @param {Object} state - The state object
   * @param {number[]} sources - Array of source state IDs for this (possibly merged) state
   */
  createStateItem(state, sources) {
    const item = document.createElement('div');
    item.className = 'state-item';
    item.dataset.stateId = state.id;

    // Header
    const header = document.createElement('div');
    header.className = 'state-header';

    const idSpan = document.createElement('span');
    idSpan.className = 'state-id';
    // Use prime notation for merged states
    const isMerged = sources.length > 1;
    idSpan.textContent = isMerged ? `q'${state.id}` : `q${state.id}`;

    // For merged states, show all source states with their labels on separate lines
    if (isMerged) {
      header.appendChild(idSpan);
      header.appendChild(document.createTextNode(' = '));

      const sourcesList = document.createElement('div');
      sourcesList.className = 'state-sources-list';
      for (const id of sources) {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'state-source-item';
        const sourceLabel = this.currentNFA.stateLabels.get(id);
        sourceDiv.textContent = sourceLabel != null
          ? `q${id}: ${sourceLabel}`
          : `q${id}`;
        sourcesList.appendChild(sourceDiv);
      }
      header.appendChild(sourcesList);
    } else {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'state-label';
      labelSpan.textContent = this.currentNFA.stateLabels.get(state.id) ?? `q${state.id}`;
      header.append(idSpan, ' = ', labelSpan);
    }

    // Flags
    const flags = [];
    if (state.isStart) flags.push('start');
    if (state.isAccept) flags.push('accept');
    if (state.isDead) flags.push('dead');

    if (flags.length > 0) {
      const flagsSpan = document.createElement('span');
      flagsSpan.className = 'state-flags';
      flagsSpan.textContent = ` (${flags.join(', ')})`;
      header.appendChild(flagsSpan);
    }

    // Transitions container (populated on expand)
    const transitions = document.createElement('div');
    transitions.className = 'state-transitions hidden';

    item.append(header, transitions);

    // Click handler
    item.addEventListener('click', () => {
      this.handleStateSelect(state.id, item);
    });

    return item;
  }

  /**
   * Handle state selection from state list click
   */
  handleStateSelect(stateId, itemElement) {
    const wasSelected = itemElement.classList.contains('expanded');

    // Collapse all items and clear graph selection
    this.collapseAllStateItems();
    this.visualizer.clearSelection();

    if (wasSelected) {
      // Was already selected, just deselect
      return;
    }

    // Expand and select in graph
    this.expandStateItem(stateId, itemElement);
    this.visualizer.selectState(stateId);
  }

  /**
   * Collapse all state items in the list
   */
  collapseAllStateItems() {
    this.elements.stateList.querySelectorAll('.state-item').forEach(item => {
      item.classList.remove('expanded');
      item.querySelector('.state-transitions')?.classList.add('hidden');
    });
  }

  /**
   * Expand a state item to show its transitions (UI only, no graph update)
   */
  expandStateItem(stateId, itemElement) {
    itemElement.classList.add('expanded');
    const transitionsEl = itemElement.querySelector('.state-transitions');

    // Clear and rebuild transitions content
    transitionsEl.replaceChildren();

    // Get transitions mapped through current transform
    const byCanonicalTarget = this.view.getTransitionsFrom(stateId);

    // Get epsilon transitions if enabled
    let epsilonTargets = new Set();
    if (this.view.showEpsilonTransitions) {
      epsilonTargets = this.view.getEpsilonTransitionsFrom(stateId);
    }

    if (byCanonicalTarget.size === 0 && epsilonTargets.size === 0) {
      const row = document.createElement('div');
      row.className = 'transition-row';
      row.textContent = 'No outgoing transitions';
      transitionsEl.appendChild(row);
    } else {
      // Regular transitions
      for (const [canonical, symbolSet] of byCanonicalTarget) {
        const isMerged = this.view.isMergedState(canonical);
        transitionsEl.appendChild(this.createTransitionRow(canonical, [...symbolSet], isMerged));
      }

      // Epsilon transitions
      for (const canonical of epsilonTargets) {
        const isMerged = this.view.isMergedState(canonical);
        transitionsEl.appendChild(this.createTransitionRow(canonical, ['ε'], isMerged));
      }
    }
    transitionsEl.classList.remove('hidden');
  }

  /**
   * Create a transition row DOM element
   * @param {number} toState - Target state ID
   * @param {string[]} symbols - Transition symbols
   * @param {boolean} isMerged - Whether target state is a merged state
   */
  createTransitionRow(toState, symbols, isMerged = false) {
    const row = document.createElement('div');
    row.className = 'transition-row';

    const stateSpan = document.createElement('span');
    stateSpan.className = 'state-id';
    stateSpan.textContent = isMerged ? `q'${toState}` : `q${toState}`;

    const symbolSpan = document.createElement('span');
    const label = compactSymbolLabel(symbols);
    symbolSpan.textContent = label;

    if (label === 'ε') {
      symbolSpan.className = 'symbol-label symbol-epsilon';
    } else {
      symbolSpan.className = 'symbol-label';
    }

    row.append('→ ', stateSpan, ' on ', symbolSpan);
    return row;
  }

  /**
   * Update state list to match graph selection (called from graph click)
   */
  updateStateListSelection(stateId) {
    this.collapseAllStateItems();

    if (stateId === null) return;

    // Find and expand the matching item (graph already has selection)
    const item = this.elements.stateList.querySelector(`.state-item[data-state-id="${stateId}"]`);
    if (item) {
      this.expandStateItem(stateId, item);
    }
  }

  /**
   * Reset UI to empty state
   */
  hideResults() {
    this.elements.emptyState.classList.remove('hidden');
    this.elements.statStates.textContent = '—';
    this.elements.statStart.textContent = '—';
    this.elements.statAccept.textContent = '—';
    this.elements.statLive.textContent = '—';
    this.elements.statDead.textContent = '—';
    this.elements.stateList.innerHTML = '';
  }

  // ============================================
  // Test Handler
  // ============================================

  /**
   * Update test result and trace highlighting
   */
  updateTestResult() {
    if (!this.currentNFA) {
      this.elements.testResult.textContent = '';
      this.elements.testResult.className = 'test-result';
      this.visualizer.clearHighlight();
      return;
    }

    const inputStr = this.elements.testInput.value;

    try {
      const sequence = this.parseInputSequence(inputStr);
      const result = this.currentNFA.run(sequence);

      this.displayTestResult(result, sequence);

      // Update trace highlighting based on toggle
      if (this.elements.showTraceToggle.checked) {
        this.visualizer.highlightTrace(result.trace);
      } else {
        this.visualizer.clearHighlight();
      }

    } catch (e) {
      this.showTestResult(`Error: ${e.message}`, false);
      this.visualizer.clearHighlight();
    }
  }

  /**
   * Parse user input string into a sequence of symbol arrays.
   * Each character becomes a single-element array.
   * [charClass] syntax expands to array of matching symbols.
   * @returns {Array<string[]>} Array of symbol arrays
   */
  parseInputSequence(inputStr) {
    const result = [];
    let i = 0;

    while (i < inputStr.length) {
      if (inputStr[i] === '[') {
        // Find matching ]
        const end = inputStr.indexOf(']', i + 1);
        if (end === -1) {
          throw new Error('Unclosed character class [');
        }
        const charClass = inputStr.slice(i + 1, end);
        if (charClass.length === 0) {
          throw new Error('Empty character class []');
        }
        result.push(expandSymbolClass(charClass));
        i = end + 1;
      } else {
        result.push([inputStr[i]]);
        i++;
      }
    }

    return result;
  }

  /**
   * Format a parsed input sequence for display
   */
  formatInputSequence(sequence) {
    if (sequence.length === 0) return '(empty)';
    return sequence.map(symbols =>
      symbols.length === 1 ? symbols[0] : `[${compactSymbolLabel(symbols)}]`
    ).join('');
  }

  /**
   * Display the test result in the UI
   */
  displayTestResult(result, sequence) {
    const lastStep = result.trace[result.trace.length - 1];

    if (result.accepted) {
      this.showTestResult(`✓ Accepted`, true);
    } else {
      // Dead end if all remaining states are dead
      const deadTransform = this.currentNFA.getDeadStates();
      const allDead = lastStep.states.every(id => deadTransform.isDeleted(id));
      const reason = allDead ? 'Dead End' : 'Rejected';
      this.showTestResult(`✗ ${reason}`, false);
    }
  }

  /**
   * Count unique canonical states from a list of state IDs
   */
  countCanonicalStates(stateIds) {
    if (!this.view) return stateIds.length;
    const canonical = new Set();
    for (const id of stateIds) {
      const mapped = this.view.getCanonical(id);
      if (mapped !== -1) canonical.add(mapped);
    }
    return canonical.size;
  }

  /**
   * Show test result with appropriate styling
   */
  showTestResult(message, accepted) {
    this.elements.testResult.textContent = message;
    this.elements.testResult.className = `test-result ${accepted ? 'accepted' : 'rejected'}`;
  }

  // ============================================
  // Error Display
  // ============================================

  showError(message) {
    this.elements.errorDisplay.textContent = message;
    this.elements.errorDisplay.classList.remove('hidden');
  }

  hideError() {
    this.elements.errorDisplay.classList.add('hidden');
  }

} // End of App class

// ============================================
// Start Application
// ============================================

const app = new App();
app.init();