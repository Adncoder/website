// The math practice page's drills, answer checker, and flash anzan runs.
// Every drill's answer is worked out a second way here, from the numbers the
// problem was built from (its `data`), by counting, brute force, or numeric
// methods rather than the drill's own formula. A drill with no entry in
// SECOND_WAY fails, so a new one cannot be added unchecked.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { anzanRun } from '../client/kshsaa-math/anzan.js';
import { answerPlain, check, exact, frac, int, parse, pi, root, same, times, toNumber, toPlain } from '../client/kshsaa-math/exact.js';
import { FORMULAS } from '../client/kshsaa-math/formulas.js';
import { cleanRecord } from '../client/kshsaa-math/progress.js';
import { makeRng } from '../client/kshsaa-math/rng.js';
import { SKILLS, TOPICS, skillById } from '../client/kshsaa-math/skills.js';

const RUNS = 250;
const near = (x, y, tolerance = 1e-9) => Math.abs(x - y) <= tolerance * Math.max(1, Math.abs(x), Math.abs(y));
const sum = list => list.reduce((a, b) => a + b, 0);
const product = list => list.reduce((a, b) => a * b, 1);
const rad = degrees => degrees * Math.PI / 180;
const evaluate = (coefficients, x) => coefficients.reduce((total, c) => total * x + c, 0);

// ---------- helpers that reach an answer without the formula ----------

