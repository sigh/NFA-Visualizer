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
import { NFAVisualizer, compactSymbolLabel } from './visualizer.js';

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
  unified: 'nfa-unified-code',
  unifiedMode: 'nfa-unified-mode',
  testInput: 'nfa-test-input'
};

// ============================================
// DOM Element References
// ============================================

const elements = {
  // Input mode controls
  unifiedToggle: document.getElementById('unified-toggle'),
  splitInput: document.getElementById('split-input'),
  unifiedInput: document.getElementById('unified-input'),

  // Split mode inputs (now divs for CodeJar)
  symbolsInput: document.getElementById('symbols-input'),
  startStateInput: document.getElementById('start-state'),
  transitionInput: document.getElementById('transition-fn'),
  acceptInput: document.getElementById('accept-fn'),

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
  statDead: document.getElementById('stat-dead'),
  hideDeadToggle: document.getElementById('hide-dead-toggle'),
  mergeToggle: document.getElementById('merge-toggle'),
  stateList: document.getElementById('state-list')
};

// ============================================
// Application State
// ============================================

let currentNFA = null;
let currentTransform = null;  // Combined StateTransformation for visualization
let currentMergedSources = null;  // Map of canonical state -> source states (cached)
let hideDeadStates = false;
let mergeEquivalentStates = false;
let visualizer = null;

/** CodeJar editor instances */
const editors = {
  startState: null,
  transition: null,
  accept: null,
  unified: null
};

// ============================================
// CodeJar Setup
// ============================================

/**
 * Syntax highlighter using PrismJS
 */
function highlight(editor) {
  const code = editor.textContent;
  editor.innerHTML = Prism.highlight(code, Prism.languages.javascript, 'javascript');
}

/**
 * Initialize CodeJar editors
 */
