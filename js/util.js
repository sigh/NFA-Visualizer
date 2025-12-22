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

/**
 * Extract the body text from a function.
 *
 * - Trims leading/trailing empty lines
 * - Removes the common leading indentation from all non-empty lines
 *
 * @param {Function} fn
 * @returns {string}
 */
export function extractFunctionBody(fn) {
  if (typeof fn !== 'function') return '';

  const source = fn.toString();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';

  let body = source.slice(start + 1, end);

  // Normalize newlines, split, and trim empty lines.
  const lines = body.split(/\r?\n/);

  let first = 0;
  while (first < lines.length && lines[first].trim().length === 0) first++;
  let last = lines.length - 1;
  while (last >= first && lines[last].trim().length === 0) last--;
  if (first > last) return '';

  const content = lines.slice(first, last + 1);

  // Compute minimum indentation across non-empty lines.
  let minIndent = Infinity;
  for (const line of content) {
    if (line.trim().length === 0) continue;
    const indentMatch = line.match(/^\s*/);
    const indentLen = indentMatch ? indentMatch[0].length : 0;
    if (indentLen < minIndent) minIndent = indentLen;
  }
  if (!Number.isFinite(minIndent)) minIndent = 0;

  return content
    .map(line => line.slice(Math.min(line.length, minIndent)))
    .join('\n');
}

/**
 * Shallow equality for arrays.
 *
 * @template T
 * @param {T[]} a
 * @param {T[]} b
 * @returns {boolean}
 */
export function arraysAreEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
