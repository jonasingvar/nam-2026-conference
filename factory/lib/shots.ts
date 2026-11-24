/**
 * Screenshots for a pull request: which pages to shoot, the script that
 * shoots them in the sandbox, and the comment that shows them. Pure — the
 * workflow VM loads it — so no Node imports here; the upload is a step
 * (lib/shots-steps.ts).
 */

export type Shot = { path: string; label: string };

/** A route with `:id` gets a real seeded id; 1 exists for sessions and speakers. */
const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, '1');

/** `<Route path="x" element={<XPage />} />` and `<Route index element={<HomePage />} />` from src/App.jsx. */
export function routesFrom(app: string): Record<string, string> {
  const byComponent: Record<string, string> = {};
  for (const m of app.matchAll(/<Route\s+(index|path="([^"]+)")\s+element=\{<(\w+)/g)) {
    const [, index, path, component] = m;
    if (component === 'Navigate' || path === '*') continue;
    byComponent[component] ??= index === 'index' ? '/' : `/${concrete(path)}`;
  }
  return byComponent;
}

/**
 * The pages a change shows up on. A changed page is shot directly; a changed
 * component, hook or style is shot on the pages that import it; a UI change
 * that maps to no page is shot on the home page. At most four pages.
 *
 * `pageImports` maps a page file (src/pages/X.jsx) to the module paths it imports.
 */
export function choosePages(changed: string[], app: string, pageImports: Record<string, string[]>, max = 4): Shot[] {
  const ui = changed.filter((f) => /^src\/.*\.(jsx?|tsx?|css)$/.test(f) && !/\.test\./.test(f));
  if (!ui.length) return [];
  const routes = routesFrom(app);
  const routeOfPage = (file: string) => routes[(/src\/pages\/(\w+)\.\w+$/.exec(file) || [])[1] ?? ''];
  const picked = new Map<string, Shot>();
  const add = (path: string | undefined, why: string) => {
    if (path && !picked.has(path)) picked.set(path, { path, label: why });
  };
  for (const f of ui) if (f.startsWith('src/pages/')) add(routeOfPage(f), f.replace(/^src\/pages\//, ''));
  for (const f of ui.filter((x) => !x.startsWith('src/pages/'))) {
    const stem = (/([^/]+)\.\w+$/.exec(f) || [])[1];
    for (const [page, imports] of Object.entries(pageImports)) {
      if (imports.some((i) => (/([^/]+?)(\.\w+)?$/.exec(i) || [])[1] === stem)) add(routeOfPage(page), `uses ${f.replace(/^src\//, '')}`);
    }
  }
  if (!picked.size) add('/', 'home (the change maps to no single page)');
  return [...picked.values()].slice(0, max);
}

/** In the sandbox, from the checkout: changed files, src/App.jsx and each page's imports, as result.json. */
export const pagesScript = (base: string) => [
  `CHANGED=$(git diff --name-only origin/${base}...HEAD | paste -sd, -)`,
  `CHANGED="$CHANGED" node -e '`,
  `const fs=require("fs"),p=require("path");`,
  `const pages={};for(const f of fs.readdirSync("src/pages"))pages["src/pages/"+f]=[...fs.readFileSync(p.join("src/pages",f),"utf8").matchAll(/from\\s+["\\x27]([^"\\x27]+)["\\x27]/g)].map(m=>m[1]);`,
  `fs.writeFileSync(process.env.JOB+"/result.json",JSON.stringify({changed:(process.env.CHANGED||"").split(",").filter(Boolean),app:fs.readFileSync("src/App.jsx","utf8"),pageImports:pages}))'`,
].join('\n');

export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scale: 1, mobile: false },
  { name: 'mobile', width: 393, height: 852, scale: 2, mobile: true },
] as const;

/**
 * In the sandbox: shoot each page on each viewport, on the PR's preview
 * ("after") and on the base's deployment ("before"), as Jonas (attendee 1, a
 * full agenda with clashes) with the clock pinned to Day 1, 10:30 — the same
 * way the Playwright specs open a page (tests/helpers.js `visit`).
 */
