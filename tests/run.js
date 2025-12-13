/**
 * Master test runner - runs all test files
 */

import { report } from './test_utils.js';
import './nfa.test.js';
import './nfa_builder.test.js';
import './nfa_view.test.js';
import './visualizer.test.js';
import './regex_parser.test.js';

process.exit(report() ? 0 : 1);
