import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Workflow build only registers a step whose directive is on a line of its
// own: `{ 'use step'; return … }` compiles locally, then fails on Vercel with
// "not registered in the current deployment" (#16 crashed twice on it).
test("every 'use step' and 'use workflow' directive is on a line of its own", () => {
  const bad: string[] = [];
  for (const dir of ['lib', 'workflows']) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        if (/['"]use (step|workflow)['"]/.test(line) && !/^\s*['"]use (step|workflow)['"];?\s*$/.test(line) && !/^\s*(\/\/|\*)/.test(line)) bad.push(`${dir}/${f}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(bad, []);
});