function initEditors() {
  // All editors use syntax highlighting (except symbols which uses plain text)
  editors.symbols = CodeJar(elements.symbolsInput, () => { }, { tab: '  ' });
  editors.startState = CodeJar(elements.startStateInput, highlight, { tab: '  ' });
  editors.transition = CodeJar(elements.transitionInput, highlight, { tab: '  ' });
  editors.accept = CodeJar(elements.acceptInput, highlight, { tab: '  ' });
  editors.unified = CodeJar(elements.unifiedCodeInput, highlight, { tab: '  ' });

  // Save on changes
  editors.symbols.onUpdate(saveToStorage);
  editors.startState.onUpdate(saveToStorage);
  editors.transition.onUpdate(saveToStorage);
  editors.accept.onUpdate(saveToStorage);
  editors.unified.onUpdate(saveToStorage);

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
function init() {
  // Initialize CodeJar editors
  initEditors();

  // Restore saved inputs from sessionStorage
  restoreFromStorage();

  // Set up event listeners
  elements.unifiedToggle.addEventListener('change', handleModeToggle);
  elements.buildBtn.addEventListener('click', handleBuild);

  // Auto-update test on input change
  elements.testInput.addEventListener('input', () => {
    saveToStorage();
    updateTestResult();
  });

  // Show/hide trace toggle
  elements.showTraceToggle.addEventListener('change', updateTestResult);

  // Initialize visualizer
  visualizer = new NFAVisualizer(elements.cyContainer);

  // Handle state selection from graph
  visualizer.onStateSelect = (stateId) => {
    updateStateListSelection(stateId);
  };

  // Hide dead states toggle
  elements.hideDeadToggle.addEventListener('change', () => {
    hideDeadStates = elements.hideDeadToggle.checked;
    updateTransformAndRender();
  });

  // Merge equivalent states toggle
  elements.mergeToggle.addEventListener('change', () => {
    mergeEquivalentStates = elements.mergeToggle.checked;
    updateTransformAndRender();
  });

  // Config panel collapse/expand
  elements.configToggleBtn.addEventListener('click', () => {
    elements.appLayout.classList.toggle('config-collapsed');
    visualizer?.fit();
  });

  // Refit visualization on window resize
  window.addEventListener('resize', () => {
    visualizer?.fit();
  });

  // Build NFA on startup
  handleBuild();
}

// ============================================
// Session Storage
// ============================================

/**
 * Save current input values to sessionStorage
 */
function saveToStorage() {
  sessionStorage.setItem(STORAGE_KEYS.symbols, editors.symbols.toString());
  sessionStorage.setItem(STORAGE_KEYS.startState, editors.startState.toString());
  sessionStorage.setItem(STORAGE_KEYS.transition, editors.transition.toString());
  sessionStorage.setItem(STORAGE_KEYS.accept, editors.accept.toString());
  sessionStorage.setItem(STORAGE_KEYS.unified, editors.unified.toString());
  sessionStorage.setItem(STORAGE_KEYS.unifiedMode, elements.unifiedToggle.checked);
  sessionStorage.setItem(STORAGE_KEYS.testInput, elements.testInput.value);
}

/**
 * Restore input values from sessionStorage
 */
function restoreFromStorage() {
  const symbols = sessionStorage.getItem(STORAGE_KEYS.symbols);
  const startState = sessionStorage.getItem(STORAGE_KEYS.startState);
  const transition = sessionStorage.getItem(STORAGE_KEYS.transition);
  const accept = sessionStorage.getItem(STORAGE_KEYS.accept);
  const unified = sessionStorage.getItem(STORAGE_KEYS.unified);
  const unifiedMode = sessionStorage.getItem(STORAGE_KEYS.unifiedMode);
  const testInput = sessionStorage.getItem(STORAGE_KEYS.testInput);

  if (symbols !== null) editors.symbols.updateCode(symbols);
  if (startState !== null) editors.startState.updateCode(startState);
  if (transition !== null) editors.transition.updateCode(transition);
  if (accept !== null) editors.accept.updateCode(accept);
  if (unified !== null) editors.unified.updateCode(unified);
  if (testInput !== null) elements.testInput.value = testInput;

  // Restore mode toggle state
  if (unifiedMode === 'true') {
    elements.unifiedToggle.checked = true;
    elements.splitInput.classList.add('hidden');
    elements.unifiedInput.classList.remove('hidden');
  }
}

// ============================================
// Mode Toggle Handler
// ============================================

/**
 * Toggle between split and unified input modes,
 * converting code between formats.
 */
function handleModeToggle() {
  const isUnified = elements.unifiedToggle.checked;

  if (isUnified) {
    // Convert split inputs to unified code
    const code = buildCodeFromSplit(
      editors.startState.toString() || '"start"',
      editors.transition.toString() || 'return undefined;',
      editors.accept.toString() || 'return false;'
    );
    editors.unified.updateCode(code);

    elements.splitInput.classList.add('hidden');
    elements.unifiedInput.classList.remove('hidden');
  } else {
    // Parse unified code back to split inputs
    const parts = parseSplitFromCode(editors.unified.toString());
    editors.startState.updateCode(parts.startState);
    editors.transition.updateCode(parts.transitionBody);
    editors.accept.updateCode(parts.acceptBody);

    elements.unifiedInput.classList.add('hidden');
    elements.splitInput.classList.remove('hidden');
  }

  saveToStorage();
  hideError();
}

// ============================================
// Build Handler
// ============================================

/**
 * Build the NFA from the current input code
 */
function handleBuild() {
  hideError();

  try {
    // Get code from current input mode
    const code = getCurrentCode();

    // Parse and validate
    const config = parseNFAConfig(code);

    // Expand symbol class to array of symbols
    const symbolClass = editors.symbols.toString().trim() || DEFAULT_SYMBOL_CLASS;
    const symbols = expandSymbolClass(symbolClass);

    // Build NFA
    const builder = new NFABuilder(config, { ...CONFIG, symbols });
    currentNFA = builder.build();

    // Update UI
    showResults();

  } catch (e) {
    showError(e.message);
    hideResults();
    currentNFA = null;
  }
}

/**
 * Get the current code from either split or unified mode
 */
function getCurrentCode() {
  if (elements.unifiedToggle.checked) {
    return editors.unified.toString();
  }

  return buildCodeFromSplit(
    editors.startState.toString() || '"start"',
    editors.transition.toString() || 'return undefined;',
    editors.accept.toString() || 'return false;'
  );
}

/**
 * Show test section and visualization with current NFA
 */
function showResults() {
  // Hide empty state message
  elements.emptyState.classList.add('hidden');

  // Reset toggle states
  hideDeadStates = false;
  mergeEquivalentStates = false;
  elements.hideDeadToggle.checked = false;
  elements.mergeToggle.checked = false;

  // Compute initial transform
  computeTransform();

  // Update stats display
  updateStatsDisplay();

  // Build state list
  updateStateList();

  // Render visualization
  visualizer.render(currentNFA, currentTransform);

  // Run test with current input
  updateTestResult();
}

/**
 * Compute the combined transformation based on current toggle states
 */
function computeTransform() {
  if (!currentNFA) {
    currentTransform = null;
    return;
  }

  // Start with identity
  currentTransform = StateTransformation.identity(currentNFA.numStates());

  // Apply dead state hiding (deletion)
  if (hideDeadStates) {
    const deadTransform = currentNFA.getDeadStates();
    currentTransform = currentTransform.compose(deadTransform);
  }

  // Apply equivalent state merging
  if (mergeEquivalentStates) {
    const mergeTransform = currentNFA.getEquivalentStateRemap(currentTransform);
    currentTransform = mergeTransform;
  }
}

/**
 * Recompute transform and re-render, preserving viewport and positions
 */
function updateTransformAndRender() {
  if (!currentNFA) return;

  // Save current viewport and positions
  const viewport = visualizer.getViewport();
  const positions = visualizer.getNodePositions();

  // Recompute the combined transform
  computeTransform();

  // Re-render with same positions
  visualizer.render(currentNFA, currentTransform, positions);

  // Restore viewport
  visualizer.setViewport(viewport);

  // Update stats display
  updateStatsDisplay();
  updateStateList();
  updateTestResult();
}

/**
 * Update the stats display based on current NFA and transform
 */
function updateStatsDisplay() {
  // Count visible states (canonical states in transform)
  let visibleStates = 0;
  let visibleStart = 0;
  let visibleAccept = 0;
  let visibleDead = 0;

  const deadTransform = currentNFA.getDeadStates();

  for (let i = 0; i < currentTransform.remap.length; i++) {
    // Only count canonical states (where remap[i] === i)
    if (currentTransform.remap[i] === i) {
      visibleStates++;
      if (currentNFA.startStates.has(i)) visibleStart++;
      if (currentNFA.acceptStates.has(i)) visibleAccept++;
      if (deadTransform.isDeleted(i)) visibleDead++;
    }
  }

  elements.statStates.textContent = visibleStates;
  elements.statStart.textContent = visibleStart;
  elements.statAccept.textContent = visibleAccept;
  elements.statDead.textContent = visibleDead;
}

/**
 * Update the state list display in the info panel
 */
function updateStateList() {
  const states = currentNFA.getStateInfo();
  const labels = currentNFA.stateLabels;

  // Build map of canonical state -> list of source states (cached for transitions display)
  currentMergedSources = new Map();
  for (const state of states) {
    const canonical = currentTransform.remap[state.id];
    if (canonical !== -1) {
      if (!currentMergedSources.has(canonical)) {
        currentMergedSources.set(canonical, []);
      }
      currentMergedSources.get(canonical).push(state.id);
    }
  }

  // Clear existing items
  elements.stateList.replaceChildren();

  for (const state of states) {
    // Only show canonical states
    if (currentTransform.remap[state.id] !== state.id) continue;

    const sources = currentMergedSources.get(state.id) || [state.id];
    const label = labels?.get(state.id) || `q${state.id}`;
    const item = createStateItem(state, label, sources, currentNFA);
    elements.stateList.appendChild(item);
  }
}

/**
 * Create a state item DOM element
 * @param {Object} state - The state object
 * @param {string} label - The state label (used for non-merged states)
 * @param {number[]} sources - Array of source state IDs for this state
 * @param {import('./nfa.js').NFA} nfa - The NFA for looking up labels
 */
function createStateItem(state, label, sources, nfa) {
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
      const sourceLabel = nfa.stateLabels.get(id);
      sourceDiv.textContent = sourceLabel !== null && sourceLabel !== undefined
        ? `q${id}: ${sourceLabel}`
        : `q${id}`;
      sourcesList.appendChild(sourceDiv);
    }
    header.appendChild(sourcesList);
  } else {
    const labelSpan = document.createElement('span');
    labelSpan.className = 'state-label';
    labelSpan.textContent = label;
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
    handleStateSelect(state.id, item);
  });

  return item;
}