export function captureScript(pages: Shot[], after: string, before: string | null) {
  const cfg = JSON.stringify({ pages, after, before, viewports: VIEWPORTS });
  return [
    `mkdir -p "$JOB/shots"`,
    `cat > "$JOB/capture.cjs" <<'JS'`,
    `const { createRequire } = require('module');`,
    `const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');`,
    `const fs = require('fs');`,
    `const cfg = ${cfg};`,
    `(async () => {`,
    `  const browser = await chromium.launch();`,
    `  const out = [];`,
    `  for (const [which, base] of [['after', cfg.after], ['before', cfg.before]]) {`,
    `    if (!base) continue;`,
    `    let at = null;`,
    `    try { const b = await (await fetch(base + '/api/bootstrap')).json(); at = b.days[0].date + 'T10:30'; } catch {}`,
    `    for (const pg of cfg.pages) for (const v of cfg.viewports) {`,
    `      const file = pg.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';`,
    `      const name = file + '-' + v.name + '-' + which + '.png';`,
    `      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale, isMobile: v.mobile, hasTouch: v.mobile, ignoreHTTPSErrors: true });`,
    `      await ctx.addInitScript(({ at }) => { localStorage.setItem('orbit:currentUserId', '1'); if (at) localStorage.setItem('orbit:clockAt', at); }, { at });`,
    `      const page = await ctx.newPage();`,
    `      try {`,
    `        const res = await page.goto(base + pg.path, { waitUntil: 'networkidle', timeout: 45000 });`,
    `        await page.getByRole('banner').waitFor({ timeout: 15000 }).catch(() => {});`,
    `        await page.waitForTimeout(600);`,
    `        const full = name.replace(/\\.png$/, '-full.png');`,
    `        await page.screenshot({ path: process.env.JOB + '/shots/' + name });`,
    `        await page.screenshot({ path: process.env.JOB + '/shots/' + full, fullPage: true });`,
    `        out.push({ path: pg.path, viewport: v.name, which, file: name, full, status: res ? res.status() : 0 });`,
    `      } catch (e) { out.push({ path: pg.path, viewport: v.name, which, error: String(e && e.message || e).slice(0, 200) }); }`,
    `      await ctx.close();`,
    `    }`,
    `  }`,
    `  await browser.close();`,
    `  fs.writeFileSync(process.env.JOB + '/result.json', JSON.stringify({ dir: process.env.JOB + '/shots', shots: out }));`,
    `})().catch((e) => { fs.writeFileSync(process.env.JOB + '/result.json', JSON.stringify({ error: String(e && e.message || e).slice(0, 300), shots: [] })); });`,
    `JS`,
    `node "$JOB/capture.cjs"`,
  ].join('\n');
}

export type Uploaded = { path: string; viewport: string; which: string; url?: string; full?: string; error?: string };

/**
 * The pull request's screenshots comment. Per page, a table with a column for
 * the base (when there is one) and one for this PR, and a Desktop row and a
 * Mobile row. Every image is viewport-sized, so a row's images are the same
 * height and line up; each links to its full-page shot. Widths fit GitHub's
 * ~880px comment column: two desktop shots at 420 and two mobile at 220, or
 * one larger column when there is nothing to compare with. Pages after the
 * first fold into <details>.
 */
/**
 * A pull request's description with "try it" at its top — or, with no url, without it: a change
 * to the factory or the docs has nothing for a person to try on the app's preview. A marked block,
 * replaced in place, so ship rewriting the body or the next push re-pinning it never stacks two.
 */
export function withPreview(body: string, url: string | null, sha = ''): string {
  const rest = body.replace(/<!-- factory-preview -->[\s\S]*?<!-- \/factory-preview -->\n*/g, '');
  if (!url) return rest;
  return `<!-- factory-preview -->\n> [!TIP]\n> **🔎 Try it:** ${url} — this pull request's Vercel preview, at ${sha.slice(0, 7)}.\n<!-- /factory-preview -->\n\n${rest}`;
}

export function shotsComment(pr: number, sha: string, pages: Shot[], shots: Uploaded[], previewUrl: string, beforeLabel: string | null, footer: string) {
  const img = (s: Uploaded | undefined, width: number) =>
    !s ? '—' : s.url ? `<a href="${s.full ?? s.url}"><img src="${s.url}" width="${width}"></a>` : `⚠️ ${s.error ?? 'not captured'}`;
  const find = (path: string, viewport: string, which: string) => shots.find((s) => s.path === path && s.viewport === viewport && s.which === which);
  const cols = beforeLabel ? ['before', 'after'] : ['after'];
  const width: Record<string, number> = beforeLabel ? { desktop: 420, mobile: 220 } : { desktop: 640, mobile: 300 };
  const sections = pages.map((p, i) => {
    const rows = [
      `| | ${cols.map((c) => (c === 'before' ? `Before (${beforeLabel})` : 'This PR')).join(' | ')} |`,
      `|---|${cols.map(() => '---').join('|')}|`,
      ...['desktop', 'mobile'].map((v) => `| **${v === 'desktop' ? 'Desktop' : 'Mobile'}** | ${cols.map((c) => img(find(p.path, v, c), width[v])).join(' | ')} |`),
    ];
    // A folded page's summary is its title, so it gets no heading of its own (it showed twice).
    if (i === 0) return [`#### [\`${p.path}\`](${previewUrl}${p.path}) <sub>${p.label}</sub>`, '', ...rows].join('\n');
    return [`<details><summary><a href="${previewUrl}${p.path}"><code>${p.path}</code></a> <sub>${p.label}</sub></summary>`, '', ...rows, '', '</details>'].join('\n');
  });
  return [
    `### 📸 Screenshots`,
    `As attendee Jonas, clock pinned to Day 1 10:30, on [this PR's preview](${previewUrl})${beforeLabel ? ` and on ${beforeLabel}` : ''} — click an image for the full page.`,
    '',
    ...sections.flatMap((s) => [s, '']),
    `<sub>${footer} · commit ${sha.slice(0, 7)}</sub>`,
    `<!-- factory-shots ${JSON.stringify({ pr, sha })} -->`,
  ].join('\n');
}
