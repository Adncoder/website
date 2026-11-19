// Solids: the vertices, edges, and faces of polyhedra, and volumes and
// surface areas.

import { exact, frac, int, pi, root } from '../exact.js';
import { T } from '../tex.js';

const TOPIC = 'Solids';

/** name: [vertices, edges, faces, face shape] */
export const PLATONIC = {
  tetrahedron: [4, 6, 4, 'triangles'],
  cube: [8, 12, 6, 'squares'],
  octahedron: [6, 12, 8, 'triangles'],
  dodecahedron: [20, 30, 12, 'pentagons'],
  icosahedron: [12, 30, 20, 'triangles']
};
const PARTS = ['vertices', 'edges', 'faces'];
const BASES = { 3: 'triangular', 4: 'square', 5: 'pentagonal', 6: 'hexagonal', 7: 'heptagonal', 8: 'octagonal', 10: 'decagonal' };

/** [vertices, edges, faces] of a prism or pyramid on an n-sided base */
export const prismCounts = n => [2 * n, 3 * n, n + 2];
export const pyramidCounts = n => [n + 1, 2 * n, n + 1];

export default [
  {
    id: 'platonic',
    name: 'Platonic solids',
    topic: TOPIC,
    seconds: 10,
    hint: T`Tetrahedron 4, 6, 4. Cube 8, 12, 6. Octahedron 6, 12, 8. Dodecahedron 20, 30, 12. Icosahedron 12, 30, 20 (vertices, edges, faces). The cube and octahedron swap vertices and faces, and so do the dodecahedron and icosahedron.`,
    make (r) {
      const name = r.pick(Object.keys(PLATONIC));
      const part = r.int(0, 2);
      const [v, e, f, shape] = PLATONIC[name];
      return {
        prompt: T`How many ${PARTS[part]} does ${name === 'cube' ? 'a cube' : 'a regular ' + name} have?`,
        answer: int(PLATONIC[name][part]),
        steps: T`A ${name} has ${v} vertices, ${e} edges, and ${f} faces, all ${shape}.`,
        data: { name, part }
      };
    }
  },
  {
    id: 'euler',
    name: "Euler's formula for polyhedra",
    topic: TOPIC,
    seconds: 30,
    hint: T`[[V - E + F = 2]] for any convex polyhedron.`,
    make (r) {
      const n = r.int(3, 10);
      const counts = r.chance(0.5) ? prismCounts(n) : pyramidCounts(n);
      const part = r.int(0, 2);
      const known = [0, 1, 2].filter(i => i !== part);
      const [v, e, f] = counts;
      return {
        prompt: T`A convex polyhedron has ${counts[known[0]]} ${PARTS[known[0]]} and ${counts[known[1]]} ${PARTS[known[1]]}. How many ${PARTS[part]} does it have?`,
        answer: int(counts[part]),
        steps: T`[[V - E + F = 2]]: [[${v} - ${e} + ${f} = 2]]`,
        data: { counts, part }
      };
    }
  },
  {
    id: 'prism-pyramid',
    name: 'Prisms and pyramids',
    topic: TOPIC,
    seconds: 30,
    hint: T`On an n-sided base, a prism has 2n vertices, 3n edges, and n + 2 faces. A pyramid has n + 1 vertices, 2n edges, and n + 1 faces.`,
    make (r) {
      const n = r.pick(Object.keys(BASES).map(Number));
      const prism = r.chance(0.5);
      const counts = prism ? prismCounts(n) : pyramidCounts(n);
      const part = r.int(0, 2);
      return {
        prompt: T`How many ${PARTS[part]} does a ${BASES[n]} ${prism ? 'prism' : 'pyramid'} have?`,
        answer: int(counts[part]),
        steps: T`With [[n = ${n}]]: ${counts[0]} vertices, ${counts[1]} edges, ${counts[2]} faces.`,
        data: { n, prism, part }
      };
    }
  },
  {
    id: 'sphere',
    name: 'Spheres',
    topic: TOPIC,
    seconds: 30,
    hint: T`Volume [[\frac{4}{3}\pi r^3]], surface area [[4\pi r^2]].`,
    make (r) {
      const radius = r.int(1, 9);
      const volume = exact(4 * radius ** 3, 3, 1, 1);
      const surface = pi(4 * radius * radius);
      const kind = r.pick(['volume', 'surface', 'radiusFromVolume', 'radiusFromSurface']);
      if (kind === 'volume') {
        return { prompt: T`In terms of pi, what is the volume of a sphere with radius ${radius}?`, answer: volume, steps: T`[[\frac{4}{3}\pi \cdot ${radius}^3 = \frac{${4 * radius ** 3}}{3}\pi]]`, data: { kind, radius } };
      }
      if (kind === 'surface') {
        return { prompt: T`In terms of pi, what is the surface area of a sphere with radius ${radius}?`, answer: surface, steps: T`[[4\pi \cdot ${radius}^2 = ${4 * radius * radius}\pi]]`, data: { kind, radius } };
      }
      if (kind === 'radiusFromSurface') {
        return { prompt: T`The surface area of a sphere is [[${4 * radius * radius}\pi]]. What is its radius?`, answer: int(radius), steps: T`[[4\pi r^2 = ${4 * radius * radius}\pi]], so [[r^2 = ${radius * radius}]] and [[r = ${radius}]]`, data: { kind, radius } };
      }
      const three = 3 * r.int(1, 3);
      return { prompt: T`The volume of a sphere is [[${4 * three ** 3 / 3}\pi]]. What is its radius?`, answer: int(three), steps: T`[[\frac{4}{3}\pi r^3 = ${4 * three ** 3 / 3}\pi]], so [[r^3 = ${three ** 3}]] and [[r = ${three}]]`, data: { kind, radius: three } };
    }
  },
  {
    id: 'cylinder-cone',
    name: 'Cylinders and cones',
    topic: TOPIC,
    seconds: 30,
    hint: T`Cylinder [[\pi r^2 h]]. A cone is a third of the cylinder around it: [[\frac{1}{3}\pi r^2 h]].`,
    make (r) {
      const [radius, h] = [r.int(1, 9), r.int(2, 12)];
      const kind = r.pick(['cylinder', 'cone', 'height']);
      if (kind === 'height') {
        return {
          prompt: T`A cylinder has radius ${radius} and volume [[${radius * radius * h}\pi]]. What is its height?`,
          answer: int(h),
          steps: T`[[\pi \cdot ${radius}^2 \cdot h = ${radius * radius * h}\pi]], so [[h = ${h}]]`,
          data: { kind, radius, h }
        };
      }
      const cone = kind === 'cone';
      return {
        prompt: T`In terms of pi, what is the volume of a ${kind} with radius ${radius} and height ${h}?`,
        answer: exact(radius * radius * h, cone ? 3 : 1, 1, 1),
        steps: cone ? T`[[\frac{1}{3}\pi \cdot ${radius}^2 \cdot ${h} = \frac{${radius * radius * h}}{3}\pi]]` : T`[[\pi \cdot ${radius}^2 \cdot ${h} = ${radius * radius * h}\pi]]`,
        data: { kind, radius, h }
      };
    }
  },
  {
    id: 'pyramid-volume',
    name: 'Volume of a pyramid',
    topic: TOPIC,
    seconds: 30,
    hint: T`A third of the base area times the height: [[\frac{1}{3}Bh]].`,
    make (r) {
      const [s, h] = [r.int(2, 12), r.int(2, 15)];
      return {
        prompt: T`Find the volume of a square pyramid with base edge ${s} and height ${h}.`,
        answer: frac(s * s * h, 3),
        steps: T`[[\frac{1}{3} \cdot ${s}^2 \cdot ${h} = \frac{${s * s * h}}{3}]]`,
        data: { s, h }
      };
    }
  },
  {
    id: 'box',
    name: 'Boxes and cubes',
    topic: TOPIC,
    seconds: 45,
    hint: T`Surface area [[2(lw + lh + wh)]]. The diagonal through the box is [[\sqrt{l^2 + w^2 + h^2}]]. A cube with edge s has surface area [[6s^2]] and volume [[s^3]].`,
    make (r) {
      const kind = r.pick(['surface', 'diagonal', 'cube']);
      if (kind === 'cube') {
        const s = r.int(2, 10);
        return {
          prompt: T`A cube has a surface area of ${6 * s * s}. What is its volume?`,
          answer: int(s ** 3),
          steps: T`[[6s^2 = ${6 * s * s}]] gives [[s = ${s}]], so the volume is [[${s}^3 = ${s ** 3}]]`,
          data: { kind, l: s, w: s, h: s }
        };
      }
      const [l, w, h] = [r.int(1, 9), r.int(1, 9), r.int(1, 9)];
      if (kind === 'surface') {
        return {
          prompt: T`What is the total surface area of a rectangular box that measures ${l} by ${w} by ${h}?`,
          answer: int(2 * (l * w + l * h + w * h)),
          steps: T`[[2(${l * w} + ${l * h} + ${w * h}) = ${2 * (l * w + l * h + w * h)}]]`,
          data: { kind, l, w, h }
        };
      }
      return {
        prompt: T`What is the length of the diagonal through a rectangular box that measures ${l} by ${w} by ${h}, in simplest radical form?`,
        answer: root(l * l + w * w + h * h),
        steps: T`[[\sqrt{${l}^2 + ${w}^2 + ${h}^2} = \sqrt{${l * l + w * w + h * h}}]]`,
        data: { kind, l, w, h }
      };
    }
  },
  {
    id: 'similar-solids',
    name: 'Similar figures',
    topic: TOPIC,
    seconds: 45,
    hint: T`If lengths are in the ratio a : b, areas are in the ratio [[a^2 : b^2]] and volumes [[a^3 : b^3]].`,
    make (r) {
      const [a, b] = r.pick([[1, 2], [2, 3], [1, 3], [3, 4], [2, 5], [3, 5], [1, 4]]);
      const volume = r.chance(0.5);
      const power = volume ? 3 : 2;
      const small = a ** power * r.int(1, 6);
      const large = small / a ** power * b ** power;
      return {
        prompt: T`Two similar solids have sides in the ratio ${a} : ${b}. The ${volume ? 'volume' : 'surface area'} of the smaller is ${small}. What is the ${volume ? 'volume' : 'surface area'} of the larger?`,
        answer: int(large),
        steps: T`[[${small} \cdot \left(\frac{${b}}{${a}}\right)^{${power}} = ${small} \cdot \frac{${b ** power}}{${a ** power}} = ${large}]]`,
        data: { a, b, power, small }
      };
    }
  }
];
