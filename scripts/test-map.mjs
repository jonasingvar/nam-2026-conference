/**
 * The test map: which tests run which source files — what lets CI run the
 * tests a pull request's change reaches instead of the whole suite.
 *
 *   node scripts/test-map.mjs build          # run every test with coverage; write test-results/test-map.json
 *   node scripts/test-map.mjs facts <base> [map.json]   # for this diff: changed files, the specs its
 *                                            # imports reach, the map's candidates, the tests at HEAD
 *
 * `build` runs each unit and API test file on its own under V8 coverage
 * (NODE_V8_COVERAGE), then the browser suite one test at a time, with
 * Chromium's JS coverage for the page and the coverage agent
 * (`scripts/coverage-agent.mjs`) for the API it talks to — one test at a
 * time because the API is one process, and coverage taken between tests is
 * only one test's when nothing else is running. A file counts as run when one
 * of its functions ran, not when it was loaded: the dev server loads every
 * page on every test.
 *
 * The factory builds the map on pushes to main and keeps it in Blob
 * (`test-map/<sha>.json`); `facts` is what verify reads before it chooses.
 * What a map cannot see — CSS, seed data, config, a route table — the
 * selector in the factory adds; a map that is missing or stale widens the run.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
export const PROJECTS = ['desktop', 'mobile'];
/** Source files the map tracks: what a change to can break a test. */
export const CODE = /^(src|server|api)\/.*\.(jsx?|mjs|cjs)$/;
/** Code the dev server adds to a module, not the module's own. */
const HMR = /RefreshRuntime|\$RefreshReg\$|\$RefreshSig\$|import\.meta\.hot|__vite__/;
/** What the map describes: a commit touching none of these leaves it current. */
const APP_PATHS = ['src', 'server', 'api', 'tests', 'index.html', 'package-lock.json', 'vite.config.js', 'playwright.config.js'];

/** A coverage entry's URL → its repo path, or null (a dependency, a virtual module). */
export function fileOfUrl(url, root) {
  let path = null;
  if (url.startsWith('file://')) {
    const abs = fileURLToPath(url);
    if (!abs.startsWith(`${root}/`)) return null;
    path = relative(root, abs);
  } else if (/^https?:\/\//.test(url)) {
    path = new URL(url).pathname.replace(/^\//, '');
  } else return null;
  path = decodeURIComponent(path);
  return CODE.test(path) ? path : null;
}

/**
 * V8 coverage (Chromium's, NODE_V8_COVERAGE's or the inspector's — the same
 * shape) → the repo files with a function that ran. A module's own top level
 * does not count: loading a module is not running it.
 */
export function executedFiles(entries, root) {
  const out = new Set();
  for (const e of entries || []) {
    const file = fileOfUrl(e.url || '', root);
    if (!file || out.has(file)) continue;
    const ran = (e.functions || []).some((f) => {
      const r = f.ranges?.[0];
      if (!r || !r.count) return false;
      if (f.functionName === '' && r.startOffset === 0) return false;
      // Vite's dev server appends React Fast Refresh code to every module, and
      // its callback runs on load — on every page, for every module.
      return !(e.source && HMR.test(e.source.slice(r.startOffset, r.endOffset)));
    });
    if (ran) out.add(file);
  }
  return [...out].sort();
}

/**
 * The map, kept small: each test named once, each file pointing at indexes.
 * `unit`: [{ test: 'tests/unit/x.test.js', files }]. `browser`: the records
 * tests/fixtures.js wrote — { project, file, title, files }.
 */
export function buildMap({ sha, known, unit, browser, seconds }) {
  const tests = { unit: [], desktop: [], mobile: [] };
  const files = {};
  const add = (kind, name, ran) => {
    let i = tests[kind].indexOf(name);
    if (i < 0) { tests[kind].push(name); i = tests[kind].length - 1; }
    for (const f of ran) {
      files[f] ??= {};
      (files[f][kind] ??= []).includes(i) || files[f][kind].push(i);
    }
  };
  for (const u of unit) add('unit', u.test, u.files);
  for (const b of browser) if (tests[b.project]) add(b.project, `${b.file} › ${b.title}`, b.files);
  return { version: 1, sha, builtAt: new Date().toISOString(), seconds, known: [...known].sort(), tests, files };
}

/** The relative imports in a module's text, resolved to repo paths (each with the endings it may have). */
function importsIn(file, text) {
  const dir = file.split('/').slice(0, -1);
  const out = new Set();
  for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const parts = [...dir];
    for (const seg of m[1].split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
    const path = parts.join('/');
    for (const end of ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']) out.add(path + end);
  }
  return out;
}

/**
 * The new files a change itself brings in: a file the map has never seen that
 * a changed file the map does know imports — directly, or through another
 * such new file. Its code can only run where that importer runs, and the map
 * has measured the importer, so the importer's tests stand for it. On #51 one
 * new 24-line helper, imported by the page the ticket changed, sent the gate
 * to all 98 browser tests. A new file nothing changed imports (a route found
 * by scanning a folder, an entry point) stays unmapped: nothing vouches for it.
 */
export function carriedBy(changed, known, sources) {
  const imports = new Map(changed.map((f) => [f, importsIn(f, sources.get(f) || '')]));
  const carried = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const f of changed) {
      if (known.has(f) || carried.has(f)) continue;
      if (changed.some((g) => g !== f && (known.has(g) || carried.has(g)) && imports.get(g).has(f))) { carried.add(f); grew = true; }
    }
  }
  return carried;
}

