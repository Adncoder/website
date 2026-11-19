// Physics the way KSHSAA asks it: computation from the numbers given, with
// gravity stated in the question as 9.8 or 10 m/s² (the archive's questions
// always say which). Physics has its own mode on the page, apart from the
// math drills; these topics are PHYSICS_TOPICS in skills.js.

import { frac, int, pi, root } from '../exact.js';
import { T } from '../tex.js';

export const MOTION = 'Physics: motion';
export const FORCES = 'Physics: forces';
export const ENERGY = 'Physics: energy and momentum';
export const ELECTRIC = 'Physics: electricity';
export const WAVES = 'Physics: waves, heat, and fluids';

// g as a question gives it, and as an exact fraction
function gravity (r) {
  return r.chance(0.6)
    ? { g: 9.8, n: 49, d: 5, says: 'Using 9.8 m/s² for gravity, ' }
    : { g: 10, n: 10, d: 1, says: 'Using 10 m/s² for gravity, ' };
}
/** a/b times g, exactly */
const gTimes = (G, a, b = 1) => frac(G.n * a, G.d * b);
/** "a 5" or "an 80": eight, eleven, and eighteen start with a vowel sound */
const an = n => (/^(8|1[18]$|1[18]\d{3}$)/.test(String(n)) ? 'an ' : 'a ') + n;
const An = n => an(n).replace(/^a/, 'A');
const seconds = t => (t === 1 ? '1 second' : t + ' seconds');
/** a decimal product as written, never 1.4000000000000001 */
const num = x => +x.toFixed(6);
/** 2, 3, and 6 */
const list = items => (items.length < 3 ? items.join(' and ') : items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1]);

