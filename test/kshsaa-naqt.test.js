// NAQT rounds for the reader (client/kshsaa/naqt.js), with qbreader.org
// replaced by made-up questions. Run with `npm test`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTRIBUTION, PACKET_LENGTH, PARTS, TIEBREAKERS, answerKey, apportion, fromBonus, fromTossup, modaqText, naqtRound,
  naqtUrl, partCounts, spread
} from '../client/kshsaa/naqt.js';

// a seeded generator, so a failure can be replayed
function seeded (seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

// qbreader.org as a function of the URL: every question unique, in the asked-for category
function fakeQbreader ({ empty = [] } = {}) {
  let n = 0;
  return async url => {
    const params = new URL(url).searchParams;
    const sub = (params.get('subcategories') || '').split(',')[0];
    const category = params.get('categories') ||
      Object.entries({ Literature: 'Literature', Science: 'Biology,Chemistry,Physics,Other Science', 'Fine Arts': 'Fine Arts', History: 'History', 'Pop Culture': 'Sports,Movies' })
        .find(([, subs]) => subs.split(',').some(s => sub.includes(s)))?.[0] || 'Other Academic';
    if (empty.includes(category)) return {};
    const make = () => {
      n++;
      const alt = params.get('alternateSubcategories') ? 'Math' : null;
      return {
        _id: 'id' + n, category, subcategory: sub || category, alternate_subcategory: alt, set: { name: 'Test Set' }
      };
    };
    const count = Number(params.get('number'));
    if (url.includes('/random-bonus')) {
      return {
        bonuses: Array.from({ length: count }, () => {
          const b = make();
          const answers = [1, 2, 3].map(k => '<b><u>Answer ' + b._id + 'p' + k + '</u></b>');
          return { ...b, leadin: 'Lead-in ' + b._id, parts: ['One', 'Two', 'Three'], answers };
        })
      };
    }
    return {
      tossups: Array.from({ length: count }, () => {
        const t = make();
        return {
          ...t,
          question: '<b>Clue for ' + t._id + ' (*)</b> giveaway <i>Title</i>.',
          question_sanitized: 'Clue for ' + t._id + ' (*) giveaway Title.',
          answer: '<b><u>Answer ' + t._id + '</u></b> [or Other]',
          answer_sanitized: 'Answer ' + t._id + ' [or Other]'
        };
      })
    };
  };
}

const quick = () => Promise.resolve();

describe('apportion', () => {
  it('adds up and rounds every share up or down', () => {
    const weights = DISTRIBUTION.map(g => g.t);
    const sum = weights.reduce((a, w) => a + w, 0);
    for (let seed = 1; seed < 200; seed++) {
      const counts = apportion(24, weights, seeded(seed));
      assert.equal(counts.reduce((a, c) => a + c, 0), 24);
      counts.forEach((c, i) => {
        const exact = 24 * weights[i] / sum;
        assert.ok(c === Math.floor(exact) || c === Math.ceil(exact), DISTRIBUTION[i].group + ': ' + c + ' for ' + exact);
      });
    }
  });

  it('gives nothing to nothing', () => {
    assert.deepEqual(apportion(0, [1, 2]), [0, 0]);
    assert.deepEqual(apportion(3, [0, 0]), [0, 0]);
  });
});

describe('the distribution', () => {
  it('averages 24 tossups and 24 bonuses, as NAQT lists it', () => {
    const total = kind => DISTRIBUTION.reduce((a, g) => a + g[kind], 0);
    assert.equal(Math.round(total('t') * 10) / 10, 24);
    assert.equal(Math.round(total('b') * 10) / 10, 24);
  });

  it('splits a packet across every part', () => {
    const counts = partCounts(PACKET_LENGTH, 't', seeded(7));
    assert.equal(counts.length, PARTS.length);
    assert.equal(counts.reduce((a, c) => a + c, 0), PACKET_LENGTH);
  });
});

describe('naqtUrl', () => {
  it('asks for the level, standard sets, and recent years where subjects go stale', () => {
    const current = PARTS.find(p => p.group === 'Current Events');
    const url = new URL(naqtUrl('tossup', current, 'jv', 5, 2026));
    assert.equal(url.pathname, '/api/random-tossup');
    assert.equal(url.searchParams.get('difficulties'), '2');
    assert.equal(url.searchParams.get('minYear'), '2025');
    assert.equal(url.searchParams.get('standardOnly'), 'true');
    const bonus = new URL(naqtUrl('bonus', PARTS[0], 'varsity', 3, 2026));
    assert.equal(bonus.pathname, '/api/random-bonus');
    assert.equal(bonus.searchParams.get('threePartBonuses'), 'true');
    assert.equal(bonus.searchParams.get('minYear'), '2010');
  });
});

describe('modaqText', () => {
  it('keeps the tags MODAQ reads and rewrites or drops the rest', () => {
    assert.equal(modaqText('<i>Hamlet</i> by <strong>him</strong>'), '<em>Hamlet</em> by <b>him</b>');
    assert.equal(modaqText('<b>power (*)</b> <span class="x">rest</span><br>end'), '<b>power (*)</b> rest end');
    assert.equal(modaqText('H<sub>2</sub>O &amp; x&lt;y &#8212; &#x2014;'), 'H<sub>2</sub>O & x<y — —');
  });
});

describe('answerKey', () => {
  it('reads the answer up to its alternates', () => {
    assert.equal(answerKey('Crime and Punishment [or Prestupleniye]'), 'crimeandpunishment');
    assert.equal(answerKey('Norway (accept Kingdom of Norway)'), 'norway');
  });
});

describe('fromTossup and fromBonus', () => {
  it('names Math and catch-all subcategories by what they hold', () => {
    const t = fromTossup({ _id: 'a', category: 'Science', subcategory: 'Other Science', alternate_subcategory: 'Math', question: 'q', answer: 'a' });
    assert.equal(t.category, 'Math');
    assert.equal(t.group, 'Science');
    const astro = fromTossup({ _id: 'b', category: 'Science', subcategory: 'Other Science', alternate_subcategory: 'Astronomy', question: 'q', answer: 'a' });
    assert.equal(astro.category, 'Astronomy');
    assert.equal(fromTossup({ _id: 'c', category: 'Science', question: '', answer: 'a' }), null);
  });

  it('takes only three-part bonuses with every answer', () => {
    const b = { _id: 'x', category: 'History', subcategory: 'American History', leadin: 'L', parts: ['1', '2', '3'], answers: ['a', 'b', 'c'] };
    assert.deepEqual(fromBonus(b).values, [10, 10, 10]);
    assert.deepEqual(fromBonus(b).answers, ['a', 'b', 'c']);
    assert.equal(fromBonus({ ...b, answers: ['a', '', 'c'] }), null);
    assert.equal(fromBonus({ ...b, parts: ['1', '2'], answers: ['a', 'b'] }), null);
  });
});

describe('spread', () => {
  it('never puts two of a group in a row when it can be helped', () => {
    const items = [...'AAAABBBCCD'].map((group, i) => ({ group, i }));
    for (let seed = 1; seed < 50; seed++) {
      const out = spread(items, seeded(seed));
      assert.equal(out.length, items.length);
      for (let i = 1; i < out.length; i++) assert.notEqual(out[i].group, out[i - 1].group);
    }
  });

  it('keeps every item when it cannot help it', () => {
    const out = spread([...'AAAB'].map(group => ({ group })), seeded(3));
    assert.equal(out.length, 4);
  });
});

describe('naqtRound', () => {
  it('builds 24 tossups, two tiebreakers, and 24 bonuses with no answer twice', async () => {
    const r = await naqtRound({ level: 'varsity', get: fakeQbreader(), wait: quick, random: seeded(11), year: 2026 });
    assert.equal(r.round.length, PACKET_LENGTH + TIEBREAKERS);
    assert.equal(r.bonuses.length, PACKET_LENGTH);
    assert.deepEqual(r.notes, []);
    const keys = r.round.flatMap(q => q.keys).concat(r.bonuses.flatMap(b => b.keys));
    assert.equal(new Set(keys).size, keys.length);
    const science = r.round.slice(0, PACKET_LENGTH).filter(q => q.group === 'Science').length;
    assert.ok(science === 5 || science === 6, 'science tossups: ' + science);
    assert.ok(r.round[0].question.includes('<em>Title</em>'));
    assert.ok(!r.round[0].display.includes('<'));
  });

  it('fills a subject qbreader.org has none of from the others, and says so', async () => {
    const r = await naqtRound({ level: 'beginner', get: fakeQbreader({ empty: ['Mythology', 'Philosophy'] }), wait: quick, random: seeded(5), year: 2026 });
    assert.equal(r.round.length, PACKET_LENGTH + TIEBREAKERS);
    assert.equal(r.bonuses.length, PACKET_LENGTH);
    assert.ok(r.round.every(q => q.group !== 'Mythology' && q.group !== 'Philosophy'));
    assert.match(r.notes.join(' '), /too few/);
  });

  it('explains a failed request', async () => {
    const down = async () => { throw new Error('offline'); };
    await assert.rejects(naqtRound({ level: 'jv', get: down, wait: quick }), /Could not get questions from qbreader\.org \(offline\)/);
  });
});