/**
 * The map's candidates for a change: per project, spec file → the titles
 * that ran a changed file; the unit and API files that did; which changed
 * files reach each spec (the status's "these reach …"); and the changed code
 * files the map has never seen — new, so nothing can be said about them.
 * `sources` (changed file → its text) lets a new file be vouched for: see `carriedBy`.
 */
export function candidatesFor(map, changed, sources = new Map()) {
  const out = { desktop: {}, mobile: {}, unit: [], reach: {}, unmapped: [] };
  const known = new Set(map.known || []);
  const carried = carriedBy(changed.filter((f) => CODE.test(f)), known, sources);
  for (const f of changed) {
    if (!CODE.test(f)) continue;
    if (carried.has(f)) continue;
    if (!known.has(f)) { out.unmapped.push(f); continue; }
    const e = map.files?.[f];
    if (!e) continue;
    for (const i of e.unit || []) if (!out.unit.includes(map.tests.unit[i])) out.unit.push(map.tests.unit[i]);
    for (const p of PROJECTS) {
      for (const i of e[p] || []) {
        const name = map.tests[p][i];
        const cut = name.indexOf(' › ');
        const spec = `tests/${name.slice(0, cut)}`;
        const title = name.slice(cut + 3);
        (out[p][spec] ??= []).includes(title) || out[p][spec].push(title);
        (out.reach[spec] ??= []).includes(f) || out.reach[spec].push(f);
      }
    }
  }
  out.unit.sort();
  return out;
}

/** `playwright test --list --reporter=json` → per project, every test: spec, line, title (describes › title). */
export function listedTests(report) {
  const out = { desktop: [], mobile: [] };
  const walk = (suite, titles) => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        if (!out[t.projectName]) continue;
        out[t.projectName].push({ spec: `tests/${spec.file}`, line: spec.line, title: [...titles, spec.title].join(' › ') });
      }
    }
    for (const s of suite.suites || []) walk(s, [...titles, s.title]);
  };
  // The top suites are files: their title is the file name, not a describe.
  for (const s of report.suites || []) walk(s, []);
  return out;
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

