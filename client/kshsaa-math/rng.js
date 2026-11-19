// Random numbers for the drills, from a seed so a test can replay any problem.
// The page seeds it from the clock; npm test seeds it with fixed numbers.

/**
 * @param {number} seed
 * @returns {{next: function(): number, int: function(number, number): number,
 *   nonzero: function(number, number): number, pick: function(Array): *,
 *   shuffle: function(Array): Array, chance: function(number): boolean}}
 */
export function makeRng (seed) {
  let a = seed >>> 0;
  // mulberry32
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    nonzero: (lo, hi) => { let x = 0; while (x === 0) x = int(lo, hi); return x; },
    pick: list => list[Math.floor(next() * list.length)],
    shuffle: list => {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    chance: p => next() < p
  };
}
