// The check that keeps an answer from coming up twice in a round
// (client/kshsaa/same-answer.js), on answer lines written the ways the
// question sources write them. Run with `npm test`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerSet, answerWords, sameAnswer } from '../client/kshsaa/same-answer.js';

describe('answerWords', () => {
  it('reads the answer up to its alternatives', () => {
    assert.deepEqual([...answerWords('Crime and Punishment [or Prestupleniye]')], ['crime', 'punishment']);
    assert.deepEqual([...answerWords('<b><u>Norway</u></b> (accept Kingdom of Norway)')], ['norway']);
    assert.deepEqual([...answerWords('Saratoga Campaign or Battle (prompt on "upstate New York")')], ['saratoga', 'campaign', 'battle']);
  });

  it('keeps words in parentheses that are part of the answer', () => {
    assert.deepEqual([...answerWords('Chromatic (scale)')], ['chromatic', 'scale']);
    assert.deepEqual([...answerWords('James (Abbot McNeil) Whistler')], ['james', 'abbot', 'mcneil', 'whistler']);
    assert.deepEqual([...answerWords('Translation: (The) Flowers grow (bloom) along the river.')], ['flowers', 'grow', 'bloom', 'along', 'river']);
  });

  it('drops case, accents, possessives, and filler, and keeps numbers whole', () => {
    assert.deepEqual([...answerWords("The Lord's Supper")], ['lord', 'supper']);
    assert.deepEqual([...answerWords('La Bohème')], ['boheme']);
    assert.deepEqual([...answerWords('1/3 pi')], ['1/3', 'pi']);
    assert.deepEqual([...answerWords('H2O')], ['h2o']);
  });
});

describe('sameAnswer', () => {
  it('matches one answer however the sources write it', () => {
    const faulkner = ['William Faulkner', '(William) Faulkner', 'William Cuthbert Faulkner',
      'William Faulkner (accept William Curthbert Faulkner)', 'Faulkner', 'FAULKNER'];
    faulkner.forEach(a => faulkner.forEach(b => assert.ok(sameAnswer(a, b), a + ' / ' + b)));
    assert.ok(sameAnswer('Charles John Huffam Dickens', 'Charles Dickens'));
    assert.ok(sameAnswer('Kurt Vonnegut, Jr.', 'Kurt Vonnegut'));
    assert.ok(sameAnswer('Frankenstein; or, The Modern Prometheus', 'Frankenstein'));
    assert.ok(sameAnswer('Van Gogh (Vincent Van Gogh)', 'Vincent van Gogh'));
    assert.ok(sameAnswer('Walter "Walt" Whitman', '(Walt) Whitman'));
  });

  it('tells different answers apart', () => {
    assert.ok(!sameAnswer('Theodore Roosevelt', 'Franklin Delano Roosevelt'));
    assert.ok(!sameAnswer('Henry VII', 'King Henry VIII Tudor'));
    assert.ok(!sameAnswer('James (Abbot McNeil) Whistler', 'James Joyce [or James Augustine Aloysius Joyce]'));
    assert.ok(!sameAnswer('1/3', '3'));
    assert.ok(!sameAnswer('x-axis', 'y-axis'));
    assert.ok(!sameAnswer('', ''));
  });

  it('reads World Language sentences as sentences, not as "Translation"', () => {
    const ankle = 'Translation: I twisted (did twist) my ankle during the volleyball game.';
    assert.ok(!sameAnswer(ankle, 'Translation: (The) Flowers grow (bloom) along the river.'));
    assert.ok(!sameAnswer(ankle, 'translation (accept polypeptide synthesis)'));
  });
});

describe('answerSet', () => {
  it('remembers what a round has had', () => {
    const answers = answerSet();
    answers.add('William Faulkner [or William Cuthbert Faulkner]');
    answers.add('');
    assert.ok(answers.has('(William) Faulkner'));
    assert.ok(!answers.has('Ernest Hemingway'));
    assert.ok(!answers.has(''));
  });
});