function listTests() {
  const r = spawnSync('npx', ['playwright', 'test', '--list', '--reporter=json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try { return listedTests(JSON.parse(r.stdout)); } catch { return null; }
}

/** The diff's facts, for the factory's selection: one JSON line. */
async function facts(base, mapFile) {
  const { affectedSpecs, fastFallback, readRepo, deckTouched } = await import('./gate.mjs');
  const changed = git('diff', '--name-only', '--diff-filter=d', `${base}...HEAD`).split('\n').filter(Boolean);
  const repo = readRepo();
  const reached = affectedSpecs(changed, repo);
  let map = null;
  if (mapFile && existsSync(mapFile)) {
    try {
      const m = JSON.parse(readFileSync(mapFile, 'utf8'));
      // Stale is measured in commits that changed what the map describes: a docs or factory commit moves nothing.
      let behind = null;
      try { behind = Number(git('rev-list', '--count', `${m.sha}..${base}`, '--', ...APP_PATHS)); } catch { /* not in this history */ }
      const sources = new Map(changed.filter((f) => CODE.test(f)).map((f) => { try { return [f, readFileSync(join(ROOT, f), 'utf8')]; } catch { return [f, '']; } }));
      map = { sha: m.sha, builtAt: m.builtAt, behind, ...candidatesFor(m, changed, sources) };
    } catch { map = null; }
  }
  return { changed, static: reached, branch: reached || fastFallback(changed), deck: deckTouched(changed.join('\n')), tests: listTests(), map };
}

/** Start the API (with the coverage agent) and Vite, and wait for the web port. */
async function startApp(env) {
  const api = spawn('node', ['--import', './scripts/coverage-agent.mjs', 'server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
  const web = spawn('npx', ['vite', '--strictPort'], { cwd: ROOT, env, stdio: 'ignore' });
  const url = `http://localhost:${env.WEB_PORT}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok && (await fetch(`http://localhost:${env.PORT}/api/health`)).ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return () => { api.kill(); web.kill(); };
}

async function build() {
  const t0 = Date.now();
  const out = join(ROOT, 'test-results', 'coverage');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // Unit and API: each file on its own, so its coverage is its own.
  const unit = [];
  const files = ['tests/unit', 'tests/api'].flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.test.js')).map((f) => `${d}/${f}`));
  for (const test of files) {
    const dir = join(out, 'v8', test.replace(/\W+/g, '_'));
    spawnSync('node', ['--test', test], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NODE_V8_COVERAGE: dir } });
    const entries = existsSync(dir) ? readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).result || []) : [];
    unit.push({ test, files: executedFiles(entries, ROOT) });
  }
  const unitSeconds = Math.round((Date.now() - t0) / 1000);

  // Browser: one test at a time against an app whose API reports its coverage.
  const env = { ...process.env, PORT: process.env.PORT || '3001', WEB_PORT: process.env.WEB_PORT || '5173', NO_OPEN: '1', ORBIT_COVERAGE_PORT: process.env.ORBIT_COVERAGE_PORT || '3999' };
  spawnSync('npm', ['run', 'db:seed', '--silent'], { cwd: ROOT, stdio: 'ignore', env });
  const stop = await startApp(env);
  try {
    // TEST_MAP_SPECS / TEST_MAP_PROJECT narrow a run, for trying the map out on one spec.
    const only = (process.env.TEST_MAP_SPECS || '').split(/\s+/).filter(Boolean);
    spawnSync('npx', ['playwright', 'test', ...only, '--workers=1', '--retries=0', '--reporter=json', ...(process.env.TEST_MAP_PROJECT ? [`--project=${process.env.TEST_MAP_PROJECT}`] : [])], {
      cwd: ROOT, stdio: 'ignore',
      env: { ...env, ORBIT_COVERAGE: out, ORBIT_COVERAGE_AGENT: `http://127.0.0.1:${env.ORBIT_COVERAGE_PORT}`, ORBIT_REUSE_SERVER: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: join(out, 'playwright.json') },
    });
  } finally { stop(); }
  const bdir = join(out, 'browser');
  const browser = existsSync(bdir) ? readdirSync(bdir).map((f) => JSON.parse(readFileSync(join(bdir, f), 'utf8'))) : [];

  const known = git('ls-files', 'src', 'server', 'api').split('\n').filter((f) => CODE.test(f));
  const seconds = Math.round((Date.now() - t0) / 1000);
  const map = buildMap({ sha: git('rev-parse', 'HEAD'), known, unit, browser, seconds });
  writeFileSync(join(ROOT, 'test-results', 'test-map.json'), JSON.stringify(map));
  const failed = browser.filter((b) => b.status !== 'passed' && b.status !== 'skipped').length;
  console.log(JSON.stringify({ ok: browser.length > 0, sha: map.sha, seconds, unitSeconds, unit: unit.length, browser: browser.length, failed, files: Object.keys(map.files).length, bytes: JSON.stringify(map).length }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'build') await build();
  else if (cmd === 'facts') console.log(JSON.stringify(await facts(args[0] || 'origin/main', args[1])));
  else { console.error('usage: node scripts/test-map.mjs build | facts <base> [map.json]'); process.exit(2); }
}
