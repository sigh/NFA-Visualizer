/**
 * NFA Visualizer - Main Application Controller
 *
 * Handles UI interactions, mode toggling, NFA building, and testing.
 *
 * @module app
 */

import { NFABuilder, parseNFAConfig, buildCodeFromSplit, parseSplitFromCode } from './nfa.js';
import { NFAVisualizer } from './visualizer.js';

// ============================================
// Configuration
// ============================================

const CONFIG = {
  maxStates: 500,
  maxSymbols: 10
};

/** SessionStorage keys for persisting input fields */
const STORAGE_KEYS = {
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
  startStateInput: document.getElementById('start-state'),
  transitionInput: document.getElementById('transition-fn'),
  acceptInput: document.getElementById('accept-fn'),

  // Unified mode input
  unifiedCodeInput: document.getElementById('unified-code'),

  // Actions
  buildBtn: document.getElementById('build-btn'),
  testBtn: document.getElementById('test-btn'),

  // Output
  errorDisplay: document.getElementById('error-display'),
  testInput: document.getElementById('test-input'),
  testResult: document.getElementById('test-result'),
  cyContainer: document.getElementById('cy-container'),
  emptyState: document.getElementById('empty-state'),

  // Stats
  statStates: document.getElementById('stat-states'),
  statStart: document.getElementById('stat-start'),
  statAccept: document.getElementById('stat-accept'),
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
  elements.testBtn.addEventListener('click', handleTest);
  elements.testInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTest();
  });

  // Save inputs on change
  elements.startStateInput.addEventListener('input', saveToStorage);
  elements.transitionInput.addEventListener('input', saveToStorage);
  elements.acceptInput.addEventListener('input', saveToStorage);
  elements.unifiedCodeInput.addEventListener('input', saveToStorage);
  elements.testInput.addEventListener('input', saveToStorage);

  // Initialize visualizer
  visualizer = new NFAVisualizer(elements.cyContainer);

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
  const startState = sessionStorage.getItem(STORAGE_KEYS.startState);
  const transition = sessionStorage.getItem(STORAGE_KEYS.transition);
  const accept = sessionStorage.getItem(STORAGE_KEYS.accept);
  const unified = sessionStorage.getItem(STORAGE_KEYS.unified);
  const unifiedMode = sessionStorage.getItem(STORAGE_KEYS.unifiedMode);
  const testInput = sessionStorage.getItem(STORAGE_KEYS.testInput);

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

    // Build NFA
    const builder = new NFABuilder(config, CONFIG);
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
  elements.statStates.textContent = currentNFA.numStates();
  elements.statStart.textContent = startStates.size;
  elements.statAccept.textContent = acceptStates.size;

  // Build state list
  updateStateList();

  // Render visualization
  visualizer.render(currentNFA);

  // Clear previous test result
  elements.testResult.textContent = '';
  elements.testResult.className = 'test-result';
}

/**
 * Update the state list display in the info panel
 */
function updateStateList() {
  const states = currentNFA.getStateInfo();
  const labels = currentNFA.stateLabels;

  const items = states.map(state => {
    const label = labels?.get(state.id) || `q${state.id}`;
    const flags = [];
    if (state.isStart) flags.push('start');
    if (state.isAccept) flags.push('accept');
    const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
    return `<div class="state-item"><span class="state-id">q${state.id}</span> = <span class="state-label">${escapeHtml(formatStateLabel(label))}</span>${flagStr}</div>`;
  });

  elements.stateList.innerHTML = items.join('');
}

/**
 * Format a state label for display
 */
function formatStateLabel(label) {
  try {
    const value = JSON.parse(label);
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number') return String(value);
    if (value === null) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  } catch {
    return label;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
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
 * Test the current NFA with the input sequence
 */
function handleTest() {
  if (!currentNFA) {
    showError('Build NFA first');
    return;
  }

  const inputStr = elements.testInput.value.trim();
  if (!inputStr) {
    showTestResult('Enter an input sequence', false);
    return;
  }

  try {
    const sequence = parseInputSequence(inputStr);
    const result = currentNFA.run(sequence);

    displayTestResult(result, sequence);
    visualizer.highlightTrace(result.trace);

  } catch (e) {
    showTestResult(`Error: ${e.message}`, false);
  }
}

/**
 * Parse user input string into a sequence of values
 */
function parseInputSequence(inputStr) {
  return inputStr.split(',').map(s => {
    const val = s.trim();

    // Try parsing as number first
    const num = Number(val);
    if (!isNaN(num)) return num;

    // Otherwise treat as string, stripping quotes if present
    return val.replace(/^["']|["']$/g, '');
  });
}

/**
 * Display the test result in the UI
 */
function displayTestResult(result, sequence) {
  const lastStep = result.trace[result.trace.length - 1];

  if (result.accepted) {
    showTestResult(
      `✓ ACCEPTED\nInput: [${sequence.join(', ')}]\nFinal states: ${lastStep.states.length}`,
      true
    );
  } else {
    const reason = lastStep.states.length === 0
      ? 'No reachable states (dead end)'
      : 'No accepting state reached';
    showTestResult(
      `✗ REJECTED\nInput: [${sequence.join(', ')}]\nReason: ${reason}`,
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