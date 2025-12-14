/**
 * Shared test utilities
 */

import assert from 'assert';

let testCount = 0;
let passCount = 0;

export function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    console.log(e.stack);
  }
}

export function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

export function report() {
  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${passCount}/${testCount} passed`);
  if (passCount === testCount) {
    console.log('All tests passed! ✓');
    return true;
  } else {
    console.log(`${testCount - passCount} test(s) failed`);
    return false;
  }
}

export { assert };
