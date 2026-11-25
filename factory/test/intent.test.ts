import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actsOn, explicitAsk, INTENTS, MAX_PICKUPS_AN_HOUR, tooManyPickups } from '../lib/intent';

test('/fix and @claude carry the request, without the command', () => {
  assert.equal(explicitAsk('/fix load the tiles and my day at once'), 'load the tiles and my day at once');
  assert.equal(explicitAsk('@claude why a new helper?'), 'why a new helper?');
  assert.equal(explicitAsk('please /fix the flicker'), 'please the flicker');
  assert.equal(explicitAsk('/fix'), '');
});

test('a plain comment has no explicit ask — Jev reads it', () => {
  assert.equal(explicitAsk("I don't like how it shows all the tiles first, then it flickers."), null);
  assert.equal(explicitAsk('see /fixtures for the data'), null);
});

test('the factory acts on a change or a question it is sure of, and on nothing else', () => {
  assert.ok(actsOn('change', 0.9));
  assert.ok(actsOn('question', 0.6));
  assert.ok(!actsOn('change', 0.59));
  assert.ok(!actsOn('none', 0.99));
  assert.ok(!actsOn(null, null), 'Jev unavailable: left alone');
  assert.ok(!actsOn('change', null));
});

test('every intent Jev may choose has a criterion', () => {
  assert.deepEqual(Object.keys(INTENTS).sort(), ['change', 'none', 'question']);
});

test('past the hourly cap, plain comments wait for a /fix', () => {
  const on = '👀 On it — asked by someone · [run](https://x)';
  assert.ok(!tooManyPickups(Array(MAX_PICKUPS_AN_HOUR - 1).fill(on)));
  assert.ok(tooManyPickups(Array(MAX_PICKUPS_AN_HOUR).fill(on)));
  assert.ok(!tooManyPickups(Array(20).fill('Looks good to me')));
});