export default [
  // ---------- motion ----------
  {
    id: 'kin-acceleration',
    name: 'Acceleration',
    topic: MOTION,
    seconds: 30,
    hint: T`[[a = \frac{v - v_0}{t}]]: the change in velocity over the time it took.`,
    make (r) {
      const [a, t] = [r.int(1, 9), r.int(2, 8)];
      const slowing = r.chance(0.3);
      const low = r.int(0, 20);
      const [v0, v] = slowing ? [low + a * t, low] : [low, low + a * t];
      return {
        prompt: slowing
          ? T`A car slows from ${v0} m/s to ${v} m/s in ${t} seconds. At what rate does it slow down?`
          : T`A car speeds up from ${v0} m/s to ${v} m/s in ${t} seconds. What is its acceleration?`,
        answer: int(a),
        unit: 'm/s²',
        steps: T`[[\frac{${Math.max(v0, v)} - ${Math.min(v0, v)}}{${t}} = ${a}]] m/s²`,
        data: { v0, v, t }
      };
    }
  },
  {
    id: 'kin-final-velocity',
    name: 'Final velocity',
    topic: MOTION,
    seconds: 30,
    hint: T`[[v = v_0 + at]]. Starting from rest, [[v_0 = 0]].`,
    make (r) {
      const [v0, a, t] = [r.chance(0.4) ? 0 : r.int(2, 20), r.int(2, 9), r.int(2, 9)];
      return {
        prompt: v0
          ? T`A car moving at ${v0} m/s accelerates at ${a} m/s² for ${t} seconds. What is its final velocity?`
          : T`A rocket starting from rest accelerates at ${a} m/s² for ${t} seconds. What is its speed then?`,
        answer: int(v0 + a * t),
        unit: 'm/s',
        steps: T`[[${v0} + ${a} \cdot ${t} = ${v0 + a * t}]] m/s`,
        data: { v0, a, t }
      };
    }
  },
  {
    id: 'kin-displacement',
    name: 'Distance while accelerating',
    topic: MOTION,
    seconds: 45,
    hint: T`[[d = v_0 t + \tfrac12 a t^2]]. Or the average velocity times the time: [[d = \frac{v_0 + v}{2}\,t]].`,
    make (r) {
      const [v0, a, t] = [r.chance(0.5) ? 0 : r.int(2, 15), r.int(1, 8), r.int(2, 8)];
      const d = frac(2 * v0 * t + a * t * t, 2);
      return {
        prompt: v0
          ? T`A cart moving at ${v0} m/s accelerates at ${a} m/s² for ${t} seconds. How far does it travel in that time?`
          : T`A car initially at rest accelerates at ${a} m/s² for ${t} seconds. What is its displacement?`,
        answer: d,
        unit: 'm',
        steps: T`[[${v0} \cdot ${t} + \tfrac12 \cdot ${a} \cdot ${t}^2 = ${(2 * v0 * t + a * t * t) / 2}]] m`,
        data: { v0, a, t }
      };
    }
  },
  {
    id: 'kin-stopping',
    name: 'Without the time',
    topic: MOTION,
    seconds: 45,
    hint: T`When no time is given: [[v^2 = v_0^2 + 2ad]]. A car stopping from [[v_0]] at [[a]] covers [[d = \frac{v_0^2}{2a}]].`,
    make (r) {
      if (r.chance(0.5)) {
        const [v0, a] = [r.int(2, 8) * 5, r.int(2, 8)];
        return {
          prompt: T`A car moving at ${v0} m/s brakes, slowing at ${a} m/s². How far does it travel before it stops?`,
          answer: frac(v0 * v0, 2 * a),
          unit: 'm',
          steps: T`[[\frac{${v0}^2}{2 \cdot ${a}} = \frac{${v0 * v0}}{${2 * a}}]] m`,
          data: { kind: 'stop', v0, a }
        };
      }
      // speeds and distance from a Pythagorean-style pair so the root is whole
      const [v0, v] = r.pick([[0, 10], [6, 10], [8, 10], [5, 13], [12, 13], [0, 20], [12, 20], [16, 20], [9, 15], [0, 6]]);
      const acc = r.pick([1, 2, 4, 5]);
      const d = (v * v - v0 * v0) / (2 * acc);
      return {
        prompt: v0
          ? T`A ball rolling at ${v0} m/s speeds up at ${acc} m/s² over ${d} meters. How fast is it going then?`
          : T`A cart starting from rest accelerates at ${acc} m/s² over ${d} meters. How fast is it going then?`,
        answer: int(v),
        unit: 'm/s',
        steps: T`[[v = \sqrt{${v0}^2 + 2 \cdot ${acc} \cdot ${d}} = \sqrt{${v * v}} = ${v}]] m/s`,
        data: { kind: 'speed', v0, a: acc, d }
      };
    }
  },
  {
    id: 'free-fall',
    name: 'Free fall',
    topic: MOTION,
    seconds: 30,
    hint: T`From rest, [[v = gt]] and [[d = \tfrac12 g t^2]]. With [[g = 9.8]] the distances after 1, 2, 3, 4, 5 seconds are 4.9, 19.6, 44.1, 78.4, 122.5 m.`,
    make (r) {
      const G = gravity(r);
      const t = r.int(1, 8);
      const kind = r.pick(['distance', 'distance', 'velocity', 'time']);
      const d = gTimes(G, t * t, 2);
      if (kind === 'velocity') {
        return { prompt: G.says + T`how fast is a dropped object falling after ${t} seconds?`, answer: gTimes(G, t), unit: 'm/s', steps: T`[[v = gt = ${G.g} \cdot ${t}]]`, data: { kind, g: G.g, t } };
      }
      if (kind === 'time') {
        const h = (G.n * t * t) / (2 * G.d);
        return { prompt: G.says + T`how many seconds does it take an object dropped from ${h} meters to reach the ground?`, answer: int(t), unit: 's', steps: T`[[t = \sqrt{\frac{2h}{g}} = \sqrt{\frac{2 \cdot ${h}}{${G.g}}} = ${t}]] s`, data: { kind, g: G.g, h } };
      }
      return { prompt: G.says + T`how far does an object fall from rest in ${t} seconds?`, answer: d, unit: 'm', steps: T`[[\tfrac12 \cdot ${G.g} \cdot ${t}^2]]`, data: { kind, g: G.g, t } };
    }
  },
  {
    id: 'horizontal-launch',
    name: 'Thrown horizontally',
    topic: MOTION,
    seconds: 60,
    hint: T`Sideways and down are separate. The fall takes [[t = \sqrt{2h/g}]] whatever the sideways speed; the range is the sideways speed times that time, and the vertical speed at impact is [[gt]].`,
    make (r) {
      const G = gravity(r);
      const [t, v] = [r.int(1, 10), r.int(2, 8) * 5];
      const h = (G.n * t * t) / (2 * G.d);
      const kind = r.pick(['range', 'range', 'time', 'impact']);
      const lead = G.says + T`a stone is thrown horizontally at ${v} m/s from the top of a cliff ${h} meters high. `;
      if (kind === 'time') return { prompt: lead + 'How many seconds is it in the air?', answer: int(t), unit: 's', steps: T`[[t = \sqrt{\frac{2 \cdot ${h}}{${G.g}}} = ${t}]] s`, data: { kind, g: G.g, h, v } };
      if (kind === 'impact') return { prompt: lead + 'What is its vertical velocity when it lands?', answer: gTimes(G, t), unit: 'm/s', steps: T`It falls for [[${t}]] s, so [[${G.g} \cdot ${t}]] m/s.`, data: { kind, g: G.g, h, v } };
      return { prompt: lead + 'How far from the base of the cliff does it land?', answer: int(v * t), unit: 'm', steps: T`It falls for [[\sqrt{2 \cdot ${h} / ${G.g}} = ${t}]] s, so [[${v} \cdot ${t} = ${v * t}]] m.`, data: { kind, g: G.g, h, v } };
    }
  },
  {
    id: 'angle-launch',
    name: 'Launched at an angle',
    topic: MOTION,
    seconds: 60,
    hint: T`Split the launch speed: [[v\sin\theta]] up, [[v\cos\theta]] across. Time in the air [[\frac{2v\sin\theta}{g}]], highest point [[\frac{(v\sin\theta)^2}{2g}]], range [[\frac{v^2\sin 2\theta}{g}]], which is longest at 45 degrees.`,
    make (r) {
      const kind = r.pick(['time', 'height', 'range']);
      if (kind === 'range') {
        const v = r.int(1, 5) * 10;
        return { prompt: T`Using 10 m/s² for gravity, a ball is launched at ${v} m/s at 45 degrees above level ground. How far away does it land?`, answer: int(v * v / 10), unit: 'm', steps: T`[[\frac{v^2 \sin 90^\circ}{g} = \frac{${v * v}}{10}]] m`, data: { kind, v, angle: 45 } };
      }
      if (kind === 'height') {
        const v = r.int(1, 4) * 20;
        return { prompt: T`Using 10 m/s² for gravity, a ball is launched at ${v} m/s at 30 degrees above the horizontal. How high does it rise?`, answer: frac(v * v, 80), unit: 'm', steps: T`It goes up at [[${v} \sin 30^\circ = ${v / 2}]] m/s, so [[\frac{${v / 2}^2}{2 \cdot 10} = ${v * v / 80}]] m.`, data: { kind, v, angle: 30 } };
      }
      const v = r.int(1, 8) * 10;
      return { prompt: T`Using 10 m/s² for gravity, an arrow is shot at ${v} m/s at 30 degrees above the horizontal. How many seconds is it in the air?`, answer: int(v / 10), unit: 's', steps: T`[[\frac{2 \cdot ${v} \sin 30^\circ}{10} = ${v / 10}]] s`, data: { kind, v, angle: 30 } };
    }
  },

  // ---------- forces ----------
  {
    id: 'newton-second',
    name: "Newton's second law",
    topic: FORCES,
    seconds: 30,
    hint: T`[[F = ma]]: force in newtons, mass in kilograms, acceleration in m/s².`,
    make (r) {
      const kind = r.pick(['a', 'a', 'F', 'm']);
      const [m, a] = [r.pick([2, 4, 5, 10, 12, 20, 25, 30, 50, 100, 200, 350, 1500]), r.pick([0.5, 1.5, 2, 3, 4, 5, 6, 8])];
      const F = m * a;
      if (kind === 'F') return { prompt: T`How much force accelerates ${an(m)} kg object at ${a} m/s²?`, answer: frac(2 * F, 2), unit: 'N', steps: T`[[F = ma = ${m} \cdot ${a} = ${F}]] N`, data: { kind, m, a } };
      if (kind === 'm') return { prompt: T`An unbalanced force of ${F} N accelerates an object at ${a} m/s². What is its mass?`, answer: frac(2 * m, 2), unit: 'kg', steps: T`[[m = \frac{F}{a} = \frac{${F}}{${a}} = ${m}]] kg`, data: { kind, F, a } };
      return { prompt: T`What is the acceleration of ${an(m)} kg box when an unbalanced force of ${F} N acts on it?`, answer: frac(2 * a, 2), unit: 'm/s²', steps: T`[[a = \frac{F}{m} = \frac{${F}}{${m}} = ${a}]] m/s²`, data: { kind, F, m } };
    }
  },
  {
    id: 'weight',
    name: 'Weight',
    topic: FORCES,
    seconds: 30,
    hint: T`[[W = mg]]. Mass stays the same everywhere; weight changes with [[g]].`,
    make (r) {
      const G = gravity(r);
      const m = r.int(2, 90);
      if (r.chance(0.35)) {
        const [p, q] = r.pick([[1, 2], [3, 4], [1, 4], [1, 6], [2, 5], [3, 2], [5, 2]]);
        return {
          prompt: G.says + T`what does ${an(m)} kg mass weigh on a planet where gravity is ${p}/${q} of Earth's?`,
          answer: gTimes(G, m * p, q),
          unit: 'N',
          steps: T`[[${m} \cdot ${G.g} \cdot \frac{${p}}{${q}}]] N`,
          data: { g: G.g, m, factor: p / q }
        };
      }
      return { prompt: G.says + T`what is the weight of ${an(m)} kg mass?`, answer: gTimes(G, m), unit: 'N', steps: T`[[W = ${m} \cdot ${G.g}]] N`, data: { g: G.g, m, factor: 1 } };
    }
  },
  {
    id: 'incline',
    name: 'Box on a ramp',
    topic: FORCES,
    seconds: 60,
    hint: T`Split the weight [[mg]] along the ramp, [[mg\sin\theta]], and into it, [[mg\cos\theta]]. A box that stays put has static friction exactly equal to [[mg\sin\theta]] (not [[\mu N]], which is only the most it could be). The normal force is [[mg\cos\theta]]. It starts to slide once [[\tan\theta > \mu_s]].`,
    make (r) {
      const G = gravity(r);
      const m = r.int(2, 30);
      const kind = r.pick(['friction', 'friction', 'normal', 'slide', 'mu']);
      if (kind === 'normal') {
        return { prompt: G.says + T`${an(m)} kg box rests on a ramp at 60 degrees. What is the normal force on it?`, answer: gTimes(G, m, 2), unit: 'N', steps: T`[[mg\cos 60^\circ = ${m} \cdot ${G.g} \cdot \tfrac12]] N`, data: { kind, g: G.g, m, angle: 60 } };
      }
      if (kind === 'slide') {
        return { prompt: G.says + T`${an(m)} kg block slides down a frictionless ramp at 30 degrees. What is its acceleration?`, answer: gTimes(G, 1, 2), unit: 'm/s²', steps: T`[[g\sin 30^\circ = ${G.g} \cdot \tfrac12]]; the mass cancels.`, data: { kind, g: G.g, m, angle: 30 } };
      }
      if (kind === 'mu') {
        const angle = r.pick([30, 45, 60]);
        return {
          prompt: T`A box is about to slide down a ramp at ${angle} degrees. What is the coefficient of static friction, in simplest radical form if needed?`,
          answer: { 30: root(3, 1, 3), 45: int(1), 60: root(3) }[angle],
          steps: T`At the point of slipping [[\mu_s = \tan ${angle}^\circ]].`,
          data: { kind, angle }
        };
      }
      return { prompt: G.says + T`${an(m)} kg box sits without moving on a ramp at 30 degrees. What is the force of friction on it?`, answer: gTimes(G, m, 2), unit: 'N', steps: T`It is not moving, so friction cancels the pull down the ramp: [[mg\sin 30^\circ = ${m} \cdot ${G.g} \cdot \tfrac12]] N.`, data: { kind, g: G.g, m, angle: 30 } };
    }
  },
  {
    id: 'friction-coefficient',
    name: 'Friction on level ground',
    topic: FORCES,
    seconds: 45,
    hint: T`[[f = \mu N]], and on level ground [[N = mg]]. Sliding at a constant speed means the push equals the friction.`,
    make (r) {
      if (r.chance(0.5)) {
        const N = r.int(2, 30) * 10;
        const mu = r.pick([0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75]);
        const f = num(N * mu);
        return { prompt: T`It takes ${an(f)} N push to keep ${an(N)} N crate sliding at a constant speed across a level floor. What is the coefficient of kinetic friction?`, answer: frac(Math.round(mu * 100), 100), steps: T`[[\mu = \frac{f}{N} = \frac{${f}}{${N}}]]`, data: { kind: 'mu', f, N } };
      }
      const G = gravity(r);
      const [m, mu] = [r.int(2, 40), r.pick([0.1, 0.2, 0.25, 0.3, 0.4, 0.5])];
      return { prompt: G.says + T`${an(m)} kg crate slides across a level floor with a coefficient of kinetic friction of ${mu}. What is the friction force?`, answer: gTimes(G, m * Math.round(mu * 100), 100), unit: 'N', steps: T`[[\mu mg = ${mu} \cdot ${m} \cdot ${G.g}]] N`, data: { kind: 'force', g: G.g, m, mu } };
    }
  },
  {
    id: 'elevator',
    name: 'Weight in an elevator',
    topic: FORCES,
    seconds: 60,
    hint: T`The floor pushes up with [[N = m(g + a)]] when the elevator speeds up going up (or slows going down), and [[N = m(g - a)]] when it speeds up going down. At a constant speed it is just [[mg]].`,
    make (r) {
      const G = gravity(r);
      const [m, a] = [r.int(4, 12) * 10, r.int(1, 4)];
      const up = r.chance(0.5);
      return {
        prompt: G.says + T`what is the normal force on ${an(m)} kg person standing in an elevator that is accelerating ${up ? 'upward' : 'downward'} at ${a} m/s²?`,
        answer: frac(m * (G.n + (up ? a : -a) * G.d), G.d),
        unit: 'N',
        steps: T`[[${m}(${G.g} ${up ? '+' : '-'} ${a})]] N`,
        data: { g: G.g, m, a: up ? a : -a }
      };
    }
  },
  {
    id: 'hookes-law',
    name: "Hooke's law",
    topic: FORCES,
    seconds: 30,
    hint: T`[[F = kx]]: the force a spring takes is its constant times how far it is stretched. Convert centimeters to meters first.`,
    make (r) {
      const [k, cm] = [r.int(2, 40) * 10, r.pick([2, 4, 5, 10, 20, 25, 50])];
      const F = num(k * cm / 100);
      const kind = r.pick(['F', 'k', 'x']);
      if (kind === 'k') return { prompt: T`${An(F)} N force stretches a spring ${cm} cm. What is its spring constant, in N/m?`, answer: int(k), unit: 'N/m', steps: T`[[k = \frac{F}{x} = \frac{${F}}{${cm / 100}}]]`, data: { kind, F, x: cm / 100 } };
      if (kind === 'x') return { prompt: T`A spring has a constant of ${k} N/m. How many centimeters does ${an(F)} N force stretch it?`, answer: int(cm), unit: 'cm', steps: T`[[x = \frac{F}{k} = \frac{${F}}{${k}} = ${cm / 100}]] m`, data: { kind, F, k } };
      return { prompt: T`How much force stretches a spring with a constant of ${k} N/m by ${cm} cm?`, answer: frac(k * cm, 100), unit: 'N', steps: T`[[F = kx = ${k} \cdot ${cm / 100}]]`, data: { kind, k, x: cm / 100 } };
    }
  },
  {
    id: 'centripetal',
    name: 'Moving in a circle',
    topic: FORCES,
    seconds: 45,
    hint: T`Toward the center: [[a = \frac{v^2}{r}]] and [[F = \frac{mv^2}{r}]].`,
    make (r) {
      const [m, v, rad] = [r.int(1, 20), r.int(2, 12), r.pick([1, 2, 4, 5, 8, 10])];
      if (r.chance(0.5)) return { prompt: T`A car rounds a curve of radius ${rad} m at ${v} m/s. What is its centripetal acceleration?`, answer: frac(v * v, rad), unit: 'm/s²', steps: T`[[\frac{${v}^2}{${rad}}]]`, data: { kind: 'a', v, rad } };
      return { prompt: T`${An(m)} kg ball on a string moves in a circle of radius ${rad} m at ${v} m/s. What is the tension, the centripetal force?`, answer: frac(m * v * v, rad), unit: 'N', steps: T`[[\frac{${m} \cdot ${v}^2}{${rad}}]]`, data: { kind: 'F', m, v, rad } };
    }
  },
  {
    id: 'gravitation-ratio',
    name: 'Universal gravitation',
    topic: FORCES,
    seconds: 30,
    hint: T`[[F = \frac{Gm_1m_2}{r^2}]]: double a mass and the force doubles; double the distance and it falls to a quarter.`,
    make (r) {
      const m1 = r.pick([1, 1, 2, 3, 4]);
      const m2 = r.pick([1, 2, 3]);
      const c = r.pick([2, 3, 4, 0.5]);
      const changes = [
        m1 > 1 ? 'one mass is multiplied by ' + m1 : '',
        m2 > 1 ? (m1 > 1 ? 'the other by ' : 'one mass is multiplied by ') + m2 : '',
        c < 1 ? 'the distance between them is halved' : 'the distance between them is multiplied by ' + c
      ].filter(Boolean);
      return {
        prompt: T`Two objects attract each other with a force F. If ${list(changes)}, the force becomes F times what?`,
        answer: c < 1 ? int(4 * m1 * m2) : frac(m1 * m2, c * c),
        steps: T`[[\frac{${m1} \cdot ${m2}}{(${c})^2}]]`,
        data: { a: m1, b: m2, c }
      };
    }
  },

  // ---------- energy and momentum ----------
  {
    id: 'kinetic-energy',
    name: 'Kinetic energy',
    topic: ENERGY,
    seconds: 30,
    hint: T`[[KE = \tfrac12 mv^2]]. Working back to the speed: [[v = \sqrt{2\,KE/m}]].`,
    make (r) {
      const [m, v] = [r.pick([0.5, 1, 2, 4, 5, 10, 20, 50, 1000]), r.pick([2, 3, 4, 5, 6, 8, 10, 12, 20, 30, 50])];
      const KE = num(m * v * v / 2);
      if (r.chance(0.35)) return { prompt: T`How fast is ${an(m)} kg object moving if its kinetic energy is ${KE} J?`, answer: int(v), unit: 'm/s', steps: T`[[v = \sqrt{\frac{2 \cdot ${KE}}{${m}}} = ${v}]] m/s`, data: { kind: 'v', m, KE } };
      return { prompt: T`What is the kinetic energy of ${an(m)} kg object moving at ${v} m/s?`, answer: frac(Math.round(m * 2) * v * v, 4), unit: 'J', steps: T`[[\tfrac12 \cdot ${m} \cdot ${v}^2 = ${KE}]] J`, data: { kind: 'KE', m, v } };
    }
  },
  {
    id: 'potential-energy',
    name: 'Potential energy',
    topic: ENERGY,
    seconds: 30,
    hint: T`[[PE = mgh]]: mass, gravity, height above the reference level.`,
    make (r) {
      const G = gravity(r);
      const [m, h] = [r.int(1, 60), r.int(2, 30)];
      return { prompt: G.says + T`what is the potential energy of ${an(m)} kg object ${h} meters above the ground?`, answer: gTimes(G, m * h), unit: 'J', steps: T`[[${m} \cdot ${G.g} \cdot ${h}]] J`, data: { g: G.g, m, h } };
    }
  },
  {
    id: 'drop-speed',
    name: 'Speed after a drop',
    topic: ENERGY,
    seconds: 45,
    hint: T`All the potential energy turns into kinetic: [[mgh = \tfrac12 mv^2]], so [[v = \sqrt{2gh}]] whatever the mass.`,
    make (r) {
      const G = gravity(r);
      const v = G.g === 10 ? r.pick([10, 20, 30, 40]) : r.pick([7, 14, 21, 28, 35]);
      const h = (v * v * G.d) / (2 * G.n);
      return { prompt: G.says + T`how fast is a ball dropped from ${h} meters moving just before it hits the ground? Ignore air resistance.`, answer: int(v), unit: 'm/s', steps: T`[[\sqrt{2 \cdot ${G.g} \cdot ${h}} = \sqrt{${v * v}} = ${v}]] m/s`, data: { g: G.g, h } };
    }
  },
  {
    id: 'work-power',
    name: 'Work and power',
    topic: ENERGY,
    seconds: 30,
    hint: T`Work [[W = Fd]] in joules; power [[P = \frac{W}{t}]] in watts; efficiency is work out over work in.`,
    make (r) {
      const kind = r.pick(['work', 'power', 'power', 'efficiency']);
      const [F, d, t] = [r.int(2, 50) * 10, r.int(2, 20), r.pick([2, 4, 5, 8, 10, 20])];
      if (kind === 'work') return { prompt: T`How much work is done pushing a box ${d} meters with a force of ${F} N?`, answer: int(F * d), unit: 'J', steps: T`[[${F} \cdot ${d}]] J`, data: { kind, F, d } };
      if (kind === 'efficiency') {
        const [out, inn] = r.pick([[300, 400], [400, 500], [80, 120], [450, 600], [90, 100], [60, 150], [700, 1000]]);
        return { prompt: T`A machine takes in ${inn} J of work and puts out ${out} J. What is its efficiency, in percent?`, answer: frac(100 * out, inn), unit: '%', steps: T`[[\frac{${out}}{${inn}} \cdot 100]]`, data: { kind, out, inn } };
      }
      return { prompt: T`A motor lifts a load with a force of ${F} N through ${d} meters in ${t} seconds. What power does it deliver?`, answer: frac(F * d, t), unit: 'W', steps: T`[[\frac{${F} \cdot ${d}}{${t}}]] W`, data: { kind, F, d, t } };
    }
  },
  {
    id: 'momentum',
    name: 'Momentum',
    topic: ENERGY,
    seconds: 30,
    hint: T`[[p = mv]], in kg·m/s.`,
    make (r) {
      const [m, v] = [r.pick([0.5, 2, 5, 10, 50, 60, 73, 200, 1200]), r.int(2, 30)];
      if (r.chance(0.35)) return { prompt: T`What is the velocity of ${an(m)} kg mass with a momentum of ${num(m * v)} kg·m/s?`, answer: int(v), unit: 'm/s', steps: T`[[\frac{${num(m * v)}}{${m}}]]`, data: { kind: 'v', m, p: num(m * v) } };
      return { prompt: T`What is the momentum of ${an(m)} kg object moving at ${v} m/s?`, answer: frac(2 * m * v, 2), unit: 'kg·m/s', steps: T`[[${m} \cdot ${v}]]`, data: { kind: 'p', m, v } };
    }
  },
  {
    id: 'impulse',
    name: 'Impulse',
    topic: ENERGY,
    seconds: 45,
    hint: T`Impulse is force times time, and it equals the change in momentum: [[F\Delta t = m\Delta v]].`,
    make (r) {
      const [m, v, t] = [r.pick([0.2, 0.5, 1, 2, 5, 60, 1000]), r.int(2, 30), r.pick([0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2])];
      const stop = r.chance(0.7);
      if (stop) return { prompt: T`${An(m)} kg object moving at ${v} m/s is stopped in ${seconds(t)}. What average force stops it?`, answer: frac(Math.round(m * v * 100), Math.round(t * 100)), unit: 'N', steps: T`[[\frac{${m} \cdot ${v}}{${t}}]] N`, data: { kind: 'force', m, v, t } };
      const F = num(m * v);
      return { prompt: T`${An(F)} N force acts on a ball for ${seconds(t)}. What impulse does it give?`, answer: frac(Math.round(F * t * 1000), 1000), unit: 'N·s', steps: T`[[${F} \cdot ${t}]] N·s`, data: { kind: 'impulse', F, t } };
    }
  },
  {
    id: 'collision',
    name: 'Collisions',
    topic: ENERGY,
    seconds: 45,
    hint: T`Momentum before equals momentum after. Objects that stick together share one velocity: [[v = \frac{m_1v_1 + m_2v_2}{m_1 + m_2}]]. Two that push apart from rest move off with equal and opposite momentum.`,
    make (r) {
      if (r.chance(0.35)) {
        const [m1, m2] = r.pick([[60, 40], [50, 70], [80, 40], [45, 60], [30, 90]]);
        const v2 = r.pick([1, 2, 3, 4, 6]);
        return { prompt: T`Two skaters, ${m1} kg and ${m2} kg, stand together and push apart. The ${m2} kg skater moves off at ${v2} m/s. How fast does the other one move?`, answer: frac(m2 * v2, m1), unit: 'm/s', steps: T`[[${m1}v = ${m2} \cdot ${v2}]]`, data: { kind: 'apart', m1, m2, v2 } };
      }
      const [m1, v1, m2] = [r.pick([2, 4, 5, 10, 45, 60, 1000]), r.int(2, 20), r.pick([1, 2, 3, 5, 10, 15, 500])];
      return { prompt: T`${An(m1)} kg cart moving at ${v1} m/s hits ${an(m2)} kg cart at rest, and they stick together. How fast do they move?`, answer: frac(m1 * v1, m1 + m2), unit: 'm/s', steps: T`[[\frac{${m1} \cdot ${v1}}{${m1} + ${m2}}]]`, data: { kind: 'stick', m1, v1, m2 } };
    }
  },
  {
    id: 'energy-factor',
    name: 'How kinetic energy scales',
    topic: ENERGY,
    seconds: 30,
    hint: T`[[KE = \tfrac12 mv^2]]: kinetic energy goes with the mass and the square of the speed. Triple the speed, nine times the energy.`,
    make (r) {
      const s = r.pick([2, 3, 4, 0.5]);
      const m = r.pick([1, 1, 2, 3, 0.5]);
      const said = (s < 1 ? "an object's speed is halved" : "an object's speed is multiplied by " + s) + (m === 1 ? '' : m < 1 ? ' and its mass halved' : ' and its mass by ' + m);
      return { prompt: T`If ${said}, its kinetic energy is multiplied by what?`, answer: frac(Math.round(m * 4) * Math.round(s * s * 4), 16), steps: T`[[${m} \cdot ${s}^2]]`, data: { s, m } };
    }
  },

  // ---------- electricity ----------
  {
    id: 'ohms-law',
    name: "Ohm's law",
    topic: ELECTRIC,
    seconds: 30,
    hint: T`[[V = IR]]: volts equal amps times ohms. Current is [[V/R]], never [[V \cdot R]].`,
    make (r) {
      const kind = r.pick(['I', 'I', 'R', 'V']);
      const pairs = [[3, 60], [6, 2], [12, 4], [9, 3], [120, 60], [120, 240], [24, 4.8], [1.5, 3], [12, 48], [9, 18], [120, 30]];
      // a current of 1/12 A only as an answer, never in the question
      const [V, R] = r.pick(kind === 'I' ? pairs.concat([[3, 36], [12, 9]]) : pairs);
      const I = frac(Math.round(V * 10), Math.round(R * 10));
      if (kind === 'R') return { prompt: T`A device on ${an(V)} V source draws ${num(V / R)} A. What is its resistance?`, answer: frac(Math.round(R * 10), 10), unit: 'Ω', steps: T`[[R = \frac{V}{I} = \frac{${V}}{${num(V / R)}}]]`, data: { kind, V, I: num(V / R) } };
      if (kind === 'V') return { prompt: T`What voltage drives ${num(V / R)} A through ${an(R)} Ω resistor?`, answer: frac(Math.round(V * 10), 10), unit: 'V', steps: T`[[V = IR = ${num(V / R)} \cdot ${R}]]`, data: { kind, R, I: num(V / R) } };
      return { prompt: T`What current flows when ${an(V)} V battery is connected to ${an(R)} Ω resistor?`, answer: I, unit: 'A', steps: T`[[I = \frac{V}{R} = \frac{${V}}{${R}}]] A`, data: { kind, V, R } };
    }
  },
  {
    id: 'resistors',
    name: 'Resistors in series and parallel',
    topic: ELECTRIC,
    seconds: 45,
    hint: T`Series: add them. Parallel: [[\frac{1}{R} = \frac{1}{R_1} + \frac{1}{R_2} + \cdots]]; for two, [[\frac{R_1R_2}{R_1 + R_2}]], and two equal ones give half of one.`,
    make (r) {
      const kind = r.pick(['series', 'parallel', 'parallel', 'mixed']);
      const pair = r.pick([[3, 6], [4, 4], [6, 12], [10, 15], [12, 4], [20, 30], [8, 8], [6, 6], [2, 2], [10, 40], [9, 18], [5, 20]]);
      const par = rs => frac(rs.reduce((x, y) => x * y, 1), rs.reduce((sum, _, i) => sum + rs.filter((__, j) => j !== i).reduce((x, y) => x * y, 1), 0));
      if (kind === 'series') {
        const items = [pair[0], pair[1], r.int(1, 20)];
        return { prompt: T`Resistors of ${list(items)} Ω are connected in series. What is the total resistance?`, answer: int(items[0] + items[1] + items[2]), unit: 'Ω', steps: T`[[${items.join(' + ')}]]`, data: { kind, list: items } };
      }
      if (kind === 'mixed') {
        const extra = r.int(1, 10);
        return { prompt: T`${An(pair[0])} Ω and ${an(pair[1])} Ω resistor are connected in parallel, and that pair in series with ${an(extra)} Ω resistor. What is the total resistance?`, answer: frac(pair[0] * pair[1] + extra * (pair[0] + pair[1]), pair[0] + pair[1]), unit: 'Ω', steps: T`[[\frac{${pair[0]} \cdot ${pair[1]}}{${pair[0]} + ${pair[1]}} + ${extra}]]`, data: { kind, list: pair, extra } };
      }
      const items = r.chance(0.25) ? r.pick([[2, 3, 6], [4, 6, 12], [3, 3, 3], [6, 12, 12], [10, 15, 30]]) : pair;
      return { prompt: T`Resistors of ${list(items)} Ω are connected in parallel. What is the equivalent resistance?`, answer: par(items), unit: 'Ω', steps: T`[[\frac{1}{R} = ${items.map(x => T`\frac{1}{${x}}`).join(' + ')}]]`, data: { kind, list: items } };
    }
  },
  {
    id: 'electric-power',
    name: 'Electric power and energy',
    topic: ELECTRIC,
    seconds: 30,
    hint: T`[[P = IV = I^2R = \frac{V^2}{R}]] in watts. Energy is power times time; in kilowatt-hours, kilowatts times hours.`,
    make (r) {
      const kind = r.pick(['IV', 'IR', 'VR', 'current', 'kwh']);
      if (kind === 'kwh') {
        const [w, h] = [r.pick([40, 60, 100, 150, 500, 1000, 1500, 2000]), r.pick([2, 3, 4, 5, 6, 8, 10])];
        return { prompt: T`How many kilowatt-hours does ${an(w)} W appliance use in ${h} hours?`, answer: frac(w * h, 1000), unit: 'kWh', steps: T`[[\frac{${w}}{1000} \cdot ${h}]] kWh`, data: { kind, w, h } };
      }
      if (kind === 'current') {
        const [P, V] = r.pick([[60, 120], [1200, 120], [12, 6], [100, 120], [24, 12], [600, 120], [9, 3]]);
        return { prompt: T`How much current does ${an(P)} W device draw on ${V} V?`, answer: frac(P, V), unit: 'A', steps: T`[[I = \frac{P}{V} = \frac{${P}}{${V}}]]`, data: { kind, P, V } };
      }
      const [I, R] = [r.pick([0.5, 1, 2, 3, 4, 5]), r.pick([2, 4, 5, 6, 10, 12, 20])];
      const V = num(I * R);
      if (kind === 'IV') return { prompt: T`What power does a device use if ${I} A flows through it at ${V} V?`, answer: frac(Math.round(4 * I * V), 4), unit: 'W', steps: T`[[P = IV = ${I} \cdot ${V}]]`, data: { kind, I, V } };
      if (kind === 'IR') return { prompt: T`What power is used by ${an(R)} Ω resistor carrying ${I} A?`, answer: frac(Math.round(4 * I * I * R), 4), unit: 'W', steps: T`[[P = I^2R = ${I}^2 \cdot ${R}]]`, data: { kind, I, R } };
      return { prompt: T`What power is used by ${an(R)} Ω resistor across ${V} V?`, answer: frac(Math.round(4 * V * V), 4 * R), unit: 'W', steps: T`[[P = \frac{V^2}{R} = \frac{${V}^2}{${R}}]]`, data: { kind, V, R } };
    }
  },

  // ---------- waves, heat, and fluids ----------
  {
    id: 'wave-speed',
    name: 'Waves',
    topic: WAVES,
    seconds: 30,
    hint: T`[[v = f\lambda]]: speed is frequency times wavelength. The period is [[T = \frac{1}{f}]].`,
    make (r) {
      const kind = r.pick(['v', 'lambda', 'f', 'period']);
      const [f, lambda] = [r.pick([2, 4, 5, 10, 20, 50, 100, 200, 256, 440, 500]), r.pick([0.5, 1, 2, 3, 4, 0.25, 1.5])];
      const v = f * lambda;
      if (kind === 'period') return { prompt: T`What is the period of a wave with a frequency of ${f} Hz?`, answer: frac(1, f), unit: 's', steps: T`[[T = \frac{1}{${f}}]] s`, data: { kind, f } };
      if (kind === 'lambda') return { prompt: T`A wave travels at ${v} m/s with a frequency of ${f} Hz. What is its wavelength?`, answer: frac(Math.round(lambda * 4), 4), unit: 'm', steps: T`[[\lambda = \frac{v}{f} = \frac{${v}}{${f}}]]`, data: { kind, v, f } };
      if (kind === 'f') return { prompt: T`A wave travels at ${v} m/s with a wavelength of ${lambda} m. What is its frequency?`, answer: int(f), unit: 'Hz', steps: T`[[f = \frac{v}{\lambda} = \frac{${v}}{${lambda}}]]`, data: { kind, v, lambda } };
      return { prompt: T`What is the speed of a wave with a frequency of ${f} Hz and a wavelength of ${lambda} m?`, answer: frac(Math.round(v * 4), 4), unit: 'm/s', steps: T`[[v = f\lambda = ${f} \cdot ${lambda}]]`, data: { kind, f, lambda } };
    }
  },
  {
    id: 'echo',
    name: 'Echoes',
    topic: WAVES,
    seconds: 30,
    hint: T`An echo travels there and back, so the distance is half of speed times time.`,
    make (r) {
      const [v, t] = [r.pick([340, 343, 1500]), r.pick([0.5, 1, 2, 3, 4, 5, 6])];
      const where = v === 1500 ? 'Sonar sent down through water, where sound travels 1500 m/s,' : T`A shout, with sound traveling ${v} m/s,`;
      return { prompt: T`${where} echoes back after ${seconds(t)}. How far away is the surface it bounced off?`, answer: frac(Math.round(v * t * 2), 4), unit: 'm', steps: T`[[\frac{${v} \cdot ${t}}{2}]] m`, data: { v, t } };
    }
  },
  {
    id: 'pendulum',
    name: 'Pendulums',
    topic: WAVES,
    seconds: 45,
    hint: T`[[T = 2\pi\sqrt{\frac{L}{g}}]]: only the length and gravity matter, not the mass or the swing (for small swings). Four times the length doubles the period.`,
    make (r) {
      const G = gravity(r);
      const q = r.pick([[1, 2], [1, 1], [2, 1], [1, 4]]);
      const L = (G.n * q[0] * q[0]) / (G.d * q[1] * q[1]);
      return { prompt: G.says + T`what is the period of a pendulum ${L} m long? Answer in terms of pi.`, answer: pi(2 * q[0], q[1]), unit: 's', steps: T`[[2\pi\sqrt{\frac{${L}}{${G.g}}} = 2\pi \cdot \frac{${q[0]}}{${q[1]}}]] s`, data: { g: G.g, L } };
    }
  },
  {
    id: 'density',
    name: 'Density and buoyancy',
    topic: WAVES,
    seconds: 45,
    hint: T`[[\rho = \frac{m}{V}]]. The buoyant force equals the weight of the fluid pushed aside: [[F_b = \rho_{\text{fluid}}Vg]], with water at 1000 kg/m³ (1 g/cm³).`,
    make (r) {
      if (r.chance(0.5)) {
        const [m, V] = r.pick([[540, 200], [270, 100], [79, 10], [193, 10], [50, 25], [1000, 400], [36, 12], [27, 10]]);
        return { prompt: T`A block has a mass of ${m} g and a volume of ${V} cm³. What is its density, in g/cm³?`, answer: frac(m, V), unit: 'g/cm³', steps: T`[[\frac{${m}}{${V}}]] g/cm³`, data: { kind: 'density', m, V } };
      }
      const G = gravity(r);
      const liters = r.pick([1, 2, 5, 10, 20, 0.5]);
      return { prompt: G.says + T`what buoyant force does water exert on an object of volume ${liters / 1000} m³ held fully under the surface?`, answer: gTimes(G, Math.round(liters * 10), 10), unit: 'N', steps: T`[[1000 \cdot ${liters / 1000} \cdot ${G.g}]] N`, data: { kind: 'buoyancy', g: G.g, V: liters / 1000 } };
    }
  },
  {
    id: 'pressure',
    name: 'Pressure',
    topic: WAVES,
    seconds: 30,
    hint: T`[[P = \frac{F}{A}]] in pascals (N/m²). Under water, [[P = \rho gh]] more than at the surface, with water at 1000 kg/m³.`,
    make (r) {
      if (r.chance(0.5)) {
        const [F, A] = [r.int(1, 50) * 20, r.pick([0.5, 2, 4, 5, 10, 0.25])];
        return { prompt: T`${An(F)} N crate rests on a base of area ${A} m². What pressure does it put on the floor?`, answer: frac(F * 4, Math.round(A * 4)), unit: 'Pa', steps: T`[[\frac{${F}}{${A}}]] Pa`, data: { kind: 'FA', F, A } };
      }
      const G = gravity(r);
      const h = r.int(1, 20);
      return { prompt: G.says + T`how much greater is the water pressure ${h} meters below the surface of a lake than at the surface?`, answer: gTimes(G, 1000 * h), unit: 'Pa', steps: T`[[1000 \cdot ${G.g} \cdot ${h}]] Pa`, data: { kind: 'depth', g: G.g, h } };
    }
  },
  {
    id: 'specific-heat',
    name: 'Heat and specific heat',
    topic: WAVES,
    seconds: 45,
    hint: T`[[Q = mc\Delta T]]. Water's specific heat is 4.18 J/(g·°C), or 1 calorie per gram per degree.`,
    make (r) {
      const [m, dT] = [r.pick([10, 20, 50, 100, 200, 250, 500]), r.int(2, 40)];
      if (r.chance(0.5)) return { prompt: T`How many calories warm ${m} g of water by ${dT} °C?`, answer: int(m * dT), unit: 'cal', steps: T`[[${m} \cdot 1 \cdot ${dT}]] cal`, data: { m, c: 1, dT } };
      return { prompt: T`How many joules warm ${m} g of water by ${dT} °C? Water's specific heat is 4.18 J/(g·°C).`, answer: frac(m * 418 * dT, 100), unit: 'J', steps: T`[[${m} \cdot 4.18 \cdot ${dT}]] J`, data: { m, c: 4.18, dT } };
    }
  },
  {
    id: 'temperature',
    name: 'Temperature scales',
    topic: WAVES,
    seconds: 30,
    hint: T`[[K = {}^\circ\!C + 273]], and [[{}^\circ\!F = \tfrac95\,{}^\circ\!C + 32]]. The scales cross at -40.`,
    make (r) {
      const kind = r.pick(['CK', 'KC', 'CF', 'FC']);
      const c = kind === 'CF' || kind === 'FC' ? 5 * r.int(-8, 20) : r.int(-50, 120);
      if (kind === 'CK') return { prompt: T`What is ${c} °C in kelvins?`, answer: int(c + 273), unit: 'K', steps: T`[[${c} + 273]]`, data: { kind, c } };
      if (kind === 'KC') return { prompt: T`What is ${c + 273} K in degrees Celsius?`, answer: int(c), unit: '°C', steps: T`[[${c + 273} - 273]]`, data: { kind, c } };
      if (kind === 'CF') return { prompt: T`What is ${c} °C in degrees Fahrenheit?`, answer: int(9 * c / 5 + 32), unit: '°F', steps: T`[[\tfrac95 \cdot ${c} + 32]]`, data: { kind, c } };
      return { prompt: T`What is ${9 * c / 5 + 32} °F in degrees Celsius?`, answer: int(c), unit: '°C', steps: T`[[\tfrac59(${9 * c / 5 + 32} - 32)]]`, data: { kind, c } };
    }
  },
  {
    id: 'lens',
    name: 'Lenses and mirrors',
    topic: WAVES,
    seconds: 60,
    hint: T`[[\frac{1}{f} = \frac{1}{d_o} + \frac{1}{d_i}]] for a converging lens or a concave mirror; the magnification is [[\frac{d_i}{d_o}]] in size.`,
    make (r) {
      const [f, d] = r.pick([[10, 15], [10, 20], [10, 30], [12, 20], [20, 30], [6, 9], [8, 12], [15, 20], [5, 10], [4, 12], [12, 18]]);
      const di = f * d / (d - f);
      if (r.chance(0.3)) return { prompt: T`An object ${d} cm from a converging lens of focal length ${f} cm forms an image ${di} cm away. What is the magnification, in size?`, answer: frac(di, d), steps: T`[[\frac{${di}}{${d}}]]`, data: { kind: 'mag', f, d } };
      return { prompt: T`An object is ${d} cm from a converging lens with a focal length of ${f} cm. How far from the lens is the image?`, answer: int(di), unit: 'cm', steps: T`[[\frac{1}{d_i} = \frac{1}{${f}} - \frac{1}{${d}}]], so [[d_i = ${di}]] cm`, data: { kind: 'image', f, d } };
    }
  },
  {
    id: 'half-life',
    name: 'Half-life',
    topic: WAVES,
    seconds: 30,
    hint: T`Halve once per half-life: [[N = N_0\left(\tfrac12\right)^{t/T}]].`,
    make (r) {
      const [half, n] = [r.pick([2, 3, 5, 8, 10, 12, 20]), r.int(1, 5)];
      const start = r.pick([16, 32, 64, 80, 96, 100, 128, 160, 200, 400]);
      return { prompt: T`An isotope has a half-life of ${half} days. Of ${an(start)} g sample, how many grams are left after ${half * n} days?`, answer: frac(start, 2 ** n), unit: 'g', steps: T`${n} half-lives: [[${start} \cdot \left(\tfrac12\right)^{${n}}]] g`, data: { half, start, t: half * n } };
    }
  }
];
