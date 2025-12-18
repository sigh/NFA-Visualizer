/**
 * NFA Visualizer - Main Application Controller
 *
 * Handles UI interactions, mode toggling, NFA building, and testing.
 *
 * @module app
 */

import { CodeJar } from '../lib/codejar.min.js';
import { NFABuilder, parseNFAConfig, buildCodeFromSplit, parseSplitFromCode, expandSymbolClass } from './nfa_builder.js';
import { RegexParser, RegexToNFABuilder } from './regex_parser.js';
import { NFAView } from './nfa_view.js';
import { NFAVisualizer, compactSymbolLabel } from './visualizer.js';
import { EXAMPLES } from './examples.js';

// ============================================
// Configuration
// ============================================

const CONFIG = {
  maxStates: 500
};

// Pipeline Stage IDs
const STAGES = {
  RAW: 'raw',
  EPSILON: 'epsilon',
  PRUNE: 'prune',
  MERGE: 'merge',
  EXPAND: 'expand'
};

// Display Labels for Stages
const STAGE_LABELS = {
  [STAGES.RAW]: 'Raw',
  [STAGES.EPSILON]: 'ε-Closure',
  [STAGES.PRUNE]: 'Pruned States',
  [STAGES.MERGE]: 'Merged States',
  [STAGES.EXPAND]: 'Subset Expansion'
};

// Pipeline Definitions
const PIPELINES = {
  NFA: [STAGES.RAW, STAGES.EPSILON, STAGES.PRUNE, STAGES.MERGE],
  DFA: [STAGES.EXPAND, STAGES.PRUNE, STAGES.MERGE]
};

/** SessionStorage keys for persisting input fields */
const STORAGE_KEYS = {
  symbols: 'nfa-symbols',
  startState: 'nfa-start-state',
  transition: 'nfa-transition',
  accept: 'nfa-accept',
  epsilon: 'nfa-epsilon',
  unified: 'nfa-unified-code',
  regex: 'nfa-regex',
  regexSymbols: 'nfa-regex-symbols',
  inputMode: 'nfa-input-mode',
  testInput: 'nfa-test-input'
};

/** Input modes enum */
const MODES = {
  SPLIT: 'split',
  UNIFIED: 'unified',
  REGEX: 'regex'
};

