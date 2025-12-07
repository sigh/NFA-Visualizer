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
  maxValues: 10
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
  canvas: document.getElementById('nfa-canvas'),
  emptyState: document.getElementById('empty-state'),

  // Stats
  statStates: document.getElementById('stat-states'),
  statStart: document.getElementById('stat-start'),
  statAccept: document.getElementById('stat-accept')
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
  // Set up event listeners
  elements.unifiedToggle.addEventListener('change', handleModeToggle);
  elements.buildBtn.addEventListener('click', handleBuild);
  elements.testBtn.addEventListener('click', handleTest);
  elements.testInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTest();
  });

  // Initialize visualizer
  visualizer = new NFAVisualizer(elements.canvas);

  // Handle window resize for visualization
  window.addEventListener('resize', () => {
    if (currentNFA) {
      visualizer.render(currentNFA);
    }
  });
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

  // Render visualization
  visualizer.render(currentNFA);

  // Clear previous test result
  elements.testResult.textContent = '';
  elements.testResult.className = 'test-result';
}

/**
 * Hide test section and visualization
 */
function hideResults() {
  elements.emptyState.classList.remove('hidden');
  elements.statStates.textContent = '—';
  elements.statStart.textContent = '—';
  elements.statAccept.textContent = '—';
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