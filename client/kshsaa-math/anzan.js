// Flash anzan: numbers shown one at a time, to be added in the head. This
// makes the run of numbers; the page does the flashing.

export const ANZAN_DIGITS = [1, 2, 3, 4, 5];
export const ANZAN_SECONDS = [3, 2.5, 2, 1.5, 1, 0.7, 0.5, 0.3, 0.2, 0.1];
export const ANZAN_COUNTS = [3, 5, 10, 15, 20, 25, 30, 50, 100];

/**
 * @param {object} r - from makeRng
 * @param {{digits: number, count: number, subtract?: boolean}} options
 *   subtract: about a third of the numbers after the first are taken away,
 *   never taking the running total below zero
 * @returns {{numbers: number[], total: number}}
 */
export function anzanRun (r, { digits, count, subtract = false }) {
  const lo = digits === 1 ? 1 : 10 ** (digits - 1);
  const hi = 10 ** digits - 1;
  const numbers = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    let n;
    // no number twice in a row, or the second flash looks like the first
    do { n = r.int(lo, hi); } while (numbers.length && Math.abs(numbers[numbers.length - 1]) === n);
    if (subtract && i > 0 && n <= total && r.chance(0.35)) n = -n;
    numbers.push(n);
    total += n;
  }
  return { numbers, total };
}