/** Pipeline modes enum */
const PIPELINE_MODES = {
  NFA: 'nfa',
  DFA: 'dfa'
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
      tabRegex: document.getElementById('tab-regex'),
      splitInput: document.getElementById('split-input'),
      unifiedInput: document.getElementById('unified-input'),
      regexInput: document.getElementById('regex-input'),

      // Split mode inputs (now divs for CodeJar)
      symbolsInput: document.getElementById('symbols-input'),
      startStateInput: document.getElementById('start-state'),
      transitionInput: document.getElementById('transition-fn'),
      acceptInput: document.getElementById('accept-fn'),
      epsilonInput: document.getElementById('epsilon-fn'),

      // Unified mode input
      unifiedCodeInput: document.getElementById('unified-code'),

      // Regex mode input
      regexSymbolsInput: document.getElementById('regex-symbols-input'),
      regexCodeInput: document.getElementById('regex-code'),

      // Actions
      buildBtn: document.getElementById('build-btn'),
      refreshLayoutBtn: document.getElementById('refresh-layout-btn'),

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
      statType: document.getElementById('stat-type'),
      statStart: document.getElementById('stat-start'),
      statAccept: document.getElementById('stat-accept'),
      statLive: document.getElementById('stat-live'),
      statDead: document.getElementById('stat-dead'),
      nfaSlider: document.getElementById('nfa-slider'),
      nfaTrack: document.getElementById('nfa-track'),
      nfaLabelsContainer: document.getElementById('nfa-labels'),
      dfaSlider: document.getElementById('dfa-slider'),
      dfaLabelsContainer: document.getElementById('dfa-labels'),
      // DFA Container Elements for positioning
      dfaArrow: document.getElementById('dfa-arrow'),
      dfaTrack: document.getElementById('dfa-track'),
      pipelineContainer: document.querySelector('.pipeline-container'),

      stateList: document.getElementById('state-list')
    };

    // Application state
    this.view = null;
    this.visualizer = null;
    this.pipelineViews = [];
    this.isRestoring = false;
    this.mode = MODES.SPLIT;
    this.activePipeline = PIPELINE_MODES.NFA;

    // CodeJar editor instances
    this.editors = {
      symbols: null,
      startState: null,
      transition: null,
      accept: null,
      epsilon: null,
      unified: null,
      regex: null,
      regexSymbols: null
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
    this.editors.regex = CodeJar(this.elements.regexCodeInput, () => { }, { tab: '  ' });
    this.editors.regexSymbols = CodeJar(this.elements.regexSymbolsInput, () => { }, { tab: '  ' });

    // Save on changes
    this.editors.symbols.onUpdate(() => this.saveToStorage());
    this.editors.startState.onUpdate(() => this.saveToStorage());
    this.editors.transition.onUpdate(() => this.saveToStorage());
    this.editors.accept.onUpdate(() => this.saveToStorage());
    this.editors.epsilon.onUpdate(() => this.saveToStorage());
    this.editors.unified.onUpdate(() => this.saveToStorage());
    this.editors.regex.onUpdate(() => this.saveToStorage());
    this.editors.regexSymbols.onUpdate(() => this.saveToStorage());

    // Add Ctrl+Enter to run (capture phase to prevent editor from eating it)

    document.addEventListener(
      'keydown',
      e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          this.handleBuild();
        }
      },
      { capture: true }
    );

    // Highlight static code decoration elements
    document.querySelectorAll('.code-decoration').forEach(el => {
      Prism.highlightElement(el);
    });
  }

  // ============================================
  // Initialization
  // ============================================

  /**
   * Helper to set CSS variables for track layout
   */
  setTrackLayout(trackEl, labelsEl, steps) {
    const numSteps = steps.length;
    const numIntervals = Math.max(1, numSteps - 1);

    // Set variables on the track element (which contains the slider)
    trackEl.style.setProperty('--track-steps', numSteps);
    trackEl.style.setProperty('--track-intervals', numIntervals);

    // Set variables on the labels container
    labelsEl.style.setProperty('--track-steps', numSteps);
  }

  /**
   * Initialize pipeline UI from config
   */
  initPipelineUI() {
    // Helper to create steps
    const createSteps = (container, stageIds) => {
      container.innerHTML = '';
      stageIds.forEach((stageId, index) => {
        const step = document.createElement('div');
        step.className = 'pipeline-step';
        step.dataset.value = index;
        step.dataset.stage = stageId;
        step.textContent = STAGE_LABELS[stageId];
        container.appendChild(step);
      });
    };

    // Initialize NFA pipeline
    createSteps(this.elements.nfaLabelsContainer, PIPELINES.NFA);
    this.elements.nfaSlider.max = PIPELINES.NFA.length - 1;
    this.setTrackLayout(this.elements.nfaTrack, this.elements.nfaLabelsContainer, PIPELINES.NFA);

    // Initialize DFA pipeline (start with full)
    createSteps(this.elements.dfaLabelsContainer, PIPELINES.DFA);
    this.elements.dfaSlider.max = PIPELINES.DFA.length - 1;
    this.setTrackLayout(this.elements.dfaTrack, this.elements.dfaLabelsContainer, PIPELINES.DFA);

    // Store references to steps for later use
    this.elements.nfaLabels = this.elements.nfaLabelsContainer.querySelectorAll('.pipeline-step');
    this.elements.dfaLabels = this.elements.dfaLabelsContainer.querySelectorAll('.pipeline-step');
  }

  /**
   * Initialize the application: set up event listeners and visualizer
   */
  init() {
    // Initialize CodeJar editors
    this.initEditors();

    // Initialize Pipeline UI
    this.initPipelineUI();

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
    this.elements.tabSplit.addEventListener('click', () => this.switchMode(MODES.SPLIT));
    this.elements.tabUnified.addEventListener('click', () => this.switchMode(MODES.UNIFIED));
    this.elements.tabRegex.addEventListener('click', () => this.switchMode(MODES.REGEX));
    this.elements.buildBtn.addEventListener('click', () => this.handleBuild());
    this.elements.refreshLayoutBtn.addEventListener('click', () => {
      if (this.visualizer) {
        this.visualizer.runLayout(/* animate= */ true);
      }
    });

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

    // NFA Pipeline slider
    this.elements.nfaSlider.addEventListener('input', () => {
      this.activePipeline = PIPELINE_MODES.NFA;
      this.updatePipelineUI(this.elements.nfaSlider, this.elements.nfaLabels);
      this.updatePipelineUI(this.elements.dfaSlider, this.elements.dfaLabels);
      this.updateTransformAndRender();
    });

    // NFA Pipeline labels click
    this.elements.nfaLabels.forEach(label => {
      label.addEventListener('click', () => {
        this.activePipeline = PIPELINE_MODES.NFA;
        const value = label.dataset.value;
        this.elements.nfaSlider.value = value;
        this.updatePipelineUI(this.elements.nfaSlider, this.elements.nfaLabels);
        this.updatePipelineUI(this.elements.dfaSlider, this.elements.dfaLabels);
        this.updateTransformAndRender();
      });
    });

    // DFA Pipeline slider
    this.elements.dfaSlider.addEventListener('input', () => {
      this.activePipeline = PIPELINE_MODES.DFA;
      this.updatePipelineUI(this.elements.dfaSlider, this.elements.dfaLabels);
      this.updatePipelineUI(this.elements.nfaSlider, this.elements.nfaLabels);
      this.updateTransformAndRender();
    });

    // DFA Pipeline labels click
    this.elements.dfaLabels.forEach(label => {
      label.addEventListener('click', () => {
        this.activePipeline = PIPELINE_MODES.DFA;
        const value = label.dataset.value;
        this.elements.dfaSlider.value = value;
        this.updatePipelineUI(this.elements.dfaSlider, this.elements.dfaLabels);
        this.updatePipelineUI(this.elements.nfaSlider, this.elements.nfaLabels);
        this.updateTransformAndRender();
      });
    });

    // DFA Arrow click
    this.elements.dfaArrow.addEventListener('click', () => {
      this.activePipeline = PIPELINE_MODES.DFA;
      this.updatePipelineUI(this.elements.dfaSlider, this.elements.dfaLabels);
      this.updatePipelineUI(this.elements.nfaSlider, this.elements.nfaLabels);
      this.updateTransformAndRender();
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
    sessionStorage.setItem(STORAGE_KEYS.regex, this.editors.regex.toString());
    sessionStorage.setItem(STORAGE_KEYS.regexSymbols, this.editors.regexSymbols.toString());

    sessionStorage.setItem(STORAGE_KEYS.inputMode, this.mode);

    sessionStorage.setItem(STORAGE_KEYS.testInput, this.elements.testInput.value);
  }

  /**
   * Restore input values from sessionStorage
   */
  restoreFromStorage() {
    this.isRestoring = true;

    const inputMode = sessionStorage.getItem(STORAGE_KEYS.inputMode);
    // Restore mode toggle state first to avoid layout jitter
    this.switchMode(inputMode || MODES.SPLIT);

    const symbols = sessionStorage.getItem(STORAGE_KEYS.symbols);
    const startState = sessionStorage.getItem(STORAGE_KEYS.startState);
    const transition = sessionStorage.getItem(STORAGE_KEYS.transition);
    const accept = sessionStorage.getItem(STORAGE_KEYS.accept);
    const epsilon = sessionStorage.getItem(STORAGE_KEYS.epsilon);
    const unified = sessionStorage.getItem(STORAGE_KEYS.unified);
    const regex = sessionStorage.getItem(STORAGE_KEYS.regex);
    const regexSymbols = sessionStorage.getItem(STORAGE_KEYS.regexSymbols);
    const testInput = sessionStorage.getItem(STORAGE_KEYS.testInput);

    if (symbols !== null) this.editors.symbols.updateCode(symbols);
    if (startState !== null) this.editors.startState.updateCode(startState);
    if (transition !== null) this.editors.transition.updateCode(transition);
    if (accept !== null) this.editors.accept.updateCode(accept);
    if (epsilon !== null) this.editors.epsilon.updateCode(epsilon);
    if (unified !== null) this.editors.unified.updateCode(unified);
    if (regex !== null) this.editors.regex.updateCode(regex);
    if (regexSymbols !== null) this.editors.regexSymbols.updateCode(regexSymbols);
    if (testInput !== null) this.elements.testInput.value = testInput;

    this.isRestoring = false;
  }

  /**
   * Update UI elements for the selected mode
   * @param {string} mode
   */
  updateModeUI(mode) {
    const isUnified = mode === MODES.UNIFIED;
    const isRegex = mode === MODES.REGEX;
    const isSplit = mode === MODES.SPLIT;

    this.elements.tabUnified.classList.toggle('active', isUnified);
    this.elements.tabSplit.classList.toggle('active', isSplit);
    this.elements.tabRegex.classList.toggle('active', isRegex);

    this.elements.unifiedInput.classList.toggle('hidden', !isUnified);
    this.elements.splitInput.classList.toggle('hidden', !isSplit);
    this.elements.regexInput.classList.toggle('hidden', !isRegex);
  }

  // ============================================
  // Mode Switching
  // ============================================

  /**
   * Switch between input modes (split, unified, regex)
   * @param {string} mode - 'split', 'unified', or 'regex'
   */
  switchMode(mode) {
    if (mode === this.mode) return;

    const previousMode = this.mode;

    // Sync data based on the mode we are leaving
    if (previousMode === MODES.SPLIT) {
      const code = buildCodeFromSplit(
        this.editors.symbols.toString() || '1-9',
        this.editors.startState.toString() || '"start"',
        this.editors.transition.toString() || 'return undefined;',
        this.editors.accept.toString() || 'return false;',
        this.editors.epsilon.toString()
      );
      this.editors.unified.updateCode(code);
    } else if (previousMode === MODES.UNIFIED) {
      try {
        const parts = parseSplitFromCode(this.editors.unified.toString());
        this.editors.symbols.updateCode(parts.symbols);
        this.editors.startState.updateCode(parts.startState);
        this.editors.transition.updateCode(parts.transitionBody);
        this.editors.accept.updateCode(parts.acceptBody);
        this.editors.epsilon.updateCode(parts.epsilonBody);
      } catch (e) {
        console.warn('Failed to sync unified to split:', e);
      }
    }

    this.mode = mode;
    this.updateModeUI(mode);
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

    this.switchMode(MODES.UNIFIED);
    this.editors.unified.updateCode(example.code);
    if (example.symbols) this.editors.symbols.updateCode(example.symbols);

    this.saveToStorage();
    this.handleBuild();
    this.elements.examplesSelect.value = '';
  }

  // ============================================
  // Build Handler
  // ============================================

  /**
   * Build the NFA from the current input code
   */
  handleBuild() {
    this.hideError();

    this.view = null;

    let nfa = null;
    try {
      if (this.mode === MODES.REGEX) {
        const symbolStr = this.editors.regexSymbols.toString() || '1-9';
        const symbols = expandSymbolClass(symbolStr);
        const pattern = this.editors.regex.toString();

        const parser = new RegexParser(pattern);
        const ast = parser.parse();
        const builder = new RegexToNFABuilder(symbols);
        nfa = builder.build(ast);
      } else {
        // Get code from current input mode
        const code = this.getCurrentCode();

        // Parse and validate
        const config = parseNFAConfig(code);

        // Build NFA
        // symbols is already expanded to an array by parseNFAConfig
        const builder = new NFABuilder(config, { ...CONFIG, symbols: config.symbols });
        nfa = builder.build();
      }

      // Precompute views for all pipeline steps
      // Base state prefix is set by the caller.
      const baseLayoutState = this.visualizer.createLayoutState();
      const baseView = NFAView.fromNFA(nfa, {
        layoutState: baseLayoutState,
        stateIdPrefix: 'q',
      });
      this.pipelineViews = this.buildPipeline(baseView, PIPELINES.NFA);
      this.dfaCache = new Map();

      // Update UI
      this.showResults();

    } catch (e) {
      this.showError(e.message);
      this.hideResults();
    }
  }

  /**
   * Get the current code from either split or unified mode
   */
  getCurrentCode() {
    if (this.mode === MODES.UNIFIED) {
      return this.editors.unified.toString();
    }

    return buildCodeFromSplit(
      this.editors.symbols.toString() || '1-9',
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
    this.elements.pipelineContainer.classList.add('ready');

    // Check if initial NFA is already a DFA
    const isDeterministic = this.pipelineViews[0].isDeterministic();
    const dfaElements = [
      this.elements.dfaArrow,
      this.elements.dfaTrack,
      this.elements.dfaLabelsContainer
    ];

    if (isDeterministic) {
      dfaElements.forEach(el => el.style.display = 'none');
    } else {
      dfaElements.forEach(el => el.style.display = '');
    }

    // Reset pipeline sliders
    this.activePipeline = PIPELINE_MODES.NFA;
    this.elements.nfaSlider.value = 0;
    this.updatePipelineUI(this.elements.nfaSlider, this.elements.nfaLabels);

    this.elements.dfaSlider.value = 0;
    this.updatePipelineUI(this.elements.dfaSlider, this.elements.dfaLabels);

    this.updateTransformAndRender();
  }

  getDfaPipelineAtNfaStep(nfaStep) {
    // Update DFA slider logic based on NFA state
    // If the NFA pipeline has reached the PRUNE stage, remove PRUNE from the DFA pipeline
    const pruneStageIndex = PIPELINES.NFA.indexOf(STAGES.PRUNE);
    const nfaIsPruned = nfaStep >= pruneStageIndex;

    return nfaIsPruned
      ? PIPELINES.DFA.filter(s => s !== STAGES.PRUNE)
      : PIPELINES.DFA;
  }

  /**
   * Update the pipeline UI to reflect current slider value
   */
  updatePipelineUI(slider, labels) {
    const value = parseInt(slider.value);
    const max = parseInt(slider.max);
    const percentage = (value / max) * 100;

    // Determine active state based on pipeline selection
    const isNFA = slider === this.elements.nfaSlider;
    const isActive = isNFA ? true : this.activePipeline === PIPELINE_MODES.DFA;

    // Update slider fill
    slider.style.setProperty('--slider-progress', `${percentage}%`);

    // Update labels
    labels.forEach(label => {
      const labelValue = parseInt(label.dataset.value);
      label.classList.toggle('active', isActive && labelValue <= value);
    });

    // Update visual state for DFA controls
    if (!isNFA) {
      this.elements.dfaSlider.classList.toggle('inactive', !isActive);
      this.elements.dfaArrow.classList.toggle('active', isActive);
    }

    // If this is the NFA slider, update the DFA elements position
    if (isNFA) {
      // Use grid row positioning
      // Value 0 -> Row 1
      // Value 1 -> Row 2
      // Value 2 -> Row 3
      // Value 3 -> Row 4
      const rowStart = value + 1;
      [
        this.elements.dfaArrow,
        this.elements.dfaTrack,
        this.elements.dfaLabelsContainer
      ].forEach(el => el.style.gridRowStart = rowStart);

      const dfaPipeline = this.getDfaPipelineAtNfaStep(value);

      // Update layout variables for DFA track
      this.setTrackLayout(this.elements.dfaTrack, this.elements.dfaLabelsContainer, dfaPipeline);

      // Update slider range
      this.elements.dfaSlider.max = dfaPipeline.length - 1;

      // Update labels
      const dfaLabels = this.elements.dfaLabels;

      // Update text and visibility based on the computed pipeline
      dfaPipeline.forEach((stageId, index) => {
        if (dfaLabels[index]) {
          dfaLabels[index].textContent = STAGE_LABELS[stageId];
          dfaLabels[index].style.display = '';
        }
      });

      // Hide remaining labels
      for (let i = dfaPipeline.length; i < dfaLabels.length; i++) {
        dfaLabels[i].style.display = 'none';
      }

      // If switching to short mode, ensure value doesn't exceed max
      if (parseInt(this.elements.dfaSlider.value) > this.elements.dfaSlider.max) {
        this.elements.dfaSlider.value = this.elements.dfaSlider.max;
        this.updatePipelineUI(this.elements.dfaSlider, this.elements.dfaLabels);
      }
    }
  }
  /**
   * Build a pipeline of views for a given NFA based on stage definitions
   * @param {NFA} nfa - The source NFA
   * @param {string[]} stages - Array of stage IDs
   * @returns {NFAView[]} Array of views corresponding to the stages
   */
  buildPipeline(view, stages) {
    const views = [];

    // Ensure we have one opaque layout state shared by all views in this pipeline.
    if (!view.layoutState) {
      view.layoutState = this.visualizer.createLayoutState();
    }

    for (const stage of stages) {
      switch (stage) {
        case STAGES.RAW:
          // Base view for the raw NFA (explicit epsilon edges come from the NFA itself)
          break;

        case STAGES.EPSILON:
          view = view.withEpsilonClosure();
          break;

        case STAGES.EXPAND:
          // Base view for DFA pipeline (subset expansion)
          break;

        case STAGES.PRUNE:
          view = view.withDeadStatesPruned();
          break;

        case STAGES.MERGE:
          view = view.withEquivalentStatesMerged();
          break;

        default:
          console.warn(`Unknown pipeline stage: ${stage}`);
      }

      views.push(view);
    }

    return views;
  }

  getActivePipelineViews() {
    if (this.activePipeline === PIPELINE_MODES.NFA) {
      return this.pipelineViews;
    }

    const nfaStep = parseInt(this.elements.nfaSlider.value);

    // Check cache for this NFA step
    if (!this.dfaCache.has(nfaStep)) {
      // Build DFA from current NFA view
      // IMPORTANT: If the current view is "Raw" (step 0), it hides effective transitions
      // (epsilon closures). We must use the "Epsilon Closure" view (step 1) or later
      // to ensure the DFA builder sees the full transition set.
      // If the user is at step 0, we use step 1 as the source for DFA construction.
      const sourceViewStep = nfaStep === 0 ? 1 : nfaStep;
      const sourceView = this.pipelineViews[sourceViewStep];

      // Subset expansion is handled by the view.
      const expandedView = sourceView.withSubsetExpansion();

      // Precompute DFA pipeline views using the generic builder
      const pipeline = this.getDfaPipelineAtNfaStep(nfaStep);

      const dfaViews = this.buildPipeline(expandedView, pipeline);
      this.dfaCache.set(nfaStep, dfaViews);
    }

    return this.dfaCache.get(nfaStep);
  }

  /**
   * Create a new NFAView based on the current NFA and slider state
   */
  getViewFromSlider() {
    if (this.activePipeline === PIPELINE_MODES.DFA) {
      const dfaViews = this.getActivePipelineViews();
      const dfaStep = parseInt(this.elements.dfaSlider.value);
      return dfaViews[dfaStep];
    } else {
      const nfaStep = parseInt(this.elements.nfaSlider.value);
      return this.pipelineViews[nfaStep];
    }
  }

  /**
   * Recompute transform and re-render, preserving viewport and positions
   */
  updateTransformAndRender() {
    const previousView = this.view;

    const views = this.getActivePipelineViews();

    const slider = this.activePipeline === PIPELINE_MODES.DFA
      ? this.elements.dfaSlider
      : this.elements.nfaSlider;
    this.view = views[parseInt(slider.value)];

    // Capture the previous layout into its (opaque) layout state.
    if (previousView?.layoutState) {
      this.visualizer.captureLayout(previousView.layoutState);
    }

    // Re-render
    this.visualizer.render(this.view, this.view.layoutState);

    // Update stats display
    this.updateStatsDisplay(this.view, views[views.length - 1]);
    this.updateStateList();
    this.updateTestResult();
  }

  /**
   * Update the stats display based on current NFA and view
   */
  updateStatsDisplay(view, finalView) {
    const stats = view.getStats();

    this.elements.statStates.textContent = stats.total;

    // Determine machine type
    let type = 'NFA';
    const isDeterministic = view.isDeterministic();
    const hasEpsilons = view.nfa.epsilonTransitions.size > 0;

    if (hasEpsilons) {
      type = 'ε-NFA';
    } else if (isDeterministic) {
      const minStates = finalView.getStats().total;
      if (stats.total === minStates) {
        type = 'Min-DFA';
      } else {
        type = 'DFA';
      }
    } else {
      type = 'NFA';
    }

    this.elements.statType.textContent = type;

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
      const displayStrings = this.view.getDisplayStrings(state.id);
      const item = this.createStateItem(state, sources, displayStrings);
      this.elements.stateList.appendChild(item);
    }
  }

  /**
   * Create a state item DOM element
   * @param {Object} state - The state object
   * @param {Array<number>} sources - Array of source state IDs for this (possibly merged) state
  * @param {string | string[]} displayStrings - Display-ready label string or list of strings
   */
  createStateItem(state, sources, displayStrings) {
    const item = document.createElement('div');
    item.className = 'state-item';
    item.dataset.stateId = state.id;

    // Header
    const header = document.createElement('div');
    header.className = 'state-header';

    const idSpan = document.createElement('span');
    idSpan.className = 'state-id';

    const isMerged = sources.length > 1;
    const prefix = this.view.getStateIdPrefix();
    const suffix = isMerged ? "'" : "";

    let stateName = `${prefix}${state.id}${suffix}`;
    idSpan.textContent = stateName;

    // If resolved sources is a list, show each item on its own line.
    if (Array.isArray(displayStrings)) {
      header.appendChild(idSpan);
      header.appendChild(document.createTextNode(' = '));

      const sourcesList = document.createElement('div');
      sourcesList.className = 'state-sources-list';
      for (const line of displayStrings) {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'state-source-item';
        sourceDiv.textContent = line;
        sourcesList.appendChild(sourceDiv);
      }
      header.appendChild(sourcesList);
    } else {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'state-label';
      labelSpan.textContent = displayStrings;

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

    // Epsilon transitions (if any)
    const epsilonTargets = this.view.getEpsilonTransitionsFrom(stateId);

    const prefix = this.view.getStateIdPrefix();
    if (byCanonicalTarget.size === 0 && epsilonTargets.size === 0) {
      const row = document.createElement('div');
      row.className = 'transition-row';
      row.textContent = 'No outgoing transitions';
      transitionsEl.appendChild(row);
    } else {
      // Regular transitions
      for (const [canonical, symbolSet] of byCanonicalTarget) {
        const isMerged = this.view.isMergedState(canonical);
        const suffix = isMerged ? "'" : "";
        const toStateName = `${prefix}${canonical}${suffix}`;
        transitionsEl.appendChild(this.createTransitionRow(toStateName, [...symbolSet], isMerged));
      }

      // Epsilon transitions
      for (const canonical of epsilonTargets) {
        const isMerged = this.view.isMergedState(canonical);
        const suffix = isMerged ? "'" : "";
        const toStateName = `${prefix}${canonical}${suffix}`;
        transitionsEl.appendChild(this.createTransitionRow(toStateName, ['ε'], isMerged));
      }
    }
    transitionsEl.classList.remove('hidden');
  }

  /**
   * Create a transition row DOM element
   * @param {string} toStateName - Target state name
   * @param {string[]} symbols - Transition symbols
   * @param {boolean} isMerged - Whether target state is a merged state
   */
  createTransitionRow(toStateName, symbols, isMerged = false) {
    const row = document.createElement('div');
    row.className = 'transition-row';

    const stateSpan = document.createElement('span');
    stateSpan.className = 'state-id';

    stateSpan.textContent = toStateName;

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
    this.elements.statType.textContent = '';
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
    const nfa = this.view?.nfa;

    if (!nfa) {
      this.elements.testResult.textContent = '';
      this.elements.testResult.className = 'test-result';
      this.visualizer.clearHighlight();
      return;
    }

    const inputStr = this.elements.testInput.value;

    try {
      const sequence = this.parseInputSequence(inputStr);

      // Check for invalid symbols
      const invalidSymbols = new Set();
      for (const step of sequence) {
        for (const symbol of step) {
          if (!nfa.hasSymbol(symbol)) {
            invalidSymbols.add(symbol);
          }
        }
      }

      if (invalidSymbols.size > 0) {
        this.showTestResult("✗ Invalid", false);
        this.visualizer.clearHighlight();
        return;
      }

      const result = nfa.run(sequence);

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
      const deadTransform = this.view.nfa.getDeadStates();
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