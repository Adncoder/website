// Every drill on the math practice page, in the order the page lists them.
//
// A skill is { id, name, topic, seconds, hint, lesson?, make(rng, options) }:
// `seconds` is the time KSHSAA would give a question like it, `hint` the
// formula, and `lesson` (speed tricks only) the worked example. make() returns
// { prompt, answer, steps, unit?, data }: prompt and steps are text with TeX
// between double square brackets (tex.js), answer is what exact.js checks, and
// data is the numbers it was built from, which npm test recomputes the answer
// from a second way. To add a drill, add a skill to a file in drills/, or a
// new file here.

import pascal from './drills/pascal.js';
import counting from './drills/counting.js';
import probability from './drills/probability.js';
import statistics from './drills/statistics.js';
import polygons from './drills/polygons.js';
import triangles from './drills/triangles.js';
import circles from './drills/circles.js';
import solids from './drills/solids.js';
import coordinates from './drills/coordinates.js';
import vieta from './drills/vieta.js';
import algebra from './drills/algebra.js';
import exponents from './drills/exponents.js';
import sequences from './drills/sequences.js';
import trig from './drills/trig.js';
import calculus from './drills/calculus.js';
import rates from './drills/rates.js';
import numbers from './drills/numbers.js';
import tricks from './drills/tricks.js';

export const SKILLS = [
  ...pascal, ...counting, ...probability, ...statistics, ...polygons, ...triangles, ...circles, ...solids, ...coordinates,
  ...vieta, ...algebra, ...exponents, ...sequences, ...trig, ...calculus, ...rates, ...numbers, ...tricks
];

/** Topics in page order. */
export const TOPICS = [...new Set(SKILLS.map(s => s.topic))];

/** The topic with its own mode on the page, left out of mixed practice. */
export const TRICKS = 'Speed tricks';

const BY_ID = new Map(SKILLS.map(s => [s.id, s]));
export const skillById = id => BY_ID.get(id);
