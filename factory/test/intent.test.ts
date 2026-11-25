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

import { quoted, readLine, respondCard, RESPOND_MARK } from '../lib/respond-view';

test('the respond card says how the comment was read, on what model, and where the run is', () => {
  const card = respondCard({ phase: 'Change', ask: 'the tiles flicker\nplease fix', author: 'sam', issue: 51, read: { intent: 'change', sure: 0.912 }, model: '`deepseek-v4.1-flash` (standard, Jev 68%, est $0.049)', runUrl: 'https://x/run' });
  assert.match(card, /Respond on Vercel · Change/);
  assert.match(card, /✅ Read → \*\*⏳ Change\*\* → Gate → Push → Reply → Preview/);
  assert.match(card, /> the tiles flicker\n> please fix/);
  assert.match(card, /\*\*Asked by:\*\* sam on #51/);
  assert.match(card, /\*\*Read as:\*\* a change to make — Jev, 91% sure/);
  assert.match(card, /\*\*Model:\*\* `deepseek-v4\.1-flash` \(standard, Jev 68%/);
  assert.match(card, /Watch the agent work, live\]\(https:\/\/x\/run\?tab=streams\)/);
  assert.ok(card.includes(RESPOND_MARK) && card.includes('<!-- factory'), 'marked as the factory\'s own, and countable');
});

test('a /fix is not classified; a question skips the gate; the cap counts cards', () => {
  assert.match(readLine(undefined), /explicit request/);
  const done = respondCard({ phase: null, outcome: 'answered', ask: 'why?', author: 'sam', read: { intent: 'question', sure: null }, runUrl: 'u' });
  assert.match(done, /Respond on Vercel · Answered/);
  assert.match(done, /✅ Read → ✅ Change → <s>Gate<\/s> → <s>Push<\/s> → ✅ Reply → <s>Preview<\/s>/);
  assert.match(done, /a question to answer — Jev\n/);
  assert.match(respondCard({ phase: 'Gate', doing: 'Fixing what the gate found', ask: 'x', author: 'sam', runUrl: 'u' }), /Respond on Vercel · Fixing what the gate found/);
  assert.equal(quoted(`a <!-- factory --> b\n${'x\n'.repeat(20)}`).split('\n').length, 6);
  assert.ok(tooManyPickups(Array(MAX_PICKUPS_AN_HOUR).fill(done)));
});

test('a commit the review has judged is not reviewed again when the pull request is marked ready', async () => {
  const { alreadyReviewed } = await import('../lib/intent');
  assert.ok(alreadyReviewed([{ context: 'factory/review', state: 'success' }]));
  assert.ok(alreadyReviewed([{ context: 'factory/verify', state: 'success' }, { context: 'factory/review', state: 'failure' }]));
  assert.ok(!alreadyReviewed([{ context: 'factory/review', state: 'pending' }]));
  assert.ok(!alreadyReviewed([{ context: 'factory/verify', state: 'success' }]));
  assert.ok(!alreadyReviewed(null));
});

test('when the preview of the pushed commit is ready, its link is the first thing on the card', () => {
  const base = { ask: 'x', author: 'sam', runUrl: 'u' };
  const waiting = respondCard({ ...base, phase: 'Preview' });
  assert.match(waiting, /Changed and pushed · building the preview/);
  assert.match(waiting, /✅ Reply → \*\*⏳ Preview\*\*/);
  const done = respondCard({ ...base, phase: null, outcome: 'changed', preview: { url: 'https://p.vercel.app', sha: '0e843ed' } });
  assert.ok(done.indexOf('## 🔎 [Open the preview](https://p.vercel.app)') < done.indexOf('✅ Read'), 'above the phase path');
  assert.match(done, /✅ Reply → ✅ Preview/);
  assert.match(respondCard({ ...base, phase: null, outcome: 'changed', preview: 'late' }), /<s>Preview<\/s>[\s\S]*not ready in time/);
  assert.match(respondCard({ ...base, phase: null, outcome: 'changed', preview: 'none' }), /did not rebuild the app/);
});
