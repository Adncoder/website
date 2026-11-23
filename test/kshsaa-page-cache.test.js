// The tabs' kept results: worked out once, and again after any change on
// this server or the other one. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { makePageCache } from '../server/kshsaa/page-cache.js';

// a stand-in for kshsaa_settings: just the change counter
function counterStore () {
  let version = 0;
  return {
    // a change saved on the other server
    elsewhere () { version++; },
    read: () => version,
    async findOne () { return { _id: 'dataVersion', version }; },
    async updateOne (filter, update) { version += update.$inc.version; }
  };
}

// a request through noteChanges, its reply sent
function request (cache, method) {
  const res = new EventEmitter();
  let passed = false;
  cache.noteChanges({ method }, res, () => { passed = true; });
  res.emit('finish');
  res.emit('close');
  return passed;
}

test('a tab is worked out once, and again after a change here or on the other server', async () => {
  const store = counterStore();
  const cache = makePageCache(store);
  let runs = 0;
  const work = () => ({ run: ++runs });
  assert.deepEqual(await cache.get('insights', work), { run: 1 });
  assert.deepEqual(await cache.get('insights', work), { run: 1 });
  // reading changes nothing
  assert.equal(request(cache, 'GET'), true);
  assert.deepEqual(await cache.get('insights', work), { run: 1 });
  // a save here, counted once though its reply both finished and closed
  assert.equal(request(cache, 'POST'), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.read(), 1);
  assert.deepEqual(await cache.get('insights', work), { run: 2 });
  store.elsewhere();
  assert.deepEqual(await cache.get('insights', work), { run: 3 });
  // each key is its own
  assert.deepEqual(await cache.get('tournaments', work), { run: 4 });
});

test('requests at the same time share one result, and a failure is not kept', async () => {
  const cache = makePageCache(counterStore());
  let runs = 0;
  const slow = () => new Promise(resolve => setTimeout(() => resolve(++runs), 10));
  assert.deepEqual(await Promise.all([cache.get('k', slow), cache.get('k', slow)]), [1, 1]);
  let fail = true;
  const flaky = () => { if (fail) throw new Error('database away'); return 'fine'; };
  await assert.rejects(cache.get('f', flaky), /database away/);
  fail = false;
  assert.equal(await cache.get('f', flaky), 'fine');
});

test('a kept result expires, and only the newest few are kept', async () => {
  let now = 0;
  const cache = makePageCache(counterStore(), { maxEntries: 2, maxAgeMs: 1000, now: () => now });
  let runs = 0;
  const work = () => ++runs;
  assert.equal(await cache.get('a', work), 1);
  now = 999;
  assert.equal(await cache.get('a', work), 1);
  now = 1000;
  assert.equal(await cache.get('a', work), 2);
  // a third key pushes out the oldest
  await cache.get('b', work);
  await cache.get('c', work);
  assert.equal(await cache.get('a', work), 5);
  assert.equal(await cache.get('c', work), 4);
});