/**
 * Handle state selection from state list click
 */
function handleStateSelect(stateId, itemElement) {
  const wasSelected = itemElement.classList.contains('expanded');

  // Collapse all items and clear graph selection
  collapseAllStateItems();
  visualizer.clearSelection();

  if (wasSelected) {
    // Was already selected, just deselect
    return;
  }

  // Expand and select in graph
  expandStateItem(stateId, itemElement);
  visualizer.selectState(stateId);
}

/**
 * Collapse all state items in the list
 */
function collapseAllStateItems() {
  elements.stateList.querySelectorAll('.state-item').forEach(item => {
    item.classList.remove('expanded');
    item.querySelector('.state-transitions')?.classList.add('hidden');
  });
}

/**
 * Expand a state item to show its transitions (UI only, no graph update)
 */
function expandStateItem(stateId, itemElement) {
  itemElement.classList.add('expanded');
  const transitionsEl = itemElement.querySelector('.state-transitions');

  // Clear and rebuild transitions content
  transitionsEl.replaceChildren();

  const transitions = currentNFA.getTransitionsFrom(stateId);
  if (transitions.length === 0) {
    const row = document.createElement('div');
    row.className = 'transition-row';
    row.textContent = 'No outgoing transitions';
    transitionsEl.appendChild(row);
  } else {
    for (const { to, symbols } of transitions) {
      // Use prime notation if target state absorbed multiple states
      const targetSources = currentMergedSources?.get(to);
      const isMerged = targetSources && targetSources.length > 1;
      transitionsEl.appendChild(createTransitionRow(to, symbols, isMerged));
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
function createTransitionRow(toState, symbols, isMerged = false) {
  const row = document.createElement('div');
  row.className = 'transition-row';

  const stateSpan = document.createElement('span');
  stateSpan.className = 'state-id';
  stateSpan.textContent = isMerged ? `q'${toState}` : `q${toState}`;

  const symbolSpan = document.createElement('span');
  symbolSpan.className = 'symbol-label';
  symbolSpan.textContent = compactSymbolLabel(symbols);

  row.append('→ ', stateSpan, ' on ', symbolSpan);
  return row;
}

/**
 * Update state list to match graph selection (called from graph click)
 */
function updateStateListSelection(stateId) {
  collapseAllStateItems();

  if (stateId === null) return;

  // Find and expand the matching item (graph already has selection)
  const item = elements.stateList.querySelector(`.state-item[data-state-id="${stateId}"]`);
  if (item) {
    expandStateItem(stateId, item);
  }
}

/**
 * Reset UI to empty state
 */
function hideResults() {
  elements.emptyState.classList.remove('hidden');
  elements.statStates.textContent = '—';
  elements.statStart.textContent = '—';
  elements.statAccept.textContent = '—';
  elements.statDead.textContent = '—';
  elements.stateList.innerHTML = '';
}

// ============================================
// Test Handler
// ============================================

/**
 * Update test result and trace highlighting
 */
function updateTestResult() {
  if (!currentNFA) {
    elements.testResult.textContent = '';
    elements.testResult.className = 'test-result';
    visualizer.clearHighlight();
    return;
  }

  const inputStr = elements.testInput.value;

  try {
    const sequence = parseInputSequence(inputStr);
    const result = currentNFA.run(sequence);

    displayTestResult(result, sequence);

    // Update trace highlighting based on toggle
    if (elements.showTraceToggle.checked) {
      visualizer.highlightTrace(result.trace, currentTransform);
    } else {
      visualizer.clearHighlight();
    }

  } catch (e) {
    showTestResult(`Error: ${e.message}`, false);
    visualizer.clearHighlight();
  }
}

/**
 * Parse user input string into a sequence of symbol arrays.
 * Each character becomes a single-element array.
 * [charClass] syntax expands to array of matching symbols.
 * @returns {Array<string[]>} Array of symbol arrays
 */
function parseInputSequence(inputStr) {
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
function formatInputSequence(sequence) {
  if (sequence.length === 0) return '(empty)';
  return sequence.map(symbols =>
    symbols.length === 1 ? symbols[0] : `[${compactSymbolLabel(symbols)}]`
  ).join('');
}

/**
 * Display the test result in the UI
 */
function displayTestResult(result, sequence) {
  const lastStep = result.trace[result.trace.length - 1];
  const inputDisplay = formatInputSequence(sequence);

  // Count final states, mapping through transform if active
  const finalStateCount = countCanonicalStates(lastStep.states);

  if (result.accepted) {
    showTestResult(
      `✓ ACCEPTED\nInput: ${inputDisplay}\nFinal states: ${finalStateCount}`,
      true
    );
  } else {
    const reason = lastStep.states.length === 0
      ? 'No reachable states (dead end)'
      : 'No accepting state reached';
    showTestResult(
      `✗ REJECTED\nInput: ${inputDisplay}\nReason: ${reason}`,
      false
    );
  }
}

/**
 * Count unique canonical states from a list of state IDs
 */
function countCanonicalStates(stateIds) {
  if (!currentTransform) return stateIds.length;
  const canonical = new Set();
  for (const id of stateIds) {
    const mapped = currentTransform.remap[id];
    if (mapped !== -1) canonical.add(mapped);
  }
  return canonical.size;
}

/**
 * Show test result with appropriate styling
 */
function showTestResult(message, accepted) {
  elements.testResult.textContent = message;
  elements.testResult.className = `test-result ${accepted ? 'accepted' : 'rejected'}`;
}

// ============================================
// Error Display
// ============================================

function showError(message) {
  elements.errorDisplay.textContent = message;
  elements.errorDisplay.classList.remove('hidden');
}

function hideError() {
  elements.errorDisplay.classList.add('hidden');
}

// ============================================
// Start Application
// ============================================

init();