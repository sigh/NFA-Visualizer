/**
 * Utility Functions
 *
 * @module util
 */

/**
 * Serialize a value to JSON with object keys sorted for canonical representation.
 * Two objects with the same keys/values will produce identical strings regardless
 * of the order in which keys were defined.
 *
 * @param {any} value - Value to serialize
 * @returns {string} Canonical JSON string
 */
export function canonicalJSON(value) {
  const replacer = (key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sortedEntries = Object.entries(val).sort(
        (a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
      );
      return Object.fromEntries(sortedEntries);
    }
    return val;
  };
  return JSON.stringify(value, replacer);
}