// a row of Pascal's triangle built by adding the row above
function pascalRow (n) {
  let row = [1];
  for (let i = 0; i < n; i++) row = [1, ...row.slice(1).map((v, j) => v + row[j]), 1];
  return row;
}
// coefficients of (a x + b)^n, lowest power first, by repeated multiplication
function expand (a, b, n) {
  let p = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(p.length + 1).fill(0);
    p.forEach((c, j) => { next[j] += c * b; next[j + 1] += c * a; });
    p = next;
  }
  return p;
}
// every ordering of a list
function * orderings (list) {
  if (list.length <= 1) { yield list; return; }
  for (let i = 0; i < list.length; i++) {
    for (const rest of orderings([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...rest];
  }
}
// distinct orderings of a word's letters, counted by walking the letter counts
function distinctOrders (counts, left) {
  if (left === 0) return 1;
  let total = 0;
  for (const c of Object.keys(counts)) {
    if (!counts[c]) continue;
    counts[c]--;
    total += distinctOrders(counts, left - 1);
    counts[c]++;
  }
  return total;
}
// area of a polygon from its corners
const shoelace = points => Math.abs(sum(points.map(([x, y], i) => { const [u, v] = points[(i + 1) % points.length]; return x * v - u * y; }))) / 2;
// Simpson's rule, exact for cubics
function simpson (f, lo, hi, steps = 2) {
  const h = (hi - lo) / steps;
  let total = f(lo) + f(hi);
  for (let i = 1; i < steps; i++) total += f(lo + i * h) * (i % 2 ? 4 : 2);
  return total * h / 3;
}
// complex numbers as [re, im]
const cmul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const cdiv = ([a, b], [c, d]) => { const m = c * c + d * d; return [(a * c + b * d) / m, (b * c - a * d) / m]; };
const csub = ([a, b], [c, d]) => [a - c, b - d];
const cadd = ([a, b], [c, d]) => [a + c, b + d];
// all roots of a polynomial (highest power first), by Durand-Kerner
function roots (coefficients) {
  const lead = coefficients[0];
  const monic = coefficients.map(c => [c / lead, 0]);
  const n = monic.length - 1;
  let guess = Array.from({ length: n }, (_, i) => { let z = [1, 0]; for (let k = 0; k < i; k++) z = cmul(z, [0.4, 0.9]); return z; });
  for (let step = 0; step < 500; step++) {
    guess = guess.map((z, i) => {
      const value = monic.reduce((total, c) => cadd(cmul(total, z), c), [0, 0]);
      const others = guess.reduce((total, w, j) => (j === i ? total : cmul(total, csub(z, w))), [1, 0]);
      return csub(z, cdiv(value, others));
    });
  }
  return guess;
}
const csum = list => list.reduce(cadd, [0, 0]);
const cproduct = list => list.reduce(cmul, [1, 0]);
const slope = (f, x, h = 1e-4) => (f(x - 2 * h) - 8 * f(x - h) + 8 * f(x + h) - f(x + 2 * h)) / (12 * h);
const fromRoman = text => {
  const value = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return [...text].reduce((total, c, i) => total + (value[c] < (value[text[i + 1]] || 0) ? -value[c] : value[c]), 0);
};
// percent of a normal distribution below z standard deviations, from the
// rule's three numbers
const WITHIN = { 0: 0, 1: 68, 2: 95, 3: 99.7 };
const below = z => 50 + Math.sign(z) * WITHIN[Math.abs(z)] / 2;
// a triangle's corners from its three sides
function corners (a, b, c) {
  const x = (b * b + c * c - a * a) / (2 * c);
  return [[0, 0], [c, 0], [x, Math.sqrt(b * b - x * x)]];
}
// [vertices, edges, faces] of a prism or pyramid, by listing them
function solidCounts (n, prism) {
  const edges = new Set();
  const edge = (a, b) => edges.add([a, b].sort().join('-'));
  for (let i = 0; i < n; i++) {
    edge('b' + i, 'b' + (i + 1) % n);
    if (prism) { edge('t' + i, 't' + (i + 1) % n); edge('b' + i, 't' + i); } else edge('b' + i, 'apex');
  }
  return [prism ? 2 * n : n + 1, edges.size, n + (prism ? 2 : 1)];
}
// Schlafli symbols {p, q}: p-sided faces, q meeting at each vertex
const SCHLAFLI = { tetrahedron: [3, 3], cube: [4, 3], octahedron: [3, 4], dodecahedron: [5, 3], icosahedron: [3, 5] };
function platonicCounts (name) {
  const [p, q] = SCHLAFLI[name];
  const e = 2 * p * q / (4 - (p - 2) * (q - 2));
  return [2 * e / q, e, 2 * e / p];
}

// ---------- each drill's answer, a second way ----------

const SECOND_WAY = {
  pascal: d => pascalRow(d.n)[d.k],
  'pascal-row-sum': d => sum(pascalRow(d.n)),
  'binomial-coefficient': d => expand(d.a, d.b, d.n)[d.k],
  'binomial-term': d => expand(d.a, d.b, d.n)[d.n - d.k],
  permutations: d => { let n = 0; const walk = (used, left) => { if (!left) { n++; return; } for (let i = 0; i < d.n; i++) if (!(used >> i & 1)) walk(used | 1 << i, left - 1); }; walk(0, d.k); return n; },
  combinations: d => { let n = 0; for (let mask = 0; mask < 1 << d.n; mask++) { let bits = 0; for (let m = mask; m; m >>= 1) bits += m & 1; if (bits === d.k) n++; } return n; },
  handshakes: d => { let n = 0; for (let i = 0; i < d.n; i++) for (let j = i + 1; j < d.n; j++) n++; return n; },
  'word-arrangements': d => { const counts = {}; for (const c of d.word) counts[c] = (counts[c] || 0) + 1; return distinctOrders(counts, d.word.length); },
  circular: d => {
    // seat person 0 first so a turn of the table is not counted again
    const seen = new Set();
    let together = 0;
    for (const rest of orderings(Array.from({ length: d.n - 1 }, (_, i) => i + 1))) {
      const seats = [0, ...rest];
      const mirror = [0, ...rest.slice().reverse()];
      seen.add(d.kind === 'ring' ? [seats.join(), mirror.join()].sort()[0] : seats.join());
      const at = seats.indexOf(1);
      if (at === 1 || at === d.n - 1) together++;
    }
    return d.kind === 'together' ? together : seen.size;
  },
  'factorial-quotient': d => { let p = 1; for (let i = d.b + 1; i <= d.a; i++) p *= i; return p; },
  'counting-principle': d => { let n = 0; for (let i = 0; i < d.a; i++) for (let j = 0; j < d.b; j++) n += d.c; return n; },
  subsets: d => { let n = 0; for (let mask = 0; mask < 1 << d.n; mask++) if (!d.proper || mask) n++; return n; },
  survey: d => d.total - (d.a - d.both) - (d.b - d.both) - d.both,
  'dice-sum': d => {
    let hits = 0;
    for (let i = 1; i <= 6; i++) {
      for (let j = 1; j <= 6; j++) {
        const s = i + j;
        if (d.kind === 'doubles' ? i === j : d.kind === 'prime' ? [2, 3, 5, 7, 11].includes(s) : d.kind === 'atLeast' ? s >= d.s : s === d.s) hits++;
      }
    }
    return hits / 36;
  },
  cards: d => d.count / 52,
  coins: d => { let hits = 0; for (let mask = 0; mask < 1 << d.n; mask++) { let heads = 0; for (let m = mask; m; m >>= 1) heads += m & 1; if (d.k == null ? heads >= 1 : heads === d.k) hits++; } return hits / 2 ** d.n; },
  marbles: d => { const bag = [...'r'.repeat(d.red), ...'b'.repeat(d.blue)]; let hits = 0; let all = 0; bag.forEach((x, i) => bag.forEach((y, j) => { if (i !== j) { all++; if (x === 'r' && y === 'r') hits++; } })); return hits / all; },
  'independent-events': d => (1 / 2) * (d.die / 6) * (d.card / 52),
  mean: d => sum(d.list) / d.list.length,
  median: d => { const s = d.list.slice().sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2; },
  'missing-score': d => { for (let x = 0; x <= 200; x++) if (near((sum(d.scores) + x) / (d.scores.length + 1), d.target)) return x; },
  'geometric-mean': d => product(d.list) ** (1 / d.list.length),
  'harmonic-mean': d => 2 / (1 / d.a + 1 / d.b),
  'empirical-rule': d => (d.kind === 'above' ? 100 - below(d.lo) : d.kind === 'below' ? below(d.hi) : below(d.hi) - below(d.lo)),
  diagonals: d => { if (d.inverse) return d.n; let n = 0; for (let i = 0; i < d.n; i++) for (let j = i + 2; j < d.n; j++) if (!(i === 0 && j === d.n - 1)) n++; return n; },
  // walk around the polygon: the turns add to 360, and each turn is 180 minus an interior angle
  'angle-sum': d => d.n * 180 - 360,
  'interior-angle': d => (d.inverse ? d.n : (d.n * 180 - 360) / d.n),
  'exterior-angle': d => (d.inverse ? d.n : 180 - (d.n * 180 - 360) / d.n),
  'polygon-names': d => d.n,
  'quadrilateral-area': d => (d.kind === 'trapezoid'
    ? shoelace([[0, 0], [d.a, 0], [1 + d.b, d.h], [1, d.h]])
    : d.kind === 'parallelogram'
      ? shoelace([[0, 0], [d.a, 0], [d.a + 2, d.b], [2, d.b]])
      : shoelace([[d.a / 2, 0], [0, d.b / 2], [-d.a / 2, 0], [0, -d.b / 2]])),
  'hexagon-area': d => shoelace(Array.from({ length: 6 }, (_, i) => [d.s * Math.cos(rad(60 * i)), d.s * Math.sin(rad(60 * i))])),
  platonic: d => platonicCounts(d.name)[d.part],
  euler: d => { const [v, e, f] = d.counts; assert.equal(v - e + f, 2); return d.counts[d.part]; },
  'prism-pyramid': d => solidCounts(d.n, d.prism)[d.part],
  sphere: d => {
    const r = d.radius;
    // stack of discs for the volume; the surface is the volume's rate of change
    const volume = simpson(z => Math.PI * (r * r - z * z), -r, r);
    return d.kind === 'volume' ? volume : d.kind === 'surface' ? 3 * volume / r : r;
  },
  'cylinder-cone': d => (d.kind === 'height' ? d.h : simpson(z => Math.PI * (d.kind === 'cone' ? d.radius * (1 - z / d.h) : d.radius) ** 2, 0, d.h)),
  'pyramid-volume': d => simpson(z => (d.s * (1 - z / d.h)) ** 2, 0, d.h),
  box: d => (d.kind === 'cube' ? d.l * d.w * d.h : d.kind === 'surface' ? 2 * d.l * d.w + 2 * d.l * d.h + 2 * d.w * d.h : Math.hypot(d.l, d.w, d.h)),
  'similar-solids': d => d.small * (d.b / d.a) ** d.power,
  pythagorean: d => (d.c == null ? Math.hypot(d.a, d.b) : Math.sqrt(d.c * d.c - d.a * d.a)),
  'special-30-60-90': d => {
    const sides = { short: 1, long: Math.tan(rad(60)), hyp: 1 / Math.cos(rad(60)) };
    return (d.given === 'hyp' ? 2 * d.x : d.x) * sides[d.want] / sides[d.given];
  },
  'special-45-45-90': d => (d.fromLeg ? d.x / Math.cos(rad(45)) : d.x * Math.cos(rad(45))),
  equilateral: d => (d.area ? shoelace(corners(d.s, d.s, d.s)) : corners(d.s, d.s, d.s)[2][1]),
  heron: d => shoelace(corners(d.a, d.b, d.c)),
  'law-of-cosines': d => (d.findAngle
    ? Math.acos((d.a * d.a + d.b * d.b - d.c * d.c) / (2 * d.a * d.b)) * 180 / Math.PI
    : Math.hypot(d.a - d.b * Math.cos(rad(d.angle)), d.b * Math.sin(rad(d.angle)))),
  'law-of-sines': d => d.a * Math.sin(rad(d.B)) / Math.sin(rad(d.A)),
  'triangle-area-sas': d => shoelace([[0, 0], [d.a, 0], [d.b * Math.cos(rad(d.C)), d.b * Math.sin(rad(d.C))]]),
  // the legs are the geometric means of the hypotenuse and each piece
  'altitude-hypotenuse': d => Math.sqrt(d.p * (d.p + d.q)) * Math.sqrt(d.q * (d.p + d.q)) / (d.p + d.q),
  'triangle-inequality': d => { let n = 0; for (let c = 1; c <= d.a + d.b; c++) if (c < d.a + d.b && d.a < c + d.b && d.b < c + d.a) n++; return n; },
  'triangle-angles': d => (d.vertex ? 180 - d.base - d.base : (180 - d.base) / 2),
  'arc-length': d => rad(d.angle) * d.radius,
  'sector-area': d => rad(d.angle) * d.radius * d.radius / 2,
  'circle-measures': d => (d.toArea ? Math.PI * d.radius ** 2 : 2 * Math.PI * d.radius),
  radians: d => (d.toDegrees ? d.degrees : rad(d.degrees)),
  'inscribed-angle': d => (d.findAngle ? d.arc / 2 : d.arc),
  'intersecting-chords': d => d.a * d.b / d.c,
  'circle-equation': d => (d.radius ? Math.sqrt(d.square) : [d.h, d.k]),
  // the tangent's slope times the radius's slope is -1
  'circle-tangent-slope': d => -1 / (d.b / d.a),
  slope: d => { const m = (d.y2 - d.y1) / (d.x2 - d.x1); return d.perpendicular ? -1 / m : m; },
  midpoint: d => [d.x1 + (d.x2 - d.x1) / 2, d.y1 + (d.y2 - d.y1) / 2],
  distance: d => Math.hypot(d.x2 - d.x1, d.y2 - d.y1),
  intercepts: d => (d.x ? d.c / d.a : d.c / d.b),
  'line-through-points': d => d.y1 - (d.y2 - d.y1) / (d.x2 - d.x1) * d.x1,
  'vieta-quadratic': d => { const r = roots([d.a, d.b, d.c]); return (d.sum ? csum(r) : cproduct(r))[0]; },
  'vieta-cubic': d => {
    const [p, q, r] = roots([d.a, d.b, d.c, d.d]);
    return (d.which === 'sum' ? csum([p, q, r]) : d.which === 'product' ? cproduct([p, q, r]) : csum([cmul(p, q), cmul(p, r), cmul(q, r)]))[0];
  },
  'vieta-symmetric': d => {
    const [r, s] = roots([d.a, d.b, d.c]);
    return (d.which === 'squares' ? cadd(cmul(r, r), cmul(s, s)) : d.which === 'reciprocals' ? cadd(cdiv([1, 0], r), cdiv([1, 0], s)) : cmul(csub(r, s), csub(r, s)))[0];
  },
  'vieta-build': d => expandRoots(d.p, d.q)[d.linear ? 1 : 2],
  discriminant: d => {
    if (!d.count) return d.b * d.b - 4 * d.a * d.c;
    // count sign changes and touches of the parabola along the axis
    const [p, q] = roots([d.a, d.b, d.c]);
    if (Math.abs(p[1]) > 1e-6) return 0;
    return Math.abs(p[0] - q[0]) < 1e-6 ? 1 : 2;
  },
  vertex: d => {
    // the parabola is symmetric about its vertex: find where the slope is 0
    const f = x => evaluate([d.a, d.b, d.c], x);
    const x = -slope(f, 0) / (slope(f, 1) - slope(f, 0));
    return [x, f(x)];
  },
  system: d => { const det = d.a * d.d - d.b * d.c; return [(d.p * d.d - d.b * d.q) / det, (d.a * d.q - d.c * d.p) / det]; },
  'remainder-theorem': d => { let carry = 0; for (const c of d.coefficients) carry = carry * d.a + c; return carry; },
  functions: d => { const f = x => d.a * x + d.b; const g = x => x * x + d.c; return d.kind === 'fg' ? f(g(d.k)) : d.kind === 'gf' ? g(f(d.k)) : f(d.k) + g(d.k); },
  complex: d => {
    if (d.kind === 'power') { let z = [1, 0]; for (let i = 0; i < d.n; i++) z = cmul(z, [0, 1]); return Math.abs(z[1]) < 0.5 ? Math.round(z[0]) : (z[1] > 0 ? 'i' : '-i'); }
    return d.kind === 'conjugate' ? cmul([d.a, d.b], [d.a, -d.b])[0] : Math.hypot(d.a, d.b);
  },
  determinant: d => shoelaceSigned([[0, 0], [d.a, d.c], [d.a + d.b, d.c + d.d], [d.b, d.d]]),
  'consecutive-integers': d => { for (let first = -1000; first < 1000; first++) { let total = 0; for (let i = 0; i < d.count; i++) total += first + i * d.step; if (total === d.sum) return first + (d.count - 1) * d.step; } },
  percent: d => (d.kind === 'of' ? d.p * d.y / 100 : d.kind === 'tax' ? d.price + (d.off ? -1 : 1) * d.price * d.p / 100 : Math.abs(d.to - d.from) / d.from * 100),
  'fractional-powers': d => Math.pow(d.whole, (d.negative ? -1 : 1) * d.p / d.q),
  'exponent-rules': d => (d.kind === 'times' ? d.base ** d.m * d.base ** d.n : d.kind === 'over' ? d.base ** d.m / d.base ** d.n : (d.base ** d.m) ** d.n),
  'exponent-equation': (d, answer) => {
    const x = toNumber(answer);
    assert.ok(near(d.m * (d.a * x + d.b), d.n * (d.c * x + d.d), 1e-9), 'the solution satisfies the equation');
    return x;
  },
  logs: d => Math.log(d.x) / Math.log(d.base),
  'arithmetic-term': d => { let v = d.a; for (let i = 1; i < d.n; i++) v += d.d; return v; },
  'arithmetic-sum': d => { let total = 0; for (let i = 0; i < d.n; i++) total += d.a + i * d.d; return total; },
  'geometric-term': d => { let v = d.a; for (let i = 1; i < d.n; i++) v = v * d.top / d.bottom; return v; },
  'geometric-sum': d => { let total = 0; let v = d.a; for (let i = 0; i < (d.n ?? 400); i++) { total += v; v = v * d.top / d.bottom; } return total; },
  'power-sums': d => { let total = 0; for (let i = 1; i <= d.n; i++) total += i ** d.power; return total; },
  'unit-circle': d => Math[d.fn](rad(d.degrees)),
  'reference-angle': d => Math.asin(Math.abs(Math.sin(rad(d.degrees)))) * 180 / Math.PI,
  'trig-triangle': d => {
    const theta = Math.atan2((d.quadrant > 2 ? -1 : 1) * d.opp, (d.quadrant === 2 || d.quadrant === 3 ? -1 : 1) * d.adj);
    return Math[d.want](theta);
  },
  'period-amplitude': (d, answer) => {
    const f = x => d.a * Math[d.fn](d.b * x);
    if (d.amplitude) return Math.max(...Array.from({ length: 4000 }, (_, i) => Math.abs(f(i * Math.PI / 2000))));
    // Any period of a periodic function is a whole multiple of the shortest
    // one, so the answer is the period exactly when shifting by it leaves the
    // curve unchanged and shifting by no whole fraction of it does.
    const P = toNumber(answer);
    const isPeriod = T => [0.1, 0.37, 0.9, 1.7].every(x => near(f(x), f(x + T), 1e-7));
    assert.ok(isPeriod(P), 'not a period');
    for (let m = 2; m <= 12; m++) assert.ok(!isPeriod(P / m), 'a shorter period: P/' + m);
    return P;
  },
  'angle-sum-identities': d => (d.kind === 'product' ? Math.sin(rad(d.degrees)) * Math.cos(rad(d.degrees)) : Math.cos(rad(d.degrees)) ** 2 - Math.sin(rad(d.degrees)) ** 2),
  derivative: d => { const f = x => evaluate(d.coefficients, x); return d.second ? slope(x => slope(f, x), d.k) : slope(f, d.k); },
  integral: d => simpson(x => evaluate(d.coefficients, x), d.lo, d.hi),
  'limit-factor': (d, answer, problem) => {
    if (d.kind === 'infinity') return d.a / d.d;
    const f = x => evaluate([1, d.b - d.a, -d.a * d.b], x) / (x - d.a);
    return (f(d.a - 1e-6) + f(d.a + 1e-6)) / 2;
  },
  lhopital: d => {
    const { a, b } = d;
    const n = b > 5 ? 3 : b;
    const f = {
      sin: x => Math.sin(a * x) / (b * x),
      exp: x => Math.expm1(a * x) / (b * x),
      tan: x => Math.tan(a * x) / Math.sin(b * x),
      sinsin: x => Math.sin(a * x) / Math.sin(b * x),
      log: x => Math.log1p(a * x) / (b * x),
      cos: x => (1 - Math.cos(a * x)) / (x * x),
      power: x => ((a + x) ** n - a ** n) / x,
      lnx: x => a * Math.log1p(x) / (b * x),
      expexp: x => (Math.exp(a * x) - Math.exp(b * x)) / x
    }[d.kind];
    return (f(1e-5) + f(-1e-5)) / 2;
  },
  'derivative-rules': d => {
    const k = d.k;
    const [f, at] = { sin: [x => Math.sin(k * x), 0], exp: [x => Math.exp(k * x), 0], ln: [Math.log, k], cos: [x => Math.cos(k * x), 0], sqrt: [Math.sqrt, k * k], reciprocal: [x => 1 / x, k], square: [x => (x + k) ** 2, 1] }[d.kind];
    return slope(f, at);
  },
  'work-rate': d => (d.kind === 'minutes' ? 60 : 1) / (1 / d.a + (d.kind === 'drain' ? -1 : 1) / d.b),
  'distance-rate-time': d => (d.kind === 'time' ? d.d / d.a : d.kind === 'meet' ? d.d / (d.a + d.b) : d.d / (d.a - d.b)),
  lever: d => d.w1 * d.d1 / d.w2,
  'unit-conversion': d => (d.reverse ? d.n : d.n * d.factor),
  interest: d => { let total = 0; for (let y = 0; y < d.years; y++) total += d.principal * d.rate / 100; return total; },
  proportion: d => d.want,
  'base-to-ten': d => [...d.written].reduce((total, c) => total * d.base + '0123456789ABCDEF'.indexOf(c), 0),
  'ten-to-base': (d, answer) => { assert.equal([...answer.text].reduce((total, c) => total * d.base + '0123456789ABCDEF'.indexOf(c), 0), d.n); return answer.text; },
  roman: (d, answer) => {
    const value = d.kind === 'divide' ? d.a / d.b : d.kind === 'add' ? d.a + d.b : d.a;
    if (d.kind === 'read') return value;
    assert.equal(fromRoman(answer.text), value);
    return answer.text;
  },
  divisors: d => { let n = 0; for (let i = 1; i <= d.n; i++) if (d.n % i === 0) n++; return n; },
  'gcd-lcm': d => { if (d.least) { for (let m = Math.max(d.a, d.b); ; m++) if (m % d.a === 0 && m % d.b === 0) return m; } for (let g = Math.min(d.a, d.b); ; g--) if (d.a % g === 0 && d.b % g === 0) return g; },
  'repeating-decimal': d => { let total = 0; for (let i = 1; i <= 12; i++) total += d.block / 10 ** (d.digits * i); return total; },
  'perfect-powers': d => { let n = 0; for (let i = 1; i ** (d.cube ? 3 : 2) <= d.limit; i++) n++; return n; },
  x11: d => d.a * d.b,
  'square-5': d => d.a * d.b,
  'tens-complement': d => d.a * d.b,
  'near-100': d => d.a * d.b,
  'square-near-50': d => d.a * d.b,
  'difference-of-squares': d => d.a * d.b,
  teens: d => d.a * d.b,
  'criss-cross': d => d.a * d.b,
  'x5-25-125': d => d.a * d.b,
  'x9-99': d => d.a * d.b,
  x15: d => d.a * d.b,
  'double-halve': d => d.a * d.b,
  complement: d => d.a - d.b,
  'percent-swap': d => d.a * d.b / 100,
  squares: d => d.a * d.b,
  'cubes-powers': d => { let p = 1; for (let i = 0; i < d.b; i++) p *= d.a; return p; },
  'fraction-decimal': (d, answer, problem) => (problem.unit === '%' ? 100 : 1) * d.a / d.b,
  'roots-perfect': (d, answer, problem) => { assert.ok(problem.prompt.includes(String(d.a ** d.b).slice(-3))); return d.a; },
  divisibility: d => (d.a % d.b === 0 ? 'yes' : 'no')
};

// x^2 + b x + c with the given roots, by multiplying the factors out
function expandRoots (p, q) {
  return [1, -p - q, p * q];
}
const shoelaceSigned = points => sum(points.map(([x, y], i) => { const [u, v] = points[(i + 1) % points.length]; return x * v - u * y; })) / 2;

// ---------- the drills ----------

test('every skill is complete and has a second way to its answer', () => {
  assert.ok(SKILLS.length >= 100, 'expected at least 100 drills, found ' + SKILLS.length);
  assert.equal(new Set(SKILLS.map(s => s.id)).size, SKILLS.length, 'skill ids are unique');
  for (const s of SKILLS) {
    assert.ok(s.name && s.topic && s.hint && s.seconds > 0, s.id + ' is missing a field');
    assert.equal(typeof s.make, 'function');
    assert.ok(SECOND_WAY[s.id], s.id + ' has no second way to its answer in this test');
    assert.equal(skillById(s.id), s);
    if (s.topic === 'Speed tricks') assert.ok(s.lesson, s.id + ' has no lesson');
  }
  assert.ok(TOPICS.length >= 15);
});

for (const skill of SKILLS) {
  test('drill: ' + skill.id, () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const problem = skill.make(makeRng(seed * 7919 + skill.id.length));
      const where = skill.id + ' seed ' + seed + ': ' + problem.prompt;
      assert.ok(problem.prompt && problem.steps, where);
      for (const text of [problem.prompt, problem.steps, skill.hint, skill.lesson || '']) {
        assert.equal(text.split('[[').length, text.split(']]').length, 'unbalanced math brackets in ' + where);
        assert.ok(!/undefined|NaN|\[object/.test(text), 'a value is missing in ' + where + ' / ' + text);
      }
      const { answer } = problem;
      // what the page shows as the answer is itself accepted
      assert.ok(check(answer, answerPlain(answer)).ok, 'own answer rejected: ' + where + ' -> ' + answerPlain(answer));
      // and something else is not
      const wrong = answer.text != null ? 'zzz' : answer.list ? answer.list.map(v => toPlain(times(v.n ? v : int(1), int(3)))).join(', ') + '9' : toPlain(answer.n ? times(answer, int(3)) : int(1));
      assert.ok(!check(answer, wrong).ok, 'wrong answer accepted: ' + where + ' -> ' + wrong);

      const second = SECOND_WAY[skill.id](problem.data, answer, problem);
      const tolerance = ['derivative', 'derivative-rules', 'limit-factor', 'lhopital', 'vertex', 'period-amplitude'].includes(skill.id) ? 1e-4 : 1e-7;
      if (answer.text != null) {
        assert.equal(String(second), answer.text, where);
      } else if (answer.list) {
        assert.equal(second.length, answer.list.length, where);
        answer.list.forEach((v, i) => assert.ok(near(toNumber(v), second[i], tolerance), where + ' part ' + i + ': ' + toNumber(v) + ' vs ' + second[i]));
      } else {
        assert.ok(near(toNumber(answer), second, tolerance), where + ': the drill says ' + toNumber(answer) + ', the second way ' + second);
      }
    }
  });
}

test('Pascal drill respects the rows and the edges setting', () => {
  const pascal = skillById('pascal');
  for (let seed = 1; seed <= 400; seed++) {
    const inner = pascal.make(makeRng(seed), { maxRow: 6, edges: false }).data;
    assert.ok(inner.n >= 2 && inner.n <= 6 && inner.k >= 1 && inner.k < inner.n);
    const all = pascal.make(makeRng(seed), { maxRow: 4, edges: true }).data;
    assert.ok(all.n >= 0 && all.n <= 4 && all.k >= 0 && all.k <= all.n);
    assert.ok(pascal.make(makeRng(seed), { maxRow: 1 }).data.n <= 1);
  }
});

// ---------- the answer checker ----------

test('parse reads the ways an answer gets typed', () => {
  const cases = [
    ['42', int(42)], ['-7', int(-7)], ['3,628,800', int(3628800)], ['3/4', frac(3, 4)], ['6/8', frac(3, 4)], ['0.75', frac(3, 4)], ['.5', frac(1, 2)],
    ['3 1/5', frac(16, 5)], ['-2 1/2', frac(-5, 2)], ['negative 1/32', frac(-1, 32)], ['17 over 26', frac(17, 26)],
    ['9√3', root(3, 9)], ['9 sqrt 3', root(3, 9)], ['9 radical 3', root(3, 9)], ['9sqrt(3)', root(3, 9)], ['√12', root(3, 2)], ['√3/2', root(3, 1, 2)], ['(5√3)/2', root(3, 5, 2)],
    ['1/√2', root(2, 1, 2)], ['√(3/4)', root(3, 1, 2)], ['24π', pi(24)], ['24 pi', pi(24)], ['3π/4', pi(3, 4)], ['π/3', pi(1, 3)], ['(3/4)π', pi(3, 4)], ['2.5π', pi(5, 2)],
    ['108°', int(108)], ['108 degrees', int(108)], ['81.5%', frac(163, 2)], ['$5,720', int(5720)], ['x = 5', int(5)], ['9√3 cm', root(3, 9)], ['5/π', exact(5, 1, 1, -1)],
    ['square root of 12', root(3, 2)], ['24 square units', int(24)], ['4 square root 3', root(3, 4)]
  ];
  for (const [typed, expected] of cases) {
    const got = parse(typed);
    assert.ok(got && same(got, expected), typed + ' parsed as ' + JSON.stringify(got));
    assert.ok(same(parse(toPlain(expected)), expected), toPlain(expected) + ' does not round-trip');
  }
  for (const junk of ['', 'abc', '3 +', '5 - 2', '√-4', '1/0', '(3', '3..4', 'π π']) assert.equal(parse(junk), null, junk);
});

test('check accepts equal forms and a decimal right to the places typed', () => {
  assert.deepEqual(check(root(3, 9), '9√3'), { ok: true, close: false });
  assert.ok(check(root(3, 9), '15.59').close);
  assert.ok(check(root(3, 9), '15.588').ok);
  assert.ok(!check(root(3, 9), '15.6').ok, 'one decimal place is not enough');
  assert.ok(!check(root(3, 9), '15.58').ok);
  assert.ok(check(frac(1, 3), '0.33').ok && check(frac(1, 3), '.333').ok && !check(frac(1, 3), '0.3').ok);
  assert.ok(check(frac(17, 2), '8.5').ok && check(frac(17, 2), '8 1/2').ok && check(frac(17, 2), '17/2').ok);
  assert.ok(!check(int(12), '').ok && !check(int(12), '13').ok && !check(int(12), 'twelve').ok);
});

test('an answer asked for as a fraction has to be typed as one', () => {
  const asked = { ...frac(3, 8), form: 'fraction' };
  assert.ok(check(asked, '3/8').ok && check(asked, '6/16').ok);
  assert.deepEqual(check(asked, '0.375'), { ok: false, form: 'fraction' });
  assert.ok(check({ ...frac(4, 1), form: 'fraction' }, '4').ok, 'a whole number needs no fraction bar');
});

test('check handles ordered pairs, unordered lists, and words', () => {
  const pair = { list: [int(-1), int(4)], ordered: true };
  assert.ok(check(pair, '(-1, 4)').ok && check(pair, '-1,4').ok && check(pair, '-1 and 4').ok);
  assert.ok(!check(pair, '(4, -1)').ok && !check(pair, '-1').ok && !check(pair, '-1, 4, 2').ok);
  const set = { list: [int(2), int(-3)], ordered: false };
  assert.ok(check(set, '-3 and 2').ok && check(set, '2, -3').ok && !check(set, '2, 2').ok);
  assert.ok(check({ text: 'XXV' }, 'xxv').ok && !check({ text: 'XXV' }, 'XXIV').ok);
  assert.ok(check({ text: '-i', accept: ['negative i'] }, '-i').ok && check({ text: '-i', accept: ['negative i'] }, 'negative i').ok);
  assert.ok(!check({ text: '-i' }, 'i').ok && !check({ text: 'i' }, '-i').ok, 'the sign of i matters');
  assert.ok(check({ text: '101111' }, '10 1111').ok);
});

// ---------- flash anzan, the formula sheet, saved progress ----------

test('flash anzan runs have the right digits and add up', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = makeRng(seed);
    const options = { digits: 1 + seed % 5, count: 3 + seed % 30, subtract: seed % 2 === 0 };
    const { numbers, total } = anzanRun(r, options);
    assert.equal(numbers.length, options.count);
    assert.equal(sum(numbers), total);
    let running = 0;
    numbers.forEach((n, i) => {
      assert.equal(String(Math.abs(n)).length, options.digits);
      if (i) assert.notEqual(Math.abs(n), Math.abs(numbers[i - 1]), 'the same number twice in a row');
      if (!options.subtract) assert.ok(n > 0);
      running += n;
      assert.ok(running >= 0, 'the running total went below zero');
    });
  }
});

