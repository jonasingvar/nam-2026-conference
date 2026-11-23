import { test } from 'node:test';
import assert from 'node:assert/strict';
import { group, shortName, totals } from '../lib/runs';
import { mayView, openSession, sealSession } from '../lib/session';

const t = (m: number) => new Date(Date.UTC(2026, 10, 23, 18, m));

test('children group under their root ship run and their spend adds up', () => {
  const g = group([
    { runId: 'ship1', status: 'running', workflowName: 'workflow//./workflows/ship//ship', createdAt: t(0), attributes: { issue: '16', spend_usd: '1.20', phase: 'Review & QA' } },
    { runId: 'rev1', status: 'completed', workflowName: 'workflow//./workflows/review//review', createdAt: t(20), completedAt: t(25), attributes: { $rootRunId: 'ship1', $parentRunId: 'ship1', spend_usd: '0.30', verdict: 'approve' } },
    { runId: 'qa1', status: 'completed', workflowName: 'workflow//./workflows/qa//qa', createdAt: t(19), completedAt: t(30), attributes: { $rootRunId: 'ship1', spend_usd: '0.25' } },
    { runId: 'ver1', status: 'completed', workflowName: 'workflow//./workflows/verify//verify', createdAt: t(40), attributes: { pr: '30' } },
  ], t(45).getTime());
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.runId), ['ver1', 'ship1']);
  const ship = g[1];
  assert.deepEqual(ship.children.map((c) => c.workflow), ['qa', 'review']);
  assert.equal(ship.total.toFixed(2), '1.75');
  assert.equal(ship.children[1].outcome, 'approve');
  assert.equal(ship.minutes, 45);
});

test('a child whose root fell out of the window is shown on its own', () => {
  const g = group([{ runId: 'qa2', status: 'completed', workflowName: 'qa', createdAt: t(0), attributes: { $rootRunId: 'gone' } }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].workflow, 'qa');
});

test('failed and handed-back runs are flagged for a person', () => {
  const g = group([
    { runId: 'a', status: 'failed', workflowName: 'ship', createdAt: t(0) },
    { runId: 'b', status: 'completed', workflowName: 'ship', createdAt: t(1), attributes: { outcome: 'needs-human' } },
    { runId: 'c', status: 'completed', workflowName: 'ship', createdAt: t(2), attributes: { outcome: 'merged' } },
  ]);
  assert.equal(totals(g).needsPerson, 2);
  assert.equal(shortName('workflow//./workflows/ship//ship'), 'ship');
});

test('a session cookie opens only with its secret, before it expires', () => {
  const now = Date.UTC(2026, 10, 23);
  const c = sealSession('jonasingvar', 's3cret', now);
  assert.equal(openSession(c, 's3cret', now + 1000), 'jonasingvar');
  assert.equal(openSession(c, 'other', now), null);
  assert.equal(openSession(c, 's3cret', now + 13 * 3600_000), null);
  assert.equal(openSession(c.replace(/^./, 'x'), 's3cret', now), null);
  assert.equal(openSession(undefined, 's3cret'), null);
  assert.equal(openSession(c, undefined), null);
});

test('only listed viewers get in; an empty list admits nobody', () => {
  assert.equal(mayView('JonasIngvar', 'jonasingvar, someone'), true);
  assert.equal(mayView('stranger', 'jonasingvar'), false);
  assert.equal(mayView('jonasingvar', ''), false);
  assert.equal(mayView(null, 'jonasingvar'), false);
});
