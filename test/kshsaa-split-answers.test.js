// Repairing archive questions the packet parser got wrong
// (server/kshsaa/split-answers.js), on records as they are in the database.
// Run with `npm test`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitRecord } from '../server/kshsaa/split-answers.js';

describe('splitRecord', () => {
  it('leaves a sound record alone', () => {
    const record = { question: 'What World War II battle is considered the turning point in the Pacific War?', answer: 'Battle of Midway' };
    assert.deepEqual(splitRecord(record), [record]);
  });

  it('takes an answer back out of the question', () => {
    assert.deepEqual(splitRecord({
      question: 'What social hierarchy is based on hereditary divisions specified by the Hindu religion in India? Answer: The Caste System 1',
      answer: ''
    }), [{ question: 'What social hierarchy is based on hereditary divisions specified by the Hindu religion in India?', answer: 'The Caste System' }]);
  });

  it('splits questions run together, answers and all', () => {
    const items = splitRecord({
      question: 'Created during World War II, what American intelligence apparatus preceded the CIA? Answer: The Office of Strategic Services (accept OSS) 2 What does the acronym OPEC stand for?',
      answer: 'Oil & Petroleum Exporting Countries 3 What political principle provided for a national government and multiple regional and state governments in the United States? Federalism Page 7 of 68'
    });
    assert.deepEqual(items.map(i => i.answer), ['The Office of Strategic Services (accept OSS)', 'Oil & Petroleum Exporting Countries', 'Federalism']);
    assert.equal(items[1].question, 'What does the acronym OPEC stand for?');
    assert.ok(items[2].question.endsWith('in the United States?'));
  });

  it('splits a run of questions with no "Answer:" between them', () => {
    const items = splitRecord({
      question: 'to indicate certain plurals of lowercase letters',
      answer: 'Apostrophe 2 Name the native Minnesotan who was the first American to win the Nobel Prize for Literature and whose works include Babbitt, Elmer Gantry, and Main Street. (Sinclair) Lewis 3 Who is Edmond Dantes better known as? The Count of Monte Cristo'
    });
    assert.deepEqual(items.map(i => i.answer), ['Apostrophe', '(Sinclair) Lewis', 'The Count of Monte Cristo']);
    assert.equal(items[2].question, 'Who is Edmond Dantes better known as?');
  });

  it('drops page headers, footers, and page numbers', () => {
    const answer = a => splitRecord({ question: 'Q?', answer: a })[0].answer;
    assert.equal(answer('Indonesia Round: Championship 3 / Page: 37 Round: Championship 3'), 'Indonesia');
    assert.equal(answer('(Sigmund) Freud 57 Round: Replacement 07'), '(Sigmund) Freud');
    assert.equal(answer('franchise Round: Consolation Replacement'), 'franchise');
    assert.equal(answer('Selfie stick Page 62 of 68'), 'Selfie stick');
    assert.equal(answer('Translation: I used to go to Germany every year. Language Arts'), 'Translation: I used to go to Germany every year.');
  });

  it('keeps numbers that belong to the answer', () => {
    assert.equal(splitRecord({ question: 'Q?', answer: 'Two cubed times 19' }, { numeric: true })[0].answer, 'Two cubed times 19');
    assert.equal(splitRecord({ question: 'Q?', answer: 'Clause 18 of Article I, Section 8' })[0].answer, 'Clause 18 of Article I, Section 8');
    assert.equal(splitRecord({ question: 'Q?', answer: 'the Museum of Fine Arts' })[0].answer, 'the Museum of Fine Arts');
  });

  it('finds a World Language translation left in the question', () => {
    assert.deepEqual(splitRecord({
      question: 'FRENCH Aujourd\'hui il fait très chaud. GERMAN Heute ist es sehr heiß. SPANISH Hoy hace mucho calor. Translation: Today it is very hot.',
      answer: ''
    }), [{ question: 'FRENCH Aujourd\'hui il fait très chaud. GERMAN Heute ist es sehr heiß. SPANISH Hoy hace mucho calor.', answer: 'Translation: Today it is very hot.' }]);
  });

  it('keeps the corrected copy of a question printed twice', () => {
    const items = splitRecord({
      question: 'Which religious leader did Pope Francis meet with in Cuba, the first such meeting since 1954? Answer: Patriarch Kirill 2 Which religious leader did Pope Francis meet with in Cuba, the first such meeting since 1054? Answer: Patriarch Kirill',
      answer: ''
    });
    assert.equal(items.length, 1);
    assert.ok(items[0].question.endsWith('since 1054?'));
  });

  it('leaves an answer empty where there is none to find', () => {
    assert.deepEqual(splitRecord({ question: 'What is the largest Arabic-speaking country in terms of population?', answer: '' }),
      [{ question: 'What is the largest Arabic-speaking country in terms of population?', answer: '' }]);
  });
});
