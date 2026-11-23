import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * CLAUDE.md's "Where work is tracked" section, read as text: an agent must be
 * able to answer "which tracker, and how do I talk to it" from context alone,
 * and label conventions must be linked, not restated.
 */

const root = new URL('../../', import.meta.url);
const claude = readFileSync(new URL('CLAUDE.md', root), 'utf8');
const section = () => {
  const m = claude.match(/^## Where work is tracked\n([\s\S]*?)(?=^## )/m);
  assert.ok(m, 'CLAUDE.md has a "Where work is tracked" section');
  return m[1];
};

describe('tracker access in the AI context', () => {
  test('names the tracker, the repository, and that the original is never written to', () => {
    const s = section();
    assert.match(s, /GitHub Issues/);
    // This is a personal repository now, not a workshop fork: it names itself,
    // and names the original only to say nothing writes there.
    assert.match(s, /jonasingvar\/nam-2026-conference/);
    assert.match(s, /never the workshop's original \(`EqualExperts\/nam-2026-conference`\)/);
    assert.match(s, /`gh`/);
    assert.match(s, /read-only/i);
    assert.match(s, /never create a test ticket/i);
  });

  test('names the MCP server and REST-with-token alternatives', () => {
    const s = section();
    assert.match(s, /MCP/);
    assert.match(s, /REST/);
  });

  test('links the label docs instead of restating labels', () => {
    const s = section();
    assert.ok(s.includes('context/engineering-context/harness/github.md'));
    for (const label of ['ai-working', 'needs-human', 'ready-for-human', 'ship:full']) {
      assert.ok(!s.includes(label), `${label} is not restated`);
    }
  });
});
