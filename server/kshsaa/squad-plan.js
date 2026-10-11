// The squad plan, written on the Roster tab one line per squad or pool:
//
//   Varsity Blue: 3 from Rotating Varsity Pool
//   Varsity Crimson: 2 from Rotating Varsity Pool; 1 from JV Rotating Pool or JV Crimson Rotators
//   JV Blue
//   Rotating Varsity Pool (pool)
//
// A squad is built from its permanent players plus its rotating spots, each
// spot filled from the pools it names. A pool is a group players belong to
// without being on a team; anything a spot draws from is a pool even when it
// has no line of its own. A squad with no spots fills from everyone, the way
// squads worked before pools.

const MAX_NAME = 40;
const MAX_ENTRIES = 24;
const MAX_SPOTS = 10;

/**
 * @typedef {object} SquadPlan
 * @property {string[]} list - squads and pools, in the order written; squads strongest first
 * @property {string[]} pools - the entries of `list` that are pools
 * @property {Object<string, {count: number, from: string[]}[]>} spots - rotating spots by squad
 */

const keyOf = name => name.toLowerCase();

/**
 * @param {string} text
 * @returns {SquadPlan}
 * @throws {Error} with a message for the coach
 */
export function parseSquadPlan (text) {
  const list = [];
  const pools = new Set();
  const spots = {};
  const canonical = {};
  const add = name => {
    if (!name) throw new Error('a line has no squad name');
    if (name.length > MAX_NAME) throw new Error(name + ' is longer than ' + MAX_NAME + ' characters');
    if (!canonical[keyOf(name)]) {
      canonical[keyOf(name)] = name;
      list.push(name);
    }
    return canonical[keyOf(name)];
  };

  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const squadLines = [];
  for (const line of lines) {
    const pool = line.match(/^(.*?)\s*\(pool\)$/i);
    if (pool) {
      pools.add(add(pool[1].trim()));
      continue;
    }
    const colon = line.indexOf(':');
    const name = add((colon === -1 ? line : line.slice(0, colon)).trim());
    if (colon !== -1) squadLines.push([name, line.slice(colon + 1)]);
  }

  for (const [name, rest] of squadLines) {
    if (spots[name]) throw new Error(name + ' is listed twice');
    let total = 0;
    spots[name] = rest.split(';').map(s => s.trim()).filter(Boolean).map(group => {
      const m = group.match(/^(\d+)\s+from\s+(.+)$/i);
      if (!m) throw new Error('could not read "' + group + '" for ' + name + ' - write it like "2 from Rotating Varsity Pool"');
      const count = Number(m[1]);
      total += count;
      if (!count || total > MAX_SPOTS) throw new Error(name + ' needs between 1 and ' + MAX_SPOTS + ' rotating spots');
      const from = m[2].split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean).map(source => {
        const pool = add(source);
        pools.add(pool);
        return pool;
      });
      return { count, from: [...new Set(from)] };
    });
    if (!spots[name].length) delete spots[name];
  }

  for (const name of Object.keys(spots)) {
    if (pools.has(name)) throw new Error(name + ' is both a squad and a pool that spots are filled from');
  }
  if (!list.length) throw new Error('list at least one squad');
  if (list.length > MAX_ENTRIES) throw new Error('at most ' + MAX_ENTRIES + ' squads and pools');
  if (list.every(name => pools.has(name))) throw new Error('list at least one squad that is not a pool');
  return { list, pools: list.filter(name => pools.has(name)), spots };
}

/**
 * The plan written back out the way `parseSquadPlan` reads it.
 * @param {SquadPlan} plan
 * @returns {string}
 */
export function formatSquadPlan (plan) {
  const pools = new Set(plan.pools || []);
  return plan.list.map(name => {
    if (pools.has(name)) return name + ' (pool)';
    const groups = plan.spots?.[name];
    if (!groups?.length) return name;
    return name + ': ' + groups.map(g => g.count + ' from ' + g.from.join(' or ')).join('; ');
  }).join('\n');
}
