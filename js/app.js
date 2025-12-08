/**
 * NFA Visualizer - Main Application Controller
 *
 * Handles UI interactions, mode toggling, NFA building, and testing.
 *
 * @module app
 */

import { NFABuilder, parseNFAConfig, buildCodeFromSplit, parseSplitFromCode, expandSymbolClass, DEFAULT_SYMBOL_CLASS } from './nfa.js';
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

  // Split mode inputs
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

  // Stats
  statStates: document.getElementById('stat-states'),
  statStart: document.getElementById('stat-start'),
  statAccept: document.getElementById('stat-accept'),
  statDead: document.getElementById('stat-dead'),
  deadStatRow: document.getElementById('dead-stat-row'),
  hideDeadRow: document.getElementById('hide-dead-row'),
  hideDeadToggle: document.getElementById('hide-dead-toggle'),
  stateList: document.getElementById('state-list')
};

// ============================================
// Application State
// ============================================

let currentNFA = null;
let visualizer = null;

// ============================================
// Initialization
// ============================================

/**
 * Initialize the application: set up event listeners and visualizer
 */
function init() {
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

  // Save inputs on change
  elements.symbolsInput.addEventListener('input', saveToStorage);
  elements.startStateInput.addEventListener('input', saveToStorage);
  elements.transitionInput.addEventListener('input', saveToStorage);
  elements.acceptInput.addEventListener('input', saveToStorage);
  elements.unifiedCodeInput.addEventListener('input', saveToStorage);

  // Initialize visualizer
  visualizer = new NFAVisualizer(elements.cyContainer);

  // Handle state selection from graph
  visualizer.onStateSelect = (stateId) => {
    updateStateListSelection(stateId);
  };

  // Hide dead states toggle
  elements.hideDeadToggle.addEventListener('change', () => {
    visualizer.setHideDeadStates(elements.hideDeadToggle.checked);
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
  sessionStorage.setItem(STORAGE_KEYS.symbols, elements.symbolsInput.value);
  sessionStorage.setItem(STORAGE_KEYS.startState, elements.startStateInput.value);
  sessionStorage.setItem(STORAGE_KEYS.transition, elements.transitionInput.value);
  sessionStorage.setItem(STORAGE_KEYS.accept, elements.acceptInput.value);
  sessionStorage.setItem(STORAGE_KEYS.unified, elements.unifiedCodeInput.value);
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

  if (symbols !== null) elements.symbolsInput.value = symbols;
  if (startState !== null) elements.startStateInput.value = startState;
  if (transition !== null) elements.transitionInput.value = transition;
  if (accept !== null) elements.acceptInput.value = accept;
  if (unified !== null) elements.unifiedCodeInput.value = unified;
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
      elements.startStateInput.value || '"start"',
      elements.transitionInput.value || 'return undefined;',
      elements.acceptInput.value || 'return false;'
    );
    elements.unifiedCodeInput.value = code;

    elements.splitInput.classList.add('hidden');
    elements.unifiedInput.classList.remove('hidden');
  } else {
    // Parse unified code back to split inputs
    const parts = parseSplitFromCode(elements.unifiedCodeInput.value);
    elements.startStateInput.value = parts.startState;
    elements.transitionInput.value = parts.transitionBody;
    elements.acceptInput.value = parts.acceptBody;

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
    const symbolClass = elements.symbolsInput.value.trim() || DEFAULT_SYMBOL_CLASS;
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
    return elements.unifiedCodeInput.value;
  }

  return buildCodeFromSplit(
    elements.startStateInput.value || '"start"',
    elements.transitionInput.value || 'return undefined;',
    elements.acceptInput.value || 'return false;'
  );
}

/**
 * Show test section and visualization with current NFA
 */
function showResults() {
  // Hide empty state message
  elements.emptyState.classList.add('hidden');

  // Update stats display
  const { startStates, acceptStates } = currentNFA;
  const deadStates = currentNFA.getDeadStates();

  elements.statStates.textContent = currentNFA.numStates();
  elements.statStart.textContent = startStates.size;
  elements.statAccept.textContent = acceptStates.size;

  // Show/hide dead state info based on whether there are any
  if (deadStates.size > 0) {
    elements.statDead.textContent = deadStates.size;
    elements.deadStatRow.style.display = '';
    elements.hideDeadRow.style.display = '';
  } else {
    elements.deadStatRow.style.display = 'none';
    elements.hideDeadRow.style.display = 'none';
  }

  // Build state list
  updateStateList();

  // Render visualization
  visualizer.render(currentNFA);

  // Run test with current input
  updateTestResult();
}

/**
 * Update the state list display in the info panel
 */
function updateStateList() {
  const states = currentNFA.getStateInfo();
  const labels = currentNFA.stateLabels;

  // Clear existing items
  elements.stateList.replaceChildren();

  for (const state of states) {
    const label = labels?.get(state.id) || `q${state.id}`;
    const item = createStateItem(state, label);
    elements.stateList.appendChild(item);
  }
}

/**
 * Create a state item DOM element
 */
function createStateItem(state, label) {
  const item = document.createElement('div');
  item.className = 'state-item';
  item.dataset.stateId = state.id;

  // Header
  const header = document.createElement('div');
  header.className = 'state-header';

  const idSpan = document.createElement('span');
  idSpan.className = 'state-id';
  idSpan.textContent = `q${state.id}`;

  const labelSpan = document.createElement('span');
  labelSpan.className = 'state-label';
  labelSpan.textContent = label;

  header.append(idSpan, ' = ', labelSpan);

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
      transitionsEl.appendChild(createTransitionRow(to, symbols));
    }
  }
  transitionsEl.classList.remove('hidden');
}

/**
 * Create a transition row DOM element
 */
function createTransitionRow(toState, symbols) {
  const row = document.createElement('div');
  row.className = 'transition-row';

  const stateSpan = document.createElement('span');
  stateSpan.className = 'state-id';
  stateSpan.textContent = `q${toState}`;

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
      visualizer.highlightTrace(result.trace);
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

  if (result.accepted) {
    showTestResult(
      `✓ ACCEPTED\nInput: ${inputDisplay}\nFinal states: ${lastStep.states.length}`,
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