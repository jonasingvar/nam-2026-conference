import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * What every spec imports `test` and `expect` from. Plain Playwright, unless
 * the factory is building its test map (`scripts/test-map.mjs build`, which
 * sets ORBIT_COVERAGE): then each test records which source files it ran —
 * the browser's from Chromium's JS coverage, the API's from the coverage
 * agent the map's server was started with — so a pull request can run the
 * tests that reach what it changed instead of the whole suite.
 */
const DIR = process.env.ORBIT_COVERAGE;
const AGENT = process.env.ORBIT_COVERAGE_AGENT;
const ROOT = process.cwd();

/** The browser side of the test now running: src files its page executed. */
let browserFiles = [];

const take = async () => {
  if (!AGENT) return [];
  try { return await (await fetch(`${AGENT}/take`)).json(); } catch { return []; }
};

export const test = !DIR ? base : base.extend({
  // An auto fixture, so a test that uses only `request` is recorded too. It is
  // set up first and torn down last, after the page below has handed over.
  _coverage: [async ({}, use, testInfo) => {
    browserFiles = [];
    await take(); // whatever ran before this test is not this test's
    await use();
    const server = await take();
    const record = {
      project: testInfo.project.name,
      file: relative(join(ROOT, 'tests'), testInfo.file),
      title: testInfo.titlePath.slice(1).join(' › '),
      status: testInfo.status,
      files: [...new Set([...browserFiles, ...server])].sort(),
    };
    mkdirSync(join(DIR, 'browser'), { recursive: true });
    writeFileSync(join(DIR, 'browser', `${testInfo.project.name}-${testInfo.testId}.json`), JSON.stringify(record));
  }, { auto: true }],
  page: async ({ page }, use) => {
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    const { executedFiles } = await import('../scripts/test-map.mjs');
    browserFiles = executedFiles(await page.coverage.stopJSCoverage(), ROOT);
  },
});

export { expect };