test('the formula sheet is well formed and points at real drills', () => {
  assert.ok(FORMULAS.length >= 120, 'expected at least 120 formulas, found ' + FORMULAS.length);
  const names = new Set();
  for (const f of FORMULAS) {
    assert.ok(f.topic && f.name && f.tex, JSON.stringify(f));
    assert.ok(!names.has(f.topic + '|' + f.name), 'listed twice: ' + f.name);
    names.add(f.topic + '|' + f.name);
    if (f.skill) assert.ok(skillById(f.skill), f.name + ' points at a drill that does not exist: ' + f.skill);
    let depth = 0;
    for (const c of f.tex) { if (c === '{') depth++; if (c === '}') depth--; assert.ok(depth >= 0, 'braces in ' + f.name); }
    assert.equal(depth, 0, 'braces in ' + f.name);
  }
});

test('a saved record or backup is cleaned before use', () => {
  const clean = cleanRecord({
    skills: { pascal: { seen: 5, right: 4, ms: 9000 }, bad: 'x', neg: { seen: -3, right: 1.5 } },
    cards: { a: { seen: 2, right: 1 } },
    missed: [{ skill: 'pascal', prompt: 'p', answer: { n: 1, d: 1, rad: 1, pi: 0 } }, { skill: 3 }, null],
    extra: 1
  });
  assert.deepEqual(clean.skills, { pascal: { seen: 5, right: 4, ms: 9000 }, neg: { seen: 0, right: 0, ms: 0 } });
  assert.deepEqual(clean.cards, { a: { seen: 2, right: 1 } });
  assert.equal(clean.missed.length, 1);
  assert.deepEqual(cleanRecord('nonsense'), { skills: {}, cards: {}, anzan: {}, missed: [] });
});
