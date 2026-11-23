import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOCK_CONFIDENCE, CONFIDENCE, MAX_CHECKED, composeReview, dismissNumbers, listed, settle, toCheck, wasDismissed,
  type Raised, type SkepticVerdict,
} from '../lib/review-policy.ts';
import { dismissalsFrom } from '../lib/github-steps.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/review-false-positives.json', import.meta.url), 'utf8'));
const certain: SkepticVerdict = { verdict: 'confirmed', why: 'ran it', confidence: 0.99, executed: true };
const verdictOf = (blockers: Raised[]) => (blockers.length ? 'blocker' : 'pass');

test('past false positives never block again, even when a skeptic is certain of them', () => {
  for (const c of fixtures.cases) {
    const { checked } = toCheck([c.finding]);
    const s = settle(checked, checked.map(() => certain));
    assert.equal(verdictOf(s.blockers), 'pass', c.source);
  }
});

test('…while a real, demonstrated, certain blocker still blocks', () => {
  const f = fixtures.control.finding;
  assert.equal(verdictOf(settle([f], [certain]).blockers), 'blocker');
});

test('a test gap is never a blocker; once shown, it is polish for the fixer', () => {
  const gap: Raised = { ...fixtures.cases[0].finding };
  const s = settle([gap], [certain]);
  assert.deepEqual([s.blockers.length, s.suggestions.length, s.polish.length], [0, 0, 1]);
});

test(`a finding at 0.9 confidence can never block — the bar is ${BLOCK_CONFIDENCE}, for the lens and its skeptic both`, () => {
  const f: Raised = { ...fixtures.control.finding, confidence: 0.9 };
  assert.equal(verdictOf(settle([f], [certain]).blockers), 'pass');
  assert.equal(settle([f], [certain]).suggestions.length, 1, 'verified, so still worth a look');
  const g: Raised = { ...fixtures.control.finding };
  assert.equal(verdictOf(settle([g], [{ ...certain, confidence: 0.9 }]).blockers), 'pass', 'an unsure skeptic does not block either');
  assert.equal(verdictOf(settle([g], [{ ...certain, executed: false }]).blockers), 'pass', 'reasoned, not executed');
});

test('a blocker needs how, harm and a demonstration from its lens; a hypothetical harm is not enough', () => {
  const f: Raised = fixtures.control.finding;
  for (const weak of [{ how: '' }, { harm: '' }, { demonstrated: false }]) assert.equal(verdictOf(settle([{ ...f, ...weak }], [certain]).blockers), 'pass');
});

test('anything its skeptic could not demonstrate is dropped, not demoted — suggestions included', () => {
  const f: Raised = fixtures.control.finding;
  const sug: Raised = { severity: 'follow-up', category: 'logic', file: 'src/x.js', line: 3, claim: 'an empty list renders nothing', evidence: 'ran it', confidence: 0.9 };
  for (const v of [null, { verdict: 'unproven', why: '' }, { verdict: 'refuted', why: '' }] as SkepticVerdict[]) {
    const s = settle([f, sug], [v, v]);
    assert.deepEqual([s.blockers.length, s.suggestions.length, s.polish.length], [0, 0, 0]);
  }
  assert.equal(settle([sug], [{ verdict: 'contrived', why: 'only with a hand-edited URL', confidence: 0.9, executed: true }]).suggestions.length, 1, 'contrived is real: a suggestion');
});

test('precision over recall: low-confidence findings never reach a skeptic, and only a few are checked', () => {
  const many: Raised[] = Array.from({ length: 10 }, (_, i) => ({ severity: 'follow-up', category: 'logic', file: `src/${i}.js`, claim: `claim ${i}`, evidence: 'e', confidence: 0.85 }));
  const low: Raised = { severity: 'blocker', category: 'logic', file: 'src/low.js', claim: 'maybe', evidence: 'e', confidence: CONFIDENCE - 0.01 };
  const { checked } = toCheck([low, ...many]);
  assert.equal(checked.length, MAX_CHECKED);
  assert.ok(!checked.includes(low));
  const top = toCheck([...many, fixtures.control.finding]).checked[0];
  assert.equal(top.file, fixtures.control.finding.file, 'what may block is checked first');
});

test('a finding a person dismissed is not raised again, on any pull request', () => {
  const review = (pr: number, at: string, minus: number, marker: object) => ({
    issue_url: `https://api.github.com/repos/x/y/issues/${pr}`, created_at: at, reactions: { '-1': minus },
    body: `> [!CAUTION]\n<!-- factory-verdict:review ${JSON.stringify(marker)} -->`,
  });
  const b = fixtures.cases[0].finding;
  const s = { category: 'logic', file: 'src/a.js', line: 10, claim: 'the empty state shows a spinner forever' };
  const comments = [
    review(30, '2026-11-23T20:35:00Z', 1, { blockers: [b], listed: listed([b], [{ ...s, severity: 'follow-up', evidence: '' }]) }),
    review(31, '2026-11-23T21:00:00Z', 0, { blockers: [], listed: listed([], [{ ...s, file: 'src/b.js', severity: 'follow-up', evidence: '' }]) }),
    { issue_url: 'https://api.github.com/repos/x/y/issues/31', created_at: '2026-11-23T21:05:00Z', body: 'that is wrong — /dismiss 1', reactions: {} },
  ];
  const d = dismissalsFrom(comments);
  assert.deepEqual(d.map((x) => [x.pr, x.file]), [[30, 'tests/agenda.spec.js'], [31, 'src/b.js']], 'a 👎 dismisses the blockers; /dismiss 1 its first finding');
  assert.ok(wasDismissed({ ...b, line: 86, claim: 'The removal check cannot fail on the flag: it removes the flagged row itself' }, d));
  assert.ok(!wasDismissed({ ...b, file: 'tests/other.spec.js' }, d));
  assert.equal(toCheck([{ ...b }], d).checked.length, 0);
  assert.deepEqual(dismissNumbers('/dismiss 1, 3'), [1, 3]);
  assert.deepEqual(dismissNumbers('please /dismissal'), []);
});

test('the comment: an approval is green, every blocker sits inside the callout with its confidence, the footer links render', () => {
  const f: Raised = { ...fixtures.control.finding, skepticConfidence: 0.99 };
  const footer = '🏭 Factory review · [run](https://vercel.com/x)';
  const blocked = composeReview({ pass: false, confidence: 'high', summary: 's', blockers: [f, { ...f, line: 70 }], suggestions: [], footer, marker: {} });
  const callout = blocked.split('\n\n')[0];
  assert.match(callout, /^> \[!CAUTION\]/);
  assert.equal((callout.match(/^> 2\. \*\*orchestration\*\*/m) || []).length, 1, 'the second blocker is inside the quote');
  assert.match(callout, /confidence 0\.98, skeptic 0\.99/);
  assert.match(blocked, /\n\n<sub>🏭 Factory review · \[run\]\(https:\/\/vercel\.com\/x\)/, 'the footer is its own paragraph');
  const approved = composeReview({ pass: true, confidence: 'medium', summary: 's', blockers: [], suggestions: [{ ...f, severity: 'follow-up' }], footer, marker: {} });
  assert.match(approved, /^> \[!TIP\]\n> ### Code review · approved with 1 suggestion/);
  assert.match(approved, /<\/details>\n\n<sub>/, 'a link after an HTML block renders');
});
